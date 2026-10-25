import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

export type AiProvider = 'anthropic' | 'openai-compatible' | 'ollama';

export interface AiConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface PublicAiConfig {
  provider: AiProvider;
  model: string;
  baseUrl?: string;
  configured: boolean;
  keyHint?: string;
}

const CONFIG_FILE = path.resolve(process.cwd(), 'ai-config.json');

const DEFAULTS: Record<AiProvider, { model: string; baseUrl?: string }> = {
  anthropic: { model: 'claude-opus-5' },
  'openai-compatible': { model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
  ollama: { model: 'llama3.2', baseUrl: 'http://127.0.0.1:11434/v1' },
};

export function loadAiConfig(): AiConfig | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    if (!parsed?.apiKey) return null;
    return parsed;
  } catch (err) {
    console.error('[AI] No se pudo leer ai-config.json:', err);
    return null;
  }
}

export function saveAiConfig(input: Partial<AiConfig>): PublicAiConfig {
  const current = loadAiConfig();
  const provider: AiProvider = input.provider || current?.provider || 'anthropic';

  const config: AiConfig = {
    provider,
    apiKey: input.apiKey || current?.apiKey || (provider === 'ollama' ? 'ollama-local' : ''),
    model: input.model || current?.model || DEFAULTS[provider].model,
    baseUrl: input.baseUrl ?? current?.baseUrl ?? DEFAULTS[provider].baseUrl,
  };

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  return toPublic(config);
}

export function toPublic(config: AiConfig | null): PublicAiConfig {
  if (!config) {
    return { provider: 'ollama', model: DEFAULTS.ollama.model, baseUrl: DEFAULTS.ollama.baseUrl, configured: false };
  }
  return {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    configured: Boolean(config.apiKey),
    keyHint: config.apiKey ? `••••${config.apiKey.slice(-4)}` : undefined,
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  rounds?: number;
}

export function anthropicUsage(
  usage:
    | {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number | null;
        cache_creation_input_tokens?: number | null;
      }
    | null
    | undefined
): TokenUsage | undefined {
  if (!usage) return undefined;
  return {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? undefined,
    cacheWrite: usage.cache_creation_input_tokens ?? undefined,
    rounds: 1,
  };
}

export function openAiUsage(usage: unknown): TokenUsage | undefined {
  const raw = usage as {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    prompt_tokens_details?: { cached_tokens?: unknown };
  } | null;

  const input = raw?.prompt_tokens;
  const output = raw?.completion_tokens;
  if (typeof input !== 'number' && typeof output !== 'number') return undefined;

  const cached = raw?.prompt_tokens_details?.cached_tokens;
  return {
    input: typeof input === 'number' ? input : 0,
    output: typeof output === 'number' ? output : 0,
    cacheRead: typeof cached === 'number' && cached > 0 ? cached : undefined,
    rounds: 1,
  };
}

export function addUsage(
  a: TokenUsage | undefined,
  b: TokenUsage | undefined
): TokenUsage | undefined {
  if (!a) return b;
  if (!b) return a;
  const sum = (x?: number, y?: number) => (x ?? 0) + (y ?? 0);
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: sum(a.cacheRead, b.cacheRead) || undefined,
    cacheWrite: sum(a.cacheWrite, b.cacheWrite) || undefined,
    rounds: sum(a.rounds, b.rounds) || undefined,
  };
}

export interface ChatResult {
  success: boolean;
  reply?: string;
  diff?: { file: string; newCode: string };
  thinking?: string;
  usage?: TokenUsage;
  error?: string;
  code?: string;
}

function extractProposedFile(reply: string): { file: string; newCode: string } | undefined {
  const match = reply.match(/```[a-zA-Z]*:([^\s`]+)\n([\s\S]*?)```/);
  if (!match) return undefined;
  return { file: match[1].trim(), newCode: match[2].replace(/\n$/, '') };
}

function parseDataUrl(url: string): { mediaType: string; data: string } | null {
  const match = url.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match) return null;
  return { mediaType: match[1], data: match[2] };
}

const ANTHROPIC_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function anthropicMediaType(mediaType: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  return ANTHROPIC_IMAGE_TYPES.has(mediaType)
    ? (mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp')
    : 'image/png';
}

export function openAiUserContent(message: ChatMessage): string | Record<string, unknown>[] {
  if (!message.images?.length) return message.content;
  return [
    { type: 'text', text: message.content },
    ...message.images.map((url) => ({ type: 'image_url', image_url: { url } })),
  ];
}

function anthropicUserContent(message: ChatMessage): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];
  if (message.content) blocks.push({ type: 'text', text: message.content });
  for (const url of message.images || []) {
    const parsed = parseDataUrl(url);
    if (!parsed) continue;
    blocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: anthropicMediaType(parsed.mediaType),
        data: parsed.data,
      },
    });
  }
  return blocks;
}

export function anthropicContent(message: ChatMessage): Anthropic.MessageParam['content'] {
  return message.images?.length ? anthropicUserContent(message) : message.content;
}

async function chatAnthropic(config: AiConfig, system: string, messages: ChatMessage[]): Promise<ChatResult> {
  const client = new Anthropic({ apiKey: config.apiKey });

  const THINKING_BUDGET = 4000;

  const response = await client.messages.create({
    model: config.model,
    max_tokens: 16000,
    thinking: { type: 'enabled', budget_tokens: THINKING_BUDGET },
    system,
    messages: messages.map((m) => ({
      role: m.role,
      content: anthropicContent(m),
    })),
  });

  if (response.stop_reason === 'refusal') {
    return {
      success: false,
      code: 'REFUSAL',
      error: 'El modelo declinó esta petición.',
    };
  }

  const reply = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  const thinking = response.content
    .filter((block): block is Anthropic.ThinkingBlock => block.type === 'thinking')
    .map((block) => block.thinking)
    .join('\n\n');

  return {
    success: true,
    reply,
    thinking: thinking || undefined,
    usage: anthropicUsage(response.usage),
    diff: extractProposedFile(reply),
  };
}

async function chatOpenAiCompatible(
  config: AiConfig,
  system: string,
  messages: ChatMessage[]
): Promise<ChatResult> {
  const baseUrl = (config.baseUrl || DEFAULTS['openai-compatible'].baseUrl!).replace(/\/$/, '');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 8000,
      messages: [
        { role: 'system', content: system },
        ...messages.map((m) => ({ role: m.role, content: openAiUserContent(m) })),
      ],
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return {
      success: false,
      code: 'PROVIDER_ERROR',
      error: `El proveedor respondió ${response.status}. ${detail.slice(0, 300)}`,
    };
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown } }[];
    usage?: unknown;
  } | null;
  const reply = data?.choices?.[0]?.message?.content;
  if (typeof reply !== 'string') {
    return { success: false, code: 'BAD_RESPONSE', error: 'El proveedor devolvió una respuesta inesperada.' };
  }

  const thinking =
    data?.choices?.[0]?.message?.reasoning_content ?? data?.choices?.[0]?.message?.reasoning;

  return {
    success: true,
    reply,
    thinking: typeof thinking === 'string' ? thinking : undefined,
    usage: openAiUsage(data?.usage),
    diff: extractProposedFile(reply),
  };
}

export async function chat(system: string, messages: ChatMessage[]): Promise<ChatResult> {
  const config = loadAiConfig();

  if (!config?.apiKey) {
    return {
      success: false,
      code: 'NOT_CONFIGURED',
      error: 'No hay ningún proveedor de IA configurado. Añade tu API key en Ajustes → Agente IA.',
    };
  }

  try {
    return config.provider === 'anthropic'
      ? await chatAnthropic(config, system, messages)
      : await chatOpenAiCompatible(config, system, messages);
  } catch (err) {
    return providerError(err);
  }
}

function providerError(cause: unknown): ChatResult {
  const err = cause as { status?: number; message?: string } | null | undefined;
  const status = err?.status;
  if (status === 401) {
    return { success: false, code: 'BAD_KEY', error: 'La API key no es válida.' };
  }
  if (status === 429) {
    return { success: false, code: 'RATE_LIMIT', error: 'Has alcanzado el límite de peticiones del proveedor.' };
  }
  return {
    success: false,
    code: 'REQUEST_FAILED',
    error: `No se pudo contactar con el proveedor: ${err?.message || 'error desconocido'}`,
  };
}

export async function testAiConfig(): Promise<{ success: boolean; message: string }> {
  const result = await chat('Responde únicamente con la palabra OK.', [{ role: 'user', content: 'ping' }]);
  if (!result.success) return { success: false, message: result.error || 'Fallo desconocido' };
  return { success: true, message: `Conexión correcta. El modelo respondió: "${(result.reply || '').trim().slice(0, 40)}"` };
}

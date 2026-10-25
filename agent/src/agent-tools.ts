import Anthropic from '@anthropic-ai/sdk';
import {
  addUsage,
  anthropicContent,
  anthropicUsage,
  loadAiConfig,
  openAiUsage,
  openAiUserContent,
  type AiConfig,
  type ChatMessage,
  type ChatResult,
  type TokenUsage,
} from './ai';

export interface AgentToolDef {
  name: string;
  description: string;
  schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  run: (input: Record<string, unknown>) => Promise<string> | string;
}

export interface AgentStreamCallbacks {
  onThinking?: (delta: string) => void;
  onReply?: (delta: string) => void;
  onToolCall?: (call: { id: string; name: string; input: Record<string, unknown> }) => void;
  onToolResult?: (result: {
    id: string;
    name: string;
    output: string;
    error: boolean;
    ms: number;
  }) => void;
  onRound?: (round: number) => void;
  onUsage?: (total: TokenUsage) => void;
}

export type Esfuerzo = 'bajo' | 'medio' | 'alto';

const PRESUPUESTO: Record<Esfuerzo, number> = { bajo: 0, medio: 4000, alto: 12000 };

const ESFUERZO_OPENAI: Record<Esfuerzo, 'low' | 'medium' | 'high'> = {
  bajo: 'low',
  medio: 'medium',
  alto: 'high',
};

function partial(reply: string, thinking: string, usage?: TokenUsage): ChatResult {
  return { success: true, reply, thinking: thinking || undefined, usage };
}

const MAX_ROUNDS = 8;

function clip(text: string, max = 12000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n\n[…recortado, ${text.length - max} caracteres más]`;
}

function toAnthropicTools(tools: AgentToolDef[]): Anthropic.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.schema as Anthropic.Tool.InputSchema,
  }));
}

async function runTool(
  tools: AgentToolDef[],
  call: { id: string; name: string; input: Record<string, unknown> },
  callbacks: AgentStreamCallbacks
): Promise<Anthropic.ToolResultBlockParam> {
  const started = Date.now();
  const tool = tools.find((t) => t.name === call.name);

  callbacks.onToolCall?.(call);

  if (!tool) {
    const output = `No existe ninguna herramienta llamada "${call.name}".`;
    callbacks.onToolResult?.({ ...call, output, error: true, ms: 0 });
    return { type: 'tool_result', tool_use_id: call.id, content: output, is_error: true };
  }

  try {
    const output = clip(String(await tool.run(call.input)));
    callbacks.onToolResult?.({
      id: call.id,
      name: call.name,
      output,
      error: false,
      ms: Date.now() - started,
    });
    return { type: 'tool_result', tool_use_id: call.id, content: output };
  } catch (err) {
    const output = `La herramienta falló: ${err instanceof Error ? err.message : String(err)}`;
    callbacks.onToolResult?.({
      id: call.id,
      name: call.name,
      output,
      error: true,
      ms: Date.now() - started,
    });
    return { type: 'tool_result', tool_use_id: call.id, content: output, is_error: true };
  }
}

async function agentAnthropic(
  config: AiConfig,
  system: string,
  messages: Anthropic.MessageParam[],
  tools: AgentToolDef[],
  callbacks: AgentStreamCallbacks,
  signal?: AbortSignal,
  esfuerzo: Esfuerzo = 'medio'
): Promise<ChatResult> {
  const client = new Anthropic({ apiKey: config.apiKey });
  const conversation = [...messages];

  let reply = '';
  let thinking = '';
  let total: TokenUsage | undefined;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (signal?.aborted) return partial(reply, thinking, total);
    callbacks.onRound?.(round);

    const presupuesto = PRESUPUESTO[esfuerzo];

    const stream = client.messages.stream({
      model: config.model,
      max_tokens: Math.max(16000, presupuesto + 8000),
      thinking: presupuesto > 0 ? { type: 'enabled', budget_tokens: presupuesto } : undefined,
      system,
      messages: conversation,
      tools: tools.length ? toAnthropicTools(tools) : undefined,
    }, { signal });

    stream.on('thinking', (delta) => {
      thinking += delta;
      callbacks.onThinking?.(delta);
    });
    stream.on('text', (delta) => {
      reply += delta;
      callbacks.onReply?.(delta);
    });
    stream.on('streamEvent', (event) => {
      if (event.type !== 'message_start') return;
      const arranque = anthropicUsage(event.message.usage);
      if (arranque) callbacks.onUsage?.(addUsage(total, arranque)!);
    });

    const final = await stream.finalMessage();

    total = addUsage(total, anthropicUsage(final.usage));
    if (total) callbacks.onUsage?.(total);

    if (final.stop_reason === 'refusal') {
      return { success: false, code: 'REFUSAL', error: 'El modelo declinó esta petición.' };
    }

    const toolUses = final.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (toolUses.length === 0) {
      if (!reply) {
        reply = final.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n');
      }
      return { success: true, reply, thinking: thinking || undefined, usage: total };
    }

    conversation.push({ role: 'assistant', content: final.content });

    if (signal?.aborted) return partial(reply, thinking, total);

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      results.push(
        await runTool(
          tools,
          { id: use.id, name: use.name, input: (use.input ?? {}) as Record<string, unknown> },
          callbacks
        )
      );
    }
    conversation.push({ role: 'user', content: results });
  }

  return {
    success: true,
    reply:
      reply ||
      'He dado demasiadas vueltas leyendo ficheros sin llegar a una respuesta. Acota un poco la pregunta y lo vuelvo a intentar.',
    thinking: thinking || undefined,
    usage: total,
  };
}

interface OpenAiToolCall {
  id: string;
  name: string;
  args: string;
}

function toOpenAiTools(tools: AgentToolDef[]) {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.schema },
  }));
}

interface ToolCallDelta {
  index?: unknown;
  id?: string;
  function?: { name?: string; arguments?: string };
}

function mergeToolCallDeltas(
  accumulator: Map<number, OpenAiToolCall>,
  deltas: ToolCallDelta[]
): void {
  for (const delta of deltas) {
    const index = typeof delta.index === 'number' ? delta.index : 0;
    const current = accumulator.get(index) ?? { id: '', name: '', args: '' };
    if (delta.id) current.id = delta.id;
    if (delta.function?.name) current.name = delta.function.name;
    if (delta.function?.arguments) current.args += delta.function.arguments;
    accumulator.set(index, current);
  }
}

async function agentOpenAiCompatible(
  config: AiConfig,
  system: string,
  messages: Array<Record<string, unknown>>,
  tools: AgentToolDef[],
  callbacks: AgentStreamCallbacks,
  signal?: AbortSignal,
  esfuerzo: Esfuerzo = 'medio'
): Promise<ChatResult> {
  let sinEsfuerzo = false;

  let sinUsage = false;

  const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const conversation: Array<Record<string, unknown>> = [
    { role: 'system', content: system },
    ...messages,
  ];

  let reply = '';
  let thinking = '';
  let total: TokenUsage | undefined;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (signal?.aborted) return partial(reply, thinking, total);
    callbacks.onRound?.(round);

    const pedir = () =>
      fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 8000,
          stream: true,
          messages: conversation,
          tools: tools.length ? toOpenAiTools(tools) : undefined,
          ...(sinEsfuerzo ? {} : { reasoning_effort: ESFUERZO_OPENAI[esfuerzo] }),
          ...(sinUsage ? {} : { stream_options: { include_usage: true } }),
        }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000),
      });

    let response = await pedir();

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');

      let reintentado = false;
      if (!sinEsfuerzo && /reasoning|thinking/i.test(detail)) {
        sinEsfuerzo = true;
        reintentado = true;
      }
      if (!sinUsage && /stream_options|include_usage/i.test(detail)) {
        sinUsage = true;
        reintentado = true;
      }
      if (reintentado) response = await pedir();

      if (!response.ok || !response.body) {
        const detalleFinal = reintentado ? await response.text().catch(() => '') : detail;
        return {
          success: false,
          code: 'PROVIDER_ERROR',
          error: `El proveedor respondió ${response.status}. ${detalleFinal.slice(0, 300)}`,
        };
      }
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const pendingCalls = new Map<number, OpenAiToolCall>();
    let buffer = '';
    let roundText = '';
    let roundUsage: TokenUsage | undefined;

    const consume = (chunk: string) => {
      let idx: number;
      while ((idx = chunk.indexOf('\n\n')) !== -1) {
        const block = chunk.slice(0, idx);
        chunk = chunk.slice(idx + 2);
        for (const line of block.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const data = JSON.parse(payload);
            if (data?.usage) roundUsage = openAiUsage(data.usage) ?? roundUsage;
            const delta = data?.choices?.[0]?.delta;
            const razonamiento = delta?.reasoning_content ?? delta?.reasoning;
            if (typeof razonamiento === 'string' && razonamiento) {
              thinking += razonamiento;
              callbacks.onThinking?.(razonamiento);
            }
            if (typeof delta?.content === 'string') {
              roundText += delta.content;
              reply += delta.content;
              callbacks.onReply?.(delta.content);
            }
            if (Array.isArray(delta?.tool_calls)) {
              mergeToolCallDeltas(pendingCalls, delta.tool_calls);
            }
          } catch {}
        }
      }
      return chunk;
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        buffer = consume(buffer);
      }
      buffer += decoder.decode();
      consume(buffer + '\n\n');
    } finally {
      reader.releaseLock();
    }

    total = addUsage(total, roundUsage);
    if (total) callbacks.onUsage?.(total);

    if (signal?.aborted) return partial(reply, thinking, total);

    const calls = [...pendingCalls.values()].filter((c) => c.name);
    if (calls.length === 0) {
      return { success: true, reply, thinking: thinking || undefined, usage: total };
    }

    conversation.push({
      role: 'assistant',
      content: roundText || null,
      tool_calls: calls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: c.args || '{}' },
      })),
    });

    for (const call of calls) {
      let input: Record<string, unknown> = {};
      try {
        input = call.args ? JSON.parse(call.args) : {};
      } catch {}
      const result = await runTool(tools, { id: call.id, name: call.name, input }, callbacks);
      conversation.push({
        role: 'tool',
        tool_call_id: call.id,
        content: typeof result.content === 'string' ? result.content : '',
      });
    }
  }

  return {
    success: true,
    reply:
      reply ||
      'He dado demasiadas vueltas leyendo ficheros sin llegar a una respuesta. Acota un poco la pregunta y lo vuelvo a intentar.',
    thinking: thinking || undefined,
    usage: total,
  };
}

export async function agentStream(
  system: string,
  messages: ChatMessage[],
  tools: AgentToolDef[],
  callbacks: AgentStreamCallbacks = {},
  signal?: AbortSignal,
  opciones: { esfuerzo?: Esfuerzo } = {}
): Promise<ChatResult> {
  const esfuerzo = opciones.esfuerzo ?? 'medio';
  const config = loadAiConfig();

  if (!config?.apiKey) {
    return {
      success: false,
      code: 'NOT_CONFIGURED',
      error: 'No hay ningún proveedor de IA configurado. Añade tu API key en Ajustes → Agente IA.',
    };
  }

  try {
    if (config.provider === 'anthropic') {
      return await agentAnthropic(
        config,
        system,
        messages.map((m) => ({ role: m.role, content: anthropicContent(m) })),
        tools,
        callbacks,
        signal,
        esfuerzo
      );
    }

    return await agentOpenAiCompatible(
      config,
      system,
      messages.map((m) => ({ role: m.role, content: openAiUserContent(m) })),
      tools,
      callbacks,
      signal,
      esfuerzo
    );
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 401) return { success: false, code: 'BAD_KEY', error: 'La API key no es válida.' };
    if (status === 429) {
      return {
        success: false,
        code: 'RATE_LIMIT',
        error: 'Has alcanzado el límite de peticiones del proveedor.',
      };
    }
    return {
      success: false,
      code: 'REQUEST_FAILED',
      error: `No se pudo contactar con el proveedor: ${
        err instanceof Error ? err.message : 'error desconocido'
      }`,
    };
  }
}

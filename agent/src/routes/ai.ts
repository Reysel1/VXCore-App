import type { Router } from 'express';
import { agentStream } from '../agent-tools';
import { chat, loadAiConfig, saveAiConfig, testAiConfig, toPublic } from '../ai';
import { buildAiMessages, buildEditorSystemPrompt, buildEditorTools } from '../editor-assistant';
import { createRouter, errMsg } from '../http/helpers';
import { tr } from '../idioma';

export function aiRouter(): Router {
  const router = createRouter();

  router.get('/api/ai/config', (req, res) => {
    res.json({ success: true, config: toPublic(loadAiConfig()) });
  });

  router.get('/api/ai/models', async (req, res) => {
    const provider = String(req.query.provider || 'ollama');
    const rawBaseUrl = String(req.query.baseUrl || 'http://127.0.0.1:11434');
    const baseUrl = rawBaseUrl.replace(/\/$/, '').replace(/\/v1$/, '');
    try {
      const url = provider === 'ollama' ? `${baseUrl}/api/tags` : `${rawBaseUrl.replace(/\/$/, '')}/models`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return res.status(response.status).json({ success: false, error: tr('El proveedor respondió {status}.', { status: response.status }) });
      const data = await response.json() as { models?: Array<{ name?: string; id?: string }> };
      const models = (data.models || []).map((item) => item.name || item.id).filter((name): name is string => Boolean(name));
      res.json({ success: true, models });
    } catch (error) {
      res.status(502).json({ success: false, error: tr('No se pudo conectar con {provider}: {errMsg}', { provider, errMsg: errMsg(error) }) });
    }
  });

  router.post('/api/ai/config', (req, res) => {
    const { provider, apiKey, model, baseUrl } = req.body || {};

    if (provider && provider !== 'anthropic' && provider !== 'openai-compatible' && provider !== 'ollama') {
      return res.status(400).json({ success: false, error: tr('Proveedor no soportado') });
    }

    const config = saveAiConfig({ provider, apiKey, model, baseUrl });
    console.log(`[AI] Configuración guardada: ${config.provider} / ${config.model}`);
    res.json({ success: true, config });
  });

  router.post('/api/ai/test', async (req, res) => {
    const result = await testAiConfig();
    res.status(result.success ? 200 : 400).json(result);
  });

  router.post('/api/ai/chat', async (req, res) => {
    const { message, resource, activeFile, currentCode, files, serverContext, history, images } = req.body || {};

    if (!message && !(Array.isArray(images) && images.length > 0)) {
      return res.status(400).json({ success: false, error: tr('Falta el mensaje') });
    }

    const system = buildEditorSystemPrompt({
      resource,
      framework: serverContext?.framework,
      database: serverContext?.database,
      name: serverContext?.name,
      files,
      activeFile,
      currentCode,
    });

    const result = await chat(system, buildAiMessages(history, message, images));

    if (!result.success) {
      return res.status(result.code === 'NOT_CONFIGURED' ? 409 : 502).json(result);
    }

    res.json(result);
  });

  router.post('/api/ai/chat/stream', async (req, res) => {
    const {
      message,
      resource,
      activeFile,
      currentCode,
      files,
      serverContext,
      history,
      images,
      serverDataPath,
      esfuerzo,
      modo,
    } = req.body || {};

    const soloPlan = modo === 'plan';

    if (!message && !(Array.isArray(images) && images.length > 0)) {
      return res.status(400).json({ success: false, error: tr('Falta el mensaje') });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (event: string, data: Record<string, unknown>) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let aborted = false;
    const cancel = new AbortController();
    res.on('close', () => {
      aborted = true;
      cancel.abort();
    });

    const proposals: { file: string; newCode: string; summary?: string }[] = [];
    const readFiles = new Set<string>();

    const todasLasTools = buildEditorTools({
      serverDataPath,
      resource,
      onPlan: (steps) => send('plan', { steps }),
      onQuestion: (question) => send('question', question),
      onProposal: (proposal) => {
        proposals.push(proposal);
        send('proposal', proposal);
      },
    });

    const tools = soloPlan
      ? todasLasTools.filter((t) => t.name !== 'proponer_cambio')
      : todasLasTools;

    const system = buildEditorSystemPrompt({
      resource,
      framework: serverContext?.framework,
      database: serverContext?.database,
      name: serverContext?.name,
      files,
      activeFile,
      currentCode,
      withTools: Boolean(serverDataPath),
      soloPlan,
    });

    const result = await agentStream(
      system,
      buildAiMessages(history, message, images),
      serverDataPath ? tools : [],
      {
        onThinking: (delta) => !aborted && send('thinking', { delta }),
        onReply: (delta) => !aborted && send('reply', { delta }),
        onToolCall: (call) => {
          if (call.name === 'leer_fichero' && typeof call.input.ruta === 'string') {
            readFiles.add(call.input.ruta);
          }
          if (!aborted) send('tool', { ...call, status: 'running' });
        },
        onToolResult: (toolResult) => !aborted && send('tool_result', toolResult),
        onUsage: (usage) => !aborted && send('usage', { ...usage }),
      },
      cancel.signal,
      { esfuerzo: esfuerzo === 'bajo' || esfuerzo === 'alto' ? esfuerzo : 'medio' }
    );

    if (aborted) return res.end();

    if (!result.success) {
      send('error', { error: result.error, code: result.code });
    } else {
      send('done', {
        reply: result.reply,
        thinking: result.thinking,
        diff: result.diff,
        proposals,
        sources: [...readFiles],
        usage: result.usage,
      });
    }

    res.end();
  });

  return router;
}

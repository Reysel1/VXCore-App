import type { Router } from 'express';
import { chat } from '../ai';
import type { AgentContext } from '../http/context';
import { createRouter } from '../http/helpers';
import { tr } from '../idioma';

export function automationsRouter(ctx: AgentContext): Router {
  const { automationEngine } = ctx;
  const router = createRouter();

  router.get('/api/automations', (req, res) => {
    res.json({
      success: true,
      automations: automationEngine.list(),
      history: automationEngine.getHistory(),
    });
  });

  router.post('/api/automations', (req, res) => {
    const { id, name, trigger, actions, enabled } = req.body || {};

    if (!name || !trigger?.type || !Array.isArray(actions) || actions.length === 0) {
      return res.status(400).json({
        success: false,
        error: tr('Se requiere "name", un "trigger" con tipo y al menos una acción.'),
      });
    }

    const automation = automationEngine.upsert({ id, name, trigger, actions, enabled });
    res.json({ success: true, automation });
  });

  router.post('/api/automations/:id/toggle', (req, res) => {
    const automation = automationEngine.setEnabled(req.params.id, Boolean(req.body?.enabled));
    if (!automation) {
      return res.status(404).json({ success: false, error: tr('Automatización no encontrada') });
    }
    res.json({ success: true, automation });
  });

  router.delete('/api/automations/:id', (req, res) => {
    if (!automationEngine.remove(req.params.id)) {
      return res.status(404).json({ success: false, error: tr('Automatización no encontrada') });
    }
    res.json({ success: true });
  });

  router.post('/api/automations/:id/run', async (req, res) => {
    const automation = automationEngine.get(req.params.id);
    if (!automation) {
      return res.status(404).json({ success: false, error: tr('Automatización no encontrada') });
    }

    const result = await automationEngine.run(automation, tr('Ejecución manual desde el panel'));
    res.status(result.success ? 200 : 409).json({ success: result.success, run: result });
  });

  router.post('/api/automations/ai-generate', async (req, res) => {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ success: false, error: tr('Escribe qué quieres automatizar.') });
    }

    const system =
      'Eres el generador de flujos de automatización de VXCore, panel de control de servidores FiveM.\n' +
      'Responde ÚNICAMENTE con un JSON válido, sin markdown ni comentarios, con esta forma exacta:\n' +
      '{"name": "...", "trigger": {"type": "interval", "everyMinutes": 240} | {"type": "daily", "at": "HH:MM"} | ' +
      '{"type": "log_match", "pattern": "..."} | {"type": "cpu_above", "percent": 85, "forSeconds": 60} | ' +
      '{"type": "ram_above", "percent": 90, "forSeconds": 60} | {"type": "server_offline"}, ' +
      '"actions": [ {"type": "notify", "title": "...", "message": "...", "level": "info|success|warning|error"} | ' +
      '{"type": "command", "command": "..."} | {"type": "restart"} | {"type": "start"} | ' +
      '{"type": "stop"} | {"type": "webhook", "url": "https://...", "message": "..."} ]}\n' +
      'Reglas: nombre corto en español; máximo 4 acciones; para reinicios usa {"type": "restart"}; ' +
      'los avisos a los jugadores usan notify (warning para reinicios, error para caídas), nunca command con say; ' +
      'para Discord usa webhook. Si la petición no deja claro algo, elige un valor sensato.';

    const result = await chat(system, [{ role: 'user', content: prompt }]);
    if (!result.success) {
      return res
        .status(400)
        .json({ success: false, error: result.error || tr('El proveedor de IA no respondió.') });
    }

    const reply = result.reply || '';
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(400).json({ success: false, error: tr('La IA no devolvió un JSON válido.') });
    }

    try {
      const flow = JSON.parse(jsonMatch[0]);
      if (!flow.name || !flow.trigger || !Array.isArray(flow.actions)) {
        return res.status(400).json({ success: false, error: tr('El JSON de la IA no tiene la forma esperada.') });
      }
      res.json({ success: true, flow });
    } catch {
      res.status(400).json({ success: false, error: tr('La IA devolvió JSON inválido.') });
    }
  });

  return router;
}

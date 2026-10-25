import type { Router } from 'express';
import fs from 'fs';
import path from 'path';
import type { AgentContext } from '../http/context';
import { createRouter } from '../http/helpers';
import { tr } from '../idioma';
import { interpolateAction, loadPlayerActions, savePlayerActions, type PlayerActionDef } from '../player-actions';

const EVENT_RE =
  /(RegisterNetEvent|RegisterServerEvent|AddEventHandler|TriggerEvent|TriggerClientEvent|TriggerServerEvent|RegisterCommand)\s*\(\s*["']([^"']+)["']/g;

export function eventsRouter(ctx: AgentContext): Router {
  const { processManager, getActiveServer } = ctx;
  const router = createRouter();

  router.get('/api/events/config', (req, res) => {
    res.json({ success: true, actions: loadPlayerActions() });
  });

  router.post('/api/events/config', (req, res) => {
    const { actions } = req.body || {};
    if (!Array.isArray(actions)) {
      return res.status(400).json({ success: false, error: tr('Se esperaba un array de acciones.') });
    }
    const clean = actions.filter(
      (a: PlayerActionDef) => a && typeof a.key === 'string' && typeof a.label === 'string'
    );
    savePlayerActions(clean);
    res.json({ success: true, actions: clean });
  });

  router.post('/api/events/trigger', (req, res) => {
    const { actionKey, player } = req.body || {};
    const actions = loadPlayerActions();
    const action = actions.find((a) => a.key === actionKey);
    if (!action) {
      return res.status(404).json({ success: false, error: tr('La acción "{actionKey}" no existe.', { actionKey }) });
    }
    if (!player || player.id == null) {
      return res.status(400).json({ success: false, error: tr('Falta el id del jugador.') });
    }

    let cmd = '';
    if (action.kind === 'event' && action.event) {
      const payload = action.payload ? interpolateAction(action.payload, player) : '{}';
      cmd = `vxcore_event ${action.event} ${payload}`;
    } else if (action.command) {
      cmd = interpolateAction(action.command, player);
    } else {
      return res.status(400).json({ success: false, error: tr('La acción no tiene comando ni evento definido.') });
    }

    const result = processManager.executeCommand(cmd);
    if (result.success) {
      res.json({ success: true, message: tr('Acción "{label}" enviada al servidor.', { label: action.label }) });
    } else {
      res.status(409).json({ success: false, code: result.code, error: result.message });
    }
  });

  router.get('/api/events/scan', (req, res) => {
    const base = req.query.basePath ? String(req.query.basePath) : '';
    let root = base;
    if (!root) {
      const server = getActiveServer();
      const candidate = server?.serverDataPath ? path.join(server.serverDataPath, 'resources') : '';
      root = candidate && fs.existsSync(candidate) ? candidate : server?.serverDataPath || '';
    }
    if (!root || !fs.existsSync(root)) {
      return res.json({ success: true, basePath: root || null, scripts: [], total: 0 });
    }

    const hits: { script: string; kind: string; name: string }[] = [];

    const walk = (dir: string, depth: number) => {
      if (depth > 4) return;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'cache') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full, depth + 1);
        } else if (/\.[jt]s$|\.lua$/i.test(entry.name) && !/\.min\./.test(entry.name)) {
          let content = '';
          try {
            content = fs.readFileSync(full, 'utf-8');
          } catch {
            continue;
          }
          if (content.length > 2_000_000) continue;
          EVENT_RE.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = EVENT_RE.exec(content)) !== null) {
            const kind = m[1];
            const name = m[2];
            const script = full.replace(root, '').split(path.sep).filter(Boolean)[0] || path.basename(dir);
            hits.push({
              script,
              kind:
                kind === 'RegisterCommand'
                  ? 'command'
                  : kind === 'AddEventHandler'
                    ? 'handler'
                    : kind.startsWith('Register')
                      ? 'register'
                      : 'trigger',
              name,
            });
          }
        }
      }
    };

    walk(root, 0);

    const byScript = new Map<string, Map<string, { usage: Set<string>; count: number }>>();
    for (const hit of hits) {
      if (!byScript.has(hit.script)) byScript.set(hit.script, new Map());
      const events = byScript.get(hit.script)!;
      const prev = events.get(hit.name) || { usage: new Set<string>(), count: 0 };
      prev.usage.add(hit.kind);
      prev.count += 1;
      events.set(hit.name, prev);
    }

    const scripts = [...byScript.entries()].map(([script, events]) => ({
      script,
      events: [...events.entries()].map(([name, info]) => ({
        name,
        usage: [...info.usage],
        count: info.count,
      })),
    }));

    res.json({ success: true, basePath: root, scripts, total: hits.length });
  });

  return router;
}

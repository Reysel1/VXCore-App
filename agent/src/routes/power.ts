import type { Response, Router } from 'express';
import path from 'path';
import type { Server } from 'socket.io';
import { allowFirewall, FXSERVER_RULE_NAME } from '../firewall';
import type { AgentContext } from '../http/context';
import { createRouter } from '../http/helpers';
import { tr } from '../idioma';
import { OPEN77_RULE_NAME } from '../open77';
import { samePath } from '../path-guards';
import type { ProcessManager } from '../process-manager';
import { listKnownServers, setActiveServerId } from '../server-registry';

type StartResult = { success: boolean; message: string; code?: string; firewall?: { program: string; ruleName: string } };

async function startByGame(
  processManager: ProcessManager,
  body: { id?: unknown; cfgPath?: unknown } | undefined
): Promise<StartResult> {
  const id = typeof body?.id === 'string' ? body.id : undefined;
  const cfg = typeof body?.cfgPath === 'string' && body.cfgPath.trim() ? body.cfgPath : undefined;
  const registered =
    (id && listKnownServers().find((s) => s.id === id)) ||
    (cfg && listKnownServers().find((s) => typeof s.cfgPath === 'string' && samePath(s.cfgPath, cfg))) ||
    null;
  if (!registered?.cfgPath) {
    return {
      success: false,
      code: 'UNKNOWN_SERVER',
      message: tr('Esa ruta no es la de ningún servidor dado de alta en este panel.'),
    };
  }
  if (registered?.game === 'open77' && registered.cfgPath) {
    return processManager.startOpen77Server({
      cfgPath: registered.cfgPath,
      serverDataPath: registered.serverDataPath,
      port: registered.port,
      maxPlayers: registered.maxClients,
    });
  }
  return processManager.startServer({
    serverDataPath: registered.serverDataPath || path.dirname(registered.cfgPath),
    cfgPath: registered.cfgPath,
    ip: registered.ip,
    port: registered.port,
  });
}

function sendStartResult(io: Server, res: Response, id: string | undefined, result: StartResult): void {
  if (result.success) {
    if (id) setActiveServerId(id);
    res.json({ success: true, message: result.message });
  } else {
    if (result.code === 'FIREWALL_PERMISSION_NEEDED') {
      io.emit(
        'firewall-needed',
        result.firewall ? { ...result.firewall, serverId: id } : undefined
      );
    }
    res.status(400).json({
      success: false,
      code: result.code,
      error: result.message,
      firewall: result.firewall,
    });
  }
}

export function powerRouter(ctx: AgentContext): Router {
  const { io, processManager } = ctx;
  const router = createRouter();

  router.post('/api/server/start', async (req, res) => {
    const { id } = req.body || {};

    const result = await startByGame(processManager, req.body);
    sendStartResult(io, res, id, result);
  });

  router.post('/api/server/firewall-allow', async (req, res) => {
    const { program, ruleName } = req.body || {};
    const programPath = typeof program === 'string' ? program : '';
    const rule = ruleName === OPEN77_RULE_NAME ? OPEN77_RULE_NAME : FXSERVER_RULE_NAME;
    if (!programPath || !/\.exe$/i.test(programPath) || !path.isAbsolute(programPath)) {
      return res.status(400).json({ success: false, error: tr('Ejecutable no válido.') });
    }
    const result = await allowFirewall(programPath, rule);
    res.json({
      success: result.ok,
      ok: result.ok,
      code: result.ok ? undefined : result.cancelled ? 'PERMISSION_DENIED' : 'FIREWALL_RULE_FAILED',
      error: result.error,
    });
  });

  router.post('/api/server/stop', (req, res) => {
    const result = processManager.stopServer();
    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.status(400).json({ success: false, code: result.code, error: result.message });
    }
  });

  router.post('/api/server/restart', async (req, res) => {
    const { id } = req.body || {};
    processManager.stopServer();

    await new Promise((resolve) => setTimeout(resolve, 6000));

    const result = await startByGame(processManager, req.body);
    sendStartResult(io, res, id, result);
  });

  return router;
}

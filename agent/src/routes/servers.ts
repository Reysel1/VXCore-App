import type { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { LEVEL_RANK } from '../access';
import { currentLevel, sessionOf } from '../http/auth';
import type { AgentContext } from '../http/context';
import { createRouter, errMsg } from '../http/helpers';
import { tr } from '../idioma';
import { removeOpen77Secrets } from '../open77';
import { readImportableCfg } from '../path-guards';
import {
  discoverServerCandidates,
  getRegisteredServers,
  listKnownServers,
  removeRegisteredServer,
  saveRegisteredServer,
  setActiveServerId,
  type RegisteredServer,
} from '../server-registry';
import { livenessFor } from '../server-status';

const REGISTERED_FIELDS = [
  'name',
  'ip',
  'port',
  'maxClients',
  'location',
  'framework',
  'database',
  'dbConnection',
  'rawContent',
  'resources',
] as const;

export function serversRouter(ctx: AgentContext): Router {
  const { processManager, sysMon, getActiveServer } = ctx;
  const router = createRouter();

  router.get('/api/server/detect', async (req, res) => {
    try {
      const servers = listKnownServers();
      const active = getActiveServer();

      const withLiveness = await Promise.all(
        servers.map(async (s) => ({
          ...s,
          liveness: await livenessFor(processManager, s),
        }))
      );

      const session = sessionOf(req);
      const seesSecrets = !session || LEVEL_RANK[currentLevel(session)] >= LEVEL_RANK.admin;
      const visible = seesSecrets
        ? withLiveness
        : withLiveness.map((s) => {
            const { rawContent, dbConnection, ...rest } = s;
            void rawContent;
            void dbConnection;
            return typeof rest.database === 'object' && rest.database
              ? { ...rest, database: { ...rest.database, connectionString: undefined } }
              : rest;
          });

      res.json({
        success: true,
        servers: visible,
        activeServerId: active?.id ?? null,
        runningCfgPath: processManager.getRunningServer()?.cfgPath ?? null,
      });
    } catch (error) {
      console.error('[Agent] Error detecting servers:', error);
      res.status(500).json({ error: tr('Error listando servidores'), details: errMsg(error) });
    }
  });

  router.get('/api/server/discover', (req, res) => {
    try {
      res.json({ success: true, candidates: discoverServerCandidates() });
    } catch (error) {
      res.status(500).json({ success: false, error: tr('Error buscando server.cfg'), details: errMsg(error) });
    }
  });

  router.post('/api/server/read-cfg', (req, res) => {
    const read = readImportableCfg((req.body || {}).cfgPath);
    if (!read.ok) return res.status(read.status).json({ success: false, error: read.error });
    const resolved = read.path;

    try {
      if (!fs.statSync(resolved).isFile()) {
        return res.status(400).json({ success: false, error: tr('Esa ruta es una carpeta, no un server.cfg.') });
      }

      const rawContent = fs.readFileSync(resolved, 'utf-8');
      res.json({
        success: true,
        rawContent,
        cfgPath: resolved,
        serverDataPath: path.dirname(resolved),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: tr('No se pudo leer el fichero: {errMsg}', { errMsg: errMsg(error) }),
      });
    }
  });

  router.post('/api/server/active', (req, res) => {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: tr('Falta "id"') });

    const known = listKnownServers().find((s) => s.id === id);
    if (!known) {
      return res.status(404).json({ success: false, error: tr('El agente no conoce ningún servidor con id {id}', { id }) });
    }

    const running = processManager.getRunningServer();
    if (running && path.resolve(running.cfgPath) !== path.resolve(known.cfgPath || '')) {
      return res.status(409).json({
        success: false,
        code: 'ANOTHER_SERVER_RUNNING',
        error: tr('No se puede cambiar de servidor activo mientras {path} está en ejecución.', { path: path.basename(running.serverDataPath) }),
      });
    }

    setActiveServerId(id);
    res.json({ success: true, activeServerId: id });
  });

  router.post('/api/server/register', (req, res) => {
    try {
      const serverData = req.body;
      if (!serverData) {
        return res.status(400).json({ error: tr('Faltan datos del servidor') });
      }

      const stableId =
        (typeof serverData.id === 'string' && serverData.id) || `srv-${Date.now().toString().slice(-4)}`;
      const fullServer: RegisteredServer = { id: stableId, detectedId: stableId };
      for (const key of REGISTERED_FIELDS) {
        if (serverData[key] !== undefined) fullServer[key] = serverData[key];
      }
      fullServer.game = serverData.game === 'redm' ? 'redm' : 'fivem';
      if (serverData.cfgPath) {
        const read = readImportableCfg(serverData.cfgPath);
        if (!read.ok) return res.status(read.status).json({ success: false, error: read.error });
        fullServer.cfgPath = read.path;
        fullServer.serverDataPath = path.dirname(read.path);
        if (typeof serverData.serverDataPath === 'string' && serverData.serverDataPath.trim()) {
          const wanted = path.resolve(serverData.serverDataPath);
          if (read.path.toLowerCase().startsWith(wanted.toLowerCase() + path.sep)) fullServer.serverDataPath = wanted;
        }
      }

      saveRegisteredServer(fullServer);
      console.log(`[Agent] Registered persistent server: ${fullServer.name} (${fullServer.id})`);
      res.json({ success: true, server: fullServer });
    } catch (error) {
      res.status(500).json({ error: tr('Error registrando servidor'), details: errMsg(error) });
    }
  });

  router.post('/api/server/remove', (req, res) => {
    try {
      const { id, cfgPath } = req.body;
      const target = getRegisteredServers().find((s) => (id && s.id === id) || (cfgPath && s.cfgPath === cfgPath));
      removeRegisteredServer(id || cfgPath);
      if (target?.game === 'open77' && target.cfgPath) removeOpen77Secrets(target.cfgPath);
      console.log(`[Agent] Removed registered server: ${id || cfgPath}`);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: tr('Error eliminando servidor'), details: errMsg(error) });
    }
  });

  router.get('/api/server/status', async (req, res) => {
    try {
      const [telemetry, liveness] = await Promise.all([
        sysMon.getTelemetry(),
        processManager.getLiveness(
          req.query.ip as string | undefined,
          req.query.port as string | undefined
        ),
      ]);

      res.json({
        success: true,
        system: telemetry,
        fxserver: {
          running: liveness.online,
          managed: liveness.managed,
          reachable: liveness.reachable,
          source: liveness.source,
          uptime: liveness.uptime,
          hostname: liveness.hostname,
          usage: liveness.online ? await sysMon.getFxServerUsage() : null,
        },
      });
    } catch (error) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  return router;
}

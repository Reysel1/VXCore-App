import type { Router } from 'express';
import path from 'path';
import { userFolder } from '../fs-browse';
import { createRouter, errMsg } from '../http/helpers';
import { tr } from '../idioma';
import {
  OPEN77_ARCHIVE_SUPPORTED,
  createOpen77Server,
  extractOpen77Archive,
  findOpen77Archive,
  readOpen77Config,
} from '../open77';
import { getRegisteredServers, saveRegisteredServer, type RegisteredServer } from '../server-registry';

export function open77Router(): Router {
  const router = createRouter();

  router.post('/api/open77/create', (req, res) => {
    try {
      const { serverDir, name, port, maxPlayers, visibility, publicEndpoint, licenseKey, databaseConnection } =
        req.body || {};
      if (typeof serverDir !== 'string' || !serverDir.trim()) {
        return res.status(400).json({ success: false, error: tr('Falta la carpeta del servidor Open77.') });
      }

      const result = createOpen77Server({
        serverDir,
        name: typeof name === 'string' ? name : '',
        port: Number(port) || 11778,
        maxPlayers: Math.min(Math.max(Number(maxPlayers) || 32, 1), 1024),
        visibility: visibility === 'private' ? 'private' : 'public',
        publicEndpoint: typeof publicEndpoint === 'string' ? publicEndpoint : '',
        licenseKey: typeof licenseKey === 'string' ? licenseKey : '',
        databaseConnection: typeof databaseConnection === 'string' ? databaseConnection : undefined,
      });
      if (!result.ok || !result.cfgPath) {
        return res.status(400).json({ success: false, error: result.message });
      }

      const existing = getRegisteredServers().find(
        (s) => s.cfgPath && path.resolve(s.cfgPath) === path.resolve(result.cfgPath as string)
      );
      const id = existing?.id || `o77-${Date.now().toString().slice(-6)}`;
      const info = readOpen77Config(result.cfgPath, {
        port: Number(port) || undefined,
        maxClients: Number(maxPlayers) || undefined,
      });
      const server: RegisteredServer = {
        id,
        detectedId: id,
        game: 'open77',
        name: info.name,
        ip: info.ip,
        port: info.port,
        maxClients: Number(maxPlayers) || info.maxClients,
        framework: 'Open77',
        location: 'Local / VPS',
        cfgPath: result.cfgPath,
        serverDataPath: result.serverDataPath,
      };
      saveRegisteredServer(server);
      console.log(`[Agent] Servidor Open77 registrado: ${server.name} (${id})`);

      res.json({ success: true, message: result.message, server, keptExistingConfig: result.keptExistingConfig });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.get('/api/open77/archive', (req, res) => {
    try {
      const downloadsDir = userFolder('downloads');
      res.json({
        success: true,
        supported: OPEN77_ARCHIVE_SUPPORTED,
        archive: OPEN77_ARCHIVE_SUPPORTED ? findOpen77Archive(downloadsDir) : null,
        downloadsDir,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.post('/api/open77/extract', async (req, res) => {
    try {
      const { archivePath, targetDir } = req.body || {};
      if (typeof archivePath !== 'string' || !archivePath.trim()) {
        return res.status(400).json({ success: false, error: tr('Falta el .zip del servidor Open77.') });
      }
      const result = await extractOpen77Archive(archivePath, {
        targetDir: typeof targetDir === 'string' ? targetDir : undefined,
        fallbackParent: userFolder('desktop'),
      });
      if (!result.ok) return res.status(400).json({ success: false, error: result.message });
      console.log(`[Agent] Servidor Open77 descomprimido en ${result.serverDir}`);
      res.json({ success: true, serverDir: result.serverDir });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  return router;
}

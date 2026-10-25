import type { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { ensureResource } from '../cfg-resources';
import type { AgentContext } from '../http/context';
import { createRouter, errMsg, rejectUnknownServer } from '../http/helpers';
import { tr } from '../idioma';
import { hotReloadInGameResource, inGameResourceState } from '../ingame-resource';
import { bundledResourcePath, copyBundledResource, RESOURCE_FOLDER, syncBundledResource } from '../provision';
import { knownServerAt } from '../server-registry';

export function ingameRouter(ctx: AgentContext): Router {
  const { processManager, game, getActiveServer } = ctx;
  const router = createRouter();

  router.get('/api/server/ingame-resource', (req, res) => {
    const { serverDataPath, cfgPath } = req.query as Record<string, string>;
    const active = getActiveServer();
    res.json({
      success: true,
      vxcore: inGameResourceState(
        game,
        serverDataPath || active?.serverDataPath,
        cfgPath || active?.cfgPath
      ),
    });
  });

  router.post('/api/server/update-resource', async (req, res) => {
    const { serverDataPath, cfgPath } = req.body || {};
    const active = getActiveServer();
    const dataPath =
      typeof serverDataPath === 'string' && serverDataPath.trim()
        ? serverDataPath.trim()
        : active?.serverDataPath;

    if (!dataPath) {
      return res.status(400).json({ success: false, error: tr('Falta la ruta del servidor.') });
    }

    const appVersion = process.env.VX_APP_VERSION || 'dev';
    let result: ReturnType<typeof syncBundledResource>;
    try {
      result = syncBundledResource(dataPath, appVersion);
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: errMsg(error),
      });
    }

    if (result === 'unavailable') {
      return res.status(500).json({
        success: false,
        error: tr('El paquete del recurso in-game no está disponible en esta instalación.'),
      });
    }

    if (result === 'absent') {
      return res.status(409).json({
        success: false,
        code: 'NOT_INSTALLED',
        error: tr('El recurso in-game no está instalado en este servidor: usa «Instalar el recurso».'),
      });
    }

    if (result === 'updated' || result === 'reactivated') {
      hotReloadInGameResource(processManager, dataPath);
    }

    const state = inGameResourceState(game, dataPath, typeof cfgPath === 'string' ? cfgPath : undefined);
    res.json({
      success: true,
      updated: result !== 'current',
      message:
        result === 'current'
          ? tr('El recurso ya está al día (v{appVersion}).', { appVersion })
          : result === 'reactivated'
            ? tr('Recurso actualizado a v{appVersion} y re-añadido al server.cfg.', { appVersion })
            : tr('Recurso actualizado a v{appVersion}.', { appVersion }),
      vxcore: state,
    });
  });

  router.post('/api/server/install-resource', (req, res) => {
    try {
      const server = knownServerAt(req.body?.serverDataPath || getActiveServer()?.serverDataPath);
      if (!server) return rejectUnknownServer(res);
      const targetResourcesPath = path.join(server.serverDataPath, 'resources', RESOURCE_FOLDER);
      const sourceResourcePath = bundledResourcePath();

      if (!sourceResourcePath) {
        return res.status(500).json({
          success: false,
          message: tr('No se encuentra el recurso in-game dentro de VXCore. Reinstala la aplicación.'),
        });
      }

      console.log(`[Agent] Instalando el recurso in-game en: ${targetResourcesPath}`);
      copyBundledResource(sourceResourcePath, targetResourcesPath);

      const targetCfg = server.cfgPath || path.join(server.serverDataPath, 'server.cfg');
      if (fs.existsSync(targetCfg)) {
        const before = fs.readFileSync(targetCfg, 'utf-8');
        const after = ensureResource(before, RESOURCE_FOLDER);
        if (after !== before) fs.writeFileSync(targetCfg, after, 'utf-8');
      }

      res.json({
        success: true,
        message: tr('Recurso In-Game `{RESOURCE_FOLDER}` instalado correctamente en tu servidor de FiveM. Añadido `ensure {RESOURCE_FOLDER}` a server.cfg.', { RESOURCE_FOLDER }),
      });
    } catch (error) {
      console.error('[Agent] Error installing resource:', error);
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  return router;
}

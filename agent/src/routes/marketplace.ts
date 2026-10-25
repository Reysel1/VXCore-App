import type { Router } from 'express';
import { createRouter, errMsg, rejectUnknownServer } from '../http/helpers';
import { tr } from '../idioma';
import { CATALOG, fetchRepoMeta, installFromGithub, listInstalledResources } from '../marketplace';
import { knownServerAt } from '../server-registry';

export function marketplaceRouter(): Router {
  const router = createRouter();

  router.get('/api/marketplace/catalog', async (req, res) => {
    try {
      const { serverDataPath } = req.query as Record<string, string>;
      const installed = serverDataPath ? listInstalledResources(serverDataPath) : new Set<string>();

      const items = await Promise.all(
        CATALOG.map(async (entry) => ({
          ...entry,
          description: tr(entry.description),
          installed: entry.repo !== null && installed.has(entry.name.toLowerCase()),
          meta: entry.repo
            ? await fetchRepoMeta(entry.repo)
            : { stars: null, version: null, updatedAt: null },
        }))
      );

      res.json({
        success: true,
        items,
        installedKnown: Boolean(serverDataPath),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.post('/api/marketplace/install', async (req, res) => {
    const { repo, name, dependencies, overwrite } = req.body || {};

    if (typeof repo !== 'string' || typeof name !== 'string' || !repo || !name) {
      return res.status(400).json({ success: false, error: tr('Faltan "repo" y "name"') });
    }
    const server = knownServerAt(req.body?.serverDataPath);
    if (!server) return rejectUnknownServer(res);
    const { serverDataPath, cfgPath } = server;

    console.log(`[Marketplace] Instalando ${name} desde ${repo}...`);
    const result = await installFromGithub({ repo, name, serverDataPath, cfgPath, dependencies, overwrite });

    if (!result.success) {
      console.warn(`[Marketplace] Falló la instalación de ${name}: ${result.message}`);
      return res.status(400).json(result);
    }

    console.log(`[Marketplace] ${result.message}`);
    res.json(result);
  });

  return router;
}

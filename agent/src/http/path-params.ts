import type { RequestHandler } from 'express';
import { tr } from '../idioma';
import { isSafeResourceName } from '../path-guards';
import { isKnownCfg, resolveKnownDataPath } from '../server-registry';
import { rejectUnknownServer } from './helpers';

const SERVER_PATH_PARAMS: Record<string, { data?: string[]; cfg?: string[]; names?: string[] }> = {
  '/api/server/onesync': { cfg: ['cfgPath'] },
  '/api/server/settings': { cfg: ['cfgPath'] },
  '/api/server/ingame-resource': { data: ['serverDataPath'], cfg: ['cfgPath'] },
  '/api/server/update-resource': { data: ['serverDataPath'], cfg: ['cfgPath'] },
  '/api/server/install-resource': { data: ['serverDataPath'], cfg: ['cfgPath'] },
  '/api/server/diagnostics': { data: ['serverDataPath'], cfg: ['cfgPath'] },
  '/api/server/resources-on-disk': { data: ['serverDataPath'], cfg: ['cfgPath'] },
  '/api/server/bulk-resources': { data: ['serverDataPath'], cfg: ['cfgPath'] },
  '/api/marketplace/catalog': { data: ['serverDataPath'] },
  '/api/marketplace/install': { data: ['serverDataPath'], cfg: ['cfgPath'] },
  '/api/resource/files': { data: ['serverDataPath'], names: ['name'] },
  '/api/resource/tree': { data: ['serverDataPath'] },
  '/api/resource/search': { data: ['serverDataPath'], names: ['resource'] },
  '/api/resource/file': { data: ['serverDataPath'], names: ['name'] },
  '/api/resource/save-file': { data: ['serverDataPath'], names: ['resourceName'] },
  '/api/events/scan': { data: ['basePath'] },
  '/api/ai/chat/stream': { data: ['serverDataPath'], names: ['resource'] },
};

export const serverPathGuard: RequestHandler = (req, res, next) => {
  const params = SERVER_PATH_PARAMS[req.path];
  if (!params) return next();

  const source: Record<string, unknown> = (req.method === 'GET' ? req.query : req.body) || {};
  const given = (key: string) => source[key] !== undefined && source[key] !== null && source[key] !== '';

  for (const key of params.data ?? []) {
    if (given(key) && !resolveKnownDataPath(source[key])) return rejectUnknownServer(res);
  }
  for (const key of params.cfg ?? []) {
    if (given(key) && !isKnownCfg(source[key])) return rejectUnknownServer(res);
  }
  for (const key of params.names ?? []) {
    if (given(key) && !isSafeResourceName(source[key])) {
      return res.status(400).json({ success: false, error: tr('Nombre de recurso no válido.') });
    }
  }
  next();
};

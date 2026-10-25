import type { Router } from 'express';
import type { AgentContext } from '../http/context';
import { createRouter } from '../http/helpers';
import { tr } from '../idioma';
import type { LogLevel } from '../log-store';

export function logsRouter(ctx: AgentContext): Router {
  const { logStore } = ctx;
  const router = createRouter();

  router.get('/api/logs/recent', (req, res) => {
    const { levels, resource, search, limit } = req.query as Record<string, string>;

    const entries = logStore.query({
      levels: levels ? (levels.split(',').filter(Boolean) as LogLevel[]) : undefined,
      resource: resource || undefined,
      search: search || undefined,
      limit: limit ? Number(limit) : undefined,
    });

    res.json({
      success: true,
      entries,
      resources: logStore.knownResources(),
      counts: logStore.counts(),
      session: logStore.getSession(),
    });
  });

  router.get('/api/logs/files', (req, res) => {
    res.json({ success: true, files: logStore.listFiles() });
  });

  router.get('/api/logs/file', (req, res) => {
    const content = logStore.readFile(String(req.query.name || ''));
    if (content === null) {
      return res.status(404).json({ success: false, error: tr('Fichero de log no encontrado') });
    }
    res.type('text/plain').send(content);
  });

  return router;
}

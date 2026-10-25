import type { Router } from 'express';
import os from 'os';
import { listDirectory, listRoots } from '../fs-browse';
import { createRouter, errMsg } from '../http/helpers';
import { tr } from '../idioma';
import { describePaths, loadPathsConfig, savePathsConfig, type CreateDefaults } from '../paths-config';

export function pathsRouter(): Router {
  const router = createRouter();

  router.get('/api/fs/roots', (req, res) => {
    res.json({ success: true, roots: listRoots() });
  });

  router.get('/api/fs/list', (req, res) => {
    const target = typeof req.query.path === 'string' && req.query.path.trim() ? req.query.path : os.homedir();
    const ext = typeof req.query.ext === 'string' && req.query.ext ? req.query.ext.split(',') : undefined;

    try {
      res.json({ success: true, ...listDirectory(target, ext) });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      const status = code === 'ENOENT' ? 404 : code === 'EACCES' || code === 'EPERM' ? 403 : 400;
      res.status(status).json({
        success: false,
        error:
          status === 404
            ? tr('Esa carpeta no existe.')
            : status === 403
              ? tr('Windows no deja leer esa carpeta.')
              : tr('No se pudo abrir la carpeta: {errMsg}', { errMsg: errMsg(error) }),
      });
    }
  });

  router.get('/api/paths', (req, res) => {
    res.json({ success: true, paths: describePaths() });
  });

  router.get('/api/config/create', (req, res) => {
    res.json({ success: true, create: loadPathsConfig().create });
  });

  router.post('/api/config/create', (req, res) => {
    try {
      const { create } = req.body || {};
      const next = savePathsConfig({ create: create as CreateDefaults | undefined });
      res.json({ success: true, create: next.create });
    } catch (error) {
      res.status(500).json({ success: false, error: tr('No se pudieron guardar los valores: {errMsg}', { errMsg: errMsg(error) }) });
    }
  });

  router.post('/api/paths', (req, res) => {
    try {
      const { scanRoots, extraCfgs, fxServerBin } = req.body || {};
      res.json({ success: true, paths: describePaths(savePathsConfig({ scanRoots, extraCfgs, fxServerBin })) });
    } catch (error) {
      res.status(500).json({ success: false, error: tr('No se pudieron guardar las rutas: {errMsg}', { errMsg: errMsg(error) }) });
    }
  });

  return router;
}

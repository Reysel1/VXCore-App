import type { Response, Router } from 'express';
import fs from 'fs';
import path from 'path';
import { createRouter } from '../http/helpers';
import { tr } from '../idioma';

const UPDATES_DIR = path.resolve(process.cwd(), 'updates');

function streamUpdateFile(file: string, res: Response) {
  res.setHeader('Content-Type', 'application/octet-stream');
  const stream = fs.createReadStream(file);
  stream.on('error', () => {
    if (!res.headersSent) res.status(500).end();
    else res.destroy();
  });
  stream.pipe(res);
}

export function updatesRouter(): Router {
  const router = createRouter();

  router.get('/updates/latest.yml', (req, res) => {
    const file = path.join(UPDATES_DIR, 'latest.yml');
    if (!fs.existsSync(file)) {
      res.status(404).json({ error: tr('No hay actualizaciones publicadas aún.') });
      return;
    }
    streamUpdateFile(file, res);
  });

  router.get('/updates/:file', (req, res) => {
    const name = path.basename(req.params.file);
    const file = path.join(UPDATES_DIR, name);
    if (!fs.existsSync(file)) {
      res.status(404).json({ error: tr('Archivo no encontrado.') });
      return;
    }
    streamUpdateFile(file, res);
  });

  return router;
}

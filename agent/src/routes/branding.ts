import type { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { createRouter } from '../http/helpers';

export function brandingRouter(): Router {
  const router = createRouter();

  router.get('/api/branding/banner.png', (req, res) => {
    const candidates = [
      path.resolve(process.cwd(), '..', 'public', 'vertex', 'banner-vxcore.png'),
      path.resolve(process.cwd(), 'public', 'vertex', 'banner-vxcore.png'),
      path.resolve(
        (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath || process.cwd(),
        'public',
        'vertex',
        'banner-vxcore.png'
      ),
    ];

    const found = candidates.find((p) => fs.existsSync(p));
    if (!found) return res.status(404).end();

    res.type('png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(found).pipe(res);
  });

  return router;
}

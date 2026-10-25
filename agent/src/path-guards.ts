import fs from 'fs';
import path from 'path';

import { tr } from './idioma';

export function samePath(a: string, b: string): boolean {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

export function findKnownDataPath(servers: { serverDataPath?: unknown }[], candidate: unknown): string | null {
  if (typeof candidate !== 'string' || !candidate.trim()) return null;
  const match = servers.find((s) => typeof s.serverDataPath === 'string' && samePath(s.serverDataPath, candidate));
  return match ? path.resolve(match.serverDataPath as string) : null;
}

export function isSafeResourceName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.trim() !== '' &&
    name.length <= 200 &&
    !/[\\/\0\r\n]/.test(name) &&
    name !== '.' &&
    name !== '..'
  );
}

export const MAX_CFG_BYTES = 2 * 1024 * 1024;

export type CfgRead = { ok: true; path: string; content: string } | { ok: false; status: number; error: string };

export function readImportableCfg(rawPath: unknown): CfgRead {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    return { ok: false, status: 400, error: tr('Falta la ruta del server.cfg.') };
  }
  if (!path.isAbsolute(rawPath.trim())) {
    return { ok: false, status: 400, error: tr('La ruta del server.cfg tiene que ser absoluta.') };
  }
  const resolved = path.resolve(rawPath.trim());
  if (path.extname(resolved).toLowerCase() !== '.cfg') {
    return { ok: false, status: 400, error: tr('Sólo se pueden importar ficheros .cfg.') };
  }
  if (!fs.existsSync(resolved)) {
    return { ok: false, status: 404, error: tr('No existe el fichero: {resolved}', { resolved }) };
  }
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    return { ok: false, status: 400, error: tr('Esa ruta es una carpeta, no un server.cfg.') };
  }
  if (stat.size > MAX_CFG_BYTES) {
    return { ok: false, status: 400, error: tr('Ese fichero es demasiado grande para ser un server.cfg.') };
  }
  return { ok: true, path: resolved, content: fs.readFileSync(resolved, 'utf-8') };
}

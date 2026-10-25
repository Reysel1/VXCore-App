import fs from 'fs';
import path from 'path';
import os from 'os';
import { tr } from './idioma';

export interface FsEntry {
  name: string;
  path: string;
  directory: boolean;
  size?: number;
  modified?: string;
}

export interface FsListing {
  path: string;
  parent: string | null;
  entries: FsEntry[];
}

export function userFolder(name: 'desktop' | 'downloads'): string {
  const fromApp = process.env[name === 'desktop' ? 'VX_DESKTOP_DIR' : 'VX_DOWNLOADS_DIR'];
  if (fromApp && path.isAbsolute(fromApp)) return fromApp;
  return path.join(os.homedir(), name === 'desktop' ? 'Desktop' : 'Downloads');
}

export function listRoots(): FsEntry[] {
  const roots: FsEntry[] = [];

  if (process.platform === 'win32') {
    for (let code = 65; code <= 90; code++) {
      const drive = `${String.fromCharCode(code)}:\\`;
      try {
        if (fs.existsSync(drive)) {
          roots.push({ name: drive, path: drive, directory: true });
        }
      } catch {}
    }
  } else {
    roots.push({ name: '/', path: '/', directory: true });
  }

  const home = os.homedir();
  for (const candidate of [home, userFolder('desktop'), path.join(home, 'Documents')]) {
    try {
      if (fs.existsSync(candidate)) {
        roots.push({ name: path.basename(candidate) || candidate, path: candidate, directory: true });
      }
    } catch {}
  }

  return roots;
}

export function listDirectory(target: string, extensions?: string[]): FsListing {
  const resolved = path.resolve(target);

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw Object.assign(new Error(tr('No es una carpeta')), { code: 'ENOTDIR' });
  }

  const wanted = extensions?.map((e) => (e.startsWith('.') ? e : `.${e}`).toLowerCase());
  const entries: FsEntry[] = [];

  for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === '$RECYCLE.BIN') continue;

    const full = path.join(resolved, entry.name);

    if (entry.isDirectory()) {
      entries.push({ name: entry.name, path: full, directory: true });
      continue;
    }

    if (wanted && !wanted.includes(path.extname(entry.name).toLowerCase())) continue;

    try {
      const info = fs.statSync(full);
      entries.push({
        name: entry.name,
        path: full,
        directory: false,
        size: info.size,
        modified: info.mtime.toISOString(),
      });
    } catch {
      entries.push({ name: entry.name, path: full, directory: false });
    }
  }

  entries.sort((a, b) => {
    if (a.directory !== b.directory) return a.directory ? -1 : 1;
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });

  const parent = path.dirname(resolved);
  return { path: resolved, parent: parent === resolved ? null : parent, entries };
}

const sizeCache = new Map<string, { at: number; size: number; files: number }>();
const SIZE_TTL_MS = 60_000;
const SIZE_CACHE_MAX = 2000;

export function directorySize(target: string): { size: number; files: number } {
  const key = path.resolve(target).toLowerCase();
  const cached = sizeCache.get(key);
  if (cached && Date.now() - cached.at < SIZE_TTL_MS) {
    return { size: cached.size, files: cached.files };
  }

  let size = 0;
  let files = 0;

  const walk = (dir: string, depth: number) => {
    if (depth > 12) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        try {
          size += fs.statSync(full).size;
          files++;
        } catch {}
      }
    }
  };

  walk(path.resolve(target), 0);

  if (sizeCache.size >= SIZE_CACHE_MAX) {
    const oldest = sizeCache.keys().next().value;
    if (oldest !== undefined) sizeCache.delete(oldest);
  }
  sizeCache.set(key, { at: Date.now(), size, files });
  return { size, files };
}

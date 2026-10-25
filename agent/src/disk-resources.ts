import fs from 'fs';
import path from 'path';
import { isSafeResourceName } from './path-guards';

export interface DiskResource {
  name: string;
  path: string;
  category: string;
  groups: string[];
  hasManifest: boolean;
}

export function scanResourcesOnDisk(resourcesDir: string): DiskResource[] {
  const result: DiskResource[] = [];
  if (!fs.existsSync(resourcesDir)) return result;

  function walk(currentDir: string, groups: string[]) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (!entry.isDirectory()) continue;

        if (entry.name.startsWith('[') && entry.name.endsWith(']')) {
          walk(fullPath, [...groups, entry.name.slice(1, -1)]);
          continue;
        }

        const hasManifest =
          fs.existsSync(path.join(fullPath, 'fxmanifest.lua')) ||
          fs.existsSync(path.join(fullPath, '__resource.lua'));

        result.push({
          name: entry.name,
          path: fullPath,
          category: groups[groups.length - 1] || 'root',
          groups,
          hasManifest,
        });

        if (!hasManifest) walk(fullPath, groups);
      }
    } catch {}
  }

  walk(resourcesDir, []);
  return result;
}

export function resourcesFolderFor(serverDataPath?: string, cfgPath?: string): string | null {
  const baseDir = serverDataPath || (cfgPath ? path.dirname(cfgPath) : null);
  return baseDir ? path.join(baseDir, 'resources') : null;
}

export function resolveResourceDir(serverDataPath: string, resourceName: string): string | null {
  if (!isSafeResourceName(resourceName)) return null;
  const resourcesDir = path.join(serverDataPath, 'resources');
  const direct = path.join(resourcesDir, resourceName);
  if (fs.existsSync(direct)) return direct;

  const match = scanResourcesOnDisk(resourcesDir).find(
    (r) => r.name.toLowerCase() === resourceName.toLowerCase()
  );
  return match ? match.path : null;
}

export function resolveInsideResource(resourceDir: string, relativePath: string): string | null {
  const target = path.resolve(resourceDir, relativePath);
  const root = path.resolve(resourceDir);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  try {
    const realRoot = fs.realpathSync(root);
    let probe = target;
    while (!fs.existsSync(probe)) probe = path.dirname(probe);
    const realProbe = fs.realpathSync(probe);
    if (realProbe !== realRoot && !realProbe.startsWith(realRoot + path.sep)) return null;
  } catch {
    return null;
  }
  return target;
}

export const EDITABLE_EXTENSIONS = new Set([
  '.lua', '.js', '.ts', '.json', '.cfg', '.md', '.html', '.css', '.txt', '.sql', '.yml', '.yaml', '.xml',
]);

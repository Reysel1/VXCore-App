import fs from 'fs';
import path from 'path';
import os from 'os';

export interface PathsConfig {
  scanRoots: string[];
  extraCfgs: string[];
  fxServerBin: string | null;
  cfxServerBin: string | null;
  create: CreateDefaults;
}

export interface CreateDefaults {
  baseDir: string;
  port: number;
  maxSlots: number;
  build: 'legacy' | 'enhanced';
  installVcRedist: boolean;
  downloadArtifacts: boolean;
}

function defaultCreateDefaults(): CreateDefaults {
  return {
    baseDir: '',
    port: 30120,
    maxSlots: 32,
    build: 'legacy',
    installVcRedist: true,
    downloadArtifacts: true,
  };
}

const FILE = path.resolve(process.cwd(), 'paths.json');

export function defaultScanRoots(): string[] {
  const home = os.homedir();
  return [
    'C:\\FXServer\\server-data',
    'C:\\FXServer\\server',
    'C:\\FiveM\\server-data',
    'D:\\FXServer\\server-data',
    'D:\\FiveM\\server-data',
    '/home/fivem/server-data',
    '/home/fxserver/server-data',
    '/root/FXServer/server-data',
    '/opt/fxserver/server-data',
    path.join(home, 'FXServer', 'server-data'),
    path.join(home, 'Desktop', 'FXServer', 'server-data'),
    path.join(home, 'fxserver', 'server-data'),
  ];
}

export function defaultFxServerBins(): string[] {
  return [
    'C:\\FXServer\\server\\FXServer.exe',
    'C:\\FXServer\\FXServer.exe',
    'C:\\FXServer\\run.cmd',
    'D:\\FXServer\\server\\FXServer.exe',
    'D:\\FXServer\\FXServer.exe',
    'D:\\FXServer\\run.cmd',
    '/opt/cfx-server/run.sh',
    '/home/fivem/server/run.sh',
  ];
}

const EMPTY: PathsConfig = {
  scanRoots: [],
  extraCfgs: [],
  fxServerBin: null,
  cfxServerBin: null,
  create: defaultCreateDefaults(),
};

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const key = path.resolve(trimmed).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function cleanCreate(raw: unknown): CreateDefaults {
  const defaults = defaultCreateDefaults();
  if (!raw || typeof raw !== 'object') return defaults;
  const obj = raw as Record<string, unknown>;
  return {
    baseDir: typeof obj.baseDir === 'string' ? obj.baseDir.trim() : defaults.baseDir,
    port: typeof obj.port === 'number' && obj.port > 0 && obj.port < 65536 ? Math.floor(obj.port) : defaults.port,
    maxSlots:
      typeof obj.maxSlots === 'number' && obj.maxSlots > 0 && obj.maxSlots <= 2048
        ? Math.floor(obj.maxSlots)
        : defaults.maxSlots,
    build: obj.build === 'enhanced' ? 'enhanced' : 'legacy',
    installVcRedist: typeof obj.installVcRedist === 'boolean' ? obj.installVcRedist : defaults.installVcRedist,
    downloadArtifacts: typeof obj.downloadArtifacts === 'boolean' ? obj.downloadArtifacts : defaults.downloadArtifacts,
  };
}

export function loadPathsConfig(): PathsConfig {
  try {
    if (!fs.existsSync(FILE)) return { ...EMPTY };
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    return {
      scanRoots: cleanList(raw?.scanRoots),
      extraCfgs: cleanList(raw?.extraCfgs),
      fxServerBin: typeof raw?.fxServerBin === 'string' && raw.fxServerBin.trim() ? raw.fxServerBin.trim() : null,
      cfxServerBin:
        typeof raw?.cfxServerBin === 'string' && raw.cfxServerBin.trim() ? raw.cfxServerBin.trim() : null,
      create: cleanCreate(raw?.create),
    };
  } catch (err) {
    console.error('[Agent] paths.json ilegible; se usan sólo las rutas por defecto:', err);
    return { ...EMPTY };
  }
}

export function savePathsConfig(input: Partial<PathsConfig>): PathsConfig {
  const current = loadPathsConfig();
  const next: PathsConfig = {
    scanRoots: input.scanRoots !== undefined ? cleanList(input.scanRoots) : current.scanRoots,
    extraCfgs: input.extraCfgs !== undefined ? cleanList(input.extraCfgs) : current.extraCfgs,
    fxServerBin:
      input.fxServerBin !== undefined
        ? typeof input.fxServerBin === 'string' && input.fxServerBin.trim()
          ? input.fxServerBin.trim()
          : null
        : current.fxServerBin,
    cfxServerBin:
      input.cfxServerBin !== undefined
        ? typeof input.cfxServerBin === 'string' && input.cfxServerBin.trim()
          ? input.cfxServerBin.trim()
          : null
        : current.cfxServerBin,
    create: input.create !== undefined ? cleanCreate(input.create) : current.create,
  };

  fs.writeFileSync(FILE, JSON.stringify(next, null, 2), 'utf-8');
  console.log(`[Agent] Rutas guardadas en ${FILE}`);
  return next;
}

export function describePaths(config: PathsConfig = loadPathsConfig()) {
  const exists = (p: string) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  };

  return {
    scanRoots: config.scanRoots.map((p) => ({ path: p, exists: exists(p) })),
    extraCfgs: config.extraCfgs.map((p) => ({ path: p, exists: exists(p) })),
    fxServerBin: config.fxServerBin
      ? { path: config.fxServerBin, exists: exists(config.fxServerBin) }
      : null,
    cfxServerBin: config.cfxServerBin
      ? { path: config.cfxServerBin, exists: exists(config.cfxServerBin) }
      : null,
    defaults: defaultScanRoots()
      .filter(exists)
      .map((p) => ({ path: p, exists: true })),
    create: config.create,
    file: FILE,
  };
}

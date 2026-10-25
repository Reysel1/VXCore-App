import fs from 'fs';
import path from 'path';
import { parseServerCfg } from './cfg-parser';
import type { DbConfig } from './db-service';
import { describeOpen77Secrets, readOpen77Config } from './open77';
import { findKnownDataPath, samePath } from './path-guards';
import { defaultScanRoots, loadPathsConfig } from './paths-config';
import type { ProcessManager } from './process-manager';

export interface RegisteredServer {
  id?: string;
  game?: 'fivem' | 'redm' | 'open77';
  name?: string;
  ip?: string;
  port?: number | string;
  maxClients?: number;
  location?: string;
  framework?: string;
  database?: string | { connected: boolean; connectionString?: string; dbName?: string; host?: string };
  dbConnection?: string;
  cfgPath?: string;
  serverDataPath?: string;
  rawContent?: string;
  resources?: unknown[];
  detectedId?: string;
  [key: string]: unknown;
}

const REGISTRY_FILE = path.resolve(process.cwd(), 'registered_servers.json');

export function getRegisteredServers(): RegisteredServer[] {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      const data = fs.readFileSync(REGISTRY_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[Agent] Error reading registered_servers.json:', err);
  }
  return [];
}

export function saveRegisteredServer(serverData: RegisteredServer): void {
  try {
    const servers = getRegisteredServers();
    const existingIndex = servers.findIndex(
      (s) => (serverData.id && s.id === serverData.id) || (serverData.cfgPath && s.cfgPath === serverData.cfgPath)
    );
    if (existingIndex >= 0) {
      servers[existingIndex] = { ...servers[existingIndex], ...serverData };
    } else {
      servers.push(serverData);
    }
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(servers, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Agent] Error saving to registered_servers.json:', err);
  }
}

const ACTIVE_FILE = path.resolve(process.cwd(), 'active-server.json');

function getActiveServerId(): string | null {
  try {
    if (fs.existsSync(ACTIVE_FILE)) {
      return JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf-8'))?.id ?? null;
    }
  } catch {}
  return null;
}

export function setActiveServerId(id: string): void {
  try {
    fs.writeFileSync(ACTIVE_FILE, JSON.stringify({ id }, null, 2), 'utf-8');
    console.log(`[Agent] Servidor activo: ${id}`);
  } catch (err) {
    console.error('[Agent] No se pudo guardar el servidor activo:', err);
  }
}

export function getActiveServer(processManager: ProcessManager): RegisteredServer | null {
  const candidates = listKnownServers();
  if (candidates.length === 0) return null;

  const running = processManager.getRunningServer();
  if (running) {
    const match = candidates.find(
      (s) => s.cfgPath && path.resolve(s.cfgPath) === path.resolve(running.cfgPath)
    );
    if (match) return match;
  }

  const activeId = getActiveServerId();
  return candidates.find((s) => s.id === activeId) || candidates[0];
}

function backupRegistry(): void {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      fs.copyFileSync(REGISTRY_FILE, `${REGISTRY_FILE}.bak`);
    }
  } catch (err) {
    console.error('[Agent] No se pudo respaldar el registro de servidores:', err);
  }
}

export function removeRegisteredServer(idOrPath: string): void {
  try {
    const before = getRegisteredServers();
    const servers = before.filter((s) => s.id !== idOrPath && s.cfgPath !== idOrPath);

    if (servers.length === before.length) {
      console.warn(`[Agent] Nada que eliminar: ningún servidor coincide con "${idOrPath}".`);
      return;
    }

    backupRegistry();
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(servers, null, 2), 'utf-8');
    console.log(`[Agent] Eliminado "${idOrPath}". Quedan ${servers.length} servidor(es).`);
  } catch (err) {
    console.error('[Agent] Error removing from registered_servers.json:', err);
  }
}

export function findServerCfgPaths(): { cfgPath: string; serverDataPath: string }[] {
  const found: { cfgPath: string; serverDataPath: string }[] = [];
  const config = loadPathsConfig();

  const candidates: string[] = [...config.scanRoots, ...defaultScanRoots()];

  const registered = getRegisteredServers();
  for (const reg of registered) {
    if (reg.cfgPath) {
      candidates.unshift(path.dirname(reg.cfgPath));
    }
  }

  if (process.env.FXSERVER_PATH) {
    candidates.unshift(process.env.FXSERVER_PATH);
  }

  const seen = new Set<string>();
  const add = (cfgPath: string, serverDataPath: string) => {
    const resolved = path.resolve(cfgPath);
    if (seen.has(resolved.toLowerCase())) return;
    seen.add(resolved.toLowerCase());
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        found.push({ cfgPath: resolved, serverDataPath: path.resolve(serverDataPath) });
      }
    } catch {}
  };

  for (const cfg of config.extraCfgs) add(cfg, path.dirname(cfg));

  for (const dir of candidates) {
    try {
      add(path.join(dir, 'server.cfg'), dir);
    } catch {}
  }

  return found;
}

const VOLATILE_FIELDS = ['status', 'uptime', 'cpu', 'ram', 'players', 'managed', 'livenessSource'];

function stripVolatileState<T extends Record<string, unknown>>(entry: T): T {
  const clean = { ...entry };
  for (const field of VOLATILE_FIELDS) delete clean[field];
  return clean;
}

const idForCfg = (cfgPath: string) =>
  `srv-${Buffer.from(cfgPath).toString('base64').slice(-8).replace(/[^a-zA-Z0-9]/g, 'x')}`;

export function listKnownServers(): RegisteredServer[] {
  return getRegisteredServers().map((reg, idx) => {
    const stableId = reg.id || (reg.cfgPath ? idForCfg(reg.cfgPath) : `reg-${idx}`);

    if (reg.game === 'open77') {
      if (reg.cfgPath && fs.existsSync(reg.cfgPath)) {
        try {
          const info = readOpen77Config(reg.cfgPath, {
            port: reg.port,
            maxClients: reg.maxClients,
            name: reg.name,
          });
          return {
            ...stripVolatileState(reg),
            ...info,
            ...describeOpen77Secrets(reg.cfgPath),
            cfgPath: reg.cfgPath,
            serverDataPath: reg.serverDataPath || path.dirname(reg.cfgPath),
            id: stableId,
            detectedId: stableId,
            cfgMissing: false,
          };
        } catch {}
      }
      return { ...stripVolatileState(reg), id: stableId, detectedId: stableId, cfgMissing: true };
    }

    if (reg.cfgPath && fs.existsSync(reg.cfgPath)) {
      try {
        const rawContent = fs.readFileSync(reg.cfgPath, 'utf-8');
        const parsed = parseServerCfg(rawContent);
        return {
          ...stripVolatileState(reg),
          ...parsed,
          database: parsed.database.connectionString ? parsed.database.dbName : reg.database,
          dbConnection: parsed.database.connectionString || reg.dbConnection,
          ip: reg.ip || parsed.ip,
          port: reg.port ?? parsed.port,
          rawContent,
          cfgPath: reg.cfgPath,
          serverDataPath: reg.serverDataPath || path.dirname(reg.cfgPath),
          id: stableId,
          detectedId: stableId,
          cfgMissing: false,
        };
      } catch {}
    }

    return { ...stripVolatileState(reg), id: stableId, detectedId: stableId, cfgMissing: true };
  });
}

export function discoverServerCandidates(): RegisteredServer[] {
  const alreadyAdded = new Set(
    getRegisteredServers()
      .filter((s) => s.cfgPath)
      .map((s) => path.resolve(s.cfgPath as string).toLowerCase())
  );

  const candidates: RegisteredServer[] = [];
  for (const entry of findServerCfgPaths()) {
    if (alreadyAdded.has(path.resolve(entry.cfgPath).toLowerCase())) continue;
    try {
      const rawContent = fs.readFileSync(entry.cfgPath, 'utf-8');
      candidates.push({
        ...parseServerCfg(rawContent),
        rawContent,
        cfgPath: entry.cfgPath,
        serverDataPath: entry.serverDataPath,
        id: idForCfg(entry.cfgPath),
      });
    } catch {}
  }
  return candidates;
}

export function resolveKnownDataPath(serverDataPath: unknown): string | null {
  return findKnownDataPath(listKnownServers(), serverDataPath);
}

export function isKnownCfg(cfgPath: unknown): boolean {
  return (
    typeof cfgPath === 'string' &&
    listKnownServers().some((s) => typeof s.cfgPath === 'string' && samePath(s.cfgPath, cfgPath))
  );
}

export function knownServerAt(serverDataPath: unknown): { serverDataPath: string; cfgPath?: string } | null {
  const dataPath = resolveKnownDataPath(serverDataPath);
  if (!dataPath) return null;
  const server = listKnownServers().find(
    (s) => typeof s.serverDataPath === 'string' && samePath(s.serverDataPath, dataPath)
  );
  return { serverDataPath: dataPath, cfgPath: typeof server?.cfgPath === 'string' ? server.cfgPath : undefined };
}

export function resolveKnownCfg(cfgPath: unknown, processManager: ProcessManager): string | null {
  if (typeof cfgPath !== 'string' || !cfgPath.trim()) {
    const active = getActiveServer(processManager);
    return active?.cfgPath && fs.existsSync(active.cfgPath) ? active.cfgPath : null;
  }

  const wanted = path.resolve(cfgPath);
  if (!isKnownCfg(wanted) || !fs.existsSync(wanted)) return null;
  return wanted;
}

export function serverDbConfig(server: RegisteredServer | null | undefined): DbConfig | null {
  const connectionString = typeof server?.dbConnection === 'string' ? server.dbConnection.trim() : '';
  if (!connectionString) return null;
  return { connectionString, database: typeof server?.database === 'string' ? server.database : undefined };
}

export function activeDbConfig(processManager: ProcessManager): DbConfig | null {
  return serverDbConfig(getActiveServer(processManager));
}

import fs from 'fs';
import path from 'path';
import { resolveStarted } from './cfg-resources';
import { scanResourcesOnDisk } from './disk-resources';
import type { GameState } from './game-state';
import type { ProcessManager } from './process-manager';
import { RESOURCE_FOLDER_NAMES, syncBundledResource } from './provision';
import { getRegisteredServers } from './server-registry';

export interface InGameResourceState {
  installed: boolean;
  ensured: boolean;
  reporting: boolean;
  lastHeartbeat: string | null;
  ageMs: number | null;
  folder: string | null;
  installedVersion: string | null;
  expectedVersion: string | null;
  updateAvailable: boolean;
}

const HEARTBEAT_FRESH_MS = 12000;

export function inGameResourceState(game: GameState, serverDataPath?: string, cfgPath?: string): InGameResourceState {
  const ageMs = game.heartbeatAgeMs();
  const state: InGameResourceState = {
    installed: false,
    ensured: false,
    reporting: ageMs !== null && ageMs < HEARTBEAT_FRESH_MS,
    lastHeartbeat: game.telemetry.lastHeartbeat || null,
    ageMs,
    folder: null,
    installedVersion: null,
    expectedVersion: null,
    updateAvailable: false,
  };

  const baseDir = serverDataPath || (cfgPath ? path.dirname(cfgPath) : null);
  if (!baseDir) return state;

  const scanned = scanResourcesOnDisk(path.join(baseDir, 'resources'));
  const found = scanned.find((r) => RESOURCE_FOLDER_NAMES.includes(r.name.toLowerCase()));
  if (!found) return state;

  state.installed = true;
  state.folder = found.name;

  const stampPath = path.join(found.path, '.vxcore-version');
  try {
    if (fs.existsSync(stampPath)) {
      const stamped = fs.readFileSync(stampPath, 'utf-8').trim();
      if (stamped) state.installedVersion = stamped;
    }
  } catch {}

  state.expectedVersion = process.env.VX_APP_VERSION || 'dev';
  state.updateAvailable =
    !!state.installedVersion &&
    !!state.expectedVersion &&
    state.installedVersion !== state.expectedVersion;

  if (cfgPath && fs.existsSync(cfgPath)) {
    try {
      const { started } = resolveStarted(fs.readFileSync(cfgPath, 'utf-8'), scanned);
      state.ensured = [...started].some((name) => name.toLowerCase() === found.name.toLowerCase());
    } catch {}
  }

  return state;
}

export function hotReloadInGameResource(processManager: ProcessManager, dataPath: string): boolean {
  const running = processManager.getRunningServer();
  if (!running || path.resolve(running.serverDataPath) !== path.resolve(dataPath)) return false;
  processManager.executeCommand('refresh');
  processManager.executeCommand(`ensure ${RESOURCE_FOLDER_NAMES[0]}`);
  processManager.executeCommand(`ensure ${RESOURCE_FOLDER_NAMES[1]}`);
  return true;
}

export function syncInGameResources(processManager: ProcessManager): void {
  const appVersion = process.env.VX_APP_VERSION || 'dev';
  for (const server of getRegisteredServers()) {
    const dataPath = server.serverDataPath;
    if (!dataPath) continue;
    try {
      const result = syncBundledResource(dataPath, appVersion);
      if (result === 'updated' || result === 'reactivated') {
        console.log(
          result === 'updated'
            ? `[FiveOS Agent] Recurso in-game actualizado en ${dataPath}`
            : `[FiveOS Agent] Recurso in-game actualizado y re-añadido al server.cfg de ${dataPath}`
        );
        if (hotReloadInGameResource(processManager, dataPath)) {
          console.log('[FiveOS Agent] Recurso in-game recargado en el servidor en marcha.');
        }
      } else if (result === 'absent') {
        console.log(
          `[FiveOS Agent] ${dataPath} no tiene el recurso in-game instalado: ` +
            `las sanciones y los identificadores in-game no funcionarán en ese servidor.`
        );
      }
    } catch (err) {
      console.error('[FiveOS Agent] No se pudo actualizar el recurso in-game:', err);
    }
  }
}

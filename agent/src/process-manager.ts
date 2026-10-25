import { spawn, ChildProcessWithoutNullStreams, execFile } from 'child_process';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { checkFirewallFor } from './firewall';
import { loadPathsConfig, savePathsConfig, defaultFxServerBins } from './paths-config';
import { parseServerCfg } from './cfg-parser';
import { readOneSync } from './cfg-convars';
import { tr } from './idioma';
import {
  OPEN77_RULE_NAME,
  buildOpen77Launch,
  findOpen77Binary,
  getOpen77Secrets,
  probeOpen77,
} from './open77';

export type LivenessSource = 'managed' | 'external' | 'offline';

export const LOG_ROOM = 'console';

export type ManagedGame = 'fxserver' | 'open77';

const ANSI_PATTERN = /\[[0-9;?]*[ -/]*[@-~]/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

export interface ServerLiveness {
  managed: boolean;
  reachable: boolean;
  online: boolean;
  source: LivenessSource;
  uptime: string | null;
  hostname?: string;
}

export interface ServerMarker {
  game?: 'fivem' | 'redm';
  build?: 'legacy' | 'enhanced';
}

function readServerMarker(dir: string): ServerMarker | null {
  try {
    const file = path.join(dir, '.vxcore-game');
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const marker: ServerMarker = {};
    if (raw?.game === 'redm') marker.game = 'redm';
    else if (raw?.game === 'fivem') marker.game = 'fivem';
    if (raw?.build === 'enhanced') marker.build = 'enhanced';
    else if (raw?.build === 'legacy') marker.build = 'legacy';
    return marker;
  } catch {
    return null;
  }
}

function cfgForcesEnhancedBuild(cfgPath?: string): boolean {
  if (!cfgPath) return false;
  try {
    return /sv_enforceGameBuild\s+\d{1,3}\b/i.test(fs.readFileSync(cfgPath, 'utf-8'));
  } catch {
    return false;
  }
}

function cfgForcesLegacyBuild(cfgPath?: string): boolean {
  if (!cfgPath) return false;
  try {
    return /sv_enforceGameBuild\s+\d{4,}\b/i.test(fs.readFileSync(cfgPath, 'utf-8'));
  } catch {
    return false;
  }
}

export async function probeFxServer(
  ip?: string,
  port?: string | number,
  timeoutMs = 1500
): Promise<{ reachable: boolean; hostname?: string; players?: number }> {
  const host = (ip || '127.0.0.1').replace(/:\d+$/, '');
  const gamePort = port || (ip && ip.includes(':') ? ip.split(':')[1] : '30120');

  try {
    const response = await fetch(`http://${host}:${gamePort}/info.json`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { reachable: false };

    const info = (await response.json()) as { vars?: { sv_hostname?: string } } | null;
    return {
      reachable: true,
      hostname: info?.vars?.sv_hostname,
    };
  } catch {
    return { reachable: false };
  }
}

export function binaryVariant(bin: string): 'legacy' | 'enhanced' {
  return /^cfx-server(\.exe)?$/i.test(path.basename(bin)) ? 'enhanced' : 'legacy';
}

export function escrowResources(serverDataPath: string): { count: number; names: string[] } {
  const names: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 8) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (/^\[.*\]$/.test(entry.name)) walk(full, depth + 1);
      else if (fs.existsSync(path.join(full, '.fxap'))) names.push(entry.name);
    }
  };
  walk(path.join(serverDataPath, 'resources'), 0);
  return { count: names.length, names };
}

export class ProcessManager {
  private serverProcess: ChildProcessWithoutNullStreams | null = null;
  private io: Server;
  private startedAt: Date | null = null;
  private currentServerDataPath: string = '';
  private currentCfgPath: string = '';
  private currentGame: ManagedGame = 'fxserver';
  private logListeners: ((line: string, stream: 'stdout' | 'stderr') => void)[] = [];
  private sessionListeners: ((label: string) => void)[] = [];

  constructor(io: Server) {
    this.io = io;
  }

  onLog(listener: (line: string, stream: 'stdout' | 'stderr') => void): void {
    this.logListeners.push(listener);
  }

  waitForLine(match: (line: string) => boolean, timeoutMs: number): Promise<string | null> {
    return new Promise((resolve) => {
      const listener = (line: string) => {
        if (match(line)) finish(line);
      };
      const finish = (line: string | null) => {
        clearTimeout(timer);
        this.logListeners = this.logListeners.filter((l) => l !== listener);
        resolve(line);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      this.logListeners.push(listener);
    });
  }

  onSessionStart(listener: (label: string) => void): void {
    this.sessionListeners.push(listener);
  }

  private emitLine(line: string, stream: 'stdout' | 'stderr'): void {
    this.io.to(LOG_ROOM).emit('server-log', { type: stream, message: line, time: new Date().toISOString() });
    for (const listener of this.logListeners) {
      try {
        listener(line, stream);
      } catch (err) {
        console.error('[ProcessManager] Un listener de log falló:', err);
      }
    }
  }

  isRunning(): boolean {
    return this.serverProcess !== null && !this.serverProcess.killed;
  }

  getUptime(): string | null {
    if (!this.startedAt) return null;
    const diff = Date.now() - this.startedAt.getTime();
    const seconds = Math.floor(diff / 1000);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
  }

  async getLiveness(ip?: string, port?: string | number): Promise<ServerLiveness> {
    const managed = this.isRunning();
    const probe = await probeFxServer(ip, port);

    return {
      managed,
      reachable: probe.reachable,
      online: managed || probe.reachable,
      source: managed ? 'managed' : probe.reachable ? 'external' : 'offline',
      uptime: managed ? this.getUptime() : null,
      hostname: probe.hostname,
    };
  }

  findFxServerBinary(
    serverDataPath?: string,
    cfgPath?: string,
    force?: 'legacy' | 'enhanced'
  ): string | null {
    const dataDir = serverDataPath || (cfgPath ? path.dirname(cfgPath) : undefined);
    const marker = dataDir ? readServerMarker(dataDir) : null;
    const enhanced = force
      ? force === 'enhanced'
      : !cfgForcesLegacyBuild(cfgPath) &&
        (marker?.build === 'enhanced' ||
          (marker === null && !!dataDir && cfgForcesEnhancedBuild(cfgPath) &&
            fs.existsSync(path.join(dataDir, 'cfx-server.exe'))));

    if (enhanced) {
      const candidates: (string | undefined)[] = [];

      const configured = loadPathsConfig().cfxServerBin;
      if (configured && fs.existsSync(configured)) candidates.push(configured);
      if (process.env.CFX_SERVER_BIN) candidates.push(process.env.CFX_SERVER_BIN);

      const near = (base: string) => [
        path.join(base, 'cfx-server.exe'),
        path.join(base, 'dlls', 'cfx-server.exe'),
        path.join(base, 'artifacts', 'cfx-server.exe'),
        path.join(base, 'server', 'cfx-server.exe'),
        path.join(base, '..', 'cfx-server.exe'),
      ];
      if (serverDataPath) candidates.push(...near(serverDataPath));
      if (cfgPath) candidates.push(...near(path.dirname(cfgPath)));

      candidates.push(
        path.join(process.env.LOCALAPPDATA || os.homedir(), 'VXCore', 'FXServer-Enhanced', 'cfx-server.exe')
      );

      for (const cand of candidates) {
        if (cand && binaryVariant(cand) === 'enhanced' && fs.existsSync(cand)) {
          console.log(`[ProcessManager] Binario de GTAV Enhanced encontrado en: ${cand}`);
          return cand;
        }
      }

      if (force === 'enhanced') return null;
    }

    const candidates: (string | undefined)[] = [];

    const configured = loadPathsConfig().fxServerBin;
    if (configured && fs.existsSync(configured)) candidates.push(configured);
    if (process.env.FXSERVER_BIN) candidates.push(process.env.FXSERVER_BIN);

    const nearby = (base: string) => [
      path.join(base, 'FXServer.exe'),
      path.join(base, 'run.cmd'),
      path.join(base, 'dlls', 'FXServer.exe'),
      path.join(base, 'artifacts', 'FXServer.exe'),
      path.join(base, 'server', 'FXServer.exe'),
      path.join(base, '..', 'FXServer.exe'),
      path.join(base, '..', 'run.cmd'),
      path.join(base, '..', 'dlls', 'FXServer.exe'),
      path.join(base, '..', 'artifacts', 'FXServer.exe'),
      path.join(base, '..', 'server', 'FXServer.exe'),
      path.join(base, 'run.sh'),
      path.join(base, '..', 'run.sh'),
      path.join(base, 'alpine', 'opt', 'cfx-server', 'ld-musl-x86_64.so.1'),
    ];

    if (serverDataPath) candidates.push(...nearby(serverDataPath));
    if (cfgPath) candidates.push(...nearby(path.dirname(cfgPath)));

    candidates.push(...defaultFxServerBins());

    for (const cand of candidates) {
      if (cand && binaryVariant(cand) === 'legacy' && fs.existsSync(cand)) {
        console.log(`[ProcessManager] FXServer encontrado en: ${cand}`);
        return cand;
      }
    }

    return null;
  }

  getRunningServer(): {
    cfgPath: string;
    serverDataPath: string;
    startedAt: Date;
    game: ManagedGame;
  } | null {
    if (!this.isRunning() || !this.startedAt) return null;
    return {
      cfgPath: this.currentCfgPath,
      serverDataPath: this.currentServerDataPath,
      startedAt: this.startedAt,
      game: this.currentGame,
    };
  }

  async startOpen77Server(options: {
    cfgPath: string;
    serverDataPath?: string;
    port?: string | number;
    maxPlayers?: number;
  }): Promise<{
    success: boolean;
    message: string;
    code?: string;
    firewall?: { program: string; ruleName: string };
  }> {
    const running = this.getRunningServer();
    if (running) {
      const sameServer = path.resolve(options.cfgPath) === path.resolve(running.cfgPath);
      return sameServer
        ? { success: false, code: 'ALREADY_RUNNING', message: tr('Este servidor ya está en ejecución.') }
        : {
            success: false,
            code: 'ANOTHER_SERVER_RUNNING',
            message: tr('Ya hay otro servidor en ejecución ({path}). Detenlo antes de arrancar este.', { path: path.basename(running.serverDataPath) }),
          };
    }

    const cfgPath = options.cfgPath;
    if (!cfgPath || !fs.existsSync(cfgPath)) {
      return {
        success: false,
        code: 'CFG_NOT_FOUND',
        message: tr('No se encontró el server.jsonc del servidor Open77 ({path}).', { path: cfgPath || '?' }),
      };
    }
    const dataPath = options.serverDataPath || path.dirname(cfgPath);

    if (!getOpen77Secrets(cfgPath)?.licenseKey && !process.env.OP77_LICENSE_KEY) {
      return {
        success: false,
        code: 'OPEN77_LICENSE_MISSING',
        message: tr('Falta la clave de licencia de Open77 (op77_live_…). Créala en open2077.net/account/keys.'),
      };
    }

    if ((await probeOpen77(cfgPath)).reachable) {
      return {
        success: false,
        code: 'FOREIGN_SERVER_RUNNING',
        message: tr('Este servidor Open77 ya está en marcha y no lo ha arrancado VXCore. Ciérralo antes desde donde lo lanzaste.'),
      };
    }

    const bin = findOpen77Binary(dataPath);
    if (!bin) {
      return {
        success: false,
        code: 'BINARY_NOT_FOUND',
        message: tr('No encuentro Open77.Server en {dataPath}. Descarga el servidor dedicado desde open2077.net/host y descomprímelo ahí.', { dataPath }),
      };
    }

    if (process.platform === 'win32' && /\.exe$/i.test(bin)) {
      const fw = await checkFirewallFor(bin, OPEN77_RULE_NAME);
      if (fw.ok === false) {
        return {
          success: false,
          code: 'FIREWALL_PERMISSION_NEEDED',
          message: tr('Windows Firewall necesita permiso para que el servidor de Open77 se comunique por la red. Concede el permiso en el panel y el servidor arrancará solo.'),
          firewall: { program: fw.program, ruleName: fw.ruleName },
        };
      }
    }

    const { args, env } = buildOpen77Launch(cfgPath, { port: options.port, maxPlayers: options.maxPlayers });

    this.currentServerDataPath = dataPath;
    this.currentCfgPath = cfgPath;
    this.currentGame = 'open77';
    console.log(`[ProcessManager] Arrancando Open77 en: ${dataPath}`);

    try {
      this.serverProcess = spawn(bin, args, {
        cwd: dataPath,
        env,
        windowsHide: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.startedAt = new Date();

      for (const listener of this.sessionListeners) {
        try {
          listener(`${path.basename(dataPath)} (Open77)`);
        } catch (err) {
          console.error('[ProcessManager] Un listener de sesión falló:', err);
        }
      }
      this.emitLine(`[VXCore] Binario: ${bin} (Open77 · Cyberpunk 2077)`, 'stdout');

      const consume = (stream: 'stdout' | 'stderr') => {
        let pending = '';
        return (data: Buffer) => {
          pending += data.toString();
          const lines = pending.split(/\r?\n/);
          pending = lines.pop() ?? '';
          for (const raw of lines) {
            const line = stripAnsi(raw).trimEnd();
            if (!line) continue;
            if (stream === 'stderr') console.error(`[Open77 ERROR] ${line}`);
            else console.log(`[Open77] ${line}`);
            this.emitLine(line, stream);
          }
        };
      };
      this.serverProcess.stdout.on('data', consume('stdout'));
      this.serverProcess.stderr.on('data', consume('stderr'));

      this.serverProcess.on('error', (err) => {
        console.error('[ProcessManager] Error ejecutando Open77:', err);
        this.io.to(LOG_ROOM).emit('server-log', {
          type: 'stderr',
          message: tr('[ERROR Proceso Open77]: {message}', { message: err.message }),
          time: new Date().toISOString(),
        });
        this.serverProcess = null;
        this.startedAt = null;
        this.currentGame = 'fxserver';
        this.io.emit('server-status', { status: 'offline', reason: err.message });
      });

      this.serverProcess.on('close', (code) => {
        console.log(`[ProcessManager] Open77 terminó con código ${code}`);
        this.serverProcess = null;
        this.startedAt = null;
        this.currentGame = 'fxserver';
        this.io.emit('server-status', { status: 'offline', code });
      });

      this.io.emit('server-status', { status: 'starting' });
      this.io.to(LOG_ROOM).emit('server-log', {
        type: 'stdout',
        message: tr('[FiveOS Agent] Lanzado {path} (--config {cfgName}) en {dataPath}.', {
          path: path.basename(bin),
          cfgName: path.basename(cfgPath),
          dataPath,
        }),
        time: new Date().toISOString(),
      });

      return { success: true, message: tr('Servidor Open77 lanzado') };
    } catch (error) {
      console.error('[ProcessManager] No se pudo arrancar Open77', error);
      this.serverProcess = null;
      this.startedAt = null;
      this.currentGame = 'fxserver';
      return { success: false, code: 'SPAWN_FAILED', message: tr('Error al iniciar Open77: {message}', { message: (error as Error).message }) };
    }
  }

  async startServer(options?: {
    serverDataPath?: string;
    cfgPath?: string;
    fxServerBin?: string;
    ip?: string;
    port?: string | number;
  }): Promise<{
    success: boolean;
    message: string;
    code?: string;
    firewall?: { program: string; ruleName: string };
  }> {
    const running = this.getRunningServer();
    if (running) {
      const sameServer =
        options?.cfgPath && path.resolve(options.cfgPath) === path.resolve(running.cfgPath);
      return sameServer
        ? { success: false, code: 'ALREADY_RUNNING', message: tr('Este servidor ya está en ejecución.') }
        : {
            success: false,
            code: 'ANOTHER_SERVER_RUNNING',
            message: tr('Ya hay otro servidor en ejecución ({path}). Detenlo antes de arrancar este.', { path: path.basename(running.serverDataPath) }),
          };
    }

    const cfgFullPath = options?.cfgPath || this.currentCfgPath;
    const dataPath =
      options?.serverDataPath ||
      this.currentServerDataPath ||
      process.env.FXSERVER_DATA_PATH ||
      (cfgFullPath ? path.dirname(cfgFullPath) : '');

    if (!dataPath) {
      return {
        success: false,
        code: 'NO_DATA_PATH',
        message:
          tr('No sé dónde está tu servidor. Añádelo desde Servidores indicando la ruta de su server.cfg.'),
      };
    }

    if (!fs.existsSync(dataPath)) {
      return {
        success: false,
        code: 'DATA_PATH_NOT_FOUND',
        message: tr('La carpeta del servidor no existe: {dataPath}', { dataPath }),
      };
    }

    const cfgName = cfgFullPath ? path.basename(cfgFullPath) : 'server.cfg';
    if (!fs.existsSync(path.join(dataPath, cfgName))) {
      return {
        success: false,
        code: 'CFG_NOT_FOUND',
        message: tr('No se encontró {cfgName} dentro de {dataPath}.', { cfgName, dataPath }),
      };
    }

    const probe = await probeFxServer(options?.ip, options?.port);
    if (probe.reachable) {
      return {
        success: false,
        code: 'PORT_IN_USE',
        message: tr('Ya hay un servidor FiveM respondiendo en {valor}:{valor2}{valor3}. Detenlo antes de arrancar este.', { valor: options?.ip || '127.0.0.1', valor2: options?.port || 30120, valor3: probe.hostname ? ` ("${probe.hostname}")` : '' }),
      };
    }

    let fxBin = options?.fxServerBin || this.findFxServerBinary(dataPath, cfgFullPath);

    if (!fxBin || !fs.existsSync(fxBin)) {
      return {
        success: false,
        code: 'BINARY_NOT_FOUND',
        message:
          tr('No se encontró el ejecutable de FXServer (FXServer.exe / run.cmd / run.sh). Descarga los artifacts de CFX e indica su ruta en Ajustes → Rutas.'),
      };
    }

    let binaryNote: string | null = null;
    if (binaryVariant(fxBin) === 'enhanced') {
      const escrow = escrowResources(dataPath);
      const pinsLegacyBuild = cfgForcesLegacyBuild(cfgFullPath || path.join(dataPath, cfgName));

      if (escrow.count > 0 || pinsLegacyBuild) {
        const motivo =
          escrow.count > 0
            ? tr('tiene {count} recurso(s) con Asset Escrow ({join}{valor}), que GTAV Enhanced todavía no puede descifrar', { count: escrow.count, join: escrow.names.slice(0, 3).join(', '), valor: escrow.count > 3 ? '…' : '' })
            : tr('fija en su server.cfg un gamebuild de Legacy, que GTAV Enhanced no admite');

        const legacyBin = this.findFxServerBinary(dataPath, cfgFullPath, 'legacy');
        if (!legacyBin) {
          return {
            success: false,
            code: 'LEGACY_BINARY_REQUIRED',
            message:
              tr('Este servidor {motivo}, así que necesita FXServer Legacy y sólo hay el binario de Enhanced. Descarga un artifact Legacy en Desarrollo → Artifacts y vuelve a arrancarlo.', { motivo }),
          };
        }

        binaryNote = `[VXCore] Este servidor ${motivo}: se arranca con FXServer Legacy en lugar de GTAV Enhanced.`;
        console.warn(`[ProcessManager] ${binaryNote} (${fxBin} → ${legacyBin})`);
        fxBin = legacyBin;
      }
    }

    if (!options?.fxServerBin) {
      const saved = loadPathsConfig();
      const key = binaryVariant(fxBin) === 'enhanced' ? 'cfxServerBin' : 'fxServerBin';
      const stale =
        saved[key] && path.resolve(saved[key]!) !== path.resolve(fxBin) ? saved[key] : null;
      if (stale) {
        try {
          savePathsConfig({ [key]: fxBin });
          console.log(`[ProcessManager] Ruta del binario desactualizada (${stale}); corregida a ${fxBin}.`);
        } catch (err) {
          console.warn('[ProcessManager] No se pudo auto-corregir la ruta del binario:', err);
        }
      }
    }

    if (process.platform === 'win32' && /\.exe$/i.test(fxBin)) {
      const fw = await checkFirewallFor(fxBin);
      if (fw.ok === false) {
        return {
          success: false,
          code: 'FIREWALL_PERMISSION_NEEDED',
          message:
            tr('Windows Firewall necesita permiso para que FXServer se comunique por la red. Concede el permiso en el panel y el servidor arrancará solo.'),
          firewall: { program: fw.program, ruleName: fw.ruleName },
        };
      }
    }

    try {
      const cfgLeido = cfgFullPath && fs.existsSync(cfgFullPath)
        ? parseServerCfg(fs.readFileSync(cfgFullPath, 'utf-8'))
        : null;
      const puerto = cfgLeido?.port || 30120;
      const ajeno = await probeFxServer('127.0.0.1', puerto);
      if (ajeno.reachable) {
        return {
          success: false,
          code: 'FOREIGN_SERVER_RUNNING',
          message:
            tr('Ya hay un servidor escuchando en el puerto {puerto}', { puerto }) +
            (ajeno.hostname ? ` (${ajeno.hostname})` : '') +
            tr(', y no lo ha arrancado VXCore. Ciérralo antes desde donde lo lanzaste: ') +
            tr('dos servidores sobre la misma carpeta se pelean por el puerto y por la caché.'),
        };
      }
    } catch {}

    this.currentServerDataPath = dataPath;
    this.currentCfgPath = cfgFullPath || path.join(dataPath, cfgName);
    this.currentGame = 'fxserver';

    console.log(`[ProcessManager] Arrancando FXServer en: ${dataPath}`);
    console.log(`[ProcessManager] Config: ${cfgName} | Binario: ${fxBin}`);
    let onesyncNote: string | null = null;
    try {
      const onesync = readOneSync(fs.readFileSync(this.currentCfgPath, 'utf-8'));
      if (onesync.commentedOnly && onesync.mode === 'off') {
        onesyncNote =
          '[VXCore] El server.cfg tiene el OneSync comentado, así que el servidor arranca sin OneSync. ' +
          tr('Actívalo en Ajustes → OneSync y se escribirá en el cfg.');
        console.warn(`[ProcessManager] ${onesyncNote}`);
      }
    } catch {}

    try {
      const isScript = /\.(cmd|bat)$/i.test(fxBin);
      const cmd = isScript ? 'cmd.exe' : fxBin;
      const propios = ['+exec', cfgName];
      const args = isScript ? ['/c', fxBin, ...propios] : propios;

      this.serverProcess = spawn(cmd, args, {
        cwd: dataPath,
        windowsHide: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.startedAt = new Date();

      for (const listener of this.sessionListeners) {
        try {
          listener(`${path.basename(dataPath)} (+exec ${cfgName})`);
        } catch (err) {
          console.error('[ProcessManager] Un listener de sesión falló:', err);
        }
      }

      const variante = binaryVariant(fxBin) === 'enhanced' ? 'GTAV Enhanced' : 'FXServer Legacy';
      this.emitLine(`[VXCore] Binario: ${fxBin} (${variante})`, 'stdout');
      if (binaryNote) this.emitLine(binaryNote, 'stdout');
      if (onesyncNote) this.emitLine(onesyncNote, 'stdout');

      const consume = (stream: 'stdout' | 'stderr') => {
        let pending = '';
        return (data: Buffer) => {
          pending += data.toString();
          const lines = pending.split(/\r?\n/);
          pending = lines.pop() ?? '';

          for (const raw of lines) {
            const line = stripAnsi(raw).trimEnd();
            if (!line) continue;
            if (stream === 'stderr') console.error(`[FXServer ERROR] ${line}`);
            else console.log(`[FXServer] ${line}`);
            this.emitLine(line, stream);
          }
        };
      };

      this.serverProcess.stdout.on('data', consume('stdout'));
      this.serverProcess.stderr.on('data', consume('stderr'));

      this.serverProcess.on('error', (err) => {
        console.error('[ProcessManager] Error ejecutando el proceso:', err);
        this.io.to(LOG_ROOM).emit('server-log', {
          type: 'stderr',
          message: tr('[ERROR Proceso FXServer]: {message}', { message: err.message }),
          time: new Date().toISOString(),
        });
        this.serverProcess = null;
        this.startedAt = null;
        this.io.emit('server-status', { status: 'offline', reason: err.message });
      });

      this.serverProcess.on('close', (code) => {
        console.log(`[ProcessManager] FXServer terminó con código ${code}`);
        this.serverProcess = null;
        this.startedAt = null;
        this.io.emit('server-status', { status: 'offline', code });
      });

      this.io.emit('server-status', { status: 'starting' });
      this.io.to(LOG_ROOM).emit('server-log', {
        type: 'stdout',
        message: tr('[FiveOS Agent] Lanzado {path} (+exec {cfgName}) en {dataPath}.', { path: path.basename(fxBin), cfgName, dataPath }),
        time: new Date().toISOString(),
      });

      return { success: true, message: tr('FXServer lanzado (+exec {cfgName})', { cfgName }) };
    } catch (error) {
      console.error('[ProcessManager] No se pudo arrancar FXServer', error);
      this.serverProcess = null;
      this.startedAt = null;
      return { success: false, code: 'SPAWN_FAILED', message: tr('Error al iniciar FXServer: {message}', { message: (error as Error).message }) };
    }
  }

  stopServer(): { success: boolean; message: string; code?: string } {
    if (!this.serverProcess) {
      return {
        success: false,
        code: 'NOT_MANAGED',
        message:
          tr('El agente no gestiona ningún proceso FXServer. Si el servidor está arriba, lo arrancó otra herramienta y debes pararlo desde ahí.'),
      };
    }

    const proc = this.serverProcess;
    const pid = proc.pid;
    console.log('[ProcessManager] Deteniendo FXServer...');
    this.io.to(LOG_ROOM).emit('server-log', {
      type: 'stdout',
      message: tr('[FiveOS Agent] Deteniendo servidor FXServer...'),
      time: new Date().toISOString(),
    });

    try {
      proc.stdin.write('quit\n');
    } catch {}

    setTimeout(() => {
      if (this.serverProcess === proc && !proc.killed) {
        try {
          proc.kill('SIGTERM');
        } catch {}
      }
    }, 1500);

    setTimeout(() => {
      if (this.serverProcess !== proc || proc.killed) return;

      console.log('[ProcessManager] Forzando el cierre del árbol de procesos...');
      if (process.platform === 'win32' && pid) {
        execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {});
      } else {
        try {
          proc.kill('SIGKILL');
        } catch {}
      }
    }, 4000);

    return { success: true, message: tr('Señal de detención enviada a FXServer') };
  }

  executeCommand(command: string): { success: boolean; message: string; code?: string } {
    if (typeof command !== 'string' || /[\r\n]/.test(command)) {
      return { success: false, code: 'INVALID_COMMAND', message: tr('El comando no puede contener saltos de línea.') };
    }
    if (!this.serverProcess || !this.serverProcess.stdin.writable) {
      const message =
        tr('No hay una consola de FXServer conectada. Arranca el servidor desde FiveOS para poder enviarle comandos.');
      this.io.to(LOG_ROOM).emit('server-log', {
        type: 'stderr',
        message: tr('[FiveOS Agent] Comando descartado ("{command}"): {message}', { command, message }),
        time: new Date().toISOString(),
      });
      return { success: false, code: 'NO_CONSOLE', message };
    }

    console.log(`[ProcessManager] Comando: ${command}`);
    this.io.to(LOG_ROOM).emit('server-log', { type: 'stdin', message: `> ${command}`, time: new Date().toISOString() });

    try {
      this.serverProcess.stdin.write(`${command}\n`);
      return { success: true, message: tr('Comando enviado a la consola de FXServer') };
    } catch (err) {
      return { success: false, code: 'WRITE_FAILED', message: tr('Error escribiendo a stdin: {message}', { message: (err as Error).message }) };
    }
  }
}

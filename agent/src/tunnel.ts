import { execFile, spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';

import { loadDiscordConfig } from './discord';
import { setTunnelHostname } from './exposure';
import { tr, trMsg } from './idioma';

const PREFS_FILE = path.resolve(process.cwd(), 'remote-access.json');
const TUNNEL_FILE = path.resolve(process.cwd(), 'tunnel.json');
const CREDENTIALS_FILE = path.resolve(process.cwd(), 'tunnel-credentials.json');
const CONFIG_FILE = path.resolve(process.cwd(), 'tunnel-config.yml');

const ENV_HOSTNAME = process.env.FIVEOS_TUNNEL_HOSTNAME?.trim() || '';
const ENV_CREDENTIALS = process.env.FIVEOS_TUNNEL_CREDENTIALS?.trim() || '';

const HOSTNAME_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface TunnelCredentials {
  hostname: string;
  tunnelId: string;
  accountTag: string;
  tunnelSecret: string;
}

export type TunnelPhase = 'off' | 'starting' | 'connected' | 'error';

export type TunnelBlocker = 'none' | 'config' | 'tunnel' | 'discord' | 'login';

export interface TunnelEvent {
  at: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

const EVENTS_MAX = 80;
const events: TunnelEvent[] = [];

function note(level: TunnelEvent['level'], message: string): void {
  events.push({ at: new Date().toISOString(), level, message: message.slice(0, 500) });
  if (events.length > EVENTS_MAX) events.splice(0, events.length - EVENTS_MAX);
}

export function getTunnelEvents(): TunnelEvent[] {
  return [...events];
}

export interface TunnelState {
  phase: TunnelPhase;
  hostname: string | null;
  detail: string;
  enabled: boolean;
  canEnable: boolean;
  blocker: string;
  blockerKey: TunnelBlocker;
  retryAt: string | null;
  reachable: boolean;
  credentials: 'env' | 'panel' | null;
}

let enabledCache: boolean | null = null;

function isRemoteAccessEnabled(): boolean {
  if (enabledCache !== null) return enabledCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
    enabledCache = parsed?.enabled === true;
  } catch {
    enabledCache = false;
  }
  return enabledCache;
}

export function setRemoteAccessEnabled(enabled: boolean): void {
  enabledCache = enabled;
  try {
    fs.writeFileSync(PREFS_FILE, JSON.stringify({ enabled }, null, 2), 'utf8');
  } catch (err) {
    console.error('[Tunnel] No se pudo guardar la preferencia de acceso remoto:', err);
  }
  void evaluate();
}

let state: { phase: TunnelPhase; hostname: string | null; detail: string } = {
  phase: 'off',
  hostname: null,
  detail: trMsg('El acceso remoto está desactivado.'),
};

export async function getTunnelState(): Promise<TunnelState> {
  const requirements = await checkRequirements();
  return {
    ...state,
    detail: tr(state.detail),
    enabled: isRemoteAccessEnabled(),
    canEnable: requirements.ok,
    blocker: requirements.reason,
    blockerKey: requirements.key,
    retryAt: nextRetryAt ? new Date(nextRetryAt).toISOString() : null,
    reachable: publicConfirmed,
    credentials: credentialsFromEnv() ? 'env' : loadCredentials() ? 'panel' : null,
  };
}

function setState(phase: TunnelPhase, detail: string, hostname: string | null = null): void {
  if (phase !== state.phase || detail !== state.detail) {
    note(phase === 'error' ? 'error' : phase === 'connected' ? 'info' : 'info', detail);
  }
  state = { phase, hostname, detail };
  setTunnelHostname(phase === 'connected' || phase === 'starting' ? hostname : null);
}

let panelPort = Number(process.env.FIVEOS_PANEL_PORT) || 3210;

export function setPanelPort(port: number): void {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return;
  if (port === panelPort) return;
  panelPort = port;
  if (state.phase !== 'off') void restart();
}

function agentPort(): number {
  return Number(process.env.PORT) || 4000;
}

function loadCredentials(): TunnelCredentials | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(TUNNEL_FILE, 'utf8'));
    if (
      typeof parsed?.hostname === 'string' &&
      typeof parsed?.tunnelId === 'string' &&
      typeof parsed?.accountTag === 'string' &&
      typeof parsed?.tunnelSecret === 'string'
    ) {
      return parsed;
    }
  } catch {}
  return null;
}

function saveCredentials(credentials: TunnelCredentials): void {
  fs.writeFileSync(TUNNEL_FILE, JSON.stringify(credentials, null, 2), { encoding: 'utf8', mode: 0o600 });
}

export function parseCredentials(hostname: unknown, raw: unknown): TunnelCredentials | null {
  if (typeof hostname !== 'string' || typeof raw !== 'string') return null;
  const host = hostname
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  if (!HOSTNAME_PATTERN.test(host)) return null;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  const tunnelId = data.TunnelID ?? data.tunnelId;
  const accountTag = data.AccountTag ?? data.accountTag;
  const tunnelSecret = data.TunnelSecret ?? data.tunnelSecret;
  if (typeof tunnelId !== 'string' || !UUID_PATTERN.test(tunnelId)) return null;
  if (typeof accountTag !== 'string' || !/^[0-9a-f]{32}$/i.test(accountTag.trim())) return null;
  if (typeof tunnelSecret !== 'string' || !tunnelSecret.trim()) return null;

  return {
    hostname: host,
    tunnelId: tunnelId.toLowerCase(),
    accountTag: accountTag.trim(),
    tunnelSecret: tunnelSecret.trim(),
  };
}

function credentialsFromEnv(): TunnelCredentials | null {
  if (!ENV_HOSTNAME || !ENV_CREDENTIALS) return null;
  try {
    return parseCredentials(ENV_HOSTNAME, fs.readFileSync(ENV_CREDENTIALS, 'utf8'));
  } catch {
    return null;
  }
}

function currentCredentials(): TunnelCredentials | null {
  return credentialsFromEnv() || loadCredentials();
}

export async function setCredentials(hostname: unknown, raw: unknown): Promise<{ ok: boolean; message: string }> {
  if (credentialsFromEnv()) {
    return { ok: false, message: tr('El túnel está definido en agent/.env y no se puede cambiar desde el panel.') };
  }
  const credentials = parseCredentials(hostname, raw);
  if (!credentials) {
    return {
      ok: false,
      message: tr('Revisa el dominio y el contenido del fichero de credenciales que genera cloudflared.'),
    };
  }
  saveCredentials(credentials);
  note('info', tr('Túnel configurado para {hostname}.', { hostname: credentials.hostname }));
  retries = 0;
  await restart();
  return { ok: true, message: tr('Túnel guardado.') };
}

export async function clearCredentials(): Promise<{ ok: boolean; message: string }> {
  if (credentialsFromEnv()) {
    return { ok: false, message: tr('El túnel está definido en agent/.env y no se puede quitar desde el panel.') };
  }
  stop(tr('Túnel eliminado.'));
  for (const file of [TUNNEL_FILE, CREDENTIALS_FILE, CONFIG_FILE]) {
    try {
      fs.rmSync(file, { force: true });
    } catch {}
  }
  retries = 0;
  await evaluate();
  return { ok: true, message: tr('Túnel eliminado.') };
}

function runtimeFilesContent(credentials: TunnelCredentials): {
  credentialsJson: string;
  configYaml: string;
} {
  const credentialsJson = JSON.stringify({
    AccountTag: credentials.accountTag,
    TunnelID: credentials.tunnelId,
    TunnelSecret: credentials.tunnelSecret,
  });

  const configYaml = [
    `tunnel: ${credentials.tunnelId}`,
    `credentials-file: ${CREDENTIALS_FILE.replace(/\\/g, '/')}`,
    'ingress:',
    `  - hostname: ${credentials.hostname}`,
    '    path: ^/(api|socket\\.io)/',
    `    service: http://127.0.0.1:${agentPort()}`,
    `  - hostname: ${credentials.hostname}`,
    `    service: http://127.0.0.1:${panelPort}`,
    '  - service: http_status:404',
    '',
  ].join('\n');

  return { credentialsJson, configYaml };
}

function writeRuntimeFiles(credentials: TunnelCredentials): void {
  const { credentialsJson, configYaml } = runtimeFilesContent(credentials);
  fs.writeFileSync(CREDENTIALS_FILE, credentialsJson, { encoding: 'utf8', mode: 0o600 });
  fs.writeFileSync(CONFIG_FILE, configYaml, 'utf8');
}

function runtimeFilesMatch(credentials: TunnelCredentials): boolean {
  try {
    const { credentialsJson, configYaml } = runtimeFilesContent(credentials);
    return (
      fs.readFileSync(CREDENTIALS_FILE, 'utf8') === credentialsJson &&
      fs.readFileSync(CONFIG_FILE, 'utf8') === configYaml
    );
  } catch {
    return false;
  }
}

function findCloudflared(): string | null {
  const exe = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';

  const candidates = [
    process.env.VX_CLOUDFLARED_PATH,
    path.resolve(
      (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath || process.cwd(),
      'cloudflared',
      exe
    ),
    path.resolve(process.cwd(), 'cloudflared', exe),
    path.resolve(process.cwd(), exe),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const found = candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  });
  if (found) return found;

  return exe;
}

let child: ChildProcess | null = null;
let retryTimer: NodeJS.Timeout | null = null;
let nextRetryAt: number | null = null;
let retries = 0;
let working = false;
let pendingEvaluation = false;
let workingSince = 0;
let childStartedAt = 0;

const CONNECT_DEADLINE_MS = 60_000;

const READY_DEADLINE_MS = 25_000;

const READY_EVERY_MS = 300;

const PUBLIC_DEADLINE_MS = 35_000;

const PROBE_EVERY_MS = 1_500;

const PROBE_TIMEOUT_MS = 4_000;

const WORKING_STUCK_MS = 2 * 60_000;

async function checkRequirements(): Promise<{ ok: boolean; reason: string; key: TunnelBlocker }> {
  if (process.env.VX_TUNNEL_DISABLED === '1') {
    return { ok: false, reason: tr('El acceso remoto está desactivado por configuración.'), key: 'config' };
  }
  if (!currentCredentials()) {
    return { ok: false, reason: tr('Añade el dominio y las credenciales de tu túnel de Cloudflare.'), key: 'tunnel' };
  }

  const config = loadDiscordConfig();
  if (!config.owner) {
    return {
      ok: false,
      reason: tr('Vincula tu cuenta de Discord para poder abrir el panel desde fuera.'),
      key: 'discord',
    };
  }
  if (!config.requireLogin) {
    return {
      ok: false,
      reason:
        tr('Activa el inicio de sesión obligatorio para publicar el panel: sin él, cualquiera con el enlace entraría.'),
      key: 'login',
    };
  }

  return { ok: true, reason: '', key: 'none' };
}

async function shouldRun(): Promise<{ ok: boolean; reason: string }> {
  if (!isRemoteAccessEnabled()) {
    return { ok: false, reason: tr('El acceso remoto está desactivado.') };
  }
  return checkRequirements();
}

function clearRetry(): void {
  nextRetryAt = null;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function scheduleRetry(): void {
  clearRetry();
  const base = Math.min(5_000 * 2 ** Math.min(retries, 6), 5 * 60_000);
  const delay = base + Math.floor(Math.random() * 3_000);
  retries += 1;
  nextRetryAt = Date.now() + delay;
  retryTimer = setTimeout(() => void evaluate(), delay);
}

export async function retryNow(): Promise<void> {
  clearRetry();
  retries = 0;
  await evaluate();
}

function killChild(): void {
  if (!child) return;
  const dying = child;
  child = null;
  try {
    dying.removeAllListeners();
    dying.kill();
  } catch {}
  forgetChildPid();
}

const PID_FILE = path.resolve(process.cwd(), 'cloudflared.pid');

function rememberChildPid(pid: number | undefined): void {
  if (!pid) return;
  try {
    fs.writeFileSync(PID_FILE, String(pid), 'utf8');
  } catch {}
}

function forgetChildPid(): void {
  try {
    fs.rmSync(PID_FILE, { force: true });
  } catch {}
}

function foreignCloudflaredPids(): Promise<number[]> {
  if (process.platform !== 'win32') return Promise.resolve([]);

  return new Promise((resolve) => {
    execFile(
      'tasklist',
      ['/FI', 'IMAGENAME eq cloudflared.exe', '/NH', '/FO', 'CSV'],
      { windowsHide: true, timeout: 5000 },
      (error, stdout) => {
        if (error) return resolve([]);
        const mine = child?.pid;
        const pids = stdout
          .split(/\r?\n/)
          .map((line) => Number(line.split('","')[1]))
          .filter((pid) => Number.isFinite(pid) && pid > 0 && pid !== mine);
        resolve(pids);
      }
    );
  });
}

function killOrphanedCloudflared(): void {
  let pid = 0;
  try {
    pid = Number(fs.readFileSync(PID_FILE, 'utf8').trim());
  } catch {
    return;
  }
  if (!pid || pid === process.pid) return;

  try {
    process.kill(pid, 0);
  } catch {
    forgetChildPid();
    return;
  }

  console.warn(`[Tunnel] Quedaba un cloudflared de una ejecución anterior (pid ${pid}); se cierra.`);
  try {
    process.kill(pid);
  } catch (err) {
    console.error('[Tunnel] No se pudo cerrar el cloudflared anterior:', err);
  }
  forgetChildPid();
}

function stop(reason: string): void {
  clearRetry();
  killChild();
  retries = 0;
  publicConfirmed = false;
  setState('off', reason);
}

let probing = false;

let publicConfirmed = false;

async function tunnelAnswers(hostname: string): Promise<{ ok: boolean; dnsFailure: boolean }> {
  try {
    const res = await fetch(`https://${hostname}/api/health`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, dnsFailure: false };
    const body = await res.json().catch(() => null);
    return { ok: body?.status === 'Agent is running', dnsFailure: false };
  } catch (error) {
    const code = (error as { cause?: { code?: string } })?.cause?.code || '';
    return { ok: false, dnsFailure: code === 'ENOTFOUND' || code === 'EAI_AGAIN' };
  }
}

async function cloudflaredReady(port: number): Promise<{ ready: boolean; connections: number }> {
  if (!port) return { ready: false, connections: 0 };
  try {
    const res = await fetch(`http://127.0.0.1:${port}/ready`, {
      signal: AbortSignal.timeout(1_500),
    });
    const body = (await res.json().catch(() => null)) as { readyConnections?: number } | null;
    const connections = Number(body?.readyConnections ?? 0);
    return { ready: res.ok && connections > 0, connections };
  } catch {
    return { ready: false, connections: 0 };
  }
}

let dnsFlushed = false;

function flushDnsCache(): void {
  if (dnsFlushed || process.platform !== 'win32') return;
  dnsFlushed = true;
  note('info', tr('Este equipo no resuelve todavía el enlace; se vacía la caché de DNS de Windows.'));
  execFile('ipconfig', ['/flushdns'], () => {});
}

function freeLoopbackPort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(0));
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function waitUntilReachable(hostname: string, proc: ChildProcess, metrics: number): void {
  if (probing || child !== proc) return;
  probing = true;

  void (async () => {
    try {
      const readyDeadline = Date.now() + READY_DEADLINE_MS;
      let ready = false;
      let vueltas = 0;

      while (Date.now() < readyDeadline) {
        if (child !== proc) return;

        const status = await cloudflaredReady(metrics);
        if (status.ready) {
          ready = true;
          note('info', tr('Cloudflare ha aceptado el túnel ({connections} conexión(es)).', { connections: status.connections }));
          break;
        }

        vueltas += 1;
        if (vueltas % 10 === 0 && (await tunnelAnswers(hostname)).ok) {
          if (child !== proc) return;
          ready = true;
          publicConfirmed = true;
          note('info', tr('El enlace público ya responde.'));
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, READY_EVERY_MS));
      }

      if (child !== proc) return;

      if (!ready) {
        console.error(`[Tunnel] cloudflared no registró ninguna conexión en ${READY_DEADLINE_MS / 1000}s.`);

        const foreign = await foreignCloudflaredPids();
        if (child !== proc) return;

        setState(
          'error',
          foreign.length > 0
            ? tr('Hay otro cloudflared corriendo en este equipo (probablemente instalado como servicio de Windows) y se está peleando con el de VXCore por el mismo túnel. Desinstálalo con `cloudflared service uninstall` desde una consola de administrador y vuelve a intentarlo.')
            : tr('El túnel no terminó de conectar. Se reintentará.'),
          hostname
        );
        scheduleRetry();
        killChild();
        return;
      }

      retries = 0;
      setState('connected', tr('El panel es accesible desde internet.'), hostname);

      const publicDeadline = Date.now() + PUBLIC_DEADLINE_MS;
      let intentos = 0;

      while (Date.now() < publicDeadline) {
        if (child !== proc) return;

        intentos += 1;
        const answer = await tunnelAnswers(hostname);
        if (answer.ok) {
          if (child !== proc) return;
          console.log(`[Tunnel] Enlace confirmado tras ${intentos} comprobación(es).`);
          publicConfirmed = true;
          setState('connected', tr('El panel es accesible desde internet.'), hostname);
          return;
        }
        if (answer.dnsFailure) flushDnsCache();

        await new Promise((resolve) => setTimeout(resolve, PROBE_EVERY_MS));
      }

      if (child !== proc) return;

      note('warn', tr('El túnel está conectado con Cloudflare, pero este equipo todavía no resuelve el enlace.'));
      setState(
        'connected',
        tr('Conectado con Cloudflare. Este equipo todavía no resuelve la dirección (suele ser la caché de DNS); desde fuera debería funcionar ya.'),
        hostname
      );

      while (Date.now() < publicDeadline + 5 * 60_000) {
        await new Promise((resolve) => setTimeout(resolve, 15_000));
        if (child !== proc) return;
        if ((await tunnelAnswers(hostname)).ok) {
          if (child !== proc) return;
          publicConfirmed = true;
          setState('connected', tr('El panel es accesible desde internet.'), hostname);
          return;
        }
      }
    } finally {
      probing = false;
    }
  })();
}

async function launch(credentials: TunnelCredentials): Promise<void> {
  killOrphanedCloudflared();
  publicConfirmed = false;

  try {
    writeRuntimeFiles(credentials);
  } catch (err) {
    console.error('[Tunnel] No se pudieron escribir los ficheros de cloudflared:', err);
  }

  if (!runtimeFilesMatch(credentials)) {
    setState(
      'error',
      tr('No se pudo dejar la configuración de cloudflared como toca (¿permisos en la carpeta de datos?). Se reintentará.'),
      credentials.hostname
    );
    scheduleRetry();
    return;
  }

  const bin = findCloudflared();
  if (!bin) {
    setState('error', tr('No se encontró cloudflared en esta instalación.'));
    return;
  }

  setState('starting', tr('Conectando con Cloudflare…'), credentials.hostname);

  const metrics = await freeLoopbackPort();
  if (!metrics) note('warn', tr('No se pudo reservar un puerto de métricas; se comprobará sólo por el enlace público.'));

  const args = ['tunnel', '--config', CONFIG_FILE];
  if (metrics) args.push('--metrics', `127.0.0.1:${metrics}`);
  args.push('run');

  const proc = spawn(bin, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child = proc;
  childStartedAt = Date.now();
  rememberChildPid(proc.pid);

  const onOutput = (chunk: Buffer) => {
    const text = chunk.toString();
    if (state.phase === 'starting' && /Registered tunnel connection|Connection .* registered/i.test(text)) {
      note('info', tr('Cloudflare ha registrado la conexión; comprobando el enlace…'));
    }
    for (const line of text.split('\n')) {
      const clean = line.trim();
      if (!clean) continue;
      if (/\bERR\b|error|failed|cannot|unable|refused|unauthorized/i.test(clean)) {
        console.error('[Tunnel]', clean);
        note('error', clean);
      }
    }
  };
  proc.stdout?.on('data', onOutput);
  proc.stderr?.on('data', onOutput);

  waitUntilReachable(credentials.hostname, proc, metrics);

  proc.on('error', (err) => {
    if (child !== proc) return;
    child = null;
    setState(
      'error',
      (err as NodeJS.ErrnoException).code === 'ENOENT'
        ? tr('No se encontró cloudflared en esta instalación.')
        : tr('No se pudo arrancar el acceso remoto.'),
      credentials.hostname
    );
    scheduleRetry();
  });

  proc.on('exit', (code) => {
    if (child !== proc) return;
    child = null;
    setState('error', tr('El acceso remoto se cortó (código {valor}). Reintentando…', { valor: code ?? 'desconocido' }), credentials.hostname);
    scheduleRetry();
  });
}

export async function evaluate(): Promise<void> {
  if (working && Date.now() - workingSince < WORKING_STUCK_MS) {
    pendingEvaluation = true;
    return;
  }
  if (working) {
    console.warn('[Tunnel] La evaluación anterior se quedó a medias; se continúa igualmente.');
  }
  working = true;
  workingSince = Date.now();

  try {
    const { ok, reason } = await shouldRun();

    if (!ok) {
      if (state.phase !== 'off' || child) {
        console.log('[Tunnel] Se cierra el acceso remoto:', reason);
        stop(reason);
      } else {
        setState('off', reason);
      }
      return;
    }

    if (child) {
      const running = currentCredentials();

      if (running && !runtimeFilesMatch(running)) {
        console.warn('[Tunnel] La configuración de cloudflared no correspondía; se reescribe.');
        try {
          writeRuntimeFiles(running);
        } catch (err) {
          console.error('[Tunnel] No se pudo reescribir la configuración:', err);
        }
      }

      if (state.phase === 'connected') return;
      if (Date.now() - childStartedAt < CONNECT_DEADLINE_MS) return;

      note('error', tr('El túnel lleva demasiado tiempo sin conectar: se rehace el proceso.'));
      killChild();
    }

    const credentials = currentCredentials();
    if (!credentials) {
      scheduleRetry();
      return;
    }

    clearRetry();
    await launch(credentials);
  } finally {
    working = false;
    if (pendingEvaluation) {
      pendingEvaluation = false;
      void evaluate();
    }
  }
}

async function restart(): Promise<void> {
  killChild();
  await evaluate();
}

export function startTunnel(): void {
  killOrphanedCloudflared();
  void evaluate();
  setInterval(() => void evaluate(), 5 * 60 * 1000);
}

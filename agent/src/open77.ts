import fs from 'fs';
import net from 'net';
import path from 'path';
import crypto from 'crypto';
import AdmZip from 'adm-zip';
import { extractZipSkippingRoot, isInside, readZipEntryNames, zipEntryPath } from './archives';
import { tr } from './idioma';

const OPEN77_DEFAULT_PORT = 11778;
const OPEN77_DEFAULT_RCON_PORT = 11782;
const OPEN77_DEFAULT_WARDEN_PORT = 11780;
export const OPEN77_RULE_NAME = 'VXCore Open77';
const OPEN77_CONFIG_NAME = 'server.jsonc';

const SECRETS_FILE = path.resolve(process.cwd(), 'open77-secrets.json');

function stripJsonc(text: string): string {
  let out = '';
  let inString = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i++;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i++;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

export function parseJsonc(text: string): unknown {
  return JSON.parse(stripJsonc(text.replace(/^﻿/, '')));
}

interface Open77Jsonc {
  identity?: { name?: string; visibility?: string };
  network?: { port?: number | string; publicEndpoint?: string; maxPlayers?: number | string };
  maxPlayers?: number | string;
  warden?: { enabled?: boolean; bind?: string };
  resources?: { root?: string };
  database?: { enabled?: boolean };
}

export interface Open77ServerInfo {
  game: 'open77';
  name: string;
  port: number;
  ip: string;
  maxClients: number;
  visibility: string;
  publicEndpoint: string;
  databaseEnabled: boolean;
  resourcesRoot: string;
  wardenEnabled: boolean;
  wardenUrl: string | null;
  framework: string;
  rawContent: string;
}

export function readOpen77Config(
  configPath: string,
  fallback: { port?: number | string; maxClients?: number; name?: string } = {}
): Open77ServerInfo {
  const rawContent = fs.readFileSync(configPath, 'utf-8');
  let cfg: Open77Jsonc = {};
  try {
    cfg = (parseJsonc(rawContent) as Open77Jsonc | null) || {};
  } catch {}

  const port =
    Number(cfg?.network?.port) || Number(fallback.port) || OPEN77_DEFAULT_PORT;
  const publicEndpoint: string = cfg?.network?.publicEndpoint || '';
  const wardenEnabled = cfg?.warden?.enabled === true;
  const wardenBind: string = cfg?.warden?.bind || `127.0.0.1:${OPEN77_DEFAULT_WARDEN_PORT}`;
  const resourcesRoot = path.resolve(path.dirname(configPath), cfg?.resources?.root || 'resources');

  return {
    game: 'open77',
    name: cfg?.identity?.name || fallback.name || 'Servidor Open77',
    port,
    ip: `127.0.0.1:${port}`,
    maxClients:
      Number(cfg?.network?.maxPlayers) || Number(cfg?.maxPlayers) || Number(fallback.maxClients) || 32,
    visibility: cfg?.identity?.visibility || 'public',
    publicEndpoint,
    databaseEnabled: cfg?.database?.enabled === true,
    resourcesRoot,
    wardenEnabled,
    wardenUrl: wardenEnabled ? `http://${wardenBind.replace(/^0\.0\.0\.0/, '127.0.0.1')}` : null,
    framework: 'Open77',
    rawContent,
  };
}

export function findOpen77Binary(serverDir: string): string | null {
  const names =
    process.platform === 'win32'
      ? ['Open77.Server.exe', path.join('server', 'Open77.Server.exe')]
      : ['Open77.Server', path.join('server', 'Open77.Server')];
  for (const name of names) {
    const candidate = path.join(serverDir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export const OPEN77_ARCHIVE_SUPPORTED = process.platform === 'win32';

export interface Open77Archive {
  path: string;
  name: string;
  size: number;
  downloadedAt: string;
}

const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;

const isServerExe = (name: string) => {
  const entry = zipEntryPath(name);
  return !entry.endsWith('/') && path.posix.basename(entry).toLowerCase() === 'open77.server.exe';
};

const arrivedAt = (stat: fs.Stats) => Math.max(stat.mtimeMs, stat.birthtimeMs || 0);

const archiveCache = new Map<string, { size: number; mtimeMs: number; server: boolean }>();

function zipHasOpen77Server(file: string, stat: fs.Stats): boolean {
  if (stat.size > MAX_ARCHIVE_BYTES) return false;
  const key = path.resolve(file);
  const cached = archiveCache.get(key);
  if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) return cached.server;

  let names: string[] | null;
  try {
    names = readZipEntryNames(file);
  } catch {
    return false;
  }
  const server = !!names?.some(isServerExe);
  archiveCache.set(key, { size: stat.size, mtimeMs: stat.mtimeMs, server });
  return server;
}

export function findOpen77Archive(dir: string): Open77Archive | null {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }

  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const zips = names
    .filter((name) => name.toLowerCase().endsWith('.zip'))
    .flatMap((name) => {
      const file = path.join(dir, name);
      try {
        const stat = fs.statSync(file);
        return stat.isFile() && arrivedAt(stat) >= monthAgo ? [{ file, name, stat }] : [];
      } catch {
        return [];
      }
    })
    .sort((a, b) => arrivedAt(b.stat) - arrivedAt(a.stat))
    .slice(0, 10);

  const zip = zips.find((z) => zipHasOpen77Server(z.file, z.stat));
  if (!zip) return null;
  return {
    path: zip.file,
    name: zip.name,
    size: zip.stat.size,
    downloadedAt: new Date(arrivedAt(zip.stat)).toISOString(),
  };
}

function isFree(dir: string): boolean {
  try {
    return !fs.existsSync(dir) || (fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length === 0);
  } catch {
    return false;
  }
}

function freeServerDir(parent: string): string {
  for (let n = 1; n < 1000; n++) {
    const dir = path.join(parent, n === 1 ? 'Open77-Server' : `Open77-Server-${n}`);
    if (isFree(dir)) return dir;
  }
  throw new Error(tr('No queda ninguna carpeta libre para el servidor en {parent}.', { parent }));
}

function pickExtractDir(targetDir: string | undefined, fallbackParent: string): string {
  const requested = targetDir?.trim();
  if (requested && path.isAbsolute(requested)) {
    const dir = path.resolve(requested);
    if (isFree(dir)) return dir;
    try {
      if (fs.statSync(dir).isDirectory()) {
        return freeServerDir(findOpen77Binary(dir) ? path.dirname(dir) : dir);
      }
    } catch {}
  }
  return freeServerDir(fallbackParent);
}

function discardExtraction(dir: string, existed: boolean): void {
  try {
    if (!existed) {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    }
    for (const child of fs.readdirSync(dir)) {
      fs.rmSync(path.join(dir, child), { recursive: true, force: true });
    }
  } catch {}
}

export interface ExtractOpen77Options {
  targetDir?: string;
  fallbackParent: string;
}

export interface ExtractOpen77Result {
  ok: boolean;
  message?: string;
  serverDir?: string;
}

let extracting = false;

export async function extractOpen77Archive(
  archivePath: string,
  opts: ExtractOpen77Options
): Promise<ExtractOpen77Result> {
  if (!OPEN77_ARCHIVE_SUPPORTED) {
    return { ok: false, message: tr('Descomprimir el servidor de Open77 sólo funciona con el agente en Windows.') };
  }
  if (extracting) {
    return { ok: false, message: tr('Ya se está descomprimiendo el servidor de Open77.') };
  }

  const archive = path.resolve(archivePath.trim());
  let stat: fs.Stats;
  try {
    stat = fs.statSync(archive);
  } catch {
    return { ok: false, message: tr('No encuentro {archive}.', { archive }) };
  }
  if (!stat.isFile() || !zipHasOpen77Server(archive, stat)) {
    return {
      ok: false,
      message: tr('{archive} no es el servidor de Open77: no lleva Open77.Server.exe dentro.', { archive }),
    };
  }

  extracting = true;
  try {
    const zip = new AdmZip(archive);
    const names = zip.getEntries().map((e) => zipEntryPath(e.entryName));
    const root = names[0]?.split('/')[0] ?? '';
    const skipRoot = !!root && names.every((name) => name.startsWith(`${root}/`));
    const exe = names.find(isServerExe);

    const dest = pickExtractDir(opts.targetDir, opts.fallbackParent);
    const existed = fs.existsSync(dest);
    try {
      fs.mkdirSync(dest, { recursive: true });
      await extractZipSkippingRoot(zip, dest, skipRoot);
    } catch (error) {
      discardExtraction(dest, existed);
      throw error;
    }

    const inner = exe ? path.posix.dirname(skipRoot ? exe.slice(root.length + 1) : exe) : '.';
    const serverDir = findOpen77Binary(dest) ? dest : path.join(dest, ...inner.split('/'));
    if ((serverDir !== dest && !isInside(dest, serverDir)) || !findOpen77Binary(serverDir)) {
      discardExtraction(dest, existed);
      return { ok: false, message: tr('Se descomprimió en {dest}, pero no aparece Open77.Server.exe.', { dest }) };
    }
    return { ok: true, serverDir };
  } finally {
    extracting = false;
  }
}

export interface Open77Secrets {
  licenseKey?: string;
  rconPassword: string;
  rconPort: number;
  databaseConnection?: string;
}

function readAllSecrets(): Record<string, Open77Secrets> {
  try {
    if (fs.existsSync(SECRETS_FILE)) return JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8')) || {};
  } catch (err) {
    console.error('[Open77] No se pudo leer open77-secrets.json:', err);
  }
  return {};
}

const secretKey = (configPath: string) => path.resolve(configPath).toLowerCase();

export function getOpen77Secrets(configPath: string): Open77Secrets | null {
  return readAllSecrets()[secretKey(configPath)] || null;
}

export function saveOpen77Secrets(configPath: string, patch: Partial<Open77Secrets>): Open77Secrets {
  const all = readAllSecrets();
  const key = secretKey(configPath);
  const current: Open77Secrets = all[key] || {
    rconPassword: crypto.randomBytes(24).toString('hex'),
    rconPort: OPEN77_DEFAULT_RCON_PORT,
  };
  const next: Open77Secrets = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined && v !== '') Object.assign(next, { [k]: v });
  }
  all[key] = next;
  fs.writeFileSync(SECRETS_FILE, JSON.stringify(all, null, 2), { encoding: 'utf-8', mode: 0o600 });
  return next;
}

export function removeOpen77Secrets(configPath: string): void {
  const all = readAllSecrets();
  if (!all[secretKey(configPath)]) return;
  delete all[secretKey(configPath)];
  fs.writeFileSync(SECRETS_FILE, JSON.stringify(all, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

export function describeOpen77Secrets(configPath: string) {
  const s = getOpen77Secrets(configPath);
  return {
    licenseKeyConfigured: !!s?.licenseKey,
    databaseConfigured: !!s?.databaseConnection,
    rconPort: s?.rconPort ?? OPEN77_DEFAULT_RCON_PORT,
  };
}

export interface CreateOpen77Options {
  serverDir: string;
  name: string;
  port: number;
  maxPlayers: number;
  visibility: 'public' | 'private';
  publicEndpoint?: string;
  licenseKey: string;
  databaseConnection?: string;
}

export interface CreateOpen77Result {
  ok: boolean;
  message: string;
  cfgPath?: string;
  serverDataPath?: string;
  binary?: string;
  keptExistingConfig?: boolean;
}

export function createOpen77Server(opts: CreateOpen77Options): CreateOpen77Result {
  const serverDir = path.resolve(opts.serverDir.trim());
  if (!fs.existsSync(serverDir) || !fs.statSync(serverDir).isDirectory()) {
    return { ok: false, message: `La carpeta no existe: ${serverDir}` };
  }

  const binary = findOpen77Binary(serverDir);
  if (!binary) {
    return {
      ok: false,
      message:
        `No encuentro ${process.platform === 'win32' ? 'Open77.Server.exe' : 'Open77.Server'} en ${serverDir}. ` +
        'Descarga el servidor dedicado desde open2077.net/host (necesita acceso Alpha), descomprímelo e indica esa carpeta.',
    };
  }

  const licenseKey = opts.licenseKey.trim();
  if (!/^op77_live_[A-Za-z0-9_-]{8,}$/.test(licenseKey)) {
    return {
      ok: false,
      message:
        'La clave de licencia de Open77 empieza por "op77_live_". Créala en open2077.net/account/keys (sólo se muestra una vez).',
    };
  }

  const cfgPath = path.join(serverDir, OPEN77_CONFIG_NAME);
  const keptExistingConfig = fs.existsSync(cfgPath);

  if (!keptExistingConfig) {
    const config = {
      identity: {
        name: opts.name.trim() || 'Servidor Open77',
        visibility: opts.visibility === 'private' ? 'private' : 'public',
      },
      network: {
        port: opts.port,
        ...(opts.publicEndpoint?.trim() ? { publicEndpoint: opts.publicEndpoint.trim() } : {}),
      },
      masterServer: {
        enabled: true,
        url: 'https://master.open2077.net/',
        licenseKey: null,
      },
      warden: {
        enabled: true,
        bind: `127.0.0.1:${OPEN77_DEFAULT_WARDEN_PORT}`,
      },
      database: {
        enabled: !!opts.databaseConnection?.trim(),
        connectionString: '',
        connectionStringEnvironmentVariable: 'OP77_DATABASE_CONNECTION',
        maxRows: 10000,
      },
    };

    const header =
      '// Generado por VXCore para Open77 (https://open2077.net/docs/host-a-server).\n' +
      '// Los secretos (licencia, RCON, base de datos) NO van aquí: VXCore los pasa\n' +
      '// como variables de entorno al arrancar el servidor.\n';
    fs.writeFileSync(cfgPath, header + JSON.stringify(config, null, 2) + '\n', 'utf-8');
  }

  saveOpen77Secrets(cfgPath, {
    licenseKey,
    databaseConnection: opts.databaseConnection?.trim() || undefined,
  });

  return {
    ok: true,
    message: keptExistingConfig
      ? 'Servidor Open77 añadido. Se ha respetado el server.jsonc que ya tenías.'
      : 'Servidor Open77 preparado: server.jsonc creado.',
    cfgPath,
    serverDataPath: serverDir,
    binary,
    keptExistingConfig,
  };
}

export function buildOpen77Launch(
  configPath: string,
  opts: { port?: number | string; maxPlayers?: number }
): { args: string[]; env: NodeJS.ProcessEnv; secrets: Open77Secrets } {
  const secrets = getOpen77Secrets(configPath) || saveOpen77Secrets(configPath, {});
  const args = ['--no-setup', '--config', path.basename(configPath)];
  if (opts.maxPlayers) args.push('--max-players', String(opts.maxPlayers));

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OP77_RCON_PASSWORD: secrets.rconPassword,
    OP77_CONFIG__RCON__ENABLED: 'true',
    OP77_CONFIG__RCON__BINDADDRESS: '127.0.0.1',
    OP77_CONFIG__RCON__PORT: String(secrets.rconPort),
    OP77_CONFIG__RCON__PASSWORDENVIRONMENTVARIABLE: 'OP77_RCON_PASSWORD',
  };
  if (opts.port) env.OP77_CONFIG__NETWORK__PORT = String(opts.port);
  if (secrets.licenseKey) env.OP77_LICENSE_KEY = secrets.licenseKey;
  if (secrets.databaseConnection) env.OP77_DATABASE_CONNECTION = secrets.databaseConnection;

  return { args, env, secrets };
}

interface Frame {
  id?: number;
  type?: string;
  code?: string;
  message?: string;
  status?: number;
  data?: unknown;
  error?: string;
  ok?: boolean;
  output?: string;
  result?: string;
  version?: string;
}

type OutgoingFrame = { id?: number; op: string; [key: string]: unknown };

class RconConnection {
  private socket: net.Socket;
  private buffer = Buffer.alloc(0);
  private waiters: ((frame: Frame) => void)[] = [];
  private queue: Frame[] = [];
  private closedError: Error | null = null;
  private nextId = 1;

  private constructor(socket: net.Socket) {
    this.socket = socket;
    socket.on('data', (chunk: Buffer) => this.onData(chunk));
    const fail = (err: Error) => {
      this.closedError = err;
      for (const w of this.waiters.splice(0)) w({ type: 'error', code: 'closed', message: err.message });
    };
    socket.on('error', fail);
    socket.on('close', () => fail(new Error('Conexión RCON cerrada')));
  }

  static connect(port: number, timeoutMs: number): Promise<RconConnection> {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host: '127.0.0.1', port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error('RCON no responde'));
      }, timeoutMs);
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve(new RconConnection(socket));
      });
      socket.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private onData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const len = this.buffer.readUInt32BE(0);
      if (this.buffer.length < 4 + len) break;
      const body = this.buffer.subarray(4, 4 + len).toString('utf-8');
      this.buffer = this.buffer.subarray(4 + len);
      let frame: Frame;
      try {
        frame = JSON.parse(body);
      } catch {
        continue;
      }
      const waiter = this.waiters.shift();
      if (waiter) waiter(frame);
      else this.queue.push(frame);
    }
  }

  read(timeoutMs: number): Promise<Frame> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    if (this.closedError) return Promise.reject(this.closedError);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(onFrame);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error('RCON tardó demasiado en responder'));
      }, timeoutMs);
      const onFrame = (frame: Frame) => {
        clearTimeout(timer);
        resolve(frame);
      };
      this.waiters.push(onFrame);
    });
  }

  send(frame: OutgoingFrame): number {
    const id = frame.id ?? this.nextId++;
    const payload = Buffer.from(JSON.stringify({ ...frame, id }), 'utf-8');
    const header = Buffer.alloc(4);
    header.writeUInt32BE(payload.length, 0);
    this.socket.write(Buffer.concat([header, payload]));
    return id;
  }

  async collect(id: number, timeoutMs: number): Promise<{ status?: number; body: string; error?: string }> {
    let status: number | undefined;
    const chunks: Buffer[] = [];
    for (;;) {
      const frame = await this.read(timeoutMs);
      if (frame.id !== undefined && frame.id !== id) continue;
      if (frame.type === 'error') return { status, body: '', error: frame.message || frame.code };
      if (frame.type === 'response') status = frame.status;
      if (frame.type === 'data' && typeof frame.data === 'string') chunks.push(Buffer.from(frame.data, 'base64'));
      if (frame.type === 'end') {
        return { status, body: Buffer.concat(chunks).toString('utf-8'), error: frame.error || undefined };
      }
      if (frame.ok !== undefined && frame.type === undefined) {
        return { status: frame.ok ? 200 : 400, body: frame.output ?? frame.result ?? '', error: frame.error };
      }
    }
  }

  close() {
    this.socket.destroy();
  }
}

async function withRcon<T>(
  configPath: string,
  fn: (conn: RconConnection) => Promise<T>,
  timeoutMs = 3000
): Promise<T> {
  const secrets = getOpen77Secrets(configPath);
  if (!secrets) throw new Error('Este servidor no tiene credenciales RCON guardadas en VXCore.');
  const conn = await RconConnection.connect(secrets.rconPort, timeoutMs);
  try {
    const hello = await conn.read(timeoutMs);
    if (hello.type === 'error') throw new Error(hello.message || 'RCON rechazó la conexión');
    const id = conn.send({ op: 'auth', version: 1, password: secrets.rconPassword });
    const auth = await conn.read(timeoutMs);
    if (auth.id === id && auth.ok === false) throw new Error(auth.message || 'Contraseña RCON incorrecta');
    if (auth.type === 'error') throw new Error(auth.message || 'Autenticación RCON fallida');
    return await fn(conn);
  } finally {
    conn.close();
  }
}

export async function probeOpen77(
  configPath: string,
  timeoutMs = 1500
): Promise<{ reachable: boolean; version?: string }> {
  const secrets = getOpen77Secrets(configPath);
  const port = secrets?.rconPort ?? OPEN77_DEFAULT_RCON_PORT;
  try {
    const conn = await RconConnection.connect(port, timeoutMs);
    try {
      const hello = await conn.read(timeoutMs);
      return { reachable: hello.type !== 'error', version: hello.version };
    } finally {
      conn.close();
    }
  } catch {
    return { reachable: false };
  }
}

async function open77Request(
  configPath: string,
  method: string,
  apiPath: string,
  body?: unknown
): Promise<{ status?: number; data: unknown; error?: string }> {
  return withRcon(configPath, async (conn) => {
    const id = conn.send({ op: 'request', method, path: apiPath, ...(body !== undefined ? { body } : {}) });
    const res = await conn.collect(id, 10000);
    let data: unknown = res.body;
    try {
      data = res.body ? JSON.parse(res.body) : null;
    } catch {}
    return { status: res.status, data, error: res.error };
  });
}

export async function open77Command(
  configPath: string,
  command: string
): Promise<{ ok: boolean; output: string; error?: string }> {
  return withRcon(configPath, async (conn) => {
    const id = conn.send({ op: 'command', command });
    const res = await conn.collect(id, 15000);
    const ok = !res.error && (res.status === undefined || res.status < 400);
    return { ok, output: res.body, error: res.error };
  });
}

export interface Open77Player {
  id: string | number;
  name: string;
  ping?: number;
  [key: string]: unknown;
}

interface RawOpen77Player {
  id?: string | number;
  playerId?: string | number;
  netId?: string | number;
  name?: string;
  displayName?: string;
  nickname?: string;
  ping?: number;
  rtt?: number;
  [key: string]: unknown;
}

export async function getOpen77Players(configPath: string): Promise<Open77Player[]> {
  const res = await open77Request(configPath, 'GET', '/api/players');
  if (res.error || (res.status && res.status >= 400)) {
    throw new Error(res.error || `RCON devolvió ${res.status}`);
  }
  const wrapped = res.data as { players?: unknown; data?: unknown } | null | undefined;
  const list = (Array.isArray(res.data) ? res.data : wrapped?.players || wrapped?.data || []) as RawOpen77Player[];
  return list.map((p) => ({
    ...p,
    id: (p.id ?? p.playerId ?? p.netId ?? p.name) as string | number,
    name: p.name ?? p.displayName ?? p.nickname ?? String(p.id ?? '?'),
    ping: p.ping ?? p.rtt,
  }));
}

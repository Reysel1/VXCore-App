import AdmZip from 'adm-zip';
import { execFile, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { loadPathsConfig, savePathsConfig, defaultFxServerBins } from './paths-config';
import { ensureResource, parseDirectives } from './cfg-resources';
import { tr } from './idioma';

const IS_WIN = process.platform === 'win32';

const FIVEM_VERSIONS_URL = 'https://changelogs-live.fivem.net/api/changelog/versions/win32/server';

export type ServerVariant = 'legacy' | 'enhanced';

const ENHANCED_FALLBACK_URL =
  'https://downloads.cfx-services.net/prod/01a01f0e-7471-722b-a8ec-9a1827a4fdee/cfx-server_win_x64.zip';

export interface ProvisionProgress {
  step: string;
  percent: number | null;
}

export interface ProvisionResult {
  ok: boolean;
  cancelled?: boolean;
  message: string;
  installedAt?: string;
}

interface ElevatedReply {
  ok: boolean;
  cancelled?: boolean;
  error?: string;
}

const pending = new Map<string, (reply: ElevatedReply) => void>();

function canAskDesktop(): boolean {
  return typeof process.send === 'function';
}

function askDesktop(type: string, timeoutMs: number): Promise<ElevatedReply> {
  return new Promise((resolve) => {
    if (!canAskDesktop()) {
      resolve({ ok: false, error: tr('Esto sólo se puede instalar desde la app de escritorio.') });
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ ok: false, error: tr('Se agotó la espera de la confirmación de Windows.') });
    }, timeoutMs);

    pending.set(id, (reply) => {
      clearTimeout(timer);
      pending.delete(id);
      resolve(reply);
    });

    try {
      process.send?.({ type, id });
    } catch {
      clearTimeout(timer);
      pending.delete(id);
      resolve({ ok: false, error: tr('La app de escritorio no está disponible.') });
    }
  });
}

if (typeof process.on === 'function') {
  process.on('message', (msg: unknown) => {
    const reply = msg as { type?: string; id?: string; ok?: boolean; cancelled?: boolean; error?: string };
    if (reply?.type !== 'provision-result' || !reply.id) return;
    pending.get(reply.id)?.({
      ok: Boolean(reply.ok),
      cancelled: Boolean(reply.cancelled),
      error: reply.error,
    });
  });

  process.on('disconnect', () => {
    const failed = { ok: false, error: tr('La app de escritorio se cerró antes de terminar.') };
    for (const resolve of pending.values()) resolve(failed);
    pending.clear();
  });
}

export async function installVcRedist(): Promise<ProvisionResult> {
  if (!IS_WIN) {
    return { ok: false, message: tr('El runtime de Visual C++ es cosa de Windows.') };
  }

  const reply = await askDesktop('provision-vcredist', 5 * 60 * 1000);
  if (reply.ok) {
    return { ok: true, message: tr('Visual C++ 2015-2022 (x64) instalado.') };
  }
  if (reply.cancelled) {
    return {
      ok: false,
      cancelled: true,
      message: tr('No diste permiso a Windows, así que no se instaló nada.'),
    };
  }
  return { ok: false, message: reply.error || tr('No se pudo instalar el runtime.') };
}

interface FivemVersions {
  recommended_download?: string;
  latest_download?: string;
  recommended?: string;
  latest?: string;
}

async function resolveFxServerDownload(
  variant: ServerVariant = 'legacy'
): Promise<{ url: string; build: string }> {
  if (variant === 'enhanced') return resolveEnhancedDownload();

  const response = await fetch(FIVEM_VERSIONS_URL, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    throw new Error(tr('El índice de versiones de FiveM respondió {status}.', { status: response.status }));
  }

  const data = (await response.json()) as FivemVersions;
  const url = data.recommended_download || data.latest_download;
  if (!url) throw new Error(tr('El índice de versiones de FiveM no traía ningún enlace de descarga.'));

  return { url, build: String(data.recommended || data.latest || 'desconocido') };
}

async function resolveEnhancedDownload(): Promise<{ url: string; build: string }> {
  const response = await fetch('https://docs.fivem.net/docs/server-download/', {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    throw new Error(tr('La página de descarga de Cfx.re respondió {status}.', { status: response.status }));
  }

  const parsed = parseEnhancedFromPage(await response.text());
  if (parsed) return parsed;
  return { url: ENHANCED_FALLBACK_URL, build: tr('desconocido (early access)') };
}

function parseEnhancedFromPage(html: string): { url: string; build: string } | null {
  const start = html.indexOf('"enhanced"');
  if (start === -1) return null;
  const section = html.slice(start, start + 4000);
  const match = section.match(
    /"subtitle":"build (\d+)","downloadURL":"(https:[^"]+cfx-server_win_x64\.(?:zip|7z))"/
  );
  return match ? { url: match[2], build: match[1] } : null;
}

const LEGACY_ARTIFACTS_URL = 'https://runtime.fivem.net/artifacts/fivem/build_server_windows/master/';

export type ArtifactTag = 'recommended' | 'latest' | 'critical' | 'optional';

export interface ArtifactBuild {
  build: string;
  hash?: string;
  date?: string;
  tags: ArtifactTag[];
}

export interface ArtifactCatalog {
  variant: ServerVariant;
  builds: ArtifactBuild[];
  recommended?: string;
  latest?: string;
}

interface FivemVersionsFull extends FivemVersions {
  critical?: string;
  optional?: string;
}

export function parseLegacyListing(html: string): ArtifactBuild[] {
  const seen = new Set<string>();
  const builds: ArtifactBuild[] = [];

  for (const chunk of html.split('<a class="panel-block').slice(1)) {
    const link = chunk.match(/^[^>]*href="\.\/(\d+)-([0-9a-f]{7,40})\/server\.(?:7z|zip)"/);
    if (!link || seen.has(link[1])) continue;
    seen.add(link[1]);

    const body = chunk.slice(0, chunk.indexOf('</a>') === -1 ? undefined : chunk.indexOf('</a>'));
    const date = body.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
    builds.push({ build: link[1], hash: link[2], date: date?.[1], tags: [] });
  }

  return builds.sort((a, b) => Number(b.build) - Number(a.build));
}

function parseEnhancedBuilds(html: string): { build: string; url: string }[] {
  const start = html.indexOf('"enhanced"');
  if (start === -1) return [];
  const section = html.slice(start, start + 6000);
  const out: { build: string; url: string }[] = [];
  const re = /"subtitle":"build (\d+)","downloadURL":"(https:[^"]+cfx-server_win_x64\.(?:zip|7z))"/g;
  for (let m = re.exec(section); m; m = re.exec(section)) {
    if (!out.some((b) => b.build === m![1])) out.push({ build: m[1], url: m[2] });
  }
  return out;
}

const CATALOG_TTL_MS = 10 * 60 * 1000;
const catalogCache = new Map<ServerVariant, { at: number; catalog: ArtifactCatalog; enhancedUrls?: Map<string, string> }>();

export async function listFxServerArtifacts(variant: ServerVariant = 'legacy'): Promise<ArtifactCatalog> {
  const cached = catalogCache.get(variant);
  if (cached && Date.now() - cached.at < CATALOG_TTL_MS) return cached.catalog;

  if (variant === 'enhanced') {
    const response = await fetch('https://docs.fivem.net/docs/server-download/', {
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(tr('La página de descarga de Cfx.re respondió {status}.', { status: response.status }));

    const found = parseEnhancedBuilds(await response.text());
    const newest = found.map((b) => Number(b.build)).sort((a, b) => b - a)[0];
    const catalog: ArtifactCatalog = {
      variant,
      builds: found.map((b) => ({
        build: b.build,
        tags: Number(b.build) === newest ? (['latest'] as ArtifactTag[]) : [],
      })),
      latest: newest ? String(newest) : undefined,
    };
    catalogCache.set(variant, {
      at: Date.now(),
      catalog,
      enhancedUrls: new Map(found.map((b) => [b.build, b.url])),
    });
    return catalog;
  }

  const [listing, versions] = await Promise.all([
    fetch(LEGACY_ARTIFACTS_URL, { signal: AbortSignal.timeout(30000) }).then(async (r) => {
      if (!r.ok) throw new Error(tr('El listado de artifacts de Cfx.re respondió {status}.', { status: r.status }));
      return r.text();
    }),
    fetch(FIVEM_VERSIONS_URL, { signal: AbortSignal.timeout(20000) })
      .then((r) => (r.ok ? (r.json() as Promise<FivemVersionsFull>) : null))
      .catch(() => null),
  ]);

  const builds = parseLegacyListing(listing);
  const tag = (build: string | undefined, name: ArtifactTag) => {
    const entry = build ? builds.find((b) => b.build === String(build)) : undefined;
    if (entry && !entry.tags.includes(name)) entry.tags.push(name);
  };
  tag(versions?.recommended, 'recommended');
  tag(versions?.latest, 'latest');
  tag(versions?.critical, 'critical');
  tag(versions?.optional, 'optional');

  const catalog: ArtifactCatalog = {
    variant,
    builds,
    recommended: versions?.recommended ? String(versions.recommended) : undefined,
    latest: versions?.latest ? String(versions.latest) : builds[0]?.build,
  };
  catalogCache.set(variant, { at: Date.now(), catalog });
  return catalog;
}

async function resolveBuildDownload(
  variant: ServerVariant,
  build: string
): Promise<{ url: string; build: string }> {
  const catalog = await listFxServerArtifacts(variant);
  const entry = catalog.builds.find((b) => b.build === build);
  if (!entry) throw new Error(tr('El build {build} no está en el catálogo oficial de Cfx.re.', { build }));

  if (variant === 'enhanced') {
    const url = catalogCache.get('enhanced')?.enhancedUrls?.get(build);
    if (!url) throw new Error(tr('Cfx.re ya no ofrece la descarga del build {build} de GTAV Enhanced.', { build }));
    return { url, build };
  }

  const base = `${LEGACY_ARTIFACTS_URL}${entry.build}-${entry.hash}/`;
  try {
    const head = await fetch(`${base}server.zip`, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
    if (head.ok) return { url: `${base}server.zip`, build };
  } catch {}
  return { url: `${base}server.7z`, build };
}

const buildCache = new Map<string, { mtimeMs: number; build: string | null }>();

export function legacyBuildOf(binary: string): string | null {
  const dir = path.dirname(binary);
  const dll = [path.join(dir, 'citizen-server-impl.dll'), path.join(dir, 'dlls', 'citizen-server-impl.dll')].find(
    (candidate) => fs.existsSync(candidate)
  );
  if (!dll) return null;

  try {
    const { mtimeMs } = fs.statSync(dll);
    const cached = buildCache.get(dll);
    if (cached && cached.mtimeMs === mtimeMs) return cached.build;

    const match = fs.readFileSync(dll).toString('latin1').match(/FXServer-[a-z]+ SERVER v1\.0\.0\.(\d+)/);
    const build = match ? match[1] : null;
    buildCache.set(dll, { mtimeMs, build });
    return build;
  } catch {
    return null;
  }
}

export function defaultArtifactsRoot(variant: ServerVariant): string {
  return path.join(
    process.env.LOCALAPPDATA || os.homedir(),
    'VXCore',
    variant === 'enhanced' ? 'FXServer-Enhanced' : 'FXServer'
  );
}

export function installedArtifactBuilds(variant: ServerVariant): string[] {
  const root = defaultArtifactsRoot(variant);
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .filter((entry) => serverBinaryIn(path.join(root, entry.name), variant) !== null)
      .map((entry) => entry.name)
      .sort((a, b) => Number(b) - Number(a));
  } catch {
    return [];
  }
}

function archiveKind(file: string): 'zip' | '7z' | 'unknown' {
  const head = Buffer.alloc(6);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, head, 0, 6, 0);
  } finally {
    fs.closeSync(fd);
  }

  if (head.subarray(0, 2).toString('latin1') === 'PK') return 'zip';
  if (head.toString('hex') === '377abcaf271c') return '7z';
  return 'unknown';
}

function sevenZipBinary(): string | null {
  const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    resources ? path.join(resources, '7zr', '7zr.exe') : null,
    path.resolve(process.cwd(), '..', 'vendor', '7zr', '7zr.exe'),
    path.resolve(__dirname, '..', '..', 'vendor', '7zr', '7zr.exe'),
  ].filter((c): c is string => Boolean(c));

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function extract7z(archive: string, destination: string, binary: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ['x', archive, `-o${destination}`, '-y'], { windowsHide: true });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk).slice(0, 2000);
    });
    child.on('error', (err) => reject(new Error(tr('No se pudo ejecutar 7zr: {message}', { message: err.message }))));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`7zr terminó con código ${code}. ${stderr.trim()}`.trim()));
    });
  });
}

async function extractArchive(archive: string, destination: string): Promise<void> {
  const kind = archiveKind(archive);

  if (kind === 'zip') {
    new AdmZip(archive).extractAllTo(destination, true);
    return;
  }

  if (kind === '7z') {
    const binary = sevenZipBinary();
    if (!binary) {
      throw new Error(
        tr('El paquete de FiveM viene en .7z y falta 7zr.exe, que es lo que lo abre. Reinstala VXCore: viaja dentro del instalador.')
      );
    }
    await extract7z(archive, destination, binary);
    return;
  }

  throw new Error(tr('Lo descargado de FiveM no es ni un .zip ni un .7z. Inténtalo más tarde.'));
}

function serverBinaryNames(variant: ServerVariant): string[] {
  return variant === 'enhanced' ? ['cfx-server.exe'] : ['FXServer.exe', 'run.cmd'];
}

function serverBinaryIn(dir: string, variant: ServerVariant): string | null {
  for (const name of serverBinaryNames(variant)) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function dllsPresent(dir: string): { ok: boolean; count: number } {
  const dirs = [dir, path.join(dir, 'dlls')];
  let count = 0;
  for (const d of dirs) {
    try {
      for (const entry of fs.readdirSync(d)) {
        if (/^\.dll$/i.test(path.extname(entry))) count += 1;
      }
    } catch {}
  }
  return { ok: count > 0, count };
}

async function resolveLatestFxServerDownload(): Promise<{ url: string; build: string }> {
  const response = await fetch(FIVEM_VERSIONS_URL, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(tr('El índice de versiones de FiveM respondió {status}.', { status: response.status }));
  const data = (await response.json()) as FivemVersions;
  const url = data.latest_download || data.recommended_download;
  if (!url) throw new Error(tr('El índice de versiones de FiveM no traía ningún enlace latest.'));
  return { url, build: String(data.latest || data.recommended || 'desconocido') };
}

export async function installFxServer(options: {
  targetDir?: string;
  variant?: ServerVariant;
  channel?: 'recommended' | 'latest';
  build?: string;
  onProgress?: (progress: ProvisionProgress) => void;
}): Promise<ProvisionResult> {
  if (!IS_WIN) {
    return { ok: false, message: tr('La instalación automática de FXServer es sólo para Windows.') };
  }

  const variant: ServerVariant = options.variant === 'enhanced' ? 'enhanced' : 'legacy';
  const report = (step: string, percent: number | null = null) =>
    options.onProgress?.({ step, percent });

  report(
    options.build
      ? tr('Buscando el build {build} en el catálogo de Cfx.re…', { build: options.build })
      : tr('Preguntando a Cfx.re qué versión es la recomendada…')
  );

  let download: { url: string; build: string };
  try {
    download = options.build
      ? await resolveBuildDownload(variant, String(options.build))
      : options.channel === 'latest' && variant === 'legacy'
        ? await resolveLatestFxServerDownload()
        : await resolveFxServerDownload(variant);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  const { url, build } = download;

  const targetDir =
    options.targetDir?.trim() ||
    path.join(defaultArtifactsRoot(variant), /^\d+$/.test(build) ? build : 'actual');

  if (fs.existsSync(path.join(targetDir, 'server.cfg')) || fs.existsSync(path.join(targetDir, 'resources'))) {
    return {
      ok: false,
      message:
        tr('{targetDir} es la carpeta de un servidor. Los artifacts van en una carpeta propia: deja el destino vacío y VXCore usará la suya.', { targetDir }),
    };
  }

  report(tr('Descargando FXServer (build {build})…', { build }), 0);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    return { ok: false, message: tr('La descarga de FXServer devolvió {status}.', { status: response.status }) };
  }

  const total = Number(response.headers.get('content-length')) || 0;
  const tempFile = path.join(os.tmpdir(), `vxcore-fxserver-${Date.now()}.bin`);

  const out = fs.createWriteStream(tempFile);
  let received = 0;
  try {
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        received += chunk.length;
        if (!out.write(chunk)) {
          await new Promise<void>((resolve) => out.once('drain', () => resolve()));
        }
        if (total) report(tr('Descargando FXServer (build {build})…', { build }), Math.round((received / total) * 100));
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        out.on('error', reject);
        out.end(() => resolve());
      });
    }

    report(tr('Descomprimiendo…'));
    fs.mkdirSync(targetDir, { recursive: true });
    await extractArchive(tempFile, targetDir);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  } finally {
    fs.rm(tempFile, { force: true }, () => {});
  }

  const binary = serverBinaryIn(targetDir, variant);
  if (!binary) {
    const expected = serverBinaryNames(variant)
      .map((name) => `\`${name}\``)
      .join(' ni ');
    return {
      ok: false,
      message: tr('Se descomprimió en {targetDir} pero no aparece {expected}. Revisa la carpeta.', { targetDir, expected }),
    };
  }

  const dlls = dllsPresent(targetDir);
  if (!dlls.ok) {
    return {
      ok: false,
      message: tr('Se descomprimió en {targetDir} pero no aparecen las DLLs del servidor. El paquete llegó incompleto: inténtalo otra vez.', { targetDir }),
    };
  }

  savePathsConfig(variant === 'enhanced' ? { cfxServerBin: binary } : { fxServerBin: binary });
  report(tr('Listo.'), 100);

  return {
    ok: true,
    message: tr('FXServer (build {build}) instalado y configurado ({count} DLLs).', { build, count: dlls.count }),
    installedAt: binary,
  };
}

const SERVER_DATA_URL = 'https://github.com/citizenfx/cfx-server-data/archive/refs/heads/master.zip';

const BASE_RESOURCES = [
  'mapmanager',
  'chat',
  'spawnmanager',
  'sessionmanager',
  'basic-gamemode',
  'hardcap',
  'rconlog',
  'scoreboard',
];

function resourceNamesUnder(resourcesDir: string): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name.startsWith('[') && entry.name.endsWith(']')) walk(full);
      else found.add(entry.name);
    }
  };
  walk(resourcesDir);
  return found;
}

function cfgQuote(value: string): string {
  return String(value).replace(/"/g, "'").replace(/[\r\n]+/g, ' ').trim();
}

export interface NewServerOptions {
  targetDir: string;
  hostname: string;
  maxClients: number;
  port: number;
  licenseKey: string;
  dbConnectionString?: string;
  game?: 'fivem' | 'redm';
  build?: 'legacy' | 'enhanced';
  autoInstall?: { vcRedist: boolean; artifacts: boolean };
  onProgress?: (progress: ProvisionProgress) => void;
}

function binaryAvailable(build: ServerVariant, targetDir: string): boolean {
  const config = loadPathsConfig();
  const configured = build === 'enhanced' ? config.cfxServerBin : config.fxServerBin;
  if (configured && fs.existsSync(configured)) return true;

  const base = path.join(process.env.LOCALAPPDATA || os.homedir(), 'VXCore');
  const dirs =
    build === 'enhanced'
      ? [path.join(base, 'FXServer-Enhanced')]
      : [path.join(base, 'FXServer'), path.join(base, 'FXServer-Enhanced')];
  for (const dir of dirs) {
    if (serverBinaryIn(dir, build)) return true;
  }

  if (serverBinaryIn(targetDir, build)) return true;

  if (build === 'legacy') {
    for (const bin of defaultFxServerBins()) {
      if (fs.existsSync(bin)) return true;
    }
  }

  return false;
}

export async function createServer(options: NewServerOptions): Promise<ProvisionResult & { cfgPath?: string }> {
  const report = (step: string, percent: number | null = null) =>
    options.onProgress?.({ step, percent });

  const targetDir = options.targetDir.trim();
  if (!targetDir) return { ok: false, message: tr('Falta la carpeta donde crear el servidor.') };

  const licenseKey = options.licenseKey.trim();
  if (!licenseKey) {
    return {
      ok: false,
      message: tr('Falta la clave de servidor de Cfx.re. Sácala en keymaster.fivem.net; es gratis y sirve para FiveM y RedM.'),
    };
  }

  const game = options.game === 'redm' ? 'redm' : 'fivem';
  const build: ServerVariant =
    game === 'redm' ? 'legacy' : options.build === 'enhanced' ? 'enhanced' : 'legacy';

  const createDefaults = loadPathsConfig().create;
  const autoInstall = {
    vcRedist: options.autoInstall?.vcRedist ?? createDefaults.installVcRedist,
    artifacts: options.autoInstall?.artifacts ?? createDefaults.downloadArtifacts,
  };

  const cfgPath = path.join(targetDir, 'server.cfg');
  if (fs.existsSync(cfgPath)) {
    return {
      ok: false,
      message: tr('Ya hay un server.cfg en {targetDir}. Elige otra carpeta o da de alta ese servidor en su lugar.', { targetDir }),
    };
  }

  const staging = path.join(os.tmpdir(), `vxcore-serverdata-${Date.now()}`);
  const archive = `${staging}.zip`;

  try {
    if (IS_WIN && autoInstall.vcRedist && !(await vcRedistPresent())) {
      report(tr('Instalando el runtime de Visual C++ (Windows pedirá permiso una vez)…'));
      const vc = await installVcRedist();
      if (!vc.ok) return { ok: false, cancelled: vc.cancelled, message: vc.message };
    }

    if (autoInstall.artifacts && !binaryAvailable(build, targetDir)) {
      report(tr('Descargando los artifacts de FXServer ({valor})…', { valor: build === 'enhanced' ? 'GTAV Enhanced' : 'FiveM/RedM' }), 0);
      const fx = await installFxServer({
        variant: build,
        onProgress: (progress) => report(progress.step, progress.percent),
      });
      if (!fx.ok) return { ok: false, message: fx.message };
    }

    report(tr('Descargando los recursos base de Cfx.re…'), 0);
    const response = await fetch(SERVER_DATA_URL, { redirect: 'follow' });
    if (!response.ok) {
      return { ok: false, message: tr('La descarga de los recursos base devolvió {status}.', { status: response.status }) };
    }
    fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));

    report(tr('Preparando la carpeta del servidor…'));
    fs.mkdirSync(staging, { recursive: true });
    new AdmZip(archive).extractAllTo(staging, true);

    const inner = fs
      .readdirSync(staging, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(staging, entry.name));
    const root = inner.length === 1 ? inner[0] : staging;

    fs.mkdirSync(targetDir, { recursive: true });
    fs.cpSync(root, targetDir, { recursive: true });

    report(tr('Añadiendo el recurso de VXCore…'));
    const bundled = bundledResourcePath();
    if (bundled) {
      copyBundledResource(bundled, path.join(targetDir, 'resources', RESOURCE_FOLDER));
    }

    report(tr('Escribiendo server.cfg…'));
    const present = resourceNamesUnder(path.join(targetDir, 'resources'));
    const ensures = BASE_RESOURCES.filter((name) => present.has(name));
    if (bundled) ensures.push(RESOURCE_FOLDER);

    fs.writeFileSync(cfgPath, buildServerCfg({ ...options, game, build, licenseKey, ensures }), 'utf-8');

    try {
      fs.writeFileSync(
        path.join(targetDir, '.vxcore-game'),
        JSON.stringify({ game, build }, null, 2),
        'utf-8'
      );
    } catch {}

    report(tr('Listo.'), 100);

    return {
      ok: true,
      message: tr('Servidor de {valor} creado en {targetDir}.', { valor: game === 'redm' ? 'RedM' : 'FiveM', targetDir }),
      installedAt: targetDir,
      cfgPath,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  } finally {
    fs.rm(archive, { force: true }, () => {});
    fs.rm(staging, { recursive: true, force: true }, () => {});
  }
}

export const RESOURCE_FOLDER = 'vxcore';

export const RESOURCE_FOLDER_NAMES = [RESOURCE_FOLDER, 'fiveos-resource'];

function existingResourcePath(serverDataPath: string): string | null {
  for (const name of RESOURCE_FOLDER_NAMES) {
    const candidate = path.join(serverDataPath, 'resources', name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function syncBundledResource(
  serverDataPath: string,
  version: string
): 'updated' | 'current' | 'reactivated' | 'absent' | 'unavailable' {
  const bundled = bundledResourcePath();
  if (!bundled) return 'unavailable';

  const target = existingResourcePath(serverDataPath);
  if (!target) return 'absent';

  const stamp = path.join(target, '.vxcore-version');
  try {
    if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf-8').trim() === version) {
      return 'current';
    }
  } catch {}

  copyBundledResource(bundled, target);
  try {
    fs.writeFileSync(stamp, version, 'utf-8');
  } catch {}

  const resourceName = path.basename(target);
  for (const cfgName of ['server.cfg', 'server.conf']) {
    const cfgPath = path.join(serverDataPath, cfgName);
    try {
      if (!fs.existsSync(cfgPath)) continue;
      const before = fs.readFileSync(cfgPath, 'utf-8');
      const directives = parseDirectives(before);
      const active = directives.some(
        (d) => !d.commented && d.kind === 'ensure' && d.target === resourceName
      );
      if (active) continue;
      fs.writeFileSync(cfgPath, ensureResource(before, resourceName), 'utf-8');
      return 'reactivated';
    } catch {}
  }

  return 'updated';
}

const LEGACY_RESOURCE_ENTRIES = ['client', 'server', 'nui'];

const RESOURCE_OWNER_FILES = ['config.lua'];

export function copyBundledResource(bundled: string, target: string): void {
  if (path.resolve(bundled) === path.resolve(target)) return;

  const newLayout = fs.existsSync(path.join(bundled, 'source'));
  if (newLayout) {
    for (const entry of LEGACY_RESOURCE_ENTRIES) {
      fs.rmSync(path.join(target, entry), { recursive: true, force: true });
    }
  }

  fs.cpSync(bundled, target, {
    recursive: true,
    force: true,
    filter: (src) => {
      const relative = path.relative(bundled, src);
      if (newLayout && LEGACY_RESOURCE_ENTRIES.includes(relative.split(path.sep)[0])) return false;
      if (!RESOURCE_OWNER_FILES.includes(relative)) return true;
      return !fs.existsSync(path.join(target, relative));
    },
  });
}

export function bundledResourcePath(): string | null {
  const candidates = [
    path.join(__dirname, '..', '..', RESOURCE_FOLDER),
    path.resolve(process.cwd(), '..', RESOURCE_FOLDER),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function buildServerCfg(
  options: NewServerOptions & { game: 'fivem' | 'redm'; build: 'legacy' | 'enhanced'; licenseKey: string; ensures: string[] }
): string {
  const port = Number(options.port) || 30120;
  const maxClients = Math.min(Math.max(Number(options.maxClients) || 32, 1), 2048);
  const isRedM = options.game === 'redm';
  const defaultName = isRedM ? tr('Mi servidor de RedM') : tr('Mi servidor de FiveM');

  return [
    '# server.cfg — creado por VXCore',
    '# Puedes editarlo desde el panel (Editor) o a mano; el panel respeta lo que escribas.',
    '',
    '# Por dónde entra la gente. El 30120 es el puerto por defecto de FiveM y RedM.',
    `endpoint_add_tcp "0.0.0.0:${port}"`,
    `endpoint_add_udp "0.0.0.0:${port}"`,
    '',
    ...(isRedM
      ? [
          '# RedM: esta línea es la que hace que FXServer corra Red Dead Redemption 2.',
          '# Sin ella el mismo binario arrancaría en modo FiveM. La clave de keymaster',
          '# vale igual para los dos juegos.',
          'set gamename rdr3',
          '',
        ]
      : []),
    '# Recursos base de Cfx.re. El orden importa: cada uno depende de los de arriba.',
    ...options.ensures.map((name) => `ensure ${name}`),
    '',
    ...(!isRedM && options.build === 'enhanced'
      ? [
          '# GTAV Enhanced: el binario es cfx-server.exe y se fuerza el gamebuild',
          '# nuevo (372 = The Kortz Center Heist). Sin esto los clientes Enhanced no entran.',
          'sv_enforceGameBuild 372',
          '',
        ]
      : []),
    '# Cómo se ve el servidor en la lista.',
    `sv_hostname "${cfgQuote(options.hostname) || defaultName}"`,
    `sets sv_projectName "${cfgQuote(options.hostname) || defaultName}"`,
    'sets sv_projectDesc "Servidor gestionado con VXCore"',
    'sets locale "es-ES"',
    `sv_maxclients ${maxClients}`,
    '',
    '# Tu clave de keymaster.fivem.net. Sin ella el servidor no sale en la lista.',
    `sv_licenseKey "${cfgQuote(options.licenseKey)}"`,
    '',
    '# Los mods del cliente quedan bloqueados. Ponlo a 1 sólo si sabes por qué.',
    'sv_scriptHookAllowed 0',
    '',
    ...(options.dbConnectionString
      ? [
          '# Base de datos.',
          `set mysql_connection_string "${cfgQuote(options.dbConnectionString)}"`,
          '',
        ]
      : [
          '# Cuando tengas base de datos, descomenta esto y pon tus datos:',
          '# set mysql_connection_string "mysql://usuario:contraseña@localhost/mi_base"',
          '',
        ]),
    '# Permisos. Para hacerte administrador, arranca el servidor, entra, y en la',
    '# consola escribe `add_principal identifier.fivem:TU_ID group.admin` (en RedM,',
    '# `identifier.license:TU_ID`).',
    'add_ace group.admin command allow',
    'add_ace group.admin command.quit deny',
    `add_ace resource.${RESOURCE_FOLDER} command allow`,
    '',
  ].join('\r\n');
}

export function vcRedistPresent(): Promise<boolean> {
  if (!IS_WIN) return Promise.resolve(true);
  return new Promise((resolve) => {
    execFile(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64', '/v', 'Installed'],
      { windowsHide: true, timeout: 4000 },
      (error, stdout) => resolve(!error && /Installed\s+REG_DWORD\s+0x1/i.test(stdout))
    );
  });
}

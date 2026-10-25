import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { ensureResource } from './cfg-resources';
import { tr, trMsg } from './idioma';

export interface CatalogEntry {
  name: string;
  repo: string | null;
  author: string;
  category: string;
  description: string;
  dependencies: string[];
  verified: boolean;
  store?: StoreListing;
}

export interface StoreListing {
  url: string;
  price: string;
  image: string;
}

export const CATALOG: CatalogEntry[] = [
  {
    name: 'ox_lib',
    repo: 'overextended/ox_lib',
    author: 'overextended',
    category: 'Core',
    description: trMsg('Librería compartida con UI, callbacks, zonas y utilidades. Dependencia de medio ecosistema moderno.'),
    dependencies: [],
    verified: true,
  },
  {
    name: 'oxmysql',
    repo: 'overextended/oxmysql',
    author: 'overextended',
    category: 'Core',
    description: trMsg('Driver MySQL asíncrono para FiveM. Sustituye a mysql-async con mejor rendimiento.'),
    dependencies: [],
    verified: true,
  },
  {
    name: 'ox_inventory',
    repo: 'overextended/ox_inventory',
    author: 'overextended',
    category: 'Core',
    description: trMsg('Inventario por slots con peso, metadatos, armas degradables y contenedores.'),
    dependencies: ['ox_lib', 'oxmysql'],
    verified: true,
  },
  {
    name: 'ox_target',
    repo: 'overextended/ox_target',
    author: 'overextended',
    category: 'Core',
    description: trMsg('Sistema de interacción por objetivo (third-eye) con zonas y entidades.'),
    dependencies: ['ox_lib'],
    verified: true,
  },
  {
    name: 'qb-core',
    repo: 'qbcore-framework/qb-core',
    author: 'qbcore-framework',
    category: 'Framework',
    description: trMsg('Framework modular con sistema de jugadores, trabajos, salarios y multi-personaje.'),
    dependencies: ['oxmysql'],
    verified: true,
  },
  {
    name: 'illenium-appearance',
    repo: 'iLLeniumStudios/illenium-appearance',
    author: 'iLLeniumStudios',
    category: 'UI',
    description: trMsg('Menú de personalización de ropa, tatuajes y outfits con vista previa 3D.'),
    dependencies: ['ox_lib'],
    verified: true,
  },
  {
    name: 'ps-housing',
    repo: 'Project-Sloth/ps-housing',
    author: 'Project-Sloth',
    category: 'Sistemas',
    description: trMsg('Sistema de viviendas con decoración in-game, alijos compartidos y compraventa.'),
    dependencies: ['qb-core', 'ox_lib', 'ox_target'],
    verified: true,
  },
  {
    name: 'ps-dispatch',
    repo: 'Project-Sloth/ps-dispatch',
    author: 'Project-Sloth',
    category: 'Trabajos',
    description: trMsg('Central de alertas y llamadas de emergencia con radar en vivo para policía y sanitarios.'),
    dependencies: ['qb-core'],
    verified: true,
  },
  {
    name: 'Renewed-Banking',
    repo: 'Renewed-Scripts/Renewed-Banking',
    author: 'Renewed Scripts',
    category: 'UI',
    description: trMsg('Banco NUI con transferencias IBAN, cuentas de empresa y estados de cuenta.'),
    dependencies: ['ox_lib', 'oxmysql'],
    verified: true,
  },

  {
    name: 'screenshot-basic',
    repo: 'citizenfx/screenshot-basic',
    author: 'citizenfx',
    category: 'Core',
    description:
      trMsg('Capturas del juego desde el cliente. Es lo que necesita el panel para enseñar la pantalla de un jugador en Jugadores → Ver pantalla.'),
    dependencies: [],
    verified: true,
  },

  {
    name: 'Urantix Interface',
    repo: null,
    author: 'Urantix',
    category: 'Urantix',
    description:
      trMsg('HUD todo en uno: estado, carhud, voiceui, notificaciones, textui, progressbar, DeathUI y WeaponUI. Cada elemento se activa y se ajusta por separado.'),
    dependencies: [],
    verified: true,
    store: {
      url: 'https://store.urantix.com/fivem/interface',
      price: '14,99 €',
      image: 'https://img.youtube.com/vi/6LGQgXBCXtU/maxresdefault.jpg',
    },
  },
  {
    name: 'Urantix Dealership',
    repo: null,
    author: 'Urantix',
    category: 'Urantix',
    description:
      trMsg('Concesionario con panel de gestión dentro del juego: crear y configurar concesionarios, inventario y financiación sin tocar código ni molestar al programador.'),
    dependencies: [],
    verified: true,
    store: {
      url: 'https://store.urantix.com/fivem-scripts/dealership',
      price: '36,99 €',
      image: 'https://img.youtube.com/vi/On_Cekw7m1s/maxresdefault.jpg',
    },
  },
  {
    name: 'Urantix Pausemenu',
    repo: null,
    author: 'Urantix',
    category: 'Urantix',
    description:
      trMsg('Convierte el menú de pausa en un centro de control: perfil, estadísticas, propiedades, vehículos, facturas, negocios, avisos del servidor y contadores en vivo.'),
    dependencies: [],
    verified: true,
    store: {
      url: 'https://store.urantix.com/fivem-scripts/pausemenu',
      price: '29,99 €',
      image: 'https://img.youtube.com/vi/HpSn4Q2R4Bo/maxresdefault.jpg',
    },
  },
];

export interface RepoMeta {
  stars: number | null;
  version: string | null;
  updatedAt: string | null;
  unavailable?: string;
}

const META_TTL_MS = 10 * 60 * 1000;
const metaCache = new Map<string, { at: number; meta: RepoMeta }>();

export async function fetchRepoMeta(repo: string): Promise<RepoMeta> {
  const cached = metaCache.get(repo);
  if (cached && Date.now() - cached.at < META_TTL_MS) return cached.meta;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'FiveOS-Agent',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const meta: RepoMeta = { stars: null, version: null, updatedAt: null };

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });

    if (res.status === 403 || res.status === 429) {
      meta.unavailable = tr('Límite de la API de GitHub alcanzado');
    } else if (res.ok) {
      const data = (await res.json()) as { stargazers_count?: unknown; pushed_at?: string | null };
      meta.stars = typeof data.stargazers_count === 'number' ? data.stargazers_count : null;
      meta.updatedAt = data.pushed_at || null;

      try {
        const relRes = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
          headers,
          signal: AbortSignal.timeout(6000),
        });
        if (relRes.ok) {
          const rel = (await relRes.json()) as { tag_name?: string | null };
          meta.version = rel.tag_name || null;
        }
      } catch {}
    } else {
      meta.unavailable = tr('GitHub respondió {status}', { status: res.status });
    }
  } catch (err) {
    meta.unavailable = (err as Error | undefined)?.name === 'TimeoutError' ? tr('GitHub no respondió a tiempo') : tr('Sin conexión con GitHub');
  }

  metaCache.set(repo, { at: Date.now(), meta });
  return meta;
}

export function listInstalledResources(serverDataPath: string): Set<string> {
  const installed = new Set<string>();
  const resourcesDir = path.join(serverDataPath, 'resources');
  if (!fs.existsSync(resourcesDir)) return installed;

  const walk = (dir: string, depth: number) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('[') && entry.name.endsWith(']')) {
        if (depth < 3) walk(path.join(dir, entry.name), depth + 1);
      } else {
        installed.add(entry.name.toLowerCase());
      }
    }
  };

  walk(resourcesDir, 0);
  return installed;
}

function extractSafely(zip: AdmZip, targetDir: string, stripRoot: boolean): number {
  const resolvedTarget = path.resolve(targetDir);
  let written = 0;

  for (const entry of zip.getEntries()) {
    let relative = entry.entryName.replace(/\\/g, '/');

    if (stripRoot) {
      const slash = relative.indexOf('/');
      if (slash === -1) continue;
      relative = relative.slice(slash + 1);
    }
    if (!relative) continue;

    const destination = path.resolve(resolvedTarget, relative);
    if (destination !== resolvedTarget && !destination.startsWith(resolvedTarget + path.sep)) {
      console.warn(`[Marketplace] Entrada descartada por salirse del destino: ${entry.entryName}`);
      continue;
    }

    if (entry.isDirectory) {
      fs.mkdirSync(destination, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, entry.getData());
      written++;
    }
  }

  return written;
}

export interface InstallResult {
  success: boolean;
  message: string;
  code?: string;
  installedPath?: string;
  files?: number;
  version?: string | null;
  ensureAdded?: boolean;
  missingDependencies?: string[];
}

export async function installFromGithub(options: {
  repo: string;
  name: string;
  serverDataPath: string;
  cfgPath?: string;
  dependencies?: string[];
  overwrite?: boolean;
}): Promise<InstallResult> {
  const { repo, name, serverDataPath, cfgPath, dependencies = [], overwrite = false } = options;

  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return { success: false, code: 'BAD_REPO', message: tr('Repositorio no válido: {repo}', { repo }) };
  }
  if (!/^[\w.-]+$/.test(name) || /^\.+$/.test(name)) {
    return { success: false, code: 'BAD_NAME', message: tr('Nombre de recurso no válido: {name}', { name }) };
  }
  if (!serverDataPath || !fs.existsSync(serverDataPath)) {
    return {
      success: false,
      code: 'NO_SERVER_PATH',
      message: tr('No existe la carpeta del servidor: {valor}', { valor: serverDataPath || '(sin definir)' }),
    };
  }

  const resourcesDir = path.join(serverDataPath, 'resources');
  const targetDir = path.join(resourcesDir, name);

  if (fs.existsSync(targetDir) && !overwrite) {
    return {
      success: false,
      code: 'ALREADY_INSTALLED',
      message: tr('{name} ya existe en {targetDir}. Actívalo desde Recursos o reinstálalo forzando la sobrescritura.', { name, targetDir }),
    };
  }

  const headers: Record<string, string> = { 'User-Agent': 'FiveOS-Agent' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  let buffer: Buffer;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/zipball`, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      return {
        success: false,
        code: 'DOWNLOAD_FAILED',
        message:
          res.status === 404
            ? tr('El repositorio {repo} no existe o es privado.', { repo })
            : tr('GitHub respondió {status} al descargar {repo}.', { status: res.status, repo }),
      };
    }

    buffer = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    const error = err as Error | undefined;
    return {
      success: false,
      code: 'DOWNLOAD_FAILED',
      message:
        error?.name === 'TimeoutError'
          ? tr('La descarga de {repo} superó el tiempo de espera.', { repo })
          : tr('No se pudo descargar {repo}: {message}', { repo, message: error?.message }),
    };
  }

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fiveos-install-'));
  let files = 0;

  try {
    files = extractSafely(new AdmZip(buffer), stagingDir, true);

    const hasManifest =
      fs.existsSync(path.join(stagingDir, 'fxmanifest.lua')) ||
      fs.existsSync(path.join(stagingDir, '__resource.lua'));

    if (!hasManifest) {
      return {
        success: false,
        code: 'NOT_A_RESOURCE',
        message: tr('El contenido de {repo} no tiene fxmanifest.lua en la raíz, así que no es un recurso instalable tal cual.', { repo }),
      };
    }

    fs.mkdirSync(resourcesDir, { recursive: true });
    if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
    fs.cpSync(stagingDir, targetDir, { recursive: true });
  } catch (err) {
    return { success: false, code: 'EXTRACT_FAILED', message: tr('Error extrayendo {repo}: {message}', { repo, message: (err as Error | undefined)?.message }) };
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }

  let ensureAdded = false;
  if (cfgPath && fs.existsSync(cfgPath)) {
    const before = fs.readFileSync(cfgPath, 'utf-8');
    const after = ensureResource(before, name);
    if (after !== before) {
      fs.writeFileSync(cfgPath, after, 'utf-8');
      ensureAdded = true;
    }
  }

  const installed = listInstalledResources(serverDataPath);
  const missingDependencies = dependencies.filter((dep) => !installed.has(dep.toLowerCase()));

  const meta = await fetchRepoMeta(repo);

  return {
    success: true,
    message: tr('{name} instalado en {targetDir} ({files} archivos).', { name, targetDir, files }),
    installedPath: targetDir,
    files,
    version: meta.version,
    ensureAdded,
    missingDependencies,
  };
}

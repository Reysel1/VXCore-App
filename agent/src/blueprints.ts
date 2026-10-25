import fs from 'fs';
import os from 'os';
import path from 'path';

import { extractZipSkippingRoot, isInside } from './archives';
import type { ProvisionProgress } from './provision';

export interface BlueprintTask {
  label: string;
  kind: 'release' | 'github' | 'zip';
  repo?: string;
  ref?: string;
  asset?: string;
  url?: string;
  subpath?: string;
  dest: string;
  stripRoot?: boolean;
}

export type FrameworkId = 'standalone' | 'qbcore' | 'esx';

export interface Blueprint {
  id: FrameworkId;
  name: string;
  description: string;
  sql?: { repo: string; ref: string; file: string };
  ensureOrder: string[];
  tasks: BlueprintTask[];
}

function commonTasks(): BlueprintTask[] {
  return [
    {
      label: 'oxmysql',
      kind: 'release',
      repo: 'overextended/oxmysql',
      asset: 'oxmysql.zip',
      dest: '[standalone]/oxmysql',
      stripRoot: true,
    },
    {
      label: 'pma-voice',
      kind: 'github',
      repo: 'AvarianKnight/pma-voice',
      ref: 'main',
      dest: '[voice]/pma-voice',
    },
  ];
}

function cfxServerDataTask(dest: string): BlueprintTask {
  return {
    label: 'Recursos base de Cfx.re',
    kind: 'github',
    repo: 'citizenfx/cfx-server-data',
    ref: 'master',
    subpath: 'resources',
    dest,
  };
}

const BLUEPRINTS: Record<FrameworkId, Blueprint> = {
  standalone: {
    id: 'standalone',
    name: 'Standalone',
    description:
      'Sin framework: los recursos base de Cfx.re, oxmysql y voz. Ideal si usas recursos propios o quieres montar el tuyo.',
    ensureOrder: ['[standalone]', '[voice]', '[cfx-default]'],
    tasks: [
      cfxServerDataTask('[cfx-default]'),
      ...commonTasks(),
    ],
  },
  qbcore: {
    id: 'qbcore',
    name: 'QBCore',
    description:
      'Framework QBCore: núcleo, multicharacter, target, HUD y los módulos base. Base de datos qbcore.',
    sql: { repo: 'qbcore-fivem/txAdminRecipe', ref: 'main', file: 'qbcore.sql' },
    ensureOrder: ['[qb]', '[standalone]', '[voice]', '[cfx-default]'],
    tasks: [
      cfxServerDataTask('[cfx-default]'),
      ...commonTasks(),
      { label: 'qb-core', kind: 'github', repo: 'qbcore-fivem/qb-core', ref: 'main', dest: '[qb]/qb-core' },
      {
        label: 'qb-multicharacter',
        kind: 'github',
        repo: 'qbcore-fivem/qb-multicharacter',
        ref: 'main',
        dest: '[qb]/qb-multicharacter',
      },
      { label: 'qb-spawn', kind: 'github', repo: 'qbcore-fivem/qb-spawn', ref: 'main', dest: '[qb]/qb-spawn' },
      { label: 'qb-target', kind: 'github', repo: 'qbcore-fivem/qb-target', ref: 'main', dest: '[qb]/qb-target' },
      { label: 'qb-input', kind: 'github', repo: 'qbcore-fivem/qb-input', ref: 'main', dest: '[qb]/qb-input' },
      { label: 'qb-menu', kind: 'github', repo: 'qbcore-fivem/qb-menu', ref: 'main', dest: '[qb]/qb-menu' },
      { label: 'qb-hud', kind: 'github', repo: 'qbcore-fivem/qb-hud', ref: 'main', dest: '[qb]/qb-hud' },
      {
        label: 'qb-playermenu',
        kind: 'github',
        repo: 'qbcore-framework/qb-playermenu',
        ref: 'main',
        dest: '[qb]/qb-playermenu',
      },
      {
        label: 'qb-vehicleshop',
        kind: 'github',
        repo: 'qbcore-framework/qb-vehicleshop',
        ref: 'main',
        dest: '[qb]/qb-vehicleshop',
      },
      { label: 'qb-clothing', kind: 'github', repo: 'qbcore-framework/qb-clothing', ref: 'main', dest: '[qb]/qb-clothing' },
      {
        label: 'qb-apartments',
        kind: 'github',
        repo: 'qbcore-framework/qb-apartments',
        ref: 'main',
        dest: '[qb]/qb-apartments',
      },
      {
        label: 'qb-adminmenu',
        kind: 'github',
        repo: 'qbcore-framework/qb-adminmenu',
        ref: 'main',
        dest: '[qb]/qb-adminmenu',
      },
      { label: 'PolyZone', kind: 'github', repo: 'qbcore-framework/PolyZone', ref: 'master', dest: '[qb]/PolyZone' },
      {
        label: 'interact-sound',
        kind: 'github',
        repo: 'qbcore-framework/interact-sound',
        ref: 'master',
        dest: '[standalone]/interact-sound',
      },
      {
        label: 'progressbar',
        kind: 'github',
        repo: 'qbcore-framework/progressbar',
        ref: 'main',
        dest: '[standalone]/progressbar',
      },
    ],
  },
  esx: {
    id: 'esx',
    name: 'ESX Legacy',
    description:
      'Framework ESX Legacy 1.9+: núcleo, addons y dependencias. Base de datos legacy (ESX).',
    sql: { repo: 'esx-framework/esx-core', ref: 'main', file: '[SQL]/legacy.sql' },
    ensureOrder: ['[core]', '[esx_addons]', '[standalone]', '[voice]', '[cfx-default]'],
    tasks: [
      cfxServerDataTask('[cfx-default]'),
      ...commonTasks(),
      {
        label: 'ESX core',
        kind: 'github',
        repo: 'esx-framework/esx-core',
        ref: 'main',
        dest: '[core]',
        stripRoot: false,
      },
      { label: 'esx_addonaccount', kind: 'github', repo: 'esx-framework/esx_addonaccount', ref: 'main', dest: '[esx_addons]/esx_addonaccount' },
      { label: 'esx_addoninventory', kind: 'github', repo: 'esx-framework/esx_addoninventory', ref: 'main', dest: '[esx_addons]/esx_addoninventory' },
      { label: 'esx_datastore', kind: 'github', repo: 'esx-framework/esx_datastore', ref: 'main', dest: '[esx_addons]/esx_datastore' },
      { label: 'esx_policejob', kind: 'github', repo: 'esx-framework/esx_policejob', ref: 'main', dest: '[esx_addons]/esx_policejob' },
      { label: 'esx_ambulancejob', kind: 'github', repo: 'esx-framework/esx_ambulancejob', ref: 'main', dest: '[esx_addons]/esx_ambulancejob' },
      { label: 'esx_mechanicjob', kind: 'github', repo: 'esx-framework/esx_mechanicjob', ref: 'main', dest: '[esx_addons]/esx_mechanicjob' },
      { label: 'esx_society', kind: 'github', repo: 'esx-framework/esx_society', ref: 'main', dest: '[esx_addons]/esx_society' },
      { label: 'esx_billing', kind: 'github', repo: 'esx-framework/esx_billing', ref: 'main', dest: '[esx_addons]/esx_billing' },
      { label: 'esx_shops', kind: 'github', repo: 'esx-framework/esx_shops', ref: 'main', dest: '[esx_addons]/esx_shops' },
      { label: 'esx_vehicleshop', kind: 'github', repo: 'esx-framework/esx_vehicleshop', ref: 'main', dest: '[esx_addons]/esx_vehicleshop' },
      { label: 'esx_basicneeds', kind: 'github', repo: 'esx-framework/esx_basicneeds', ref: 'main', dest: '[esx_addons]/esx_basicneeds' },
      { label: 'esx_status', kind: 'github', repo: 'esx-framework/esx_status', ref: 'main', dest: '[esx_addons]/esx_status' },
      { label: 'esx_skin', kind: 'github', repo: 'esx-framework/esx_skin', ref: 'main', dest: '[esx_addons]/esx_skin' },
      { label: 'esx_menu_default', kind: 'github', repo: 'esx-framework/esx_menu_default', ref: 'main', dest: '[esx_addons]/esx_menu_default' },
    ],
  },
};

export function listBlueprints(): Blueprint[] {
  return [BLUEPRINTS.standalone, BLUEPRINTS.qbcore, BLUEPRINTS.esx];
}

export function blueprintFor(id: string | undefined | null): Blueprint | null {
  if (!id) return null;
  const key = id.toLowerCase() as FrameworkId;
  if (key === 'standalone' || key === 'qbcore' || key === 'esx') return BLUEPRINTS[key];
  return null;
}

function tarballUrl(repo: string, ref: string): string {
  return `https://codeload.github.com/${repo}/tar.gz/refs/heads/${ref}`;
}

function releaseUrl(repo: string, tag: string, asset: string): string {
  if (tag === 'latest') return `https://github.com/${repo}/releases/latest/download/${asset}`;
  return `https://github.com/${repo}/releases/download/${tag}/${asset}`;
}

async function fetchGithubTarball(url: string): Promise<Buffer> {
  const zlib = await import('zlib');
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`GitHub respondió ${response.status} al pedir ${url}`);
  }
  const gz = Buffer.from(await response.arrayBuffer());
  const tar = zlib.gunzipSync(gz);
  return tar;
}

export interface TarEntry {
  name: string;
  data: Buffer | null;
  mode: number;
}

export function readTar(tar: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  let pendingPath: string | null = null;

  while (offset + 512 <= tar.length) {
    const block = tar.subarray(offset, offset + 512);
    if (block.every((b) => b === 0)) break;

    const readString = (start: number, size: number) =>
      block.subarray(start, start + size).toString('utf8').replace(/\0.*$/, '').trim();

    const nameField = readString(0, 100);
    const sizeField = readString(124, 12);
    const typeflag = block[156] ? String.fromCharCode(block[156]) : '0';
    const prefix = readString(345, 155);
    const size = parseInt(sizeField || '0', 8) || 0;
    const mode = parseInt(readString(100, 8) || '644', 8) || 0o644;

    offset += 512;
    const data = size > 0 ? tar.subarray(offset, offset + size) : Buffer.alloc(0);
    offset += Math.ceil(size / 512) * 512;

    if (typeflag === 'x' || typeflag === 'g') {
      const text = data.toString('utf8');
      const pathMatch = text.match(/\d+ path=([^\n]+)/);
      if (pathMatch) pendingPath = pathMatch[1];
      continue;
    }

    if (typeflag === 'L') {
      pendingPath = data.toString('utf8').replace(/\0.*$/, '');
      continue;
    }

    if (typeflag !== '0' && typeflag !== '5' && typeflag !== '\0') continue;

    const name = pendingPath || (prefix ? `${prefix}/${nameField}` : nameField);
    pendingPath = null;

    entries.push({
      name,
      data: typeflag === '5' ? null : data,
      mode: mode & 0o7777,
    });
  }
  return entries;
}

export function writeTarEntries(tar: Buffer, root: string, subpath?: string): void {
  const entries = readTar(tar);
  if (entries.length === 0) throw new Error('El tarball llegó vacío.');

  const rootDir = entries[0].name.split('/')[0];

  let written = 0;
  for (const entry of entries) {
    let rel = entry.name.slice(rootDir.length + 1);
    if (!rel) continue;
    if (subpath) {
      if (!rel.startsWith(subpath.replace(/\/+$/, '') + '/')) continue;
      rel = rel.slice(subpath.length + 1);
    }

    const full = path.join(root, rel);
    if (!isInside(root, full)) continue;

    if (entry.data === null) {
      fs.mkdirSync(full, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, entry.data);
      try {
        fs.chmodSync(full, entry.mode & 0o777 || 0o644);
      } catch {}
    }
    written += 1;
  }

  if (written === 0) {
    throw new Error(subpath ? `El repo no traía la carpeta ${subpath}.` : 'El repo llegó vacío.');
  }
}

async function fetchWithRetry(url: string, tries = 3): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status} en ${url}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < tries) await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export interface InstallBlueprintResult {
  ok: boolean;
  message: string;
  installed: string[];
}

export async function installBlueprint(
  blueprint: Blueprint,
  targetDir: string,
  onProgress: (progress: ProvisionProgress) => void
): Promise<InstallBlueprintResult> {
  const resourcesDir = path.join(targetDir, 'resources');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vxcore-bp-'));
  const installed: string[] = [];

  try {
    const total = blueprint.tasks.length;
    let done = 0;

    for (const task of blueprint.tasks) {
      done += 1;
      const base = Math.round(((done - 1) / total) * 100);
      onProgress({ step: `Descargando ${task.label}…`, percent: base });

      const destDir = path.join(resourcesDir, ...task.dest.split('/'));
      if (fs.existsSync(destDir) && fs.readdirSync(destDir).length > 0) {
        installed.push(task.dest);
        continue;
      }

      try {
        if (task.kind === 'github') {
          const tar = await fetchGithubTarball(tarballUrl(task.repo!, task.ref || 'main'));
          writeTarEntries(tar, destDir, task.subpath);
        } else if (task.kind === 'release') {
          const url = releaseUrl(task.repo!, task.ref || 'latest', task.asset!);
          const response = await fetchWithRetry(url);
          const zipPath = path.join(tmpDir, `${task.label.replace(/[^\w-]/g, '_')}.zip`);
          fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
          fs.mkdirSync(destDir, { recursive: true });
          await extractZipSkippingRoot(zipPath, destDir, task.stripRoot ?? false);
        } else if (task.kind === 'zip') {
          const response = await fetchWithRetry(task.url!);
          const zipPath = path.join(tmpDir, 'download.zip');
          fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
          fs.mkdirSync(destDir, { recursive: true });
          await extractZipSkippingRoot(zipPath, destDir, task.stripRoot ?? false);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          message: `Fallo descargando ${task.label}: ${message}. Revisa tu conexión y vuelve a intentarlo; lo ya descargado se conserva.`,
          installed,
        };
      }

      installed.push(task.dest);
      onProgress({ step: `${task.label} listo`, percent: Math.round((done / total) * 100) });
    }

    return { ok: true, message: 'Recursos del framework instalados.', installed };
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }, () => {});
  }
}

export async function fetchBlueprintSql(
  blueprint: Blueprint
): Promise<{ ok: boolean; file?: string; message?: string }> {
  if (!blueprint.sql) return { ok: true };
  try {
    const tar = await fetchGithubTarball(tarballUrl(blueprint.sql.repo, blueprint.sql.ref));
    const entries = readTar(tar);
    const wanted = blueprint.sql.file.replace(/^\.\//, '');
    const entry = entries.find((e) => e.data && e.name.endsWith(wanted)) ||
      entries.find((e) => e.data && e.name.toLowerCase().endsWith(path.basename(wanted).toLowerCase()));
    if (!entry?.data) {
      return { ok: false, message: `El repo de ${blueprint.name} no trae ${wanted}.` };
    }
    const file = path.join(os.tmpdir(), `vxcore-sql-${Date.now()}.sql`);
    fs.writeFileSync(file, entry.data);
    return { ok: true, file };
  } catch (error) {
    return {
      ok: false,
      message: `No se pudo descargar el SQL de ${blueprint.name}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

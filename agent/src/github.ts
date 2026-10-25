import fs from 'fs';
import path from 'path';
import { tr, trMsg } from './idioma';

const CONFIG_FILE = path.resolve(process.cwd(), 'github-config.json');

export interface GithubConfig {
  token: string;
  repo: string;
  branch: string;
}

export interface GithubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface PublicGithubConfig {
  repo: string;
  branch: string;
  hasToken: boolean;
  tokenMasked: string;
}

export function loadGithubConfig(): GithubConfig | null {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (parsed && typeof parsed.token === 'string' && typeof parsed.repo === 'string') {
        return {
          token: parsed.token,
          repo: parsed.repo,
          branch: parsed.branch || 'main',
        };
      }
    }
  } catch (err) {
    console.error('[GitHub] No se pudo leer github-config.json:', err);
  }
  return null;
}

function saveGithubConfig(config: GithubConfig): void {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function toPublic(config: GithubConfig | null): PublicGithubConfig {
  if (!config) {
    return { repo: '', branch: 'main', hasToken: false, tokenMasked: '' };
  }
  const masked =
    config.token.length > 8
      ? `${config.token.slice(0, 4)}…${config.token.slice(-4)}`
      : '••••';
  return { repo: config.repo, branch: config.branch, hasToken: true, tokenMasked: masked };
}

async function gh(config: GithubConfig, pathname: string, init?: RequestInit): Promise<Response> {
  const url = `https://api.github.com${pathname}`;
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'VXCore',
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });
}

export async function saveConfig(
  input: { token?: string; repo?: string; branch?: string },
  current: GithubConfig | null
): Promise<{ success: boolean; config: PublicGithubConfig; error?: string }> {
  const merged: GithubConfig = {
    token: input.token?.trim() || current?.token || '',
    repo: input.repo?.trim() || current?.repo || '',
    branch: input.branch?.trim() || current?.branch || 'main',
  };

  if (!merged.token) {
    return { success: false, error: tr('Necesitas un token de GitHub (pat con scope repo).'), config: toPublic(merged) };
  }
  if (!merged.repo || !merged.repo.includes('/')) {
    return { success: false, error: tr('El repositorio debe tener la forma owner/repo.'), config: toPublic(merged) };
  }

  try {
    const res = await gh(merged, `/repos/${merged.repo}`);
    if (res.status === 401 || res.status === 403) {
      return { success: false, error: tr('El token no es válido o no tiene acceso al repo.'), config: toPublic(merged) };
    }
    if (res.status === 404) {
      return { success: false, error: tr('No existe el repo "{repo}" o el token no lo ve.', { repo: merged.repo }), config: toPublic(merged) };
    }
    if (!res.ok) {
      return { success: false, error: tr('GitHub respondió {status}.', { status: res.status }), config: toPublic(merged) };
    }
  } catch {
    return { success: false, error: tr('No se pudo contactar con la API de GitHub.'), config: toPublic(merged) };
  }

  saveGithubConfig(merged);
  return { success: true, config: toPublic(merged) };
}

async function githubError(res: Response, config: GithubConfig, accion: string): Promise<string> {
  const detail = (await res.json().catch(() => ({}))) as { message?: string };
  const message = String(detail.message || '');

  if (res.status === 403 && /not accessible by personal access token/i.test(message)) {
    return (
      tr('A tu token de GitHub le falta el permiso "Contents" (lectura). En GitHub: Settings → Developer settings → Personal access tokens → tu token → Repository permissions, y pon "Contents" en Read-only para el repositorio {repo}.', { repo: config.repo })
    );
  }
  if (res.status === 401) {
    return tr('Tu token de GitHub no vale o ha caducado. Vuelve a conectarlo con uno nuevo.');
  }
  if (res.status === 403) {
    return /rate limit/i.test(message)
      ? tr('Se ha agotado el límite de peticiones de la API de GitHub. Prueba de nuevo en unos minutos.')
      : tr('GitHub denegó el acceso al {accion}{valor}', { accion, valor: message ? `: ${message}` : '.' });
  }
  if (res.status === 404) {
    return tr('No existe el repositorio "{repo}" en la rama "{branch}", o tu token no lo ve.', { repo: config.repo, branch: config.branch });
  }
  return tr('GitHub respondió {status} al {accion}{valor}', { status: res.status, accion, valor: message ? `: ${message}` : '.' });
}

export async function fetchCommits(config: GithubConfig, count = 50): Promise<{ success: boolean; commits?: GithubCommit[]; error?: string }> {
  try {
    const res = await gh(config, `/repos/${config.repo}/commits?sha=${encodeURIComponent(config.branch)}&per_page=${count}`);
    if (!res.ok) {
      return { success: false, error: await githubError(res, config, tr('listar los commits')) };
    }
    const data = (await res.json()) as Array<{
      sha?: string;
      html_url?: string;
      author?: { login?: string } | null;
      commit?: {
        message?: string;
        author?: { name?: string; date?: string } | null;
        committer?: { date?: string } | null;
      };
    }>;
    const commits: GithubCommit[] = data.map((c) => ({
      sha: String(c.sha || '').slice(0, 7),
      message: String((c.commit?.message as string) || '').split('\n')[0],
      author: String(c.commit?.author?.name || c.author?.login || tr('Desconocido')),
      date: String(c.commit?.author?.date || c.commit?.committer?.date || new Date().toISOString()),
      url: String(c.html_url || ''),
    }));
    return { success: true, commits };
  } catch {
    return { success: false, error: tr('No se pudo contactar con la API de GitHub.') };
  }
}

export async function fetchChangelog(config: GithubConfig): Promise<{ success: boolean; content?: string; sha?: string; error?: string }> {
  try {
    const res = await gh(config, `/repos/${config.repo}/contents/CHANGELOG.md?ref=${encodeURIComponent(config.branch)}`);
    if (res.status === 404) {
      return { success: true, content: null as unknown as string, sha: undefined };
    }
    if (!res.ok) {
      return { success: false, error: await githubError(res, config, tr('leer el CHANGELOG.md')) };
    }
    const data = (await res.json()) as { content?: string; sha?: string; encoding?: string };
    const content = data.encoding === 'base64' && data.content ? Buffer.from(data.content, 'base64').toString('utf-8') : '';
    return { success: true, content, sha: data.sha };
  } catch {
    return { success: false, error: tr('No se pudo contactar con la API de GitHub.') };
  }
}

const TYPE_LABELS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /^feat(\(|:|\s)/i, label: trMsg('🚀 Nuevas funcionalidades') },
  { pattern: /^fix(\(|:|\s)/i, label: trMsg('🐛 Correcciones') },
  { pattern: /^perf(\(|:|\s)/i, label: trMsg('⚡ Rendimiento') },
  { pattern: /^refactor(\(|:|\s)/i, label: trMsg('🔧 Refactorización') },
  { pattern: /^docs?(\(|:|\s)/i, label: trMsg('📚 Documentación') },
  { pattern: /^chore(\(|:|\s)/i, label: trMsg('🧹 Mantenimiento') },
  { pattern: /^ci(\(|:|\s)/i, label: trMsg('🔁 Integración continua') },
  { pattern: /^style(\(|:|\s)/i, label: trMsg('💄 Estilo') },
  { pattern: /^test(\(|:|\s)/i, label: trMsg('✅ Tests') },
];

export function buildChangelog(commits: GithubCommit[], version: string): string {
  const groups = new Map<string, GithubCommit[]>();
  const other: GithubCommit[] = [];

  for (const commit of commits) {
    const match = TYPE_LABELS.find((t) => t.pattern.test(commit.message));
    if (match) {
      const list = groups.get(match.label) || [];
      list.push(commit);
      groups.set(match.label, list);
    } else {
      other.push(commit);
    }
  }

  const lines: string[] = [];
  lines.push(`# Changelog`);
  lines.push('');
  lines.push(`## [${version}] - ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');

  const order = TYPE_LABELS.map((t) => t.label);
  let wrote = false;
  for (const label of order) {
    const list = groups.get(label);
    if (!list || list.length === 0) continue;
    wrote = true;
    lines.push(`### ${tr(label)}`);
    for (const c of list) {
      lines.push(`- ${c.message} ([${c.sha}](${c.url}))`);
    }
    lines.push('');
  }

  if (other.length > 0) {
    wrote = true;
    lines.push(`### 📌 ${tr('Otros')}`);
    for (const c of other) {
      lines.push(`- ${c.message} ([${c.sha}](${c.url}))`);
    }
    lines.push('');
  }

  if (!wrote) {
    lines.push('_Sin cambios en este rango._');
    lines.push('');
  }

  return lines.join('\n');
}

export async function pushChangelog(
  config: GithubConfig,
  content: string,
  existingSha: string | undefined
): Promise<{ success: boolean; commitUrl?: string; newSha?: string; error?: string }> {
  try {
    const body: Record<string, unknown> = {
      message: tr('docs: actualizar CHANGELOG.md'),
      content: Buffer.from(content, 'utf-8').toString('base64'),
      branch: config.branch,
    };
    if (existingSha) body.sha = existingSha;

    const res = await gh(config, `/repos/${config.repo}/contents/CHANGELOG.md`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))) as { message?: string };
      return { success: false, error: tr('GitHub respondió {status}: {valor}', { status: res.status, valor: detail.message || 'error al subir el changelog.' }) };
    }
    const data = (await res.json()) as { commit?: { html_url?: string }; content?: { sha?: string } };
    return { success: true, commitUrl: data.commit?.html_url, newSha: data.content?.sha };
  } catch {
    return { success: false, error: tr('No se pudo contactar con la API de GitHub.') };
  }
}

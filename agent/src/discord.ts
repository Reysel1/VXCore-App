import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { getTunnelHostname, isLoopbackHostname } from './exposure';
import { INVITE_SECTIONS, type InviteSection } from './invites';
import { tr, trMsg } from './idioma';

const API = 'https://discord.com/api/v10';

export type AccessLevel = 'owner' | 'admin' | 'moderator' | 'none';

const LEVEL_ORDER: Exclude<AccessLevel, 'none'>[] = ['owner', 'admin', 'moderator'];

export interface DiscordConfig {
  clientId: string;
  clientSecret: string;
  botToken: string;
  guildId: string;
  roles: Record<Exclude<AccessLevel, 'none' | 'owner'>, string[]> & { owner: string[] };
  roleSections: Record<string, InviteSection[]>;
  owner: LinkedAccount | null;
  requireLogin: boolean;
  publicUrl: string;
  downloadUrl: string;
  statusChannelId: string;
  statusMessageId: string;
  presenceEnabled: boolean;

  whitelistEnabled: boolean;
  whitelistRoles: string[];
  whitelistMessage: string;
  whitelistGuildId: string;
  whitelistStrict: boolean;

  sessionSecret: string;
}

export interface LinkedAccount {
  id: string;
  username: string;
  globalName?: string;
  avatar?: string;
}

export interface GuildRole {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
}

interface DiscordTokenResponse {
  access_token: string;
}

interface DiscordUserPayload {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

interface DiscordGuildPayload {
  id: string;
  name: string;
  icon?: string | null;
}

interface DiscordRolePayload {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
}

interface DiscordMemberPayload {
  roles?: string[];
}

export interface PublicDiscordConfig {
  configured: boolean;
  clientId: string;
  guildId: string;
  roles: DiscordConfig['roles'];
  roleSections: DiscordConfig['roleSections'];
  owner: LinkedAccount | null;
  requireLogin: boolean;
  publicUrl: string;
  downloadUrl: string;
  statusChannelId: string;
  presenceEnabled: boolean;
  whitelistEnabled: boolean;
  whitelistRoles: string[];
  whitelistMessage: string;
  whitelistGuildId: string;
  whitelistStrict: boolean;
  whitelistReady: boolean;
  hasStatusMessage: boolean;
  hasClientSecret: boolean;
  hasBotToken: boolean;
  redirectUri: string;
  remoteRedirectUri: string | null;
  publicBaseUrl: string;
  lockedFields: string[];
  botInviteUrl: string | null;
}

const CONFIG_FILE = path.resolve(process.cwd(), 'discord-config.json');

const EMPTY: DiscordConfig = {
  clientId: '',
  clientSecret: '',
  botToken: '',
  guildId: '',
  roles: { owner: [], admin: [], moderator: [] },
  roleSections: {},
  owner: null,
  requireLogin: false,
  publicUrl: '',
  downloadUrl: '',
  statusChannelId: '',
  statusMessageId: '',
  presenceEnabled: false,
  whitelistEnabled: false,
  whitelistRoles: [],
  whitelistMessage: trMsg('No tienes acceso a este servidor. Pide la whitelist en nuestro Discord.'),
  whitelistGuildId: '',
  whitelistStrict: false,
  sessionSecret: '',
};

const ENV_FIELDS = {
  clientId: 'DISCORD_CLIENT_ID',
  clientSecret: 'DISCORD_CLIENT_SECRET',
  botToken: 'DISCORD_BOT_TOKEN',
  guildId: 'DISCORD_GUILD_ID',
  publicUrl: 'FIVEOS_PUBLIC_URL',
  downloadUrl: 'FIVEOS_DOWNLOAD_URL',
} as const;

type EnvField = keyof typeof ENV_FIELDS;

function envOverrides(): Partial<Record<EnvField, string>> {
  const found: Partial<Record<EnvField, string>> = {};
  for (const [field, variable] of Object.entries(ENV_FIELDS) as [EnvField, string][]) {
    const value = process.env[variable]?.trim();
    if (value) found[field] = value;
  }
  return found;
}

function lockedByEnv(): EnvField[] {
  return Object.keys(envOverrides()) as EnvField[];
}

function loadStoredConfig(): DiscordConfig {
  let stored: Partial<DiscordConfig> = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      stored = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('[Discord] No se pudo leer discord-config.json:', err);
  }

  return {
    ...EMPTY,
    ...stored,
    roles: { ...EMPTY.roles, ...(stored?.roles || {}) },
  };
}

export function loadDiscordConfig(): DiscordConfig {
  return { ...loadStoredConfig(), ...envOverrides() };
}

function writeConfig(config: DiscordConfig): void {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

const CREDENCIALES_A_RECORTAR = [
  'clientId',
  'clientSecret',
  'botToken',
  'guildId',
  'whitelistGuildId',
  'statusChannelId',
] as const;

export function saveDiscordConfig(input: Partial<DiscordConfig>): PublicDiscordConfig {
  const current = loadStoredConfig();

  const patch = { ...input };
  for (const field of lockedByEnv()) delete patch[field];

  for (const field of CREDENCIALES_A_RECORTAR) {
    if (typeof patch[field] === 'string') patch[field] = patch[field].trim();
  }

  if (patch.publicUrl !== undefined) patch.publicUrl = normalizePublicUrl(patch.publicUrl);

  const config: DiscordConfig = {
    ...current,
    ...patch,
    clientSecret: patch.clientSecret || current.clientSecret,
    botToken: patch.botToken || current.botToken,
    roles: { ...current.roles, ...(input.roles || {}) },
    roleSections:
      input.roleSections !== undefined
        ? sanitizeRoleSections(input.roleSections)
        : current.roleSections,
    sessionSecret: current.sessionSecret || crypto.randomBytes(32).toString('hex'),
  };

  if (patch.statusChannelId !== undefined && patch.statusChannelId !== current.statusChannelId) {
    config.statusMessageId = '';
  }

  writeConfig(config);
  return toPublicDiscord(loadDiscordConfig());
}

export function unlinkDiscord(): PublicDiscordConfig {
  const fresh: DiscordConfig = {
    ...EMPTY,
    roles: { owner: [], admin: [], moderator: [] },
    sessionSecret: crypto.randomBytes(32).toString('hex'),
  };
  writeConfig(fresh);
  return toPublicDiscord(loadDiscordConfig());
}

export function toPublicDiscord(config: DiscordConfig): PublicDiscordConfig {
  return {
    lockedFields: lockedByEnv(),
    configured: Boolean(config.clientId && config.clientSecret && config.guildId),
    clientId: config.clientId,
    guildId: config.guildId,
    roles: config.roles,
    roleSections: config.roleSections || {},
    owner: config.owner,
    requireLogin: config.requireLogin,
    publicUrl: config.publicUrl,
    downloadUrl: config.downloadUrl,
    statusChannelId: config.statusChannelId,
    presenceEnabled: config.presenceEnabled,
    whitelistEnabled: config.whitelistEnabled,
    whitelistRoles: config.whitelistRoles || [],
    whitelistMessage: tr(config.whitelistMessage),
    whitelistGuildId: config.whitelistGuildId || '',
    whitelistStrict: Boolean(config.whitelistStrict),
    whitelistReady: Boolean(
      config.botToken &&
        (config.whitelistGuildId || config.guildId) &&
        (config.whitelistRoles?.length ?? 0) > 0
    ),
    hasStatusMessage: Boolean(config.statusMessageId),
    hasClientSecret: Boolean(config.clientSecret),
    hasBotToken: Boolean(config.botToken),
    redirectUri: redirectUriFor(config),
    remoteRedirectUri: (() => {
      const tunnel = getTunnelHostname();
      return tunnel ? `https://${tunnel}/api/discord/callback` : null;
    })(),
    publicBaseUrl: publicBaseUrl(config),
    botInviteUrl: config.clientId ? buildBotInviteUrl(config.clientId) : null,
  };
}

function buildBotInviteUrl(clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'bot',
    permissions: '0',
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export function normalizePublicUrl(raw: string): string {
  const value = String(raw || '').trim().replace(/\/+$/, '');
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;

  const host = value.split('/')[0].split(':')[0].toLowerCase();
  return `${isLoopbackHostname(host) ? 'http' : 'https'}://${value}`;
}

export function redirectUriFor(config: DiscordConfig, requestHost?: string): string {
  const tunnel = getTunnelHostname();
  if (tunnel && requestHost && requestHost.toLowerCase().split(':')[0] === tunnel) {
    return `https://${tunnel}/api/discord/callback`;
  }

  const base = normalizePublicUrl(config.publicUrl) || `http://localhost:${process.env.PORT || 4000}`;
  return `${base}/api/discord/callback`;
}

export function publicBaseUrl(config: DiscordConfig): string {
  const tunnel = getTunnelHostname();
  if (tunnel) return `https://${tunnel}`;
  return normalizePublicUrl(config.publicUrl) || `http://localhost:${process.env.PORT || 4000}`;
}

export function buildAuthorizeUrl(config: DiscordConfig, state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify guilds.members.read',
    state,
    prompt: 'consent',
  });
  return `${API}/oauth2/authorize?${params.toString()}`;
}

export async function verificarCredenciales(
  clientId: string,
  clientSecret: string
): Promise<{ ok: boolean; rechazada: boolean; detalle: string }> {
  try {
    const res = await fetch(`${API}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'identify' }),
    });

    if (res.ok) return { ok: true, rechazada: false, detalle: '' };

    const detalle = await res.text().catch(() => '');
    return { ok: false, rechazada: res.status === 401 || res.status === 400, detalle };
  } catch (err) {
    return { ok: false, rechazada: false, detalle: err instanceof Error ? err.message : String(err) };
  }
}

function motivoDelCanje(status: number, cuerpo: string): string {
  const codigo = (() => {
    try {
      return String(JSON.parse(cuerpo)?.error || '');
    } catch {
      return '';
    }
  })();

  if (codigo === 'invalid_client') {
    return tr(
      'Discord no reconoce esta aplicación: el Client ID o el Client Secret que hay guardados no son correctos. El dueño puede volver a copiarlos en Ajustes › Discord (si el secreto no aparece en el portal, hay que generar uno nuevo con «Reset Secret»).'
    );
  }

  if (codigo === 'invalid_grant') {
    return tr(
      'Discord ha rechazado este intento de entrada. Suele ser que el enlace ya se usó o que ha caducado: vuelve a iniciar sesión desde el panel.'
    );
  }

  return tr('Discord rechazó el código de autorización ({status}). {detail}', {
    status,
    detail: cuerpo,
  });
}

export async function exchangeCode(
  config: DiscordConfig,
  code: string,
  redirectUri: string
): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(motivoDelCanje(res.status, detail));
  }

  const data: DiscordTokenResponse = await res.json();
  return data.access_token;
}

export async function fetchSelf(accessToken: string): Promise<LinkedAccount> {
  const res = await fetch(`${API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(tr('No se pudo leer el perfil de Discord ({status}).', { status: res.status }));

  const user: DiscordUserPayload = await res.json();
  return {
    id: user.id,
    username: user.username,
    globalName: user.global_name ?? undefined,
    avatar: user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
      : undefined,
  };
}

export async function fetchGuild(
  config: DiscordConfig,
  guildId?: string
): Promise<{ id: string; name: string; icon?: string; roles: GuildRole[] }> {
  if (!config.botToken) throw new Error(tr('Falta el token del bot: sin él no se pueden leer los roles del gremio.'));
  const target = guildId || config.guildId;
  if (!target) throw new Error(tr('Falta el ID del gremio de Discord.'));

  const headers = { Authorization: `Bot ${config.botToken}` };

  const guildRes = await fetch(`${API}/guilds/${target}`, { headers });
  if (guildRes.status === 401) throw new Error(tr('El token del bot no es válido.'));
  if (guildRes.status === 403 || guildRes.status === 404) {
    throw new Error(tr('El bot no está en ese gremio, o el ID del gremio no es correcto.'));
  }
  if (!guildRes.ok) throw new Error(tr('Discord devolvió {status} al leer el gremio.', { status: guildRes.status }));

  const guild: DiscordGuildPayload = await guildRes.json();

  const rolesRes = await fetch(`${API}/guilds/${target}/roles`, { headers });
  if (!rolesRes.ok) throw new Error(tr('Discord devolvió {status} al leer los roles.', { status: rolesRes.status }));
  const roles: DiscordRolePayload[] = await rolesRes.json();

  return {
    id: guild.id,
    name: guild.name,
    icon: guild.icon
      ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`
      : undefined,
    roles: roles
      .filter((r) => r.id !== target)
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        position: r.position,
        managed: Boolean(r.managed),
      }))
      .sort((a, b) => b.position - a.position),
  };
}

export interface DiscordProfile {
  id: string;
  username: string;
  globalName?: string;
  avatarUrl: string | null;
}

interface DiscordProfilePayload {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

const profileCache = new Map<string, { profile: DiscordProfile | null; at: number }>();
const PROFILE_TTL_MS = 6 * 60 * 60 * 1000;

const SNOWFLAKE_RE = /^\d{5,25}$/;

function avatarUrlFor(payload: DiscordProfilePayload): string | null {
  if (!payload.avatar) return null;
  const extension = payload.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${payload.id}/${payload.avatar}.${extension}?size=128`;
}

async function fetchOneProfile(
  config: DiscordConfig,
  userId: string
): Promise<DiscordProfile | null> {
  const res = await fetch(`${API}/users/${userId}`, {
    headers: { Authorization: `Bot ${config.botToken}` },
  });

  if (!res.ok) {
    if (res.status !== 404) {
      console.warn(`[Discord] No se pudo leer la cuenta ${userId} (${res.status}).`);
    }
    return null;
  }

  const payload: DiscordProfilePayload = await res.json();
  return {
    id: payload.id,
    username: payload.username,
    globalName: payload.global_name || undefined,
    avatarUrl: avatarUrlFor(payload),
  };
}

export async function fetchUserProfiles(
  config: DiscordConfig,
  userIds: string[]
): Promise<Record<string, DiscordProfile>> {
  const result: Record<string, DiscordProfile> = {};
  if (!config.botToken) return result;

  const now = Date.now();
  const pending: string[] = [];

  for (const raw of userIds) {
    const id = String(raw || '').trim();
    if (!SNOWFLAKE_RE.test(id) || result[id]) continue;

    const cached = profileCache.get(id);
    if (cached && now - cached.at < PROFILE_TTL_MS) {
      if (cached.profile) result[id] = cached.profile;
      continue;
    }
    if (!pending.includes(id)) pending.push(id);
  }

  for (const id of pending) {
    let profile: DiscordProfile | null = null;
    try {
      profile = await fetchOneProfile(config, id);
    } catch (err) {
      console.warn(`[Discord] Fallo leyendo la cuenta ${id}:`, err);
      continue;
    }
    profileCache.set(id, { profile, at: Date.now() });
    if (profile) result[id] = profile;
  }

  return result;
}

export function whitelistGuildId(config: DiscordConfig): string {
  return config.whitelistGuildId || config.guildId;
}

export async function fetchBotGuildIds(config: DiscordConfig): Promise<string[]> {
  if (!config.botToken) throw new Error(tr('Falta el token del bot.'));

  const res = await fetch(`${API}/users/@me/guilds`, {
    headers: { Authorization: `Bot ${config.botToken}` },
  });
  if (res.status === 401) throw new Error(tr('El token del bot no es válido.'));
  if (!res.ok) throw new Error(tr('Discord devolvió {status} al leer los gremios del bot.', { status: res.status }));

  const guilds: { id: string }[] = await res.json();
  return guilds.map((g) => g.id);
}

export type MembershipState = 'member' | 'not_member' | 'no_access';

export interface MembershipResult {
  state: MembershipState;
  roles: string[];
}

export async function fetchWhitelistMembership(
  config: DiscordConfig,
  userId: string,
  guildId: string
): Promise<MembershipResult> {
  if (!config.botToken) throw new Error(tr('Falta el token del bot.'));

  const res = await fetch(`${API}/guilds/${guildId}/members/${userId}`, {
    headers: { Authorization: `Bot ${config.botToken}` },
  });

  if (res.status === 404) return { state: 'not_member', roles: [] };
  if (res.status === 403) return { state: 'no_access', roles: [] };
  if (!res.ok) throw new Error(tr('Discord devolvió {status} al comprobar el miembro.', { status: res.status }));

  const member: DiscordMemberPayload = await res.json();
  return { state: 'member', roles: Array.isArray(member.roles) ? member.roles : [] };
}

export async function memberRolesByBot(config: DiscordConfig, userId: string): Promise<string[] | null | undefined> {
  if (!config.botToken || !config.guildId) return undefined;
  try {
    const res = await fetch(`${API}/guilds/${config.guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${config.botToken}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.warn(`[Discord] El bot no pudo leer al miembro ${userId} (${res.status}).`);
      return undefined;
    }
    const member: DiscordMemberPayload = await res.json();
    return Array.isArray(member.roles) ? member.roles : [];
  } catch {
    return undefined;
  }
}

export async function fetchMemberRoles(
  config: DiscordConfig,
  userId: string,
  accessToken?: string
): Promise<string[] | null> {
  const byBot = await memberRolesByBot(config, userId);
  if (byBot !== undefined) return byBot;

  if (accessToken) {
    const res = await fetch(`${API}/users/@me/guilds/${config.guildId}/member`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 404) return null;
    if (res.ok) {
      const member: DiscordMemberPayload = await res.json();
      return Array.isArray(member.roles) ? member.roles : [];
    }
  }

  return null;
}

function sanitizeRoleSections(input: unknown): Record<string, InviteSection[]> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const allowed = new Set<string>(INVITE_SECTIONS);
  const out: Record<string, InviteSection[]> = {};

  for (const [roleId, value] of Object.entries(input as Record<string, unknown>)) {
    if (!roleId || !Array.isArray(value)) continue;
    const sections = [
      ...new Set(value.filter((s): s is InviteSection => typeof s === 'string' && allowed.has(s))),
    ];
    if (sections.length > 0) out[roleId] = sections;
  }
  return out;
}

export function sectionsForRoles(
  config: DiscordConfig,
  roleIds: string[] | null
): InviteSection[] | null {
  if (!roleIds || roleIds.length === 0) return null;

  const staffRoles = staffRoleIds(config).filter((id) => roleIds.includes(id));
  if (staffRoles.length === 0) return null;

  const union = new Set<InviteSection>();
  for (const roleId of staffRoles) {
    const sections = config.roleSections?.[roleId];
    if (!sections || sections.length === 0) return null;
    for (const section of sections) union.add(section);
  }
  return [...union];
}

function staffRoleIds(config: DiscordConfig): string[] {
  return [...new Set(LEVEL_ORDER.flatMap((level) => config.roles[level] || []))];
}

export function resolveAccessLevel(
  config: DiscordConfig,
  userId: string,
  roleIds: string[] | null
): AccessLevel {
  if (config.owner?.id === userId) return 'owner';
  if (!roleIds) return 'none';

  for (const level of LEVEL_ORDER) {
    const mapped = config.roles[level] || [];
    if (mapped.some((roleId) => roleIds.includes(roleId))) return level;
  }
  return 'none';
}

export interface Session {
  user: LinkedAccount;
  level: AccessLevel;
  exp: number;
  via?: 'discord' | 'invite';
  roleIds?: string[];
}

const SESSION_DAYS = 14;

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSession(
  config: DiscordConfig,
  user: LinkedAccount,
  level: AccessLevel,
  via: 'discord' | 'invite' = 'discord',
  roleIds?: string[] | null
): string {
  const session: Session = {
    user,
    level,
    exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 3600,
    via,
    ...(roleIds ? { roleIds: staffRoleIds(config).filter((id) => roleIds.includes(id)) } : {}),
  };
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${payload}.${sign(payload, config.sessionSecret)}`;
}

export function verifySession(config: DiscordConfig, token?: string): Session | null {
  if (!token || !config.sessionSecret) return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = sign(payload, config.sessionSecret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const session: Session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (session.exp * 1000 < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function encodeState(config: DiscordConfig, origin: string, invite?: string): string {
  const payload = Buffer.from(
    JSON.stringify({ origin, invite: invite || undefined, nonce: crypto.randomBytes(8).toString('hex') })
  ).toString('base64url');
  return `${payload}.${sign(payload, config.sessionSecret)}`;
}

export function decodeState(
  config: DiscordConfig,
  state?: string
): { origin: string; invite?: string } | null {
  if (!state) return null;
  const [payload, signature] = state.split('.');
  if (!payload || !signature) return null;

  const a = Buffer.from(signature);
  const b = Buffer.from(sign(payload, config.sessionSecret));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
  } catch {
    return null;
  }
}

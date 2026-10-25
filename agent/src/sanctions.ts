import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { tr } from './idioma';

const FILE = path.resolve(process.cwd(), 'sanctions.json');

export type SanctionType = 'ban' | 'warn' | 'kick';

export interface PlayerIdentity {
  license?: string;
  license2?: string;
  steam?: string;
  discord?: string;
  xbl?: string;
  live?: string;
  fivem?: string;
  ip?: string;
  tokens?: string[];
}

export function identityFromFields(raw: Record<string, unknown>, tokens: unknown): PlayerIdentity {
  const text = (key: string): string | undefined => {
    const value = raw[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };
  return {
    license: text('license'),
    license2: text('license2'),
    steam: text('steam'),
    discord: text('discord'),
    xbl: text('xbl'),
    live: text('live'),
    fivem: text('fivem'),
    ip: text('ip'),
    tokens: Array.isArray(tokens)
      ? (tokens as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 20)
      : [],
  };
}

export function hasAnyIdentifier(identity: PlayerIdentity): boolean {
  return Boolean(
    identity.license || identity.license2 || identity.steam || identity.discord ||
    identity.xbl || identity.live || identity.fivem || (identity.tokens && identity.tokens.length)
  );
}

export interface Sanction {
  id: string;
  type: SanctionType;
  playerName: string;
  identity: PlayerIdentity;
  reason: string;
  byName: string;
  byUserId: string | null;
  createdAt: string;
  expiresAt: string | null;
  revoked: boolean;
  revokedBy: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
}

interface Store {
  sanctions: Sanction[];
}

function load(): Store {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    return { sanctions: Array.isArray(parsed?.sanctions) ? parsed.sanctions : [] };
  } catch {
    return { sanctions: [] };
  }
}

function persist(store: Store): void {
  try {
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2), { encoding: 'utf-8', mode: 0o600 });
  } catch (err) {
    console.error('[Sanctions] No se pudo guardar sanctions.json:', err);
  }
}

function isActive(sanction: Sanction): boolean {
  if (sanction.revoked) return false;
  if (sanction.expiresAt && new Date(sanction.expiresAt).getTime() <= Date.now()) return false;
  return true;
}

function matchableKeys(identity: PlayerIdentity): string[] {
  const keys: string[] = [];
  for (const field of ['license', 'license2', 'steam', 'discord', 'xbl', 'live', 'fivem'] as const) {
    const value = identity[field];
    if (typeof value === 'string' && value.trim()) keys.push(`${field}:${value.trim().toLowerCase()}`);
  }
  for (const token of identity.tokens || []) {
    if (typeof token === 'string' && token.trim()) keys.push(`token:${token.trim().toLowerCase()}`);
  }
  return keys;
}

function sameSubject(a: PlayerIdentity, b: PlayerIdentity): boolean {
  const left = new Set(matchableKeys(a));
  if (left.size === 0) return false;
  return matchableKeys(b).some((key) => left.has(key));
}

export function listSanctions(filter?: { type?: SanctionType; activeOnly?: boolean }): Sanction[] {
  let list = load().sanctions;
  if (filter?.type) list = list.filter((s) => s.type === filter.type);
  if (filter?.activeOnly) list = list.filter(isActive);
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function historyFor(identity: PlayerIdentity): Sanction[] {
  return load()
    .sanctions.filter((s) => sameSubject(identity, s.identity))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function activeBanFor(identity: PlayerIdentity): Sanction | null {
  const found = load().sanctions.find(
    (s) => s.type === 'ban' && isActive(s) && sameSubject(identity, s.identity)
  );
  return found ?? null;
}

export function addSanction(input: {
  type: SanctionType;
  playerName: string;
  identity: PlayerIdentity;
  reason: string;
  byName: string;
  byUserId?: string | null;
  durationMinutes?: number;
}): Sanction {
  const store = load();
  const minutes = Math.max(0, Math.floor(Number(input.durationMinutes) || 0));

  const sanction: Sanction = {
    id: `snc-${crypto.randomBytes(6).toString('hex')}`,
    type: input.type,
    playerName: String(input.playerName || tr('Desconocido')).slice(0, 80),
    identity: {
      license: input.identity.license,
      license2: input.identity.license2,
      steam: input.identity.steam,
      discord: input.identity.discord,
      xbl: input.identity.xbl,
      live: input.identity.live,
      fivem: input.identity.fivem,
      ip: input.identity.ip,
      tokens: Array.isArray(input.identity.tokens) ? input.identity.tokens.slice(0, 20) : [],
    },
    reason: String(input.reason || '').trim().slice(0, 500) || tr('Sin motivo indicado'),
    byName: String(input.byName || tr('Desconocido')).slice(0, 80),
    byUserId: input.byUserId ?? null,
    createdAt: new Date().toISOString(),
    expiresAt: minutes > 0 ? new Date(Date.now() + minutes * 60000).toISOString() : null,
    revoked: false,
    revokedBy: null,
    revokedAt: null,
    revokeReason: null,
  };

  store.sanctions.push(sanction);
  persist(store);
  return sanction;
}

export function revokeSanction(id: string, by: string, reason?: string): Sanction | null {
  const store = load();
  const sanction = store.sanctions.find((s) => s.id === id);
  if (!sanction) return null;
  if (sanction.revoked) return sanction;

  sanction.revoked = true;
  sanction.revokedBy = String(by || tr('Desconocido')).slice(0, 80);
  sanction.revokedAt = new Date().toISOString();
  sanction.revokeReason = String(reason || '').trim().slice(0, 300) || null;
  persist(store);
  return sanction;
}

export function deleteSanction(id: string): boolean {
  const store = load();
  const before = store.sanctions.length;
  store.sanctions = store.sanctions.filter((s) => s.id !== id);
  if (store.sanctions.length === before) return false;
  persist(store);
  return true;
}

export function countsFor(identity: PlayerIdentity): { bans: number; warns: number; kicks: number } {
  const mine = historyFor(identity);
  return {
    bans: mine.filter((s) => s.type === 'ban' && isActive(s)).length,
    warns: mine.filter((s) => s.type === 'warn' && !s.revoked).length,
    kicks: mine.filter((s) => s.type === 'kick').length,
  };
}

export function banMessage(sanction: Sanction): string {
  const until = sanction.expiresAt
    ? tr('hasta el {toLocaleString}', { toLocaleString: new Date(sanction.expiresAt).toLocaleString('es-ES') })
    : tr('de forma permanente');
  return tr('Estás baneado {until}.\nMotivo: {reason}\nReferencia: {id}', { until, reason: sanction.reason, id: sanction.id });
}

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const FILE = path.resolve(process.cwd(), 'invites.json');

export type InviteLevel = 'admin' | 'moderator';

export type InviteSection =
  | 'dashboard'
  | 'servers'
  | 'players'
  | 'sanctions'
  | 'resources'
  | 'marketplace'
  | 'automations'
  | 'console'
  | 'database'
  | 'editor'
  | 'logs'
  | 'settings'
  | 'changelog'
  | 'staff'
  | 'board'
  | 'development';

export const INVITE_SECTIONS: InviteSection[] = [
  'dashboard', 'servers', 'players', 'sanctions', 'resources', 'marketplace',
  'automations', 'console', 'database', 'editor', 'logs', 'settings',
  'changelog', 'staff', 'board', 'development',
];

function sanitizeSections(input: unknown): InviteSection[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set<string>(INVITE_SECTIONS);
  return [...new Set(input.filter((s): s is InviteSection => typeof s === 'string' && allowed.has(s)))];
}

export interface Invite {
  id: string;
  tokenHash: string;
  level: InviteLevel;
  label: string;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number;
  uses: number;
  revoked: boolean;
  sections?: InviteSection[];
  welcome?: string;
}

export interface InvitedMember {
  userId: string;
  username: string;
  avatar?: string;
  level: InviteLevel;
  inviteId: string;
  joinedAt: string;
  sections?: InviteSection[];
}

interface Store {
  invites: Invite[];
  members: InvitedMember[];
}

const EMPTY: Store = { invites: [], members: [] };

function load(): Store {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    return {
      invites: Array.isArray(parsed?.invites) ? parsed.invites : [],
      members: Array.isArray(parsed?.members) ? parsed.members : [],
    };
  } catch {
    return { ...EMPTY, invites: [], members: [] };
  }
}

function persist(store: Store): void {
  try {
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2), { encoding: 'utf-8', mode: 0o600 });
  } catch (err) {
    console.error('[Invites] No se pudo guardar invites.json:', err);
  }
}

function hash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function usable(invite: Invite): boolean {
  if (invite.revoked) return false;
  if (invite.maxUses > 0 && invite.uses >= invite.maxUses) return false;
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) return false;
  return true;
}

export interface PublicInvite {
  id: string;
  level: InviteLevel;
  label: string;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number;
  uses: number;
  revoked: boolean;
  active: boolean;
  sections?: InviteSection[];
  welcome?: string;
}

function toPublic(invite: Invite): PublicInvite {
  const { tokenHash: _ignored, ...rest } = invite;
  void _ignored;
  return { ...rest, active: usable(invite) };
}

export function listInvites(): PublicInvite[] {
  return load()
    .invites.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toPublic);
}

export function listMembers(): InvitedMember[] {
  return load().members.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}

export function createInvite(input: {
  level: InviteLevel;
  label?: string;
  expiresInDays?: number;
  expiresInHours?: number;
  maxUses?: number;
  sections?: unknown;
  welcome?: string;
}): { invite: PublicInvite; token: string } {
  const store = load();

  const token = crypto.randomBytes(32).toString('base64url');
  const days = Number(input.expiresInDays) || 0;
  const hours = Number(input.expiresInHours) || 0;
  const ms = days * 86400000 + hours * 3600000;

  const invite: Invite = {
    id: `inv-${crypto.randomBytes(6).toString('hex')}`,
    tokenHash: hash(token),
    level: input.level === 'admin' ? 'admin' : 'moderator',
    label: String(input.label || '').trim().slice(0, 60),
    createdAt: new Date().toISOString(),
    expiresAt: ms > 0 ? new Date(Date.now() + ms).toISOString() : null,
    maxUses: Math.max(0, Math.floor(Number(input.maxUses) || 0)),
    uses: 0,
    revoked: false,
    sections: sanitizeSections(input.sections),
    welcome: String(input.welcome || '').trim().slice(0, 300) || undefined,
  };

  store.invites.push(invite);
  persist(store);
  return { invite: toPublic(invite), token };
}

export function deleteInvite(id: string): boolean {
  const store = load();
  const before = store.invites.length;
  store.invites = store.invites.filter((i) => i.id !== id);
  if (store.invites.length === before) return false;
  store.members = store.members.filter((m) => m.inviteId !== id);
  persist(store);
  return true;
}

export function removeMember(userId: string): boolean {
  const store = load();
  const before = store.members.length;
  store.members = store.members.filter((m) => m.userId !== userId);
  if (store.members.length === before) return false;
  persist(store);
  return true;
}

export function redeemInvite(
  token: string,
  user: { id: string; username: string; avatar?: string }
): InviteLevel | null {
  if (!token) return null;

  const store = load();
  const invite = store.invites.find((i) => i.tokenHash === hash(token));
  if (!invite) return null;

  const already = store.members.find((m) => m.userId === user.id);
  if (already) {
    if (already.level === 'moderator' && invite.level === 'admin') {
      already.level = 'admin';
      persist(store);
    }
    return already.level;
  }

  if (!usable(invite)) return null;

  store.members.push({
    userId: user.id,
    username: user.username,
    avatar: user.avatar,
    level: invite.level,
    inviteId: invite.id,
    joinedAt: new Date().toISOString(),
    sections: invite.sections ? [...invite.sections] : [],
  });
  invite.uses += 1;
  persist(store);

  return invite.level;
}

export function levelForUser(userId: string): InviteLevel | null {
  const member = load().members.find((m) => m.userId === userId);
  return member ? member.level : null;
}

export function sectionsForUser(userId: string): InviteSection[] | null {
  const member = load().members.find((m) => m.userId === userId);
  if (!member) return null;
  if (!member.sections || member.sections.length === 0) return null;
  return member.sections;
}

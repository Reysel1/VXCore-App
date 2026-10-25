import { resolveAccessLevel, sectionsForRoles, type AccessLevel, type DiscordConfig } from './discord';
import type { InviteSection } from './invites';

export interface InGameAccess {
  allowed: boolean;
  level: AccessLevel;
  sections: InviteSection[] | null;
  reason?: 'sin_discord' | 'sin_rango';
}

const RANK: Record<AccessLevel, number> = { none: 0, moderator: 1, admin: 2, owner: 3 };

export function normalizeDiscordId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim().replace(/^discord:/i, '');
  return /^\d{5,25}$/.test(id) ? id : null;
}

export function resolveInGameAccess(input: {
  config: Pick<DiscordConfig, 'owner' | 'roles' | 'roleSections'>;
  discordId: string | null;
  roleIds: string[] | null;
  invitedLevel: Exclude<AccessLevel, 'none' | 'owner'> | AccessLevel | null;
  invitedSections: InviteSection[] | null;
}): InGameAccess {
  const { config, discordId, roleIds, invitedLevel, invitedSections } = input;

  if (!discordId) return { allowed: false, level: 'none', sections: null, reason: 'sin_discord' };
  if (config.owner?.id === discordId) return { allowed: true, level: 'owner', sections: null };

  const byRole = resolveAccessLevel(config as DiscordConfig, discordId, roleIds);
  const level = invitedLevel && RANK[invitedLevel] > RANK[byRole] ? invitedLevel : byRole;
  if (level === 'none') return { allowed: false, level: 'none', sections: null, reason: 'sin_rango' };

  const byInvite = invitedLevel ? invitedSections : null;
  const byRoles = sectionsForRoles(config as DiscordConfig, roleIds);
  const sections = !byInvite ? byRoles : !byRoles ? byInvite : byInvite.filter((s) => byRoles.includes(s));

  return { allowed: true, level, sections };
}

const ROLE_CACHE_MS = 60_000;
const roleCache = new Map<string, { at: number; roles: string[] | null }>();

export async function memberRolesCached(
  userId: string,
  fetchRoles: () => Promise<string[] | null>
): Promise<string[] | null> {
  const hit = roleCache.get(userId);
  if (hit && Date.now() - hit.at < ROLE_CACHE_MS) return hit.roles;

  const roles = await fetchRoles().catch(() => null);
  roleCache.set(userId, { at: Date.now(), roles });
  if (roleCache.size > 2000) roleCache.clear();
  return roles;
}

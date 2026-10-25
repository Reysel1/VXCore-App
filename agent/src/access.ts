import type { AccessLevel } from './discord';
import type { InviteSection } from './invites';

export type RequiredLevel = Exclude<AccessLevel, 'none'>;

export const LEVEL_RANK: Record<AccessLevel, number> = {
  none: 0,
  moderator: 1,
  admin: 2,
  owner: 3,
};

export interface Rule {
  level: RequiredLevel;
  section?: InviteSection;
  known: boolean;
}

type Entry = [methods: string, pattern: string, level: RequiredLevel, section?: InviteSection];

const ENTRIES: Entry[] = [
  ['GET', '/api/server/detect', 'moderator'],
  ['GET', '/api/server/status', 'moderator'],
  ['GET', '/api/server/online', 'moderator'],

  ['POST', '/api/settings/locale', 'owner', 'settings'],

  ['*', '/api/tunnel/status', 'owner', 'settings'],
  ['*', '/api/tunnel/retry', 'owner', 'settings'],
  ['*', '/api/tunnel/credentials', 'owner', 'settings'],
  ['*', '/api/tunnel/enabled', 'owner', 'settings'],

  ['POST', '/api/server/create', 'owner', 'servers'],
  ['POST', '/api/server/create-full', 'owner', 'servers'],
  ['GET', '/api/server/frameworks', 'admin', 'servers'],
  ['POST', '/api/server/remove', 'owner', 'servers'],
  ['POST', '/api/server/register', 'admin', 'servers'],
  ['POST', '/api/server/active', 'admin', 'servers'],
  ['GET', '/api/server/discover', 'admin', 'servers'],
  ['GET', '/api/server/diagnostics', 'moderator'],
  ['GET', '/api/server/ingame-resource', 'moderator'],
  ['POST', '/api/server/start', 'admin', 'servers'],
  ['POST', '/api/server/stop', 'admin', 'servers'],
  ['POST', '/api/server/restart', 'admin', 'servers'],
  ['POST', '/api/server/firewall-allow', 'owner', 'servers'],
  ['*', '/api/requirements/install/vcredist', 'owner', 'servers'],
  ['*', '/api/requirements/install/fxserver', 'owner', 'servers'],
  ['POST', '/api/open77/create', 'owner', 'servers'],
  ['GET', '/api/open77/archive', 'owner', 'servers'],
  ['POST', '/api/open77/extract', 'owner', 'servers'],
  ['GET', '/api/requirements', 'admin', 'development'],
  ['GET', '/api/artifacts', 'admin', 'development'],
  ['POST', '/api/artifacts/use', 'owner', 'development'],

  ['POST', '/api/server/read-cfg', 'admin', 'servers'],
  ['POST', '/api/server/parse-cfg', 'admin', 'servers'],
  ['POST', '/api/server/save-cfg', 'admin', 'servers'],
  ['*', '/api/server/onesync', 'admin', 'settings'],
  ['*', '/api/server/settings', 'admin', 'settings'],
  ['GET', '/api/paths', 'admin', 'settings'],
  ['POST', '/api/paths', 'owner', 'settings'],
  ['GET', '/api/config/create', 'admin', 'settings'],
  ['POST', '/api/config/create', 'owner', 'settings'],
  ['GET', '/api/fs/roots', 'admin', 'servers'],
  ['GET', '/api/fs/list', 'admin', 'servers'],

  ['POST', '/api/server/command', 'admin', 'console'],
  ['POST', '/api/server/announce', 'admin', 'console'],

  ['POST', '/api/server/live-players', 'moderator', 'players'],
  ['POST', '/api/server/moderation/give-money', 'admin', 'players'],
  ['GET', '/api/server/screen/:source', 'admin', 'players'],
  ['POST', '/api/discord/users', 'moderator', 'players'],
  ['GET', '/api/server/principals', 'admin', 'players'],
  ['POST', '/api/server/principals/revoke', 'owner', 'players'],
  ['POST', '/api/server/principals', 'owner', 'players'],
  ['GET', '/api/sanctions', 'moderator', 'sanctions'],
  ['POST', '/api/sanctions/history', 'moderator', 'sanctions'],
  ['POST', '/api/sanctions/players', 'moderator', 'sanctions'],
  ['POST', '/api/sanctions', 'moderator', 'sanctions'],
  ['POST', '/api/sanctions/:id/revoke', 'moderator', 'sanctions'],
  ['DELETE', '/api/sanctions/:id', 'admin', 'sanctions'],

  ['*', '/api/db/test', 'admin', 'database'],
  ['*', '/api/db/tables', 'admin', 'database'],
  ['*', '/api/db/schema', 'admin', 'database'],
  ['*', '/api/db/query', 'admin', 'database'],

  ['POST', '/api/server/resources-on-disk', 'moderator', 'resources'],
  ['POST', '/api/server/bulk-resources', 'admin', 'resources'],
  ['POST', '/api/server/install-resource', 'owner', 'resources'],
  ['POST', '/api/server/update-resource', 'owner', 'resources'],
  ['GET', '/api/marketplace/catalog', 'moderator', 'marketplace'],
  ['POST', '/api/marketplace/install', 'owner', 'marketplace'],

  ['GET', '/api/resource/files', 'admin', 'editor'],
  ['GET', '/api/resource/tree', 'admin', 'editor'],
  ['GET', '/api/resource/file', 'admin', 'editor'],
  ['GET', '/api/resource/search', 'admin', 'editor'],
  ['POST', '/api/resource/save-file', 'admin', 'editor'],

  ['GET', '/api/ai/config', 'admin', 'settings'],
  ['POST', '/api/ai/config', 'owner', 'settings'],
  ['GET', '/api/ai/models', 'admin', 'development'],
  ['POST', '/api/ai/test', 'admin', 'settings'],
  ['*', '/api/ai/chat', 'admin', 'editor'],
  ['*', '/api/ai/chat/stream', 'admin', 'editor'],

  ['GET', '/api/logs/recent', 'moderator', 'logs'],
  ['GET', '/api/logs/files', 'moderator', 'logs'],
  ['GET', '/api/logs/file', 'moderator', 'logs'],

  ['GET', '/api/automations', 'moderator', 'automations'],
  ['POST', '/api/automations/ai-generate', 'admin', 'automations'],
  ['POST', '/api/automations', 'admin', 'automations'],
  ['POST', '/api/automations/:id/toggle', 'admin', 'automations'],
  ['POST', '/api/automations/:id/run', 'admin', 'automations'],
  ['DELETE', '/api/automations/:id', 'admin', 'automations'],

  ['*', '/api/discord/config', 'owner', 'settings'],
  ['*', '/api/discord/unlink', 'owner', 'settings'],
  ['GET', '/api/discord/credentials/check', 'owner', 'settings'],
  ['GET', '/api/discord/guild', 'owner', 'settings'],
  ['GET', '/api/discord/whitelist/guild', 'owner', 'settings'],
  ['POST', '/api/discord/status/publish', 'admin', 'settings'],
  ['*', '/api/events/config', 'admin', 'settings'],
  ['*', '/api/events/trigger', 'admin', 'settings'],
  ['GET', '/api/events/scan', 'admin', 'settings'],

  ['GET', '/api/github/status', 'admin', 'changelog'],
  ['POST', '/api/github/config', 'owner', 'changelog'],
  ['POST', '/api/github/commits', 'admin', 'changelog'],
  ['POST', '/api/github/changelog/generate', 'admin', 'changelog'],
  ['GET', '/api/github/changelog', 'moderator', 'changelog'],
  ['POST', '/api/github/changelog/save', 'admin', 'changelog'],

  ['*', '/api/invites', 'owner', 'staff'],
  ['DELETE', '/api/invites/members/:userId', 'owner', 'staff'],
  ['DELETE', '/api/invites/:id', 'owner', 'staff'],
  ['GET', '/api/staff', 'moderator', 'staff'],
  ['POST', '/api/staff/reorder', 'admin', 'staff'],
  ['POST', '/api/staff', 'admin', 'staff'],
  ['DELETE', '/api/staff/:id', 'admin', 'staff'],

  ['POST', '/api/board/reset', 'admin', 'board'],
  ['GET', '/api/board', 'moderator', 'board'],
  ['*', '/api/board/columns', 'moderator', 'board'],
  ['*', '/api/board/columns/:id', 'moderator', 'board'],
  ['*', '/api/board/cards', 'moderator', 'board'],
  ['*', '/api/board/cards/:id/move', 'moderator', 'board'],
  ['*', '/api/board/cards/:id', 'moderator', 'board'],
];

function toRegExp(pattern: string): RegExp {
  const source = pattern
    .split('/')
    .map((segment) =>
      segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    .join('/');
  return new RegExp(`^${source}$`);
}

const COMPILED = ENTRIES.map(([methods, pattern, level, section]) => ({
  methods: methods === '*' ? null : methods.split('|'),
  regexp: toRegExp(pattern),
  level,
  section,
}));

export function ruleFor(method: string, pathname: string): Rule {
  const verb = method.toUpperCase();

  for (const entry of COMPILED) {
    if (entry.methods && !entry.methods.includes(verb)) continue;
    if (!entry.regexp.test(pathname)) continue;
    return { level: entry.level, section: entry.section, known: true };
  }

  return { level: 'owner', known: false };
}

import { trMsg } from './idioma';

export const ADMIN_GROUPS = ['superadmin', 'admin', 'moderator'] as const;
export type AdminGroup = (typeof ADMIN_GROUPS)[number];

export const GROUP_LABELS: Record<AdminGroup, string> = {
  superadmin: trMsg('Superadmin — todo, incluidos los permisos de los demás'),
  admin: trMsg('Admin — comandos de administración del servidor'),
  moderator: trMsg('Moderador — lo justo para moderar a los jugadores'),
};

const IDENTIFIER_RE = /^(license|license2|steam|discord|xbl|live|fivem)\.[A-Za-z0-9]{1,128}$/;

const PRINCIPAL_RE = /^\s*add_principal\s+identifier\.(\S+)\s+group\.([^\s#]+)/i;

export interface Principal {
  identifier: string;
  group: string;
  known: boolean;
}

function eolOf(content: string): string {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

function toGameForm(cfgForm: string): string {
  const at = cfgForm.indexOf('.');
  return at === -1 ? cfgForm : `${cfgForm.slice(0, at)}:${cfgForm.slice(at + 1)}`;
}

function toCfgForm(gameForm: string): string {
  const at = gameForm.indexOf(':');
  return at === -1 ? gameForm : `${gameForm.slice(0, at)}.${gameForm.slice(at + 1)}`;
}

export function isValidIdentifier(gameForm: string): boolean {
  return IDENTIFIER_RE.test(toCfgForm(String(gameForm || '').trim()));
}

export function isAdminGroup(value: unknown): value is AdminGroup {
  return typeof value === 'string' && (ADMIN_GROUPS as readonly string[]).includes(value);
}

export function parsePrincipals(content: string): Principal[] {
  const found: Principal[] = [];

  for (const line of content.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;

    const match = line.match(PRINCIPAL_RE);
    if (!match) continue;

    const identifier = toGameForm(match[1]);
    const group = match[2];
    found.push({ identifier, group, known: isAdminGroup(group) });
  }

  return found;
}

export function groupFor(content: string, identifier: string): string | null {
  const wanted = String(identifier || '').trim().toLowerCase();
  const found = parsePrincipals(content).find((p) => p.identifier.toLowerCase() === wanted);
  return found ? found.group : null;
}

export function revokePrincipal(content: string, identifier: string): string {
  const wanted = String(identifier || '').trim().toLowerCase();
  const eol = eolOf(content);

  const kept = content.split(/\r?\n/).filter((line) => {
    const match = line.match(PRINCIPAL_RE);
    if (!match) return true;
    return toGameForm(match[1]).toLowerCase() !== wanted;
  });

  return kept.join(eol);
}

const BLOCK_HEADER = '# Permisos de administración — los gestiona VXCore';

export function grantPrincipal(content: string, identifier: string, group: AdminGroup): string {
  if (groupFor(content, identifier) === group) return content;

  const eol = eolOf(content);
  const withoutOld = revokePrincipal(content, identifier);
  const line = `add_principal identifier.${toCfgForm(identifier)} group.${group}`;

  const body = withoutOld.replace(/\s+$/, '');
  const header = body.includes(BLOCK_HEADER) ? '' : `${eol}${eol}${BLOCK_HEADER}`;

  return `${body}${header}${eol}${line}${eol}`;
}

export function liveCommandsFor(
  action: 'grant' | 'revoke',
  identifier: string,
  group?: AdminGroup,
  previousGroup?: string | null
): string[] {
  const commands: string[] = [];
  const cfgForm = toCfgForm(identifier);

  if (previousGroup) {
    commands.push(`remove_principal identifier.${cfgForm} group.${previousGroup}`);
  }
  if (action === 'grant' && group) {
    commands.push(`add_principal identifier.${cfgForm} group.${group}`);
  }

  return commands;
}

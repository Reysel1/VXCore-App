function eolOf(content: string): string {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

export type OneSyncMode = 'on' | 'legacy' | 'off';

export interface ConvarReading {
  value: string | null;
  commentedOnly: boolean;
}

const VALIDATOR_NOTE = /^\s*#+\s*\[[^\]]*CFG validator\]/i;

function isValidatorNoteFor(line: string, name: string): boolean {
  return VALIDATOR_NOTE.test(line) && new RegExp(`\\b${name}\\b`, 'i').test(line);
}

function directiveRe(name: string): RegExp {
  return new RegExp(`^(#+\\s*|//\\s*)?(set|sets|setr)\\s+(${name})\\s+(.+?)\\s*$`, 'i');
}

function readConvar(content: string, name: string): ConvarReading {
  const pattern = directiveRe(name);
  let value: string | null = null;
  let commented: string | null = null;

  for (const raw of content.split(/\r?\n/)) {
    const match = raw.trim().match(pattern);
    if (!match) continue;
    if (match[1]) commented = match[4];
    else value = match[4];
  }

  return {
    value: value === null ? null : value.replace(/^"|"$/g, ''),
    commentedOnly: value === null && commented !== null,
  };
}

export function writeConvar(
  content: string,
  name: string,
  value: string,
  fallbackDirective: 'set' | 'sets' | 'setr' = 'set'
): string {
  const eol = eolOf(content);
  const lines = content.split(/\r?\n/).filter((line) => !isValidatorNoteFor(line, name));
  const pattern = directiveRe(name);

  let written = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].trim().match(pattern);
    if (!match) continue;

    if (written) {
      lines.splice(i, 1);
      continue;
    }

    const indent = lines[i].match(/^\s*/)?.[0] ?? '';
    const directive = match[2];
    const written_name = match[3];
    lines[i] = `${indent}${directive} ${written_name} ${value}`;
    written = true;
  }

  if (written) return lines.join(eol);

  const anchor = lines.findIndex((line) => /^\s*endpoint_add_/i.test(line));
  const at = anchor === -1 ? 0 : anchor + 1;
  lines.splice(at, 0, `${fallbackDirective} ${name} ${value}`);
  return lines.join(eol);
}

export function readOneSync(content: string): ConvarReading & { mode: OneSyncMode } {
  const reading = readConvar(content, 'onesync');
  const raw = (reading.value || 'off').toLowerCase();
  const mode: OneSyncMode = raw === 'on' || raw === 'legacy' ? raw : 'off';
  return { ...reading, mode };
}

function bareRe(name: string): RegExp {
  return new RegExp(`^(#+\\s*|//\\s*)?(${name})\\s+(.+?)\\s*$`, 'i');
}

export type SettingKind = 'set' | 'bare';

export interface CfgSetting {
  kind: SettingKind;
  quote: boolean;
  directive?: 'set' | 'sets' | 'setr';
}

export const EDITABLE_SETTINGS: Record<string, CfgSetting> = {
  sv_hostname: { kind: 'bare', quote: true },
  sv_maxclients: { kind: 'set', quote: false },
  sv_licenseKey: { kind: 'set', quote: false },
  sv_projectName: { kind: 'set', quote: true, directive: 'sets' },
  sv_projectDesc: { kind: 'set', quote: true, directive: 'sets' },
  locale: { kind: 'set', quote: true, directive: 'sets' },
  load_server_icon: { kind: 'bare', quote: false },

  onesync: { kind: 'set', quote: false },
  sv_enforceGameBuild: { kind: 'set', quote: false },
  sv_scriptHookAllowed: { kind: 'set', quote: false },
  sv_endpointprivacy: { kind: 'set', quote: false },

  steam_webApiKey: { kind: 'set', quote: false },
  mysql_connection_string: { kind: 'set', quote: true },
};

export function isEditableSetting(name: string): name is keyof typeof EDITABLE_SETTINGS {
  return Object.prototype.hasOwnProperty.call(EDITABLE_SETTINGS, name);
}

export function readSetting(content: string, name: string): ConvarReading {
  const setting = EDITABLE_SETTINGS[name];
  if (!setting || setting.kind === 'set') return readConvar(content, name);

  const pattern = bareRe(name);
  let value: string | null = null;
  let commented: string | null = null;

  for (const raw of content.split(/\r?\n/)) {
    const match = raw.trim().match(pattern);
    if (!match) continue;
    if (match[1]) commented = match[3];
    else value = match[3];
  }

  return {
    value: value === null ? null : value.replace(/^"|"$/g, ''),
    commentedOnly: value === null && commented !== null,
  };
}

export function writeSetting(content: string, name: string, value: string): string {
  const setting = EDITABLE_SETTINGS[name];
  if (!setting) return content;

  const formatted = setting.quote ? `"${value.replace(/"/g, '\\"')}"` : value;
  if (setting.kind === 'set') {
    return writeConvar(content, name, formatted, setting.directive ?? 'set');
  }

  const eol = eolOf(content);
  const lines = content.split(/\r?\n/);
  const pattern = bareRe(name);

  let written = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].trim().match(pattern);
    if (!match) continue;
    if (written) {
      lines.splice(i, 1);
      continue;
    }
    const indent = lines[i].match(/^\s*/)?.[0] ?? '';
    lines[i] = `${indent}${match[2]} ${formatted}`;
    written = true;
  }

  if (written) return lines.join(eol);

  const anchor = lines.findIndex((line) => /^\s*endpoint_add_/i.test(line));
  const at = anchor === -1 ? 0 : anchor + 1;
  lines.splice(at, 0, `${name} ${formatted}`);
  return lines.join(eol);
}

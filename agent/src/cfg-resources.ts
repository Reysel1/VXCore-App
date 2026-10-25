export interface ResourceDirective {
  kind: 'ensure' | 'start' | 'stop';
  target: string;
  group: boolean;
  commented: boolean;
}

const MANAGED_HEADER = '# ── VXCore · recursos gestionados desde el panel ──';

export function groupName(target: string): string {
  return target.startsWith('[') && target.endsWith(']') ? target.slice(1, -1) : target;
}

function eolOf(content: string): string {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

const DIRECTIVE = /^(#+\s*|\/\/\s*)?(ensure|start|stop)\s+(\[[^\]]+\]|[^\s#]+)/i;

export function parseDirectives(content: string): ResourceDirective[] {
  const found: ResourceDirective[] = [];

  for (const raw of content.split(/\r?\n/)) {
    const match = raw.trim().match(DIRECTIVE);
    if (!match) continue;

    const target = match[3];
    found.push({
      kind: match[2].toLowerCase() as ResourceDirective['kind'],
      target,
      group: target.startsWith('['),
      commented: Boolean(match[1]),
    });
  }

  return found;
}

export interface DiskResourceRef {
  name: string;
  groups?: string[];
}

export interface GroupRef {
  name: string;
  chain: string[];
  count: number;
  ambiguous: boolean;
}

export function collectGroups(onDisk: DiskResourceRef[]): GroupRef[] {
  const byChain = new Map<string, { name: string; chain: string[]; count: number }>();

  for (const resource of onDisk) {
    const chain = resource.groups ?? [];
    for (let depth = 1; depth <= chain.length; depth++) {
      const slice = chain.slice(0, depth);
      const key = slice.join('/').toLowerCase();
      const entry = byChain.get(key) ?? { name: slice[depth - 1], chain: slice, count: 0 };
      entry.count++;
      byChain.set(key, entry);
    }
  }

  const repeated = new Map<string, number>();
  for (const entry of byChain.values()) {
    const key = entry.name.toLowerCase();
    repeated.set(key, (repeated.get(key) ?? 0) + 1);
  }

  return Array.from(byChain.values())
    .map((entry) => ({ ...entry, ambiguous: (repeated.get(entry.name.toLowerCase()) ?? 0) > 1 }))
    .sort((a, b) => a.chain.join('/').localeCompare(b.chain.join('/'), 'es'));
}

export function resolveStarted(
  content: string,
  onDisk: DiskResourceRef[]
): { started: Set<string>; viaGroup: Map<string, string> } {
  const started = new Set<string>();
  const viaGroup = new Map<string, string>();

  const byGroup = new Map<string, string[]>();
  for (const resource of onDisk) {
    for (const group of resource.groups ?? []) {
      const bucket = byGroup.get(group.toLowerCase()) ?? [];
      bucket.push(resource.name);
      byGroup.set(group.toLowerCase(), bucket);
    }
  }

  for (const directive of parseDirectives(content)) {
    if (directive.commented) continue;

    const targets = directive.group
      ? byGroup.get(groupName(directive.target).toLowerCase()) ?? []
      : [directive.target];

    for (const name of targets) {
      if (directive.kind === 'stop') {
        started.delete(name);
        viaGroup.delete(name);
      } else {
        started.add(name);
        if (directive.group) viaGroup.set(name, directive.target);
        else viaGroup.delete(name);
      }
    }
  }

  return { started, viaGroup };
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function ensureResource(content: string, name: string): string {
  const eol = eolOf(content);
  const lines = content.split(/\r?\n/);
  const pattern = new RegExp(`^(#+\\s*|//\\s*)?(ensure|start|stop)\\s+${escape(name)}\\s*$`, 'i');

  let rewritten = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!pattern.test(lines[i].trim())) continue;

    if (rewritten) {
      lines.splice(i, 1);
      continue;
    }

    const indent = lines[i].match(/^\s*/)?.[0] ?? '';
    lines[i] = `${indent}ensure ${name}`;
    rewritten = true;
  }

  if (rewritten) return lines.join(eol);

  return appendManaged(content, `ensure ${name}`);
}

function removeResource(content: string, name: string, coveredByGroup = false): string {
  const eol = eolOf(content);
  const lines = content.split(/\r?\n/);
  const pattern = new RegExp(`^(ensure|start)\\s+${escape(name)}\\s*$`, 'i');

  const commented = lines.map((line) => {
    const trimmed = line.trim();
    if (!pattern.test(trimmed)) return line;
    const indent = line.match(/^\s*/)?.[0] ?? '';
    return `${indent}# ${trimmed}`;
  });
  const cleaned = commented.join(eol);

  if (!coveredByGroup) return cleaned;
  return appendManaged(cleaned, `stop ${name}`);
}

function appendManaged(content: string, line: string): string {
  const eol = eolOf(content);

  if (content.includes(MANAGED_HEADER)) {
    const lines = content.split(/\r?\n/);
    const header = lines.findIndex((l) => l.trim() === MANAGED_HEADER);

    let end = header + 1;
    while (end < lines.length && (lines[end].trim() === '' || DIRECTIVE.test(lines[end].trim()))) {
      end++;
    }

    while (end > header + 1 && lines[end - 1].trim() === '') end--;

    lines.splice(end, 0, line);
    return lines.join(eol);
  }

  const separator = content.endsWith(eol) || content === '' ? '' : eol;
  return `${content}${separator}${eol}${MANAGED_HEADER}${eol}${line}${eol}`;
}

export function applyResourceChanges(
  content: string,
  changes: { name: string; action: 'start' | 'stop'; coveredByGroup?: boolean }[]
): string {
  return changes.reduce(
    (acc, change) =>
      change.action === 'start'
        ? ensureResource(acc, change.name)
        : removeResource(acc, change.name, change.coveredByGroup),
    content
  );
}

export function toggleGroup(content: string, group: string, action: 'start' | 'stop'): string {
  const target = group.startsWith('[') ? group : `[${group}]`;
  return action === 'start' ? ensureResource(content, target) : removeResource(content, target);
}

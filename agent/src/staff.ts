import fs from 'fs';
import path from 'path';

const CONFIG_FILE = path.resolve(process.cwd(), 'staff-config.json');

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  discord?: string;
  avatarColor: string;
  github?: string;
  joinedAt?: string;
  active: boolean;
  order: number;
}

export interface StaffStore {
  members: StaffMember[];
}

const DEFAULT_STORE: StaffStore = { members: [] };

function load(): StaffStore {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (parsed && Array.isArray(parsed.members)) return parsed as StaffStore;
    }
  } catch (err) {
    console.error('[Staff] No se pudo leer staff-config.json:', err);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STORE));
}

function persist(store: StaffStore): void {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Staff] No se pudo guardar staff-config.json:', err);
  }
}

export function listMembers(): StaffMember[] {
  return load().members.sort((a, b) => a.order - b.order);
}

export function upsertMember(input: Partial<StaffMember> & { name: string; role: string }): StaffMember {
  const store = load();
  const existing = input.id ? store.members.find((m) => m.id === input.id) : undefined;

  if (existing) {
    Object.assign(existing, {
      name: input.name,
      role: input.role,
      discord: input.discord ?? existing.discord,
      avatarColor: input.avatarColor || existing.avatarColor,
      github: input.github ?? existing.github,
      joinedAt: input.joinedAt ?? existing.joinedAt,
      active: input.active ?? existing.active,
    });
    persist(store);
    return existing;
  }

  const created: StaffMember = {
    id: `staff-${Date.now().toString(36)}`,
    name: input.name,
    role: input.role,
    discord: input.discord,
    avatarColor: input.avatarColor || '#8b5cf6',
    github: input.github,
    joinedAt: input.joinedAt || new Date().toISOString(),
    active: input.active ?? true,
    order: store.members.length,
  };
  store.members.push(created);
  persist(store);
  return created;
}

export function removeMember(id: string): boolean {
  const store = load();
  const before = store.members.length;
  store.members = store.members.filter((m) => m.id !== id);
  if (store.members.length !== before) {
    persist(store);
    return true;
  }
  return false;
}

export function reorderMember(id: string, direction: -1 | 1): boolean {
  const store = load();
  const idx = store.members.findIndex((m) => m.id === id);
  if (idx === -1) return false;
  const target = idx + direction;
  if (target < 0 || target >= store.members.length) return false;
  const [member] = store.members.splice(idx, 1);
  store.members.splice(target, 0, member);
  store.members.forEach((m, i) => (m.order = i));
  persist(store);
  return true;
}

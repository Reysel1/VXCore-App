const BUDGET_BYTES = 3_500_000;

const KEY_PREFIX = "vxcore_editor_session:";

const keyFor = (serverId: string) => `${KEY_PREFIX}${serverId}`;

export interface StoredAttachment {
  id: string;
  kind: "file" | "image" | "selection";
  name: string;
  content?: string;
  dataUrl?: string;
}

export interface StoredChatEntry {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  proposal?: { file: string; newCode: string };
  images?: string[];
  attachments?: { name: string; kind: "file" | "image" | "selection" }[];
}

export interface StoredChatSession {
  id: string;
  title: string;
  entries: StoredChatEntry[];
  attachments: StoredAttachment[];
}

export interface StoredTab {
  resource: string;
  filePath: string;
  content?: string;
  dirty: boolean;
}

export interface EditorSnapshot {
  version: 1;
  tabs: StoredTab[];
  activeTab: string | null;
  sessions: StoredChatSession[];
  activeChat: string | null;
  prompt: string;
  explorer: "arbol" | "buscar";
  savedAt: number;
}

const bytes = (value: unknown) => JSON.stringify(value).length;

function fitToBudget(snapshot: EditorSnapshot): EditorSnapshot | null {
  let current = snapshot;
  if (bytes(current) <= BUDGET_BYTES) return current;

  current = {
    ...current,
    sessions: current.sessions.map((s) => ({
      ...s,
      attachments: s.attachments.filter((a) => a.kind !== "image"),
      entries: s.entries.map((entry) => {
        const withoutImages = { ...entry };
        delete withoutImages.images;
        return withoutImages;
      }),
    })),
  };
  if (bytes(current) <= BUDGET_BYTES) return current;

  current = {
    ...current,
    tabs: current.tabs.map((t) => (t.dirty ? t : { ...t, content: undefined })),
  };
  if (bytes(current) <= BUDGET_BYTES) return current;

  while (bytes(current) > BUDGET_BYTES) {
    const longest = current.sessions.reduce<StoredChatSession | null>(
      (worst, s) => (!worst || s.entries.length > worst.entries.length ? s : worst),
      null
    );
    if (!longest || longest.entries.length === 0) break;

    current = {
      ...current,
      sessions: current.sessions.map((s) =>
        s.id === longest.id ? { ...s, entries: s.entries.slice(2) } : s
      ),
    };
  }

  return bytes(current) <= BUDGET_BYTES ? current : null;
}

export function saveEditorSnapshot(serverId: string, snapshot: Omit<EditorSnapshot, "version" | "savedAt">): void {
  if (typeof window === "undefined" || !serverId) return;

  const full: EditorSnapshot = { ...snapshot, version: 1, savedAt: Date.now() };
  const fitted = fitToBudget(full);
  if (!fitted) return;

  try {
    localStorage.setItem(keyFor(serverId), JSON.stringify(fitted));
  } catch {}
}

export function loadEditorSnapshot(serverId: string): EditorSnapshot | null {
  if (typeof window === "undefined" || !serverId) return null;

  try {
    const raw = localStorage.getItem(keyFor(serverId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as EditorSnapshot;
    if (parsed?.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

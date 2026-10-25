import fs from 'fs';
import path from 'path';
import { tr, trMsg } from './idioma';

const CONFIG_FILE = path.resolve(process.cwd(), 'board.json');

export interface BoardColumn {
  id: string;
  title: string;
  color: string;
  wip?: number;
}

export interface BoardCard {
  id: string;
  title: string;
  description: string;
  columnId: string;
  labels: string[];
  assigneeIds: string[];
  changelogRef?: string;
  dueAt?: string;
  createdAt: string;
}

export interface BoardStore {
  columns: BoardColumn[];
  cards: BoardCard[];
}

const DEFAULT_STORE: BoardStore = {
  columns: [
    { id: 'backlog', title: trMsg('Pendiente'), color: '#64748b' },
    { id: 'todo', title: trMsg('Por hacer'), color: '#3b82f6' },
    { id: 'doing', title: trMsg('En curso'), color: '#f59e0b' },
    { id: 'done', title: trMsg('Hecho'), color: '#22c55e' },
  ],
  cards: [],
};

function load(): BoardStore {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (parsed && Array.isArray(parsed.columns) && Array.isArray(parsed.cards)) {
        return parsed as BoardStore;
      }
    }
  } catch (err) {
    console.error('[Board] No se pudo leer board.json:', err);
  }
  const nuevo = JSON.parse(JSON.stringify(DEFAULT_STORE)) as BoardStore;
  nuevo.columns = nuevo.columns.map((c) => ({ ...c, title: tr(c.title) }));
  return nuevo;
}

function persist(store: BoardStore): void {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Board] No se pudo guardar board.json:', err);
  }
}

export function getBoard(): BoardStore {
  return load();
}

export function resetBoard(): BoardStore {
  const store = load();
  const cards = store.cards;
  const reset = JSON.parse(JSON.stringify(DEFAULT_STORE));
  const fallback = reset.columns[0]?.id;
  if (fallback) {
    for (const card of cards) card.columnId = fallback;
  }
  reset.cards = cards;
  persist(reset);
  return reset;
}

export function addColumn(title: string, color: string): BoardStore {
  const store = load();
  const column: BoardColumn = {
    id: `col-${Date.now().toString(36)}`,
    title: title.trim() || tr('Nueva columna'),
    color: color || '#64748b',
  };
  store.columns.push(column);
  persist(store);
  return store;
}

export function updateColumn(id: string, patch: Partial<BoardColumn>): BoardStore | null {
  const store = load();
  const column = store.columns.find((c) => c.id === id);
  if (!column) return null;
  Object.assign(column, patch);
  persist(store);
  return store;
}

export function removeColumn(id: string): BoardStore | null {
  const store = load();
  const column = store.columns.find((c) => c.id === id);
  if (!column) return null;
  store.columns = store.columns.filter((c) => c.id !== id);
  const fallback = store.columns[0]?.id;
  if (fallback) {
    for (const card of store.cards) {
      if (card.columnId === id) card.columnId = fallback;
    }
  } else {
    store.cards = [];
  }
  persist(store);
  return store;
}

export function addCard(input: Partial<BoardCard> & { title: string; columnId: string }): BoardStore {
  const store = load();
  const card: BoardCard = {
    id: `card-${Date.now().toString(36)}`,
    title: input.title.trim() || tr('Sin título'),
    description: input.description || '',
    columnId: input.columnId,
    labels: Array.isArray(input.labels) ? input.labels : [],
    assigneeIds: Array.isArray(input.assigneeIds) ? input.assigneeIds : [],
    changelogRef: input.changelogRef || undefined,
    dueAt: input.dueAt || undefined,
    createdAt: new Date().toISOString(),
  };
  store.cards.push(card);
  persist(store);
  return store;
}

export function updateCard(id: string, patch: Partial<BoardCard>): BoardStore | null {
  const store = load();
  const card = store.cards.find((c) => c.id === id);
  if (!card) return null;
  Object.assign(card, patch);
  persist(store);
  return store;
}

export function moveCard(id: string, toColumnId: string, beforeId?: string): BoardStore | null {
  const store = load();
  const index = store.cards.findIndex((c) => c.id === id);
  const column = store.columns.find((c) => c.id === toColumnId);
  if (index === -1 || !column) return null;

  if (beforeId === id && store.cards[index].columnId === toColumnId) return store;

  const [card] = store.cards.splice(index, 1);
  card.columnId = toColumnId;

  const at = beforeId && beforeId !== id ? store.cards.findIndex((c) => c.id === beforeId) : -1;
  if (at === -1) store.cards.push(card);
  else store.cards.splice(at, 0, card);

  persist(store);
  return store;
}

export function removeCard(id: string): BoardStore | null {
  const store = load();
  const before = store.cards.length;
  store.cards = store.cards.filter((c) => c.id !== id);
  if (store.cards.length === before) return null;
  persist(store);
  return store;
}

import fs from 'fs';
import path from 'path';

export type LogLevel = 'error' | 'warning' | 'info' | 'debug';

export interface LogEntry {
  id: number;
  time: string;
  level: LogLevel;
  resource: string;
  message: string;
  stream: 'stdout' | 'stderr' | 'agent';
}

const MEMORY_LIMIT = 5000;
const LOG_DIR = path.resolve(process.cwd(), 'logs');

function parseResource(message: string): { resource: string; rest: string } {
  const match = message.match(/^\[\s*([^\]]+?)\s*\]\s?([\s\S]*)$/);
  if (!match) return { resource: 'system', rest: message };

  const raw = match[1];
  const resource = raw.includes(':') ? raw.split(':').pop()!.trim() : raw;
  return { resource: resource || 'system', rest: match[2] };
}

function detectLevel(message: string, stream: LogEntry['stream']): LogLevel {
  const lower = message.toLowerCase();
  if (/\berror\b|\bfailed\b|\bexception\b|couldn't|could not|\bfatal\b/.test(lower)) return 'error';
  if (/\bwarn(ing)?\b|\bdeprecated\b/.test(lower)) return 'warning';
  if (/\bdebug\b|\btrace\b/.test(lower)) return 'debug';
  return stream === 'stderr' ? 'warning' : 'info';
}

export class LogStore {
  private entries: LogEntry[] = [];
  private nextId = 1;
  private currentFile: string | null = null;

  private sessionId = 0;
  private sessionStartedAt: string | null = null;

  constructor() {
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    } catch (err) {
      console.error('[LogStore] No se pudo crear la carpeta de logs:', err);
    }
  }

  startSession(label: string): void {
    this.sessionId += 1;
    this.sessionStartedAt = new Date().toISOString();
    this.entries = [];
    this.add(`[FiveOS] Nueva sesión de servidor: ${label}`, 'agent');
  }

  getSession(): { id: number; startedAt: string | null } {
    return { id: this.sessionId, startedAt: this.sessionStartedAt };
  }

  add(rawMessage: string, stream: LogEntry['stream']): LogEntry {
    const { resource, rest } = parseResource(rawMessage);
    const entry: LogEntry = {
      id: this.nextId++,
      time: new Date().toISOString(),
      level: detectLevel(rawMessage, stream),
      resource,
      message: rest || rawMessage,
      stream,
    };

    this.entries.push(entry);
    if (this.entries.length > MEMORY_LIMIT) {
      this.entries.splice(0, this.entries.length - MEMORY_LIMIT);
    }

    this.appendToFile(entry);
    return entry;
  }

  private appendToFile(entry: LogEntry): void {
    try {
      const day = entry.time.slice(0, 10);
      this.currentFile = path.join(LOG_DIR, `fiveos-${day}.log`);
      fs.appendFileSync(
        this.currentFile,
        `${entry.time}\t${entry.level}\t${entry.resource}\t${entry.message}\n`,
        'utf-8'
      );
    } catch {}
  }

  query(options: { levels?: LogLevel[]; resource?: string; search?: string; limit?: number }): LogEntry[] {
    const { levels, resource, search, limit = 500 } = options;
    const needle = search?.toLowerCase();

    const filtered = this.entries.filter((entry) => {
      if (levels && levels.length > 0 && !levels.includes(entry.level)) return false;
      if (resource && entry.resource.toLowerCase() !== resource.toLowerCase()) return false;
      if (needle && !entry.message.toLowerCase().includes(needle) && !entry.resource.toLowerCase().includes(needle)) {
        return false;
      }
      return true;
    });

    return filtered.slice(-limit).reverse();
  }

  knownResources(): string[] {
    return Array.from(new Set(this.entries.map((e) => e.resource))).sort();
  }

  counts(): Record<LogLevel, number> {
    const totals: Record<LogLevel, number> = { error: 0, warning: 0, info: 0, debug: 0 };
    for (const entry of this.entries) totals[entry.level]++;
    return totals;
  }

  listFiles(): { name: string; size: number; modified: string }[] {
    try {
      return fs
        .readdirSync(LOG_DIR)
        .filter((name) => name.endsWith('.log'))
        .map((name) => {
          const stats = fs.statSync(path.join(LOG_DIR, name));
          return { name, size: stats.size, modified: stats.mtime.toISOString() };
        })
        .sort((a, b) => b.name.localeCompare(a.name));
    } catch {
      return [];
    }
  }

  readFile(name: string): string | null {
    if (!/^fiveos-\d{4}-\d{2}-\d{2}\.log$/.test(name)) return null;
    const full = path.join(LOG_DIR, name);
    if (!fs.existsSync(full)) return null;
    return fs.readFileSync(full, 'utf-8');
  }
}

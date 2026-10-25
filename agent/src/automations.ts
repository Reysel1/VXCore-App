import fs from 'fs';
import path from 'path';
import { Server } from 'socket.io';
import { ProcessManager } from './process-manager';
import { tr } from './idioma';
import { consoleText } from './console-text';

export type Trigger =
  | { type: 'interval'; everyMinutes: number }
  | { type: 'daily'; at: string }
  | { type: 'log_match'; pattern: string }
  | { type: 'cpu_above'; percent: number; forSeconds: number }
  | { type: 'ram_above'; percent: number; forSeconds: number }
  | { type: 'server_offline' };

export type NoticeLevel = 'info' | 'success' | 'warning' | 'error';

export type Action =
  | { type: 'notify'; title: string; message: string; level: NoticeLevel }
  | { type: 'command'; command: string }
  | { type: 'webhook'; url: string; message: string }
  | { type: 'restart' }
  | { type: 'start' }
  | { type: 'stop' };

export interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  actions: Action[];
  runCount: number;
  lastRunAt?: string;
  lastResult?: string;
  lastOk?: boolean;
}

export interface ActionResult {
  action: Action;
  success: boolean;
  message: string;
}

export interface RunResult {
  automationId: string;
  name: string;
  at: string;
  reason: string;
  results: ActionResult[];
  success: boolean;
}

const NOTICE_LEVELS: NoticeLevel[] = ['info', 'success', 'warning', 'error'];

export function noticeCommand(
  title: string,
  message: string,
  level: string,
  durationMs?: number,
  sound?: boolean
): string {
  const oneLine = (text: string) => consoleText(text);
  const payload: Record<string, unknown> = {
    source: -1,
    title: oneLine(title) || tr('Aviso del servidor'),
    message: oneLine(message),
    type: NOTICE_LEVELS.includes(level as NoticeLevel) ? level : 'info',
  };
  if (typeof durationMs === 'number' && Number.isFinite(durationMs)) {
    payload.duration = Math.min(60_000, Math.max(1_000, Math.round(durationMs)));
  }
  if (typeof sound === 'boolean') payload.sound = sound;
  return `vxcore_event vxcore:notify ${JSON.stringify(payload)}`;
}

export function noticeReply(line: string): 'sent' | 'missing' | null {
  if (/Aviso enviado a todos/i.test(line)) return 'sent';
  if (/No such command\W*vxcore_event/i.test(line)) return 'missing';
  return null;
}

interface Telemetry {
  cpu?: { load: number };
  memory?: { usedPercent: number };
}

const STORE_FILE = path.resolve(process.cwd(), 'automations.json');
const TICK_MS = 10_000;
const MAX_HISTORY = 50;

export class AutomationEngine {
  private automations: Automation[] = [];
  private history: RunResult[] = [];
  private timer: NodeJS.Timeout | null = null;

  private telemetry: Telemetry | null = null;
  private lastServerOnline = false;

  private aboveSince = new Map<string, number>();
  private lastFiredAt = new Map<string, number>();
  private lastDailyDate = new Map<string, string>();

  constructor(
    private io: Server,
    private processManager: ProcessManager,
    private getServerContext: () => {
      serverDataPath?: string;
      cfgPath?: string;
      name?: string;
      ip?: string;
      port?: string | number;
    }
  ) {
    this.load();
    this.processManager.onLog((line) => this.handleLogLine(line));
  }

  private load(): void {
    try {
      if (fs.existsSync(STORE_FILE)) {
        this.automations = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
        console.log(`[Automations] ${this.automations.length} automatización(es) cargadas`);
      }
    } catch (err) {
      console.error('[Automations] No se pudo leer automations.json:', err);
      this.automations = [];
    }
  }

  private persist(): void {
    try {
      fs.writeFileSync(STORE_FILE, JSON.stringify(this.automations, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Automations] No se pudo guardar automations.json:', err);
    }
  }

  list(): Automation[] {
    return this.automations;
  }

  getHistory(): RunResult[] {
    return this.history;
  }

  get(id: string): Automation | undefined {
    return this.automations.find((a) => a.id === id);
  }

  upsert(input: Partial<Automation> & { name: string; trigger: Trigger; actions: Action[] }): Automation {
    const existing = input.id ? this.get(input.id) : undefined;

    if (existing) {
      Object.assign(existing, {
        name: input.name,
        trigger: input.trigger,
        actions: input.actions,
        enabled: input.enabled ?? existing.enabled,
      });
      this.persist();
      return existing;
    }

    const created: Automation = {
      id: `auto-${Date.now().toString(36)}`,
      name: input.name,
      enabled: input.enabled ?? true,
      trigger: input.trigger,
      actions: input.actions,
      runCount: 0,
    };
    this.automations.push(created);
    this.persist();
    return created;
  }

  remove(id: string): boolean {
    const before = this.automations.length;
    this.automations = this.automations.filter((a) => a.id !== id);
    this.aboveSince.delete(id);
    this.lastFiredAt.delete(id);
    this.lastDailyDate.delete(id);
    if (this.automations.length !== before) {
      this.persist();
      return true;
    }
    return false;
  }

  setEnabled(id: string, enabled: boolean): Automation | undefined {
    const automation = this.get(id);
    if (!automation) return undefined;
    automation.enabled = enabled;
    this.aboveSince.delete(id);
    this.persist();
    return automation;
  }

  updateTelemetry(telemetry: Telemetry | null): void {
    this.telemetry = telemetry;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch((err) => console.error('[Automations] tick:', err)), TICK_MS);
    console.log('[Automations] Motor iniciado');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private handleLogLine(line: string): void {
    for (const automation of this.automations) {
      if (!automation.enabled || automation.trigger.type !== 'log_match') continue;

      let matches = false;
      try {
        matches = new RegExp(automation.trigger.pattern, 'i').test(line);
      } catch {
        matches = line.toLowerCase().includes(automation.trigger.pattern.toLowerCase());
      }

      if (matches) {
        this.run(automation, tr('Coincidencia en consola: "{slice}"', { slice: line.trim().slice(0, 120) }));
      }
    }
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    const online = this.processManager.isRunning();
    const wentOffline = this.lastServerOnline && !online;
    this.lastServerOnline = online;

    for (const automation of this.automations) {
      if (!automation.enabled) continue;
      const { trigger } = automation;

      switch (trigger.type) {
        case 'interval': {
          const last = this.lastFiredAt.get(automation.id) ?? 0;
          if (now - last >= trigger.everyMinutes * 60_000) {
            this.lastFiredAt.set(automation.id, now);
            if (last !== 0) await this.run(automation, tr('Cada {everyMinutes} min', { everyMinutes: trigger.everyMinutes }));
          }
          break;
        }

        case 'daily': {
          const date = new Date();
          const stamp = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

          const [hh, mm] = trigger.at.split(':').map(Number);
          const due = date.getHours() > hh || (date.getHours() === hh && date.getMinutes() >= mm);

          if (!this.lastDailyDate.has(automation.id)) {
            this.lastDailyDate.set(automation.id, due ? stamp : 'pendiente');
          }

          if (due && this.lastDailyDate.get(automation.id) !== stamp) {
            this.lastDailyDate.set(automation.id, stamp);
            await this.run(automation, tr('Hora programada {at}', { at: trigger.at }));
          }
          break;
        }

        case 'cpu_above':
        case 'ram_above': {
          const value =
            trigger.type === 'cpu_above' ? this.telemetry?.cpu?.load : this.telemetry?.memory?.usedPercent;
          if (typeof value !== 'number') break;

          if (value > trigger.percent) {
            const since = this.aboveSince.get(automation.id);
            if (!since) {
              this.aboveSince.set(automation.id, now);
            } else if (now - since >= trigger.forSeconds * 1000) {
              this.aboveSince.delete(automation.id);
              const label = trigger.type === 'cpu_above' ? 'CPU' : 'RAM';
              await this.run(
                automation,
                tr('{label} al {value}% durante más de {forSeconds}s', { label, value: value.toFixed(1), forSeconds: trigger.forSeconds })
              );
            }
          } else {
            this.aboveSince.delete(automation.id);
          }
          break;
        }

        case 'server_offline': {
          if (wentOffline) await this.run(automation, tr('El servidor pasó a estar detenido'));
          break;
        }
      }
    }
  }

  async run(automation: Automation, reason: string): Promise<RunResult> {
    console.log(`[Automations] Ejecutando "${automation.name}" — ${reason}`);
    const results: ActionResult[] = [];

    for (const action of automation.actions) {
      results.push(await this.execute(action, automation, reason));
    }

    const success = results.every((r) => r.success);
    const runResult: RunResult = {
      automationId: automation.id,
      name: automation.name,
      at: new Date().toISOString(),
      reason,
      results,
      success,
    };

    automation.runCount += 1;
    automation.lastRunAt = runResult.at;
    automation.lastOk = success;
    automation.lastResult = success
      ? tr('{length} acción(es) ejecutada(s)', { length: results.length })
      : results.find((r) => !r.success)?.message || tr('Falló alguna acción');
    this.persist();

    this.history.unshift(runResult);
    if (this.history.length > MAX_HISTORY) this.history.pop();

    this.io.emit('automation-run', runResult);
    return runResult;
  }

  private async execute(action: Action, automation: Automation, reason: string): Promise<ActionResult> {
    switch (action.type) {
      case 'notify': {
        const message = this.interpolate(action.message || '', automation, reason);
        if (!message.trim()) {
          return { action, success: false, message: tr('El aviso no tiene texto.') };
        }
        const title = this.interpolate(action.title || '', automation, reason);
        const result = this.processManager.executeCommand(noticeCommand(title, message, action.level));
        return {
          action,
          success: result.success,
          message: result.success ? tr('Aviso enviado a los jugadores.') : result.message,
        };
      }

      case 'command': {
        const result = this.processManager.executeCommand(action.command);
        return { action, success: result.success, message: result.message };
      }

      case 'start':
      case 'restart': {
        const context = this.getServerContext();
        if (action.type === 'restart') this.processManager.stopServer();

        if (action.type === 'restart') await new Promise((r) => setTimeout(r, 5000));

        const result = await this.processManager.startServer({
          serverDataPath: context.serverDataPath,
          cfgPath: context.cfgPath,
          ip: context.ip,
          port: context.port,
        });
        return { action, success: result.success, message: result.message };
      }

      case 'stop': {
        const result = this.processManager.stopServer();
        return { action, success: result.success, message: result.message };
      }

      case 'webhook': {
        if (!/^https:\/\//i.test(action.url)) {
          return { action, success: false, message: tr('El webhook debe ser una URL https.') };
        }

        const content = this.interpolate(action.message, automation, reason);
        try {
          const res = await fetch(action.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
            signal: AbortSignal.timeout(8000),
          });

          if (!res.ok) {
            return { action, success: false, message: tr('El webhook respondió {status}.', { status: res.status }) };
          }
          return { action, success: true, message: tr('Mensaje enviado al webhook.') };
        } catch (err) {
          return { action, success: false, message: tr('No se pudo llamar al webhook: {message}', { message: (err as Error | undefined)?.message }) };
        }
      }

      default:
        return { action, success: false, message: tr('Tipo de acción desconocido.') };
    }
  }

  private interpolate(template: string, automation: Automation, reason: string): string {
    const context = this.getServerContext();
    return template
      .replace(/\{\{\s*servidor\s*\}\}/gi, context.name || 'servidor')
      .replace(/\{\{\s*motivo\s*\}\}/gi, reason)
      .replace(/\{\{\s*flujo\s*\}\}/gi, automation.name)
      .replace(/\{\{\s*cpu\s*\}\}/gi, this.telemetry?.cpu?.load != null ? `${this.telemetry.cpu.load}%` : 'n/d')
      .replace(
        /\{\{\s*ram\s*\}\}/gi,
        this.telemetry?.memory?.usedPercent != null ? `${this.telemetry.memory.usedPercent}%` : 'n/d'
      )
      .replace(/\{\{\s*hora\s*\}\}/gi, new Date().toLocaleString('es-ES'));
  }
}

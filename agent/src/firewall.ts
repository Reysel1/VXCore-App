import { execFile } from 'child_process';
import { tr } from './idioma';

export const FXSERVER_RULE_NAME = 'VXCore FXServer';

const IS_WIN = process.platform === 'win32';

function runNetsh(args: string[]): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    execFile(
      'netsh',
      args,
      { timeout: 15000, windowsHide: true },
      (err, stdout, stderr) => {
        resolve({ ok: !err, output: `${stdout || ''}${stderr || ''}` });
      }
    );
  });
}

async function ruleExists(ruleName: string): Promise<boolean | null> {
  if (!IS_WIN) return true;
  const res = await runNetsh(['advfirewall', 'firewall', 'show', 'rule', `name=${ruleName}`]);
  if (res.ok) return res.output.includes(ruleName);

  const out = res.output.toLowerCase();
  if (
    out.includes('no rule') ||
    out.includes('ninguna regla') ||
    out.includes('no hay reglas') ||
    out.includes('aucune règle')
  ) {
    return false;
  }
  return null;
}

async function addRule(
  program: string,
  ruleName: string
): Promise<{ ok: boolean; error?: string }> {
  const winProgram = program.replace(/\//g, '\\');
  await runNetsh(['advfirewall', 'firewall', 'delete', 'rule', `name=${ruleName}`]);
  const added = await runNetsh([
    'advfirewall',
    'firewall',
    'add',
    'rule',
    `name=${ruleName}`,
    'dir=in',
    'action=allow',
    `program=${winProgram}`,
    'enable=yes',
    'profile=any',
  ]);
  return added.ok ? { ok: true } : { ok: false, error: added.output.slice(0, 200) };
}

export interface FirewallGrant {
  ok: boolean;
  cancelled?: boolean;
  error?: string;
}

const pending: Map<string, (result: FirewallGrant) => void> = new Map();

function canAskDesktop(): boolean {
  return typeof process.send === 'function';
}

function askDesktopToAllow(program: string, ruleName: string): Promise<FirewallGrant> {
  return new Promise((resolve) => {
    if (!canAskDesktop()) {
      resolve({ ok: false, error: tr('La app de escritorio no está conectada.') });
      return;
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ ok: false, error: tr('Tiempo de espera agotado esperando la confirmación de Windows.') });
    }, 90000);
    pending.set(id, (result) => {
      clearTimeout(timer);
      pending.delete(id);
      resolve(result);
    });
    try {
      process.send?.({ type: 'firewall-allow', id, program, ruleName });
    } catch {
      clearTimeout(timer);
      pending.delete(id);
      resolve({ ok: false, error: tr('La app de escritorio no está disponible.') });
    }
  });
}

if (typeof process.on === 'function') {
  process.on('message', (raw: unknown) => {
    const msg = raw as { type?: string; id?: string; ok?: boolean; cancelled?: boolean; error?: string } | null;
    if (msg?.type === 'firewall-result' && msg?.id && pending.has(msg.id)) {
      pending.get(msg.id)!({
        ok: Boolean(msg.ok),
        cancelled: Boolean(msg.cancelled),
        error: msg.error,
      });
    }
  });

  process.on('disconnect', () => {
    const failed = { ok: false, error: tr('La app de escritorio se cerró antes de confirmar.') };
    for (const resolve of pending.values()) resolve(failed);
    pending.clear();
  });
}

const grantedThisSession = new Set<string>();

function normalizeProgram(p: string): string {
  return String(p).replace(/\//g, '\\').toLowerCase();
}

function markGranted(program: string): void {
  grantedThisSession.add(normalizeProgram(program));
}

export async function checkFirewallFor(
  program: string,
  ruleName: string = FXSERVER_RULE_NAME
): Promise<
  | { ok: true }
  | { ok: false; needsPermission: true; program: string; ruleName: string; error?: string }
> {
  if (!IS_WIN) return { ok: true };
  if (grantedThisSession.has(normalizeProgram(program))) return { ok: true };

  const exists = await ruleExists(ruleName);
  if (exists) return { ok: true };

  const direct = await addRule(program, ruleName);
  if (direct.ok) {
    markGranted(program);
    return { ok: true };
  }

  return {
    ok: false,
    needsPermission: true,
    program,
    ruleName,
    error: direct.error,
  };
}

export async function allowFirewall(program: string, ruleName: string): Promise<FirewallGrant> {
  const direct = await addRule(program, ruleName);
  if (direct.ok) {
    markGranted(program);
    return { ok: true };
  }
  if (canAskDesktop()) {
    const asked = await askDesktopToAllow(program, ruleName);
    if (asked.ok) {
      markGranted(program);
      return { ok: true };
    }
    return { ok: false, cancelled: asked.cancelled, error: asked.error };
  }
  return { ok: false, error: direct.error };
}

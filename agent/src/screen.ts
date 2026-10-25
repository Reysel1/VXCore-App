import crypto from 'crypto';

export interface ScreenFrame {
  ok: boolean;
  image?: string;
  error?: string;
}

interface Pending {
  resolve: (frame: ScreenFrame) => void;
  timer: NodeJS.Timeout;
}

const FRAME_TIMEOUT_MS = 8000;

const pending = new Map<string, Pending>();

export async function requestFrame(
  source: number,
  sendCommand: (command: string) => Promise<{ success: boolean; message: string }>,
  options: { quality?: number; encoding?: 'jpg' | 'png' | 'webp' } = {}
): Promise<ScreenFrame> {
  const requestId = crypto.randomBytes(8).toString('hex');

  const payload = JSON.stringify({
    source,
    requestId,
    quality: options.quality ?? 0.6,
    encoding: options.encoding ?? 'jpg',
  });

  const waiter = new Promise<ScreenFrame>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      resolve({ ok: false, error: 'TIMEOUT' });
    }, FRAME_TIMEOUT_MS);

    pending.set(requestId, { resolve, timer });
  });

  const sent = await sendCommand(`vxcore_event vxcore:screen ${payload}`);
  if (!sent.success) {
    const entry = pending.get(requestId);
    if (entry) {
      clearTimeout(entry.timer);
      pending.delete(requestId);
    }
    return { ok: false, error: 'NO_CONSOLE' };
  }

  return waiter;
}

export function deliverFrame(requestId: string, frame: ScreenFrame): boolean {
  const entry = pending.get(requestId);
  if (!entry) return false;

  clearTimeout(entry.timer);
  pending.delete(requestId);
  entry.resolve(frame);
  return true;
}

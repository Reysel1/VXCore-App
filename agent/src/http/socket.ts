import type { Server } from 'socket.io';
import { loadDiscordConfig, verifySession, type Session } from '../discord';
import { isExposed } from '../exposure';
import { sectionsForUser } from '../invites';
import { LOG_ROOM } from '../process-manager';
import { currentLevel, refreshRoleLevel } from './auth';

function socketAccess(
  token: unknown
): { ok: true; session: Session | null } | { ok: false; code: string } {
  const config = loadDiscordConfig();
  if (!isExposed() && (!config.requireLogin || !config.owner)) return { ok: true, session: null };

  const session = verifySession(config, typeof token === 'string' ? token : undefined);
  if (!session) {
    return { ok: false, code: config.owner ? 'LOGIN_REQUIRED' : 'REMOTE_ACCESS_NOT_CONFIGURED' };
  }
  void refreshRoleLevel(session);
  if (currentLevel(session) === 'none') return { ok: false, code: 'ACCESS_REVOKED' };
  return { ok: true, session };
}

function canReadConsole(session: Session | null): boolean {
  if (!session) return true;
  const sections = sectionsForUser(session.user.id);
  return !sections || sections.includes('console') || sections.includes('logs');
}

export function setupSocket(io: Server): void {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const access = socketAccess(token);
    if (!access.ok) {
      const error = new Error(access.code) as Error & { data?: unknown };
      error.data = { code: access.code };
      return next(error);
    }
    socket.data.token = token;
    next();
  });

  setInterval(() => {
    for (const socket of io.sockets.sockets.values()) {
      const access = socketAccess(socket.data.token);
      if (!access.ok) {
        socket.disconnect(true);
        continue;
      }
      if (canReadConsole(access.session)) socket.join(LOG_ROOM);
      else socket.leave(LOG_ROOM);
    }
  }, 60_000);

  io.on('connection', (socket) => {
    const access = socketAccess(socket.data.token);
    if (access.ok && canReadConsole(access.session)) socket.join(LOG_ROOM);

    console.log(`[Agent] New dashboard connection: ${socket.id}`);
    socket.on('disconnect', () => {
      console.log(`[Agent] Dashboard disconnected: ${socket.id}`);
    });
  });
}

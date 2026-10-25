import express, { type Router } from 'express';
import { tr } from '../idioma';
import { sessionOf } from './auth';

export function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
}

export function createRouter(): Router {
  return express.Router({ caseSensitive: true });
}

export function rejectUnknownServer(res: express.Response): void {
  res.status(403).json({
    success: false,
    code: 'UNKNOWN_SERVER',
    error: tr('Esa ruta no es la de ningún servidor dado de alta en este panel.'),
  });
}

export function actorOf(req: express.Request): { name: string; id: string | null } {
  const session = sessionOf(req);
  if (session?.user) {
    return { name: session.user.globalName || session.user.username || tr('Staff'), id: session.user.id || null };
  }
  return { name: tr('Dueño (panel local)'), id: null };
}

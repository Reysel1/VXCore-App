import type { NextFunction, Request, Response } from 'express';
import { tr } from '../idioma';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  void _next;
  console.error(`[Agent] Error no capturado en ${req.method} ${req.path}:`, err);
  if (res.headersSent) return;
  res.status(500).json({ success: false, error: tr('Error interno del agente') });
}

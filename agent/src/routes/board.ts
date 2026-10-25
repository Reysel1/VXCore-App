import type { Router } from 'express';
import * as board from '../board';
import { createRouter } from '../http/helpers';
import { tr } from '../idioma';

export function boardRouter(): Router {
  const router = createRouter();

  router.get('/api/board', (req, res) => {
    res.json({ success: true, ...board.getBoard() });
  });

  router.post('/api/board/reset', (req, res) => {
    res.json({ success: true, ...board.resetBoard() });
  });

  router.post('/api/board/columns', (req, res) => {
    const { title, color } = req.body || {};
    res.json({ success: true, ...board.addColumn(String(title || ''), String(color || '')) });
  });

  router.post('/api/board/columns/:id', (req, res) => {
    const { title, color, wip } = req.body || {};
    const patch: Record<string, unknown> = {};
    if (typeof title === 'string') patch.title = title;
    if (typeof color === 'string') patch.color = color;
    if (wip !== undefined) patch.wip = Number(wip) || undefined;
    const store = board.updateColumn(req.params.id, patch);
    if (!store) return res.status(404).json({ success: false, error: tr('Columna no encontrada.') });
    res.json({ success: true, ...store });
  });

  router.delete('/api/board/columns/:id', (req, res) => {
    const store = board.removeColumn(req.params.id);
    if (!store) return res.status(404).json({ success: false, error: tr('Columna no encontrada.') });
    res.json({ success: true, ...store });
  });

  router.post('/api/board/cards', (req, res) => {
    const { title, description, columnId, labels, assigneeIds, changelogRef, dueAt } = req.body || {};
    if (!title || !columnId) {
      return res.status(400).json({ success: false, error: tr('El título y la columna son obligatorios.') });
    }
    res.json({ success: true, ...board.addCard({ title, description, columnId, labels, assigneeIds, changelogRef, dueAt }) });
  });

  router.post('/api/board/cards/:id', (req, res) => {
    const { title, description, labels, assigneeIds, changelogRef, dueAt } = req.body || {};
    const patch: Record<string, unknown> = {};
    if (typeof title === 'string') patch.title = title;
    if (typeof description === 'string') patch.description = description;
    if (Array.isArray(labels)) patch.labels = labels;
    if (Array.isArray(assigneeIds)) patch.assigneeIds = assigneeIds;
    if (changelogRef !== undefined) patch.changelogRef = changelogRef || undefined;
    if (dueAt !== undefined) patch.dueAt = dueAt || undefined;
    const store = board.updateCard(req.params.id, patch);
    if (!store) return res.status(404).json({ success: false, error: tr('Tarjeta no encontrada.') });
    res.json({ success: true, ...store });
  });

  router.post('/api/board/cards/:id/move', (req, res) => {
    const { toColumnId, beforeCardId } = req.body || {};
    const store = board.moveCard(
      req.params.id,
      String(toColumnId || ''),
      typeof beforeCardId === 'string' && beforeCardId ? beforeCardId : undefined
    );
    if (!store) return res.status(404).json({ success: false, error: tr('Tarjeta o columna no encontrada.') });
    res.json({ success: true, ...store });
  });

  router.delete('/api/board/cards/:id', (req, res) => {
    const store = board.removeCard(req.params.id);
    if (!store) return res.status(404).json({ success: false, error: tr('Tarjeta no encontrada.') });
    res.json({ success: true, ...store });
  });

  return router;
}

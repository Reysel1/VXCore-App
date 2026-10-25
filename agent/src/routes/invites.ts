import type { Request, Response, Router } from 'express';
import { loadDiscordConfig, publicBaseUrl } from '../discord';
import { sessionOf } from '../http/auth';
import { createRouter, errMsg } from '../http/helpers';
import { tr } from '../idioma';
import {
  createInvite,
  deleteInvite,
  listInvites,
  listMembers as listInvitedMembers,
  removeMember as removeInvitedMember,
} from '../invites';

function requireOwner(req: Request, res: Response): boolean {
  const session = sessionOf(req);
  if (session && session.level !== 'owner') {
    res.status(403).json({ success: false, error: tr('Sólo el dueño puede repartir accesos.') });
    return false;
  }
  return true;
}

export function invitesRouter(): Router {
  const router = createRouter();

  router.get('/api/invites', (req, res) => {
    if (!requireOwner(req, res)) return;
    res.json({ success: true, invites: listInvites(), members: listInvitedMembers() });
  });

  router.post('/api/invites', (req, res) => {
    if (!requireOwner(req, res)) return;

    try {
      const { level, label, expiresInDays, expiresInHours, maxUses, sections, welcome } = req.body || {};
      if (level !== 'admin' && level !== 'moderator') {
        return res.status(400).json({
          success: false,
          error: tr('El nivel tiene que ser «admin» o «moderator».'),
        });
      }

      const { invite, token } = createInvite({
        level, label, expiresInDays, expiresInHours, maxUses, sections, welcome,
      });
      const base = publicBaseUrl(loadDiscordConfig()).replace(/\/+$/, '');

      res.json({
        success: true,
        invite,
        url: `${base}/acceso?invitacion=${encodeURIComponent(token)}`,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.delete('/api/invites/:id', (req, res) => {
    if (!requireOwner(req, res)) return;
    const removed = deleteInvite(req.params.id);
    res.status(removed ? 200 : 404).json({ success: removed });
  });

  router.delete('/api/invites/members/:userId', (req, res) => {
    if (!requireOwner(req, res)) return;
    const removed = removeInvitedMember(req.params.userId);
    res.status(removed ? 200 : 404).json({ success: removed });
  });

  return router;
}

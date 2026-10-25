import type { Router } from 'express';
import { fetchMemberRoles, loadDiscordConfig } from '../discord';
import { createRouter } from '../http/helpers';
import { tr } from '../idioma';
import { memberRolesCached, normalizeDiscordId, resolveInGameAccess } from '../ingame-access';
import { levelForUser as invitedLevel, sectionsForUser } from '../invites';
import * as staff from '../staff';

export function staffRouter(): Router {
  const router = createRouter();

  router.post('/api/staff/in-game-access', async (req, res) => {
    const config = loadDiscordConfig();
    const discordId = normalizeDiscordId(req.body?.discord);

    let roleIds: string[] | null = null;
    if (discordId && config.owner?.id !== discordId && config.botToken && config.guildId) {
      roleIds = await memberRolesCached(discordId, () => fetchMemberRoles(config, discordId));
    }

    const access = resolveInGameAccess({
      config,
      discordId,
      roleIds,
      invitedLevel: discordId ? invitedLevel(discordId) : null,
      invitedSections: discordId ? sectionsForUser(discordId) : null,
    });

    res.json({ success: true, ...access });
  });

  router.get('/api/staff', (req, res) => {
    res.json({ success: true, members: staff.listMembers() });
  });

  router.post('/api/staff', (req, res) => {
    const { name, role, discord, avatarColor, github: ghUser, joinedAt, active } = req.body || {};
    if (!name || !role) {
      return res.status(400).json({ success: false, error: tr('El nombre y el rol son obligatorios.') });
    }
    const member = staff.upsertMember({ name, role, discord, avatarColor, github: ghUser, joinedAt, active });
    res.json({ success: true, member });
  });

  router.post('/api/staff/reorder', (req, res) => {
    const { id, direction } = req.body || {};
    const ok = staff.reorderMember(String(id || ''), direction === 'down' ? 1 : -1);
    if (!ok) return res.status(404).json({ success: false, error: tr('Colaborador no encontrado o en el extremo.') });
    res.json({ success: true, members: staff.listMembers() });
  });

  router.delete('/api/staff/:id', (req, res) => {
    if (!staff.removeMember(req.params.id)) {
      return res.status(404).json({ success: false, error: tr('Colaborador no encontrado.') });
    }
    res.json({ success: true, members: staff.listMembers() });
  });

  return router;
}

import type { Router } from 'express';
import { consoleText } from '../console-text';
import { DbService } from '../db-service';
import type { AgentContext } from '../http/context';
import { actorOf, createRouter, errMsg } from '../http/helpers';
import { tr } from '../idioma';
import {
  activeBanFor,
  addSanction,
  banMessage,
  countsFor,
  deleteSanction,
  hasAnyIdentifier,
  historyFor,
  identityFromFields,
  listSanctions,
  revokeSanction,
  type PlayerIdentity,
  type SanctionType,
} from '../sanctions';
import { activeDbConfig } from '../server-registry';

function identityFrom(body: Record<string, unknown>): PlayerIdentity {
  const raw = (body.identity && typeof body.identity === 'object' ? body.identity : body) as Record<string, unknown>;
  return identityFromFields(raw, raw.tokens);
}

export function sanctionsRouter(ctx: AgentContext): Router {
  const { processManager, game } = ctx;
  const router = createRouter();

  router.get('/api/sanctions', (req, res) => {
    try {
      const type = String(req.query.type || '');
      res.json({
        success: true,
        sanctions: listSanctions({
          type: type === 'ban' || type === 'warn' || type === 'kick' ? (type as SanctionType) : undefined,
          activeOnly: req.query.active === '1',
        }),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.post('/api/sanctions/history', (req, res) => {
    try {
      res.json({ success: true, sanctions: historyFor(identityFrom(req.body || {})) });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.post('/api/sanctions/players', async (req, res) => {
    const bare = (value?: string): string | undefined => {
      const text = String(value || '').trim();
      if (!text) return undefined;
      const match = text.match(/^[a-z0-9]+:(.+)$/i);
      return match ? match[1] : text;
    };

    interface SanctionTarget {
      key: string;
      id: string | number;
      name: string;
      citizenid: string;
      license: string;
      discord: string;
      job: string;
      identity: PlayerIdentity;
      sanctions?: { bans: number; warns: number; kicks: number };
      isOnline: boolean;
      source: 'live' | 'database';
    }

    try {
      const online: SanctionTarget[] = game.players.map((p) => ({
        key: `online-${p.id}`,
        id: p.id,
        name: p.name || tr('Jugador'),
        citizenid: p.citizenid || '',
        license: p.license || '',
        discord: p.discord || '',
        job: p.job || '',
        identity: (p.identity as PlayerIdentity) || {},
        sanctions: p.sanctions as SanctionTarget['sanctions'],
        isOnline: true,
        source: 'live',
      }));

      const seen = new Set(online.map((p) => bare(p.license)).filter(Boolean));

      let framework = tr('Desconocido');
      const fromDb: SanctionTarget[] = [];

      const dbConfig = activeDbConfig(processManager);
      if (dbConfig) {
        const result = await DbService.getPlayersFromDb(dbConfig);
        if (result.success) {
          framework = result.framework || framework;
          for (const row of result.players) {
            const license = bare(row.license);
            if (license && seen.has(license)) continue;

            const identity: PlayerIdentity = {
              license,
              discord: bare(row.discord),
              tokens: [],
            };

            fromDb.push({
              key: `db-${row.citizenid || row.id}`,
              id: row.id ?? '',
              name: row.name || row.citizenid || 'Personaje',
              citizenid: row.citizenid || '',
              license: license || '',
              discord: identity.discord || '',
              job: row.job || '',
              identity,
              sanctions: countsFor(identity),
              isOnline: false,
              source: 'database' as const,
            });
          }
        }
      }

      res.json({ success: true, framework, players: [...online, ...fromDb] });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.post('/api/sanctions', (req, res) => {
    try {
      const { type, playerName, reason, durationMinutes } = req.body || {};
      if (type !== 'ban' && type !== 'warn' && type !== 'kick') {
        return res.status(400).json({ success: false, error: tr('Tipo de sanción no válido.') });
      }

      const identity = identityFrom(req.body || {});
      if (!hasAnyIdentifier(identity)) {
        return res.status(400).json({
          success: false,
          error: tr('Ese jugador no tiene ningún identificador guardado, así que la sanción no podría aplicarse.'),
        });
      }

      const actor = actorOf(req);
      const sanction = addSanction({
        type,
        playerName: String(playerName || tr('Desconocido')),
        identity,
        reason: String(reason || ''),
        byName: actor.name,
        byUserId: actor.id,
        durationMinutes: Number(durationMinutes) || 0,
      });

      if (type === 'ban' || type === 'kick') {
        const online = game.players.find(
          (p) => p.license && identity.license && p.license === identity.license
        );
        if (online) {
          const text = consoleText(type === 'ban' ? banMessage(sanction) : tr('Expulsado: {reason}', { reason: sanction.reason }));
          processManager.executeCommand(
            `vxcore_event vxcore:drop ${JSON.stringify({ source: online.id, message: text })}`
          );
        }
      }

      res.json({ success: true, sanction });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.post('/api/sanctions/in-game', (req, res) => {
    try {
      const { type, playerName, reason, durationMinutes, byName } = req.body || {};
      const kind = type === 'warn' || type === 'kick' ? type : 'ban';

      const identity = identityFrom(req.body || {});
      if (!hasAnyIdentifier(identity)) {
        return res.status(400).json({
          success: false,
          error: tr('Ese jugador no tiene ningún identificador, así que la sanción no podría aplicarse.'),
        });
      }

      const online = game.players.find((p) => {
        const live = p.identity as PlayerIdentity | undefined;
        if (!live) return false;
        return Boolean(
          (identity.license && live.license === identity.license) ||
            (identity.license2 && live.license2 === identity.license2) ||
            (identity.fivem && live.fivem === identity.fivem)
        );
      });
      if (!online) {
        return res.status(404).json({
          success: false,
          code: 'PLAYER_NOT_ONLINE',
          error: tr('Ese jugador no aparece conectado en la telemetría del servidor.'),
        });
      }

      const sanction = addSanction({
        type: kind,
        playerName: String(playerName || tr('Desconocido')),
        identity,
        reason: String(reason || ''),
        byName: String(byName || tr('Staff (in-game)')),
        durationMinutes: Number(durationMinutes) || 0,
      });

      res.json({
        success: true,
        sanction,
        message: kind === 'ban' ? banMessage(sanction) : tr('Expulsado: {reason}', { reason: sanction.reason }),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.post('/api/sanctions/:id/revoke', (req, res) => {
    try {
      const actor = actorOf(req);
      const sanction = revokeSanction(String(req.params.id), actor.name, String(req.body?.reason || ''));
      if (!sanction) return res.status(404).json({ success: false, error: tr('No existe esa sanción.') });
      res.json({ success: true, sanction });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.delete('/api/sanctions/:id', (req, res) => {
    try {
      if (!deleteSanction(String(req.params.id))) {
        return res.status(404).json({ success: false, error: tr('No existe esa sanción.') });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.post('/api/sanctions/check', (req, res) => {
    try {
      const ban = activeBanFor(identityFrom(req.body || {}));
      if (!ban) return res.json({ success: true, banned: false });
      res.json({
        success: true,
        banned: true,
        message: banMessage(ban),
        sanctionId: ban.id,
        expiresAt: ban.expiresAt,
      });
    } catch (error) {
      console.error('[Sanctions] Fallo comprobando el ban:', error);
      res.json({ success: true, banned: false });
    }
  });

  return router;
}

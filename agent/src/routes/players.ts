import type { Response, Router } from 'express';
import { DbService, type DbPlayer } from '../db-service';
import type { LivePlayer } from '../game-state';
import type { AgentContext } from '../http/context';
import { createRouter, errMsg } from '../http/helpers';
import { tr } from '../idioma';
import { inGameResourceState } from '../ingame-resource';
import { deliverFrame, requestFrame } from '../screen';
import { activeDbConfig, getRegisteredServers } from '../server-registry';

interface FiveMPlayer {
  id: string | number;
  name: string;
  ping?: number;
  identifiers?: string[];
  [key: string]: unknown;
}

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1'];

function normalizeHost(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
}

function knownGameHosts(): Set<string> {
  const hosts = new Set(LOOPBACK_HOSTS);
  for (const server of getRegisteredServers()) {
    if (typeof server.ip === 'string') hosts.add(normalizeHost(server.ip.replace(/:\d+$/, '')));
  }
  return hosts;
}

function rejectUnknownTarget(res: Response): void {
  res.status(403).json({
    success: false,
    code: 'UNKNOWN_TARGET',
    error: tr('Ese host no pertenece a ningún servidor dado de alta en este panel.'),
  });
}

export function playersRouter(ctx: AgentContext): Router {
  const { processManager, game, getActiveServer } = ctx;
  const router = createRouter();

  router.post('/api/server/live-players', async (req, res) => {
    try {
      const { ip, port } = req.body || {};
      const dbConfig = activeDbConfig(processManager);
      const targetHost = String(ip || '127.0.0.1').replace(/:\d+$/, '');
      const targetPort = Number(port || (String(ip || '').includes(':') ? String(ip).split(':')[1] : 30120));
      if (
        !knownGameHosts().has(normalizeHost(targetHost)) ||
        !Number.isInteger(targetPort) ||
        targetPort < 1 ||
        targetPort > 65535
      ) {
        return rejectUnknownTarget(res);
      }

      let livePlayers: LivePlayer[] = [];
      let isLiveFiveMOnline = false;

      const heartbeatAge = game.heartbeatAgeMs() ?? Infinity;
      if (game.players.length > 0 && heartbeatAge < 12000) {
        isLiveFiveMOnline = true;
        livePlayers = game.players.map((p) => ({ ...p }));
      }

      if (livePlayers.length === 0) {
        try {
          const url = `http://${targetHost}:${targetPort}/players.json`;
          const response = await fetch(url, { signal: AbortSignal.timeout(1800) });
          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
              const anonymized = data.every((p: FiveMPlayer) => !p.id || p.id === 0);
              if (!anonymized) {
                isLiveFiveMOnline = true;
                livePlayers = data.map((p: FiveMPlayer) => ({
                  id: p.id,
                  name: p.name,
                  ping: p.ping ?? 0,
                  identifiers: p.identifiers || [],
                  license: (p.identifiers || []).find((id: string) => id.startsWith('license:')) || '',
                  discord: (p.identifiers || []).find((id: string) => id.startsWith('discord:')) || '',
                  ip: (p.identifiers || []).find((id: string) => id.startsWith('ip:'))?.replace('ip:', '') || '127.0.0.1',
                  isOnline: true,
                  job: 'In-Game',
                  jobGrade: 'Online',
                  gang: tr('Ninguna'),
                  cash: 0,
                  bank: 0,
                  health: 100,
                  armor: 0,
                  citizenid: `LIVE-${p.id}`,
                  coords: { x: 0, y: 0, z: 0 },
                }));
              }
            }
          }
        } catch {}
      }

      let dbPlayers: DbPlayer[] = [];
      let framework = tr('Desconocido');
      if (dbConfig) {
        const dbResult = await DbService.getPlayersFromDb(dbConfig);
        if (dbResult.success && dbResult.players.length > 0) {
          dbPlayers = dbResult.players;
          framework = dbResult.framework || 'QBCore';
        }
      }

      if (livePlayers.length > 0) {
        livePlayers = livePlayers.map((lp) => {
          const matched = dbPlayers.find((dp) => dp.license === lp.license || dp.citizenid === lp.citizenid);
          if (matched) {
            return {
              ...matched,
              id: lp.id,
              name: lp.name || matched.name,
              ping: lp.ping,
              isOnline: true,
            };
          }
          return lp;
        });

        return res.json({
          success: true,
          source: 'live_fivem',
          onlineCount: livePlayers.length,
          isServerReachable: true,
          players: livePlayers,
          framework,
        });
      }

      const active = getActiveServer();
      return res.json({
        success: true,
        source: dbPlayers.length > 0 ? 'database' : 'none',
        onlineCount: 0,
        isServerReachable: isLiveFiveMOnline,
        players: dbPlayers,
        framework,
        connecting: game.connectingList(),
        vxcore: inGameResourceState(game, active?.serverDataPath, active?.cfgPath),
      });
    } catch (error) {
      res.status(500).json({ error: tr('Error obteniendo jugadores'), details: errMsg(error) });
    }
  });

  router.post('/api/server/moderation/give-money', async (req, res) => {
    try {
      const { playerId, citizenid, type, amount } = req.body || {};
      const dbConfig = activeDbConfig(processManager);
      const moneyType = type === 'cash' ? 'cash' : 'bank';
      const moneyVal = Number(amount) || 0;
      const target = String(playerId ?? citizenid ?? '').trim();
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(target) || !Number.isFinite(moneyVal) || moneyVal < 0) {
        return res.status(400).json({ success: false, error: tr('Jugador o cantidad no válidos.') });
      }

      processManager.executeCommand(`givemoney ${target} ${moneyType} ${moneyVal}`);

      if (dbConfig && citizenid) {
        try {
          await DbService.addPlayerMoney(dbConfig, citizenid, moneyType, moneyVal);
        } catch {}
      }

      res.json({ success: true, message: tr('Se añadieron ${moneyVal} ({moneyType}) a {valor}', { moneyVal: moneyVal.toLocaleString(), moneyType, valor: citizenid || playerId }) });
    } catch (error) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  router.get('/api/server/screen/:source', async (req, res) => {
    const source = Number(req.params.source);
    if (!Number.isInteger(source) || source <= 0) {
      return res.status(400).json({ success: false, error: tr('Id de jugador no válido.') });
    }

    const quality = Number(req.query.quality);
    const frame = await requestFrame(
      source,
      async (command) => processManager.executeCommand(command),
      { quality: Number.isFinite(quality) ? Math.min(Math.max(quality, 0.1), 1) : undefined }
    );

    if (frame.ok) {
      return res.json({ success: true, image: frame.image });
    }

    const REASONS: Record<string, { status: number; error: string }> = {
      NO_CONSOLE: {
        status: 409,
        error: tr('No hay consola: el servidor tiene que estar arrancado desde VXCore para poder pedirle la pantalla.'),
      },
      SCREENSHOT_BASIC_MISSING: {
        status: 409,
        error: tr('Falta el recurso screenshot-basic en el servidor. Se instala desde el Marketplace.'),
      },
      PLAYER_GONE: { status: 404, error: tr('Ese jugador ya no está conectado.') },
      CAPTURE_FAILED: { status: 502, error: tr('El cliente no pudo capturar la pantalla.') },
      TIMEOUT: { status: 504, error: tr('El jugador no respondió a tiempo.') },
    };

    const reason = REASONS[frame.error || ''] ?? { status: 502, error: tr('No se pudo obtener la pantalla.') };
    res.status(reason.status).json({ success: false, code: frame.error, error: reason.error });
  });

  router.post('/api/server/screen-frame', (req, res) => {
    const { requestId, ok, image, error } = req.body || {};
    if (typeof requestId !== 'string') {
      return res.status(400).json({ success: false, error: tr('Falta requestId.') });
    }

    const delivered = deliverFrame(requestId, {
      ok: Boolean(ok),
      image: typeof image === 'string' ? image : undefined,
      error: typeof error === 'string' ? error : undefined,
    });

    if (!delivered) {
      return res.status(404).json({ success: false, error: tr('Nadie esperaba ese fotograma.') });
    }
    res.json({ success: true });
  });

  return router;
}

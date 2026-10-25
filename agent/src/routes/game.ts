import type { Router } from 'express';
import type { AgentContext } from '../http/context';
import { createRouter, errMsg } from '../http/helpers';
import { tr } from '../idioma';
import { countsFor, identityFromFields, listSanctions } from '../sanctions';

export function gameRouter(ctx: AgentContext): Router {
  const { io, sysMon, game } = ctx;
  const router = createRouter();

  router.post('/api/server/connecting', (req, res) => {
    try {
      const { event, name, key } = req.body || {};
      if (event === 'start' && typeof name === 'string' && name.trim()) {
        game.connecting.set(String(key || name), {
          name: name.trim(),
          since: new Date().toISOString(),
        });
      } else if (event === 'end') {
        game.connecting.delete(String(key || name || ''));
        if (typeof name === 'string' && name.trim()) game.connecting.delete(name.trim());
      }
      io.emit('connecting-players', game.connectingList());
      res.json({ success: true });
    } catch {
      res.status(400).json({ success: false });
    }
  });

  router.get('/api/server/connecting', (_req, res) => {
    res.json({ success: true, connecting: game.connectingList() });
  });

  router.post('/api/server/telemetry', (req, res) => {
    try {
      const { players, maxClients, resources, playersList } = req.body;
      game.telemetry = {
        players: players ?? 0,
        maxClients: maxClients ?? 64,
        resources: resources ?? 0,
        lastHeartbeat: new Date().toISOString(),
      };
      if (Array.isArray(playersList)) {
        game.players = playersList
          .filter((p: Record<string, unknown>) => {
            const src = Number(p.source ?? p.id);
            return Number.isInteger(src) && src > 0;
          })
          .slice(0, 1024)
          .map((p: Record<string, unknown>) => {
            const raw = (p.identifiers && typeof p.identifiers === 'object' ? p.identifiers : {}) as Record<string, unknown>;
            const identity = identityFromFields(raw, p.tokens);

            return {
            id: Number(p.source ?? p.id) as number,
            name: String(p.name ?? tr('Jugador')),
            ping: Number(p.ping) || 0,
            license: identity.license ?? '',
            discord: identity.discord ?? '',
            ip: identity.ip ?? '127.0.0.1',
            identity,
            sanctions: countsFor(identity),
            isOnline: true,
            job: 'In-Game',
            jobGrade: 'Online',
            gang: tr('Ninguna'),
            cash: 0,
            bank: 0,
            health: 100,
            armor: 0,
            citizenid: `LIVE-${Number(p.source ?? p.id)}`,
            coords: { x: 0, y: 0, z: 0 },
            };
          });
      }
      io.emit('game-telemetry', game.telemetry);
      res.json({ success: true, received: game.telemetry });
    } catch (error) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  router.get('/api/server/ingame-summary', async (req, res) => {
    try {
      const system = await sysMon.getTelemetry();
      const age = game.heartbeatAgeMs();
      const bans = listSanctions({ type: 'ban', activeOnly: true }).length;

      res.json({
        success: true,
        juego: {
          jugadores: game.telemetry.players,
          maximo: game.telemetry.maxClients,
          recursos: game.telemetry.resources,
          latido: age === null ? null : Math.floor(age / 1000),
          obsoleto: age === null || age > 20_000,
        },
        maquina: system
          ? {
              cpu: system.cpu.load,
              nucleos: system.cpu.cores,
              memoria: system.memory.usedPercent,
              memoriaGb: Math.round((system.memory.used / 1024 ** 3) * 10) / 10,
              memoriaTotalGb: Math.round((system.memory.total / 1024 ** 3) * 10) / 10,
              encendida: Math.floor(system.uptime),
            }
          : null,
        sanciones: { activas: bans },
        version: process.env.VX_APP_VERSION || 'dev',
      });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.get('/api/server/online', (req, res) => {
    const age = game.heartbeatAgeMs();
    res.json({
      success: true,
      players: game.players.map((p) => ({
        id: p.id,
        name: p.name,
        ping: p.ping,
      })),
      connecting: game.connectingList(),
      maxClients: game.telemetry.maxClients,
      stale: age === null || age > 12000,
    });
  });

  return router;
}

import path from 'path';
import type { CfxAddress } from './cfx-address';
import { fetchPlayerCount, type ServerSnapshot } from './discord-status';
import { getOpen77Players, probeOpen77 } from './open77';
import { probeFxServer, type ProcessManager } from './process-manager';
import type { RegisteredServer } from './server-registry';

export async function livenessFor(processManager: ProcessManager, server: RegisteredServer) {
  const running = processManager.getRunningServer();
  const managed = !!(
    running &&
    server.cfgPath &&
    path.resolve(running.cfgPath) === path.resolve(server.cfgPath)
  );

  if (server.game === 'open77' && server.cfgPath) {
    const probe = await probeOpen77(server.cfgPath);
    let players: number | undefined;
    if (probe.reachable) {
      try {
        players = (await getOpen77Players(server.cfgPath)).length;
      } catch {}
    }
    return {
      managed,
      reachable: probe.reachable,
      online: managed || probe.reachable,
      source: managed ? 'managed' : probe.reachable ? 'external' : 'offline',
      uptime: managed ? processManager.getUptime() : null,
      hostname: typeof server.name === 'string' ? server.name : undefined,
      players,
    };
  }

  const probe = await probeFxServer(server.ip, server.port);
  return {
    managed,
    reachable: probe.reachable,
    online: managed || probe.reachable,
    source: managed ? 'managed' : probe.reachable ? 'external' : 'offline',
    uptime: managed ? processManager.getUptime() : null,
    hostname: probe.hostname,
  };
}

export async function statusSnapshot(
  processManager: ProcessManager,
  cfxAddress: CfxAddress,
  target: RegisteredServer
): Promise<ServerSnapshot> {
  const liveness = await livenessFor(processManager, target);
  const players = liveness.online ? await fetchPlayerCount(target.ip, target.port) : 0;

  return {
    name: target.name || 'Servidor FiveM',
    online: liveness.online,
    managed: liveness.managed,
    players,
    maxPlayers: target.maxClients || 64,
    uptime: liveness.uptime,
    address: cfxAddress.shareable(target.ip) ?? undefined,
  };
}

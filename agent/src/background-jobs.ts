import { loadDiscordConfig } from './discord';
import { publishStatus, updatePresence } from './discord-status';
import type { AgentContext } from './http/context';
import { errMsg } from './http/helpers';
import { statusSnapshot } from './server-status';

export function startBackgroundJobs(ctx: AgentContext): void {
  const { io, sysMon, processManager, automationEngine, cfxAddress, getActiveServer } = ctx;

  automationEngine.start();

  let lastStatusError = '';

  setInterval(async () => {
    const config = loadDiscordConfig();
    if (!config.botToken || (!config.statusChannelId && !config.presenceEnabled)) return;

    try {
      const target = getActiveServer();
      if (!target) return;

      const snapshot = await statusSnapshot(processManager, cfxAddress, target);

      updatePresence(snapshot);
      if (config.statusChannelId) await publishStatus(snapshot);

      lastStatusError = '';
    } catch (error) {
      const message = errMsg(error);
      if (message !== lastStatusError) {
        console.error('[Discord] No se pudo publicar el estado:', message);
        lastStatusError = message;
      }
    }
  }, 60_000);

  setInterval(async () => {
    const telemetry = await sysMon.getTelemetry();
    io.emit('telemetry', telemetry);
    automationEngine.updateTelemetry(telemetry);
  }, 2000);
}

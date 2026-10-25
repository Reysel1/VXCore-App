import si from 'systeminformation';
import os from 'os';

export interface ProcessUsage {
  cpu: number;
  memoryBytes: number;
  memoryPercent: number;
  pids: number[];
}

export class SysMon {
  async getTelemetry() {
    try {
      const cpu = await si.currentLoad();
      const mem = await si.mem();

      return {
        cpu: {
          load: parseFloat(cpu.currentLoad.toFixed(1)),
          cores: os.cpus().length
        },
        memory: {
          total: mem.total,
          free: mem.free,
          used: mem.active,
          usedPercent: parseFloat(((mem.active / mem.total) * 100).toFixed(1))
        },
        uptime: os.uptime(),
      };
    } catch (e) {
      console.error('[SysMon] Error fetching telemetry', e);
      return null;
    }
  }

  private usageCache: { at: number; value: ProcessUsage | null } | null = null;

  async getFxServerUsage(): Promise<ProcessUsage | null> {
    if (this.usageCache && Date.now() - this.usageCache.at < 4000) {
      return this.usageCache.value;
    }

    let value: ProcessUsage | null = null;
    try {
      const [load, mem] = await Promise.all([si.processLoad('FXServer'), si.mem()]);
      const matches = load.filter((entry) => entry.pid > 0 || (entry.pids?.length ?? 0) > 0);

      if (matches.length > 0) {
        const cpu = matches.reduce((sum, entry) => sum + (entry.cpu || 0), 0);
        const memoryPercent = matches.reduce((sum, entry) => sum + (entry.mem || 0), 0);
        const pids = matches.flatMap((entry) => entry.pids?.length ? entry.pids : [entry.pid]);

        value = {
          cpu: parseFloat(cpu.toFixed(1)),
          memoryBytes: Math.round((memoryPercent / 100) * mem.total),
          memoryPercent: parseFloat(memoryPercent.toFixed(1)),
          pids: pids.filter((pid) => pid > 0),
        };
      }
    } catch (e) {
      console.error('[SysMon] No se pudo medir el consumo de FXServer', e);
    }

    this.usageCache = { at: Date.now(), value };
    return value;
  }
}

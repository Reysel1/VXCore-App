import type { Server } from 'socket.io';
import { AutomationEngine } from '../automations';
import { CfxAddress } from '../cfx-address';
import { GameState } from '../game-state';
import { LogStore } from '../log-store';
import { ProcessManager } from '../process-manager';
import { getActiveServer, type RegisteredServer } from '../server-registry';
import { SysMon } from '../sysmon';

export interface AgentContext {
  io: Server;
  sysMon: SysMon;
  processManager: ProcessManager;
  logStore: LogStore;
  cfxAddress: CfxAddress;
  automationEngine: AutomationEngine;
  game: GameState;
  getActiveServer: () => RegisteredServer | null;
}

export function createContext(io: Server): AgentContext {
  const sysMon = new SysMon();

  const processManager = new ProcessManager(io);

  const logStore = new LogStore();

  const cfxAddress = new CfxAddress();

  processManager.onLog((line, stream) => {
    logStore.add(line, stream);
    cfxAddress.observe(line);
  });

  processManager.onSessionStart((label) => {
    logStore.startSession(label);
    cfxAddress.reset();
  });

  const activeServer = () => getActiveServer(processManager);

  const automationEngine = new AutomationEngine(io, processManager, () => {
    const target = activeServer();
    return {
      serverDataPath: target?.serverDataPath,
      cfgPath: target?.cfgPath,
      name: target?.name,
      ip: target?.ip,
      port: target?.port,
    };
  });

  return {
    io,
    sysMon,
    processManager,
    logStore,
    cfxAddress,
    automationEngine,
    game: new GameState(),
    getActiveServer: activeServer,
  };
}

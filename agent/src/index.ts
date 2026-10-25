import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { config } from 'dotenv';
import { startBackgroundJobs } from './background-jobs';
import { isLoopbackHostname as isLoopback } from './exposure';
import { authGuard, roleGuard } from './http/auth';
import { createContext } from './http/context';
import { errorHandler } from './http/error-handler';
import { serverPathGuard } from './http/path-params';
import {
  corsOptions,
  extraAllowedOrigins,
  gameRouteGuard,
  hostGuard,
  originGuard,
  setupRouteGuard,
  socketServerOptions,
} from './http/security';
import { setupSocket } from './http/socket';
import { syncInGameResources } from './ingame-resource';
import { aiRouter } from './routes/ai';
import { authRouter } from './routes/auth';
import { automationsRouter } from './routes/automations';
import { boardRouter } from './routes/board';
import { brandingRouter } from './routes/branding';
import { cfgRouter } from './routes/cfg';
import { consoleRouter } from './routes/console';
import { databaseRouter } from './routes/database';
import { diagnosticsRouter } from './routes/diagnostics';
import { discordRouter } from './routes/discord';
import { editorRouter } from './routes/editor';
import { eventsRouter } from './routes/events';
import { gameRouter } from './routes/game';
import { githubRouter } from './routes/github';
import { ingameRouter } from './routes/ingame';
import { invitesRouter } from './routes/invites';
import { logsRouter } from './routes/logs';
import { marketplaceRouter } from './routes/marketplace';
import { open77Router } from './routes/open77';
import { pathsRouter } from './routes/paths';
import { playersRouter } from './routes/players';
import { powerRouter } from './routes/power';
import { principalsRouter } from './routes/principals';
import { provisionRouter } from './routes/provision';
import { resourcesRouter } from './routes/resources';
import { sanctionsRouter } from './routes/sanctions';
import { serversRouter } from './routes/servers';
import { staffRouter } from './routes/staff';
import { systemRouter } from './routes/system';
import { tunnelRouter } from './routes/tunnel';
import { updatesRouter } from './routes/updates';
import { findServerCfgPaths } from './server-registry';
import { startTunnel } from './tunnel';

config();

const app = express();
app.disable('x-powered-by');
app.set('case sensitive routing', true);
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(originGuard);
app.use(hostGuard);

const httpServer = createServer(app);
const io = new Server(httpServer, socketServerOptions);

const ctx = createContext(io);
const { processManager, automationEngine } = ctx;

startBackgroundJobs(ctx);

app.use(gameRouteGuard(process.env.FIVEOS_GAME_KEY?.trim() || ''));
app.use(setupRouteGuard);
app.use(authGuard);
app.use(roleGuard);

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Agent] Recibido ${signal}, cerrando...`);

  io.close();
  httpServer.close();
  httpServer.closeAllConnections?.();

  if (processManager.isRunning()) {
    console.log('[Agent] Deteniendo el FXServer gestionado antes de salir...');
    processManager.stopServer();
  }

  automationEngine.stop();
  setTimeout(() => process.exit(0), 5000);
};

app.use(brandingRouter());
app.use(serverPathGuard);
app.use(systemRouter(ctx, shutdown));
app.use(tunnelRouter());
app.use(serversRouter(ctx));
app.use(provisionRouter(ctx));
app.use(open77Router());
app.use(cfgRouter(ctx));
app.use(principalsRouter(ctx));
app.use(pathsRouter());
app.use(gameRouter(ctx));
app.use(ingameRouter(ctx));
app.use(diagnosticsRouter(ctx));
app.use(sanctionsRouter(ctx));
app.use(staffRouter());
app.use(databaseRouter());
app.use(playersRouter(ctx));
app.use(resourcesRouter(ctx));
app.use(authRouter());
app.use(discordRouter(ctx));
app.use(aiRouter());
app.use(editorRouter());
app.use(logsRouter(ctx));
app.use(automationsRouter(ctx));
app.use(marketplaceRouter());
app.use(powerRouter(ctx));
app.use(consoleRouter(ctx));
app.use(eventsRouter(ctx));
app.use(githubRouter());
app.use(invitesRouter());
app.use(boardRouter());
app.use(updatesRouter());

setupSocket(io);

app.use(errorHandler);

process.on('unhandledRejection', (reason) => {
  console.error('[Agent] Promesa rechazada sin capturar:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Agent] Excepción no capturada:', err);
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

const PORT = Number(process.env.PORT) || 4000;

const HOST = process.env.HOST || '127.0.0.1';

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[FiveOS Agent] El puerto ${PORT} ya está en uso: probablemente ya hay un Agente FiveOS ejecutándose. ` +
        'Cierra el otro antes de arrancar este.'
    );
    process.exit(1);
  }
  console.error('[FiveOS Agent] Error del servidor HTTP:', err);
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[FiveOS Agent] Running on http://${HOST}:${PORT}`);

  startTunnel();

  syncInGameResources(processManager);

  console.log(`[FiveOS Agent] WebSocket Server is ready`);

  if (!isLoopback(HOST) && extraAllowedOrigins().length === 0) {
    console.warn(
      `[FiveOS Agent] HOST=${HOST} publica el agente fuera de esta máquina, pero no hay ` +
        `orígenes permitidos. El panel será rechazado con ORIGIN_NOT_ALLOWED: define ` +
        `FIVEOS_PUBLIC_URL (o FIVEOS_ALLOWED_ORIGINS) con la dirección desde la que se abre.`
    );
  }

  if (HOST === '127.0.0.1') {
    try {
      const ipv6Server = createServer(app);
      ipv6Server.on('error', () => {});
      ipv6Server.listen(PORT, '::1', () => {
        console.log(`[FiveOS Agent] IPv6 loopback ready on http://[::1]:${PORT}`);
      });
    } catch {}
  }

  const detected = findServerCfgPaths();
  if (detected.length > 0) {
    console.log(`[FiveOS Agent] Detected ${detected.length} server.cfg file(s):`);
    detected.forEach((d) => console.log(`  → ${d.cfgPath}`));
  } else {
    console.log(`[FiveOS Agent] No server.cfg detected. Servers can be added manually from the dashboard.`);
  }
});

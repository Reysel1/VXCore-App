import type { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { groupName, parseDirectives } from '../cfg-resources';
import { DbService } from '../db-service';
import { scanResourcesOnDisk } from '../disk-resources';
import type { AgentContext } from '../http/context';
import { createRouter } from '../http/helpers';
import { tr } from '../idioma';
import { inGameResourceState } from '../ingame-resource';
import { samePath } from '../path-guards';
import { listKnownServers, serverDbConfig } from '../server-registry';

export function diagnosticsRouter(ctx: AgentContext): Router {
  const { processManager, game, getActiveServer } = ctx;
  const router = createRouter();

  router.get('/api/server/diagnostics', async (req, res) => {
    const { ip, port, cfgPath, serverDataPath } = req.query as Record<string, string>;
    const diagnosed = cfgPath
      ? listKnownServers().find((s) => typeof s.cfgPath === 'string' && samePath(s.cfgPath, cfgPath))
      : getActiveServer();
    const savedDb = serverDbConfig(diagnosed);
    const database = savedDb?.database;
    const dbConnection = savedDb?.connectionString;

    type CheckStatus = 'ok' | 'warn' | 'error' | 'unknown';
    const checks: { id: string; label: string; status: CheckStatus; message: string; hint?: string }[] = [];

    const liveness = await processManager.getLiveness(ip, port);
    checks.push({
      id: 'fxserver',
      label: tr('Proceso FXServer'),
      status: liveness.managed ? 'ok' : liveness.reachable ? 'warn' : 'error',
      message: liveness.managed
        ? tr('En ejecución bajo FiveOS{valor}', { valor: liveness.uptime ? ` · ${liveness.uptime}` : '' })
        : liveness.reachable
          ? tr('Responde en el puerto de juego, pero lo arrancó otra herramienta')
          : tr('No responde en el puerto de juego'),
      hint: liveness.reachable && !liveness.managed
        ? tr('Sin control del proceso: no hay consola ni apagado desde el panel.')
        : !liveness.reachable
          ? tr('Arráncalo desde Servidores para tener consola y logs en vivo.')
          : undefined,
    });

    let playersOnline: number | null = null;
    if (liveness.reachable) {
      try {
        const host = (ip || '127.0.0.1').replace(/:\d+$/, '');
        const gamePort = port || '30120';
        const r = await fetch(`http://${host}:${gamePort}/players.json`, { signal: AbortSignal.timeout(1500) });
        const body = (await r.text()).trim();
        if (body) {
          const list = JSON.parse(body);
          if (Array.isArray(list)) playersOnline = list.length;
        }
      } catch {}
    }

    let effectiveDb = dbConnection;
    let effectiveDatabase = database;
    if (cfgPath && fs.existsSync(cfgPath)) {
      const rawCfg = fs.readFileSync(cfgPath, 'utf-8');
      const connMatch = rawCfg.match(/^\s*(?:set\s+)?mysql_connection_string\s+"([^"]+)"/im);
      if (connMatch && connMatch[1]) {
        effectiveDb = connMatch[1];
        const dbMatch = connMatch[1].match(/(?:database|db)\s*=\s*([^;\s]+)/i);
        if (dbMatch) effectiveDatabase = dbMatch[1];
      }
    }
    if (effectiveDb || effectiveDatabase) {
      const dbResult = await DbService.testConnection({ connectionString: effectiveDb, database: effectiveDatabase });
      checks.push({
        id: 'database',
        label: tr('Base de datos{valor}', { valor: effectiveDatabase ? ` (${effectiveDatabase})` : '' }),
        status: dbResult.success ? 'ok' : 'error',
        message: dbResult.message,
        hint: dbResult.success ? undefined : tr('Revisa mysql_connection_string en tu server.cfg.'),
      });
    } else {
      checks.push({
        id: 'database',
        label: tr('Base de datos'),
        status: 'unknown',
        message: tr('No hay cadena de conexión configurada'),
        hint: tr('Añade mysql_connection_string a tu server.cfg para poder comprobarla.'),
      });
    }

    if (cfgPath && fs.existsSync(cfgPath)) {
      const baseDir = serverDataPath || path.dirname(cfgPath);
      const resourcesDir = path.join(baseDir, 'resources');

      const scanned = scanResourcesOnDisk(resourcesDir);
      const onDisk = new Set(scanned.map((r) => r.name.toLowerCase()));

      const cacheFilesDir = path.join(baseDir, 'cache', 'files');
      if (fs.existsSync(cacheFilesDir)) {
        for (const entry of fs.readdirSync(cacheFilesDir, { withFileTypes: true })) {
          if (entry.isDirectory()) onDisk.add(entry.name.toLowerCase());
        }
      }

      const groupsOnDisk = new Set(scanned.flatMap((r) => r.groups).map((g) => g.toLowerCase()));

      const ensured = parseDirectives(fs.readFileSync(cfgPath, 'utf-8'))
        .filter((d) => !d.commented && d.kind !== 'stop')
        .map((d) => d.target);

      const missing = ensured.filter((name) => {
        const key = name.toLowerCase();
        return key.startsWith('[') ? !groupsOnDisk.has(groupName(key)) : !onDisk.has(key);
      });

      checks.push({
        id: 'resources',
        label: tr('Recursos declarados en server.cfg'),
        status: onDisk.size === 0 ? 'unknown' : missing.length > 0 ? 'error' : 'ok',
        message:
          onDisk.size === 0
            ? tr('No se encontró la carpeta resources/ en {baseDir}', { baseDir })
            : missing.length > 0
              ? tr('{length} de {length2} no existen en disco: {join}{valor}', { length: missing.length, length2: ensured.length, join: missing.slice(0, 6).join(', '), valor: missing.length > 6 ? '…' : '' })
              : tr('Los {length} recursos declarados están presentes en disco', { length: ensured.length }),
        hint: missing.length > 0 ? tr('FXServer fallará al arrancar hasta que los instales o quites su ensure.') : undefined,
      });
    } else {
      checks.push({
        id: 'resources',
        label: tr('Recursos declarados en server.cfg'),
        status: 'unknown',
        message: tr('No se pudo leer el server.cfg de este servidor'),
      });
    }

    const vxcore = inGameResourceState(game, serverDataPath, cfgPath);
    checks.push({
      id: 'vxcore-resource',
      label: tr('Recurso VXCore in-game'),
      status: vxcore.reporting ? 'ok' : vxcore.installed && vxcore.ensured ? 'warn' : 'error',
      message: vxcore.reporting
        ? tr('Reportando desde el juego{valor}', { valor: vxcore.folder ? ` (${vxcore.folder})` : '' })
        : !vxcore.installed
          ? tr('No está instalado en este servidor')
          : !vxcore.ensured
            ? tr('Instalado ({folder}), pero el server.cfg no lo arranca', { folder: vxcore.folder })
            : vxcore.lastHeartbeat
              ? tr('Instalado y declarado, pero lleva rato sin reportar')
              : tr('Instalado y declarado, pero no ha reportado todavía'),
      hint: vxcore.reporting
        ? undefined
        : !vxcore.installed
          ? tr('Instálalo desde Jugadores: sin él no se ve quién está dentro ni se aplican las sanciones.')
          : !vxcore.ensured
            ? tr('Añade "ensure {folder}" a tu server.cfg y reinicia el FXServer.', { folder: vxcore.folder })
            : tr('Reinicia el FXServer: el motor sigue ejecutando los ficheros que cargó al arrancar.'),
    });

    res.json({
      success: true,
      checks,
      players: { online: playersOnline },
      fxserver: liveness,
      vxcore,
    });
  });

  return router;
}

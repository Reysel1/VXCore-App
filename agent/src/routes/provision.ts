import type { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { blueprintFor, fetchBlueprintSql, installBlueprint, listBlueprints } from '../blueprints';
import { buildConnectionString, defaultDatabaseFor, provisionDatabase } from '../db-provision';
import type { AgentContext } from '../http/context';
import { createRouter, errMsg } from '../http/helpers';
import { tr } from '../idioma';
import { savePathsConfig } from '../paths-config';
import { binaryVariant } from '../process-manager';
import {
  createServer as createFxServerData,
  defaultArtifactsRoot,
  installFxServer,
  installVcRedist,
  installedArtifactBuilds,
  legacyBuildOf,
  listFxServerArtifacts,
  RESOURCE_FOLDER,
  vcRedistPresent,
} from '../provision';
import { checkRequirements } from '../requirements';
import { findServerCfgPaths } from '../server-registry';

export function provisionRouter(ctx: AgentContext): Router {
  const { io, processManager, getActiveServer } = ctx;
  const router = createRouter();

  router.get('/api/requirements', async (req, res) => {
    try {
      const active = getActiveServer();
      const requirements = await checkRequirements({
        findFxServerBinary: () =>
          processManager.findFxServerBinary(active?.serverDataPath, active?.cfgPath),
        serverCfgPaths: findServerCfgPaths(),
      });

      res.json({
        success: true,
        requirements,
        blocking: requirements.some((r) => r.required && r.status === 'missing'),
      });
    } catch (error) {
      console.error('[Agent] Error comprobando requisitos:', error);
      res.status(500).json({ success: false, error: tr('Error comprobando requisitos'), details: errMsg(error) });
    }
  });

  router.post('/api/requirements/install/vcredist', async (req, res) => {
    try {
      if (await vcRedistPresent()) {
        return res.json({ success: true, message: 'Ya estaba instalado; no se ha tocado nada.' });
      }

      const result = await installVcRedist();
      const present = result.ok ? await vcRedistPresent() : false;

      res.status(result.ok && present ? 200 : 409).json({
        success: result.ok && present,
        cancelled: Boolean(result.cancelled),
        message:
          result.ok && !present
            ? tr('El instalador terminó pero Windows sigue sin registrar el runtime. Prueba a reiniciar el equipo.')
            : result.message,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.get('/api/artifacts', async (req, res) => {
    const variant = req.query.variant === 'enhanced' ? 'enhanced' : 'legacy';
    try {
      const catalog = await listFxServerArtifacts(variant);

      const active = getActiveServer();
      const binary = processManager.findFxServerBinary(active?.serverDataPath, active?.cfgPath);
      const current = binary
        ? {
            path: binary,
            variant: binaryVariant(binary),
            build: binaryVariant(binary) === 'legacy' ? legacyBuildOf(binary) : null,
          }
        : null;

      res.json({ success: true, catalog, installed: installedArtifactBuilds(variant), current });
    } catch (error) {
      res.status(502).json({ success: false, error: errMsg(error) });
    }
  });

  router.post('/api/artifacts/use', (req, res) => {
    const { variant: rawVariant, build } = req.body || {};
    const variant = rawVariant === 'enhanced' ? 'enhanced' : 'legacy';
    if (typeof build !== 'string' || !/^\d+$/.test(build) || !installedArtifactBuilds(variant).includes(build)) {
      return res.status(400).json({ success: false, error: tr('Ese build no está descargado.') });
    }

    const binary = path.join(
      defaultArtifactsRoot(variant),
      build,
      variant === 'enhanced' ? 'cfx-server.exe' : 'FXServer.exe'
    );
    savePathsConfig(variant === 'enhanced' ? { cfxServerBin: binary } : { fxServerBin: binary });
    console.log(`[Agent] Artifact en uso: ${variant} ${build} (${binary})`);
    res.json({ success: true, binary });
  });

  router.post('/api/requirements/install/fxserver', async (req, res) => {
    try {
      const { targetDir, variant, channel, build } = req.body || {};

      const result = await installFxServer({
        targetDir: typeof targetDir === 'string' ? targetDir : undefined,
        variant: variant === 'enhanced' ? 'enhanced' : 'legacy',
        channel: channel === 'latest' ? 'latest' : 'recommended',
        build: typeof build === 'string' && /^\d+$/.test(build) ? build : undefined,
        onProgress: (progress) => io.emit('provision-progress', { id: 'fxserver', ...progress }),
      });

      io.emit('provision-progress', {
        id: 'fxserver',
        step: result.message,
        percent: result.ok ? 100 : null,
        done: true,
        ok: result.ok,
      });

      res.status(result.ok ? 200 : 409).json({
        success: result.ok,
        message: result.message,
        installedAt: result.installedAt,
      });
    } catch (error) {
      const message = errMsg(error);
      io.emit('provision-progress', { id: 'fxserver', step: message, percent: null, done: true, ok: false });
      res.status(500).json({ success: false, error: message });
    }
  });

  router.post('/api/server/create', async (req, res) => {
    try {
      const { targetDir, hostname, maxClients, port, licenseKey, dbConnectionString, game, build, autoInstall } =
        req.body || {};

      if (typeof targetDir !== 'string' || !targetDir.trim()) {
        return res.status(400).json({ success: false, error: tr('Falta la carpeta donde crear el servidor.') });
      }

      const result = await createFxServerData({
        targetDir,
        hostname: typeof hostname === 'string' ? hostname : '',
        maxClients: Number(maxClients) || 32,
        port: Number(port) || 30120,
        licenseKey: typeof licenseKey === 'string' ? licenseKey : '',
        dbConnectionString: typeof dbConnectionString === 'string' ? dbConnectionString : undefined,
        game: game === 'redm' ? 'redm' : 'fivem',
        build: build === 'enhanced' ? 'enhanced' : 'legacy',
        autoInstall:
          autoInstall && typeof autoInstall === 'object'
            ? {
                vcRedist: autoInstall.vcRedist !== false,
                artifacts: autoInstall.artifacts !== false,
              }
            : undefined,
        onProgress: (progress) => io.emit('provision-progress', { id: 'new-server', ...progress }),
      });

      io.emit('provision-progress', {
        id: 'new-server',
        step: result.message,
        percent: result.ok ? 100 : null,
        done: true,
        ok: result.ok,
      });

      res.status(result.ok ? 200 : 400).json({
        success: result.ok,
        message: result.message,
        serverDataPath: result.installedAt,
        cfgPath: result.cfgPath,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.post('/api/server/create-full', async (req, res) => {
    try {
      const {
        targetDir,
        hostname,
        maxClients,
        port,
        licenseKey,
        game,
        build,
        autoInstall,
        framework,
        database,
        dbConfig,
        importSql,
      } = req.body || {};

      if (typeof targetDir !== 'string' || !targetDir.trim()) {
        return res.status(400).json({ success: false, error: tr('Falta la carpeta donde crear el servidor.') });
      }

      const blueprint = blueprintFor(framework);
      if (!blueprint) {
        return res.status(400).json({
          success: false,
          error: tr('Framework desconocido: {String}. Usa standalone, qbcore o esx.', { String: String(framework) }),
        });
      }

      const report = (step: string, percent: number | null = null) =>
        io.emit('provision-progress', { id: 'new-server-full', step, percent });

      let dbDatabase: string | undefined;
      let sqlFile: string | undefined;

      if (blueprint.sql) {
        if (importSql !== false && dbConfig && typeof dbConfig.user === 'string') {
          report(tr('Preparando la base de datos…'));
          const sql = await fetchBlueprintSql(blueprint);
          if (!sql.ok) {
            report(tr('Fallo con el SQL del framework: {message}', { message: sql.message }), null);
            return res.status(400).json({ success: false, error: sql.message });
          }
          sqlFile = sql.file;

          const created = await provisionDatabase(
            {
              host: typeof dbConfig.host === 'string' ? dbConfig.host : undefined,
              port: typeof dbConfig.port === 'number' ? dbConfig.port : undefined,
              user: dbConfig.user,
              password: typeof dbConfig.password === 'string' ? dbConfig.password : '',
              database: typeof database === 'string' && database.trim() ? database : undefined,
            },
            blueprint.id,
            sqlFile,
            (progress) => report(progress.step, progress.percent)
          );
          if (!created.ok) {
            report(created.message, null);
            return res.status(400).json({ success: false, error: created.message });
          }
          dbDatabase = created.database;
        } else {
          dbDatabase =
            typeof database === 'string' && database.trim()
              ? database.trim()
              : defaultDatabaseFor(blueprint.id);
        }
      }

      const result = await createFxServerData({
        targetDir,
        hostname: typeof hostname === 'string' ? hostname : '',
        maxClients: Number(maxClients) || 32,
        port: Number(port) || 30120,
        licenseKey: typeof licenseKey === 'string' ? licenseKey : '',
        dbConnectionString: dbDatabase
          ? buildConnectionString({
              host: typeof dbConfig?.host === 'string' ? dbConfig.host : undefined,
              port: typeof dbConfig?.port === 'number' ? dbConfig.port : undefined,
              user: dbConfig?.user || 'root',
              password: dbConfig?.password || '',
              database: dbDatabase,
            })
          : undefined,
        game: game === 'redm' ? 'redm' : 'fivem',
        build: build === 'enhanced' ? 'enhanced' : 'legacy',
        autoInstall,
        onProgress: (progress) => report(progress.step, progress.percent),
      });

      if (!result.ok) {
        io.emit('provision-progress', {
          id: 'new-server-full',
          step: result.message,
          percent: null,
          done: true,
          ok: false,
        });
        return res.status(400).json({ success: false, error: result.message });
      }

      report(tr('Descargando los recursos de {name}…', { name: blueprint.name }), 0);
      const installed = await installBlueprint(blueprint, targetDir, (progress) =>
        report(progress.step, progress.percent)
      );

      if (installed.ok) {
        report(tr('Escribiendo server.cfg con el framework…'));
        try {
          const cfgPath = path.join(targetDir, 'server.cfg');
          const existing = fs.readFileSync(cfgPath, 'utf-8');
          const present = new Set(fs.readdirSync(path.join(targetDir, 'resources')));
          const frameworkEnsures = blueprint.ensureOrder.filter((name) => present.has(name));
          const after = existing.replace(
            /\r?\n# Permisos\./,
            `\r\n# Recursos del framework ${blueprint.name}.\r\n` +
              frameworkEnsures.map((name) => `ensure ${name}`).join('\r\n') +
              `\r\nensure ${RESOURCE_FOLDER}\r\n\r\n# Permisos.`
          );
          if (after !== existing) fs.writeFileSync(cfgPath, after, 'utf-8');
        } catch (error) {
          report(
            tr('Aviso: no se pudo completar el orden de carga del framework ({valor}). Revisa el server.cfg.', { valor: error instanceof Error ? error.message : String(error) }),
            null
          );
        }
      }

      io.emit('provision-progress', {
        id: 'new-server-full',
        step: installed.ok
          ? tr('Servidor de {name} listo en {targetDir}.', { name: blueprint.name, targetDir })
          : tr('Servidor creado, pero faltaron recursos: {message}', { message: installed.message }),
        percent: installed.ok ? 100 : null,
        done: true,
        ok: installed.ok,
      });

      res.status(installed.ok ? 200 : 207).json({
        success: installed.ok,
        message: installed.ok
          ? tr('Servidor de {name} creado en {targetDir}.', { name: blueprint.name, targetDir })
          : installed.message,
        serverDataPath: result.installedAt,
        cfgPath: result.cfgPath,
        framework: blueprint.id,
        database: dbDatabase ?? null,
        installedResources: installed.installed,
      });
    } catch (error) {
      io.emit('provision-progress', {
        id: 'new-server-full',
        step: errMsg(error),
        percent: null,
        done: true,
        ok: false,
      });
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.get('/api/server/frameworks', (req, res) => {
    res.json({
      success: true,
      frameworks: listBlueprints().map((bp) => ({
        id: bp.id,
        name: bp.name,
        description: bp.description,
        resourceCount: bp.tasks.length,
        database: bp.sql ? defaultDatabaseFor(bp.id) : null,
        needsDatabase: Boolean(bp.sql),
      })),
    });
  });

  return router;
}

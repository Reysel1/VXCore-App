import type { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { applyResourceChanges, collectGroups, groupName, parseDirectives, resolveStarted, toggleGroup } from '../cfg-resources';
import { resourcesFolderFor, scanResourcesOnDisk } from '../disk-resources';
import { directorySize } from '../fs-browse';
import type { AgentContext } from '../http/context';
import { createRouter, errMsg } from '../http/helpers';
import { tr } from '../idioma';
import { isSafeResourceName } from '../path-guards';
import type { ProcessManager } from '../process-manager';

function applyResourceActions(processManager: ProcessManager, options: {
  cfgPath?: string;
  serverDataPath?: string;
  resources: { name: string; action: 'start' | 'stop' }[];
  groups?: { name: string; action: 'start' | 'stop' }[];
}): { applied: number; cfgWritten: boolean; live: boolean } {
  const { cfgPath, serverDataPath, resources, groups = [] } = options;

  const live = processManager.isRunning();
  if (live) {
    if (resources.some((r) => r.action === 'start') || groups.some((g) => g.action === 'start')) {
      processManager.executeCommand('refresh');
    }

    for (const group of groups) {
      processManager.executeCommand(`${group.action === 'start' ? 'ensure' : 'stop'} [${group.name}]`);
    }
    for (const resource of resources) {
      processManager.executeCommand(`${resource.action === 'start' ? 'ensure' : 'stop'} ${resource.name}`);
    }
  }

  if (!cfgPath || !fs.existsSync(cfgPath)) {
    return { applied: resources.length + groups.length, cfgWritten: false, live };
  }

  const original = fs.readFileSync(cfgPath, 'utf-8');
  let content = original;

  for (const group of groups) {
    content = toggleGroup(content, group.name, group.action);
  }

  const folder = resourcesFolderFor(serverDataPath, cfgPath);
  const viaGroup =
    folder && resources.some((r) => r.action === 'stop')
      ? resolveStarted(content, scanResourcesOnDisk(folder)).viaGroup
      : new Map<string, string>();

  content = applyResourceChanges(
    content,
    resources.map((r) => ({
      name: r.name,
      action: r.action,
      coveredByGroup: r.action === 'stop' && viaGroup.has(r.name),
    }))
  );

  if (content !== original) fs.writeFileSync(cfgPath, content, 'utf-8');
  return { applied: resources.length + groups.length, cfgWritten: content !== original, live };
}

export function resourcesRouter(ctx: AgentContext): Router {
  const { processManager } = ctx;
  const router = createRouter();

  router.post('/api/server/resources-on-disk', (req, res) => {
    try {
      const { serverDataPath, cfgPath, withSize } = req.body;
      const resourcesFolder = resourcesFolderFor(serverDataPath, cfgPath);
      if (!resourcesFolder) {
        return res.status(400).json({
          success: false,
          error: tr('Falta la ruta del servidor (serverDataPath o cfgPath).'),
        });
      }
      const scanned = scanResourcesOnDisk(resourcesFolder);

      const contained = new Set(
        scanned
          .filter((r) => scanned.some((other) => other !== r && other.path.startsWith(r.path + path.sep)))
          .map((r) => r.path)
      );

      const cfg = cfgPath && fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath, 'utf-8') : '';
      const { started, viaGroup } = resolveStarted(cfg, scanned);

      const ensuredGroups = parseDirectives(cfg)
        .filter((d) => d.group && !d.commented && d.kind !== 'stop')
        .map((d) => groupName(d.target));
      const ensuredLower = new Set(ensuredGroups.map((g) => g.toLowerCase()));

      const categories = collectGroups(scanned).map((group) => ({
        ...group,
        ensured: ensuredLower.has(group.name.toLowerCase()),
      }));

      const resources = scanned.map((r) => ({
        name: r.name,
        category: r.category || 'Scripts',
        groups: r.groups,
        path: r.path,
        status: started.has(r.name) ? 'active' : 'stopped',
        viaGroup: viaGroup.get(r.name) ?? null,
        hasManifest: r.hasManifest,
        ...(withSize && !contained.has(r.path) ? directorySize(r.path) : {}),
      }));

      res.json({
        success: true,
        resourcesPath: resourcesFolder,
        count: resources.length,
        ensuredGroups: Array.from(new Set(ensuredGroups)),
        categories,
        resources,
      });
    } catch (error) {
      res.status(500).json({ error: tr('Error listando recursos en disco'), details: errMsg(error) });
    }
  });

  router.post('/api/server/bulk-resources', (req, res) => {
    try {
      const { cfgPath, serverDataPath, resources, groups } = req.body || {};

      const clean = (list: unknown): { name: string; action: 'start' | 'stop' }[] =>
        Array.isArray(list)
          ? list
              .filter((e) => e && isSafeResourceName(String(e.name ?? '').trim()))
              .map((e) => ({ name: String(e.name).trim(), action: e.action === 'stop' ? 'stop' : 'start' as const }))
          : [];

      const wantedResources = clean(resources);
      const wantedGroups = clean(groups).map((g) => ({ ...g, name: groupName(g.name) }));

      if (wantedResources.length === 0 && wantedGroups.length === 0) {
        return res.status(400).json({ success: false, error: tr('No se indicó ningún recurso.') });
      }

      const result = applyResourceActions(processManager, {
        cfgPath,
        serverDataPath,
        resources: wantedResources,
        groups: wantedGroups,
      });

      res.json({
        success: true,
        ...result,
        message: tr('{applied} cambio(s) aplicados{valor}.', { applied: result.applied, valor: result.live ? ' y enviados a la consola' : ' en server.cfg' }),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  return router;
}

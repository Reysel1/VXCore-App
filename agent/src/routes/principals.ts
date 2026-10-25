import type { Router } from 'express';
import fs from 'fs';
import type { AgentContext } from '../http/context';
import { actorOf, createRouter, errMsg } from '../http/helpers';
import { tr } from '../idioma';
import {
  ADMIN_GROUPS,
  GROUP_LABELS,
  grantPrincipal,
  groupFor,
  isAdminGroup,
  isValidIdentifier,
  liveCommandsFor,
  parsePrincipals,
  revokePrincipal,
} from '../principals';
import type { ProcessManager } from '../process-manager';
import { resolveKnownCfg } from '../server-registry';

function applyLive(processManager: ProcessManager, commands: string[]): boolean {
  if (commands.length === 0) return false;
  return commands.every((command) => processManager.executeCommand(command).success);
}

export function principalsRouter(ctx: AgentContext): Router {
  const { processManager } = ctx;
  const router = createRouter();

  router.get('/api/server/principals', (req, res) => {
    try {
      const cfgPath = resolveKnownCfg(req.query.cfgPath, processManager);
      if (!cfgPath) {
        return res.status(400).json({ success: false, error: tr('No se encuentra el server.cfg de ese servidor.') });
      }

      const content = fs.readFileSync(cfgPath, 'utf-8');
      res.json({
        success: true,
        principals: parsePrincipals(content),
        groups: ADMIN_GROUPS.map((group) => ({ group, label: tr(GROUP_LABELS[group]) })),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.post('/api/server/principals', (req, res) => {
    try {
      const { identifier, group } = req.body || {};

      if (!isValidIdentifier(identifier)) {
        return res.status(400).json({
          success: false,
          error: tr('Ese identificador no vale para dar permisos. Usa la licencia, Steam o Discord del jugador.'),
        });
      }
      if (!isAdminGroup(group)) {
        return res.status(400).json({ success: false, error: tr('Ese grupo no existe.') });
      }

      const cfgPath = resolveKnownCfg(req.body?.cfgPath, processManager);
      if (!cfgPath) {
        return res.status(400).json({ success: false, error: tr('No se encuentra el server.cfg de ese servidor.') });
      }

      const before = fs.readFileSync(cfgPath, 'utf-8');
      const previous = groupFor(before, identifier);
      const after = grantPrincipal(before, identifier, group);
      if (after !== before) fs.writeFileSync(cfgPath, after, 'utf-8');

      const applied = applyLive(processManager, liveCommandsFor('grant', identifier, group, previous));

      console.log(`[Principals] ${identifier} → group.${group} (${actorOf(req).name})`);
      res.json({ success: true, identifier, group, previous, appliedLive: applied });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.post('/api/server/principals/revoke', (req, res) => {
    try {
      const { identifier } = req.body || {};
      if (!isValidIdentifier(identifier)) {
        return res.status(400).json({ success: false, error: tr('Identificador no válido.') });
      }

      const cfgPath = resolveKnownCfg(req.body?.cfgPath, processManager);
      if (!cfgPath) {
        return res.status(400).json({ success: false, error: tr('No se encuentra el server.cfg de ese servidor.') });
      }

      const before = fs.readFileSync(cfgPath, 'utf-8');
      const previous = groupFor(before, identifier);
      if (!previous) {
        return res.json({ success: true, identifier, group: null, previous: null, appliedLive: false });
      }

      const after = revokePrincipal(before, identifier);
      if (after !== before) fs.writeFileSync(cfgPath, after, 'utf-8');

      const applied = applyLive(processManager, liveCommandsFor('revoke', identifier, undefined, previous));

      console.log(`[Principals] ${identifier} pierde group.${previous} (${actorOf(req).name})`);
      res.json({ success: true, identifier, group: null, previous, appliedLive: applied });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  return router;
}

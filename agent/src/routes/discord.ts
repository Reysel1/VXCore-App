import type { Router } from 'express';
import {
  fetchBotGuildIds,
  fetchGuild,
  fetchUserProfiles,
  fetchWhitelistMembership,
  loadDiscordConfig,
  saveDiscordConfig,
  toPublicDiscord,
  unlinkDiscord,
  verificarCredenciales,
  whitelistGuildId,
} from '../discord';
import { publishStatus, updatePresence } from '../discord-status';
import type { AgentContext } from '../http/context';
import { createRouter, errMsg } from '../http/helpers';
import { tr } from '../idioma';
import { statusSnapshot } from '../server-status';
import { evaluate as evaluateTunnel } from '../tunnel';

export function discordRouter(ctx: AgentContext): Router {
  const { processManager, cfxAddress, getActiveServer } = ctx;
  const router = createRouter();

  router.get('/api/discord/config', (req, res) => {
    res.json({ success: true, config: toPublicDiscord(loadDiscordConfig()) });
  });

  router.get('/api/discord/credentials/check', async (req, res) => {
    const config = loadDiscordConfig();
    if (!config.clientId || !config.clientSecret) {
      return res.json({ success: true, configured: false, ok: false, rejected: false });
    }

    const prueba = await verificarCredenciales(config.clientId, config.clientSecret);
    res.json({ success: true, configured: true, ok: prueba.ok, rejected: prueba.rechazada });
  });

  router.post('/api/discord/config', async (req, res) => {
    try {
      const body = req.body || {};

      if (body.requireLogin && !loadDiscordConfig().owner) {
        return res.status(400).json({
          success: false,
          error: tr('Vincula tu cuenta de Discord antes de exigir inicio de sesión: si no, te quedarías fuera.'),
        });
      }

      const actual = loadDiscordConfig();
      const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : actual.clientId;
      const clientSecret =
        typeof body.clientSecret === 'string' && body.clientSecret.trim()
          ? body.clientSecret.trim()
          : actual.clientSecret;
      const cambian = clientId !== actual.clientId || clientSecret !== actual.clientSecret;

      if (cambian && clientId && clientSecret) {
        const prueba = await verificarCredenciales(clientId, clientSecret);
        if (prueba.rechazada) {
          console.warn(`[Discord] Credenciales rechazadas al guardar: ${prueba.detalle}`);
          return res.status(400).json({
            success: false,
            error: tr(
              'Discord no acepta este Client ID con este Client Secret. Cópialos otra vez del portal de Discord (Applications › OAuth2); si el secreto ya no se puede ver, genera uno nuevo con «Reset Secret».'
            ),
          });
        }
        if (!prueba.ok) {
          console.warn(`[Discord] No se pudieron comprobar las credenciales: ${prueba.detalle}`);
        }
      }

      const config = saveDiscordConfig(body);
      void evaluateTunnel();
      res.json({ success: true, config });
    } catch (error) {
      res.status(500).json({ success: false, error: tr('Error guardando la configuración'), details: errMsg(error) });
    }
  });

  router.post('/api/discord/whitelist/check', async (req, res) => {
    const config = loadDiscordConfig();
    const { discordId } = req.body || {};
    const userId = String(discordId || '').replace(/^discord:/, '');

    if (!config.whitelistEnabled) {
      return res.json({ allowed: true, reason: 'whitelist_desactivada' });
    }

    if (!userId) {
      return res.json({
        allowed: false,
        reason: 'sin_discord',
        message: tr('Tienes que tener Discord abierto y vinculado a FiveM para entrar.'),
      });
    }

    const guildId = whitelistGuildId(config);

    if (!config.botToken || !guildId) {
      console.error('[Whitelist] Activada pero sin token de bot: se rechaza la entrada.');
      return res.json({ allowed: false, reason: 'sin_bot', message: tr(config.whitelistMessage) });
    }
    if (config.whitelistRoles.length === 0) {
      console.error('[Whitelist] Activada pero sin roles elegidos: se rechaza la entrada.');
      return res.json({ allowed: false, reason: 'sin_roles', message: tr(config.whitelistMessage) });
    }

    try {
      const membership = await fetchWhitelistMembership(config, userId, guildId);

      if (membership.state === 'no_access') {
        console.error(
          `[Whitelist] El bot no puede leer el gremio ${guildId} (¿está invitado al servidor de whitelist?): entrada bloqueada.`
        );
        return res.json({
          allowed: false,
          reason: 'bot_sin_acceso',
          message: tr(config.whitelistMessage),
        });
      }

      if (membership.state === 'not_member') {
        return res.json({
          allowed: false,
          reason: 'no_en_gremio',
          message: tr(config.whitelistMessage),
        });
      }

      const allowed = config.whitelistRoles.some((role) => membership.roles.includes(role));
      return res.json({
        allowed,
        reason: allowed ? 'rol_valido' : 'sin_rol',
        message: allowed ? undefined : tr(config.whitelistMessage),
      });
    } catch (error) {
      const strict = Boolean(config.whitelistStrict);
      console.error(
        `[Whitelist] No se pudo comprobar (${errMsg(error)}): ${
          strict ? 'entrada BLOQUEADA (modo estricto).' : 'se deja pasar.'
        }`
      );
      return res.json({
        allowed: !strict,
        reason: 'error_comprobando',
        ...(strict ? { message: tr(config.whitelistMessage) } : {}),
      });
    }
  });

  router.post('/api/discord/status/publish', async (req, res) => {
    try {
      const config = loadDiscordConfig();
      if (!config.botToken) {
        return res.status(400).json({ success: false, error: tr('Falta el token del bot.') });
      }
      if (!config.statusChannelId) {
        return res.status(400).json({ success: false, error: tr('No has indicado el canal de estado.') });
      }

      const target = getActiveServer();
      if (!target) {
        return res.status(400).json({ success: false, error: tr('No hay ningún servidor activo.') });
      }

      const snapshot = await statusSnapshot(processManager, cfxAddress, target);

      await publishStatus(snapshot);
      updatePresence(snapshot);

      res.json({ success: true, snapshot });
    } catch (error) {
      res.status(400).json({ success: false, error: errMsg(error) });
    }
  });

  router.post('/api/discord/unlink', (req, res) => {
    const config = unlinkDiscord();
    void evaluateTunnel();
    res.json({ success: true, config });
  });

  router.get('/api/discord/guild', async (req, res) => {
    try {
      const guild = await fetchGuild(loadDiscordConfig());
      res.json({ success: true, guild });
    } catch (error) {
      res.status(400).json({ success: false, error: errMsg(error) });
    }
  });

  router.get('/api/discord/whitelist/guild', async (req, res) => {
    const config = loadDiscordConfig();
    const target = whitelistGuildId(config);
    const usingFallback = !config.whitelistGuildId;

    if (!target) {
      return res.status(400).json({
        success: false,
        error: tr('Falta el ID del gremio: pon el servidor de staff o el de whitelist en Ajustes.'),
      });
    }

    try {
      const botGuildIds = await fetchBotGuildIds(config);
      if (!botGuildIds.includes(target)) {
        return res.json({
          success: true,
          guild: null,
          botInGuild: false,
          usingFallback,
          message: tr('El bot no está en ese servidor: invítalo con el enlace de más abajo y vuelve a leer.'),
        });
      }
      const guild = await fetchGuild(config, target);
      res.json({ success: true, guild, botInGuild: true, usingFallback });
    } catch (error) {
      res.status(400).json({ success: false, error: errMsg(error) });
    }
  });

  router.get('/api/discord/whitelist/policy', (req, res) => {
    const config = loadDiscordConfig();
    res.json({
      enabled: config.whitelistEnabled,
      strict: Boolean(config.whitelistStrict),
      message: tr(config.whitelistMessage),
    });
  });

  router.post('/api/discord/users', async (req, res) => {
    try {
      const { ids } = req.body || {};
      if (!Array.isArray(ids)) {
        return res.status(400).json({ success: false, error: tr('Falta la lista "ids".') });
      }

      const config = loadDiscordConfig();
      const profiles = await fetchUserProfiles(config, ids.slice(0, 64));

      res.json({ success: true, profiles, hasBot: Boolean(config.botToken) });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  return router;
}

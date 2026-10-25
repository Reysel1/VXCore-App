import type { Router } from 'express';
import { LEVEL_RANK } from '../access';
import {
  buildAuthorizeUrl,
  createSession,
  decodeState,
  encodeState,
  exchangeCode,
  fetchMemberRoles,
  fetchSelf,
  loadDiscordConfig,
  normalizePublicUrl,
  redirectUriFor,
  resolveAccessLevel,
  saveDiscordConfig,
  verifySession,
  type AccessLevel,
} from '../discord';
import { isAllowedHostHeader, isExposed, isLoopbackHostname as isLoopback } from '../exposure';
import { bearer, sectionsForSession } from '../http/auth';
import { createRouter, errMsg } from '../http/helpers';
import { arrivedFromInternet, isLocalRequest } from '../http/security';
import { tr } from '../idioma';
import { levelForUser as invitedLevel, redeemInvite } from '../invites';
import { authAttemptLimiter } from '../rate-limit';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function isOwnPanelOrigin(origin: string, publicUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  if (isAllowedHostHeader(url.hostname)) return true;

  const configured = normalizePublicUrl(publicUrl);
  if (!configured) return false;
  try {
    return new URL(configured).hostname.toLowerCase() === url.hostname.toLowerCase();
  } catch {
    return false;
  }
}

function effectiveLevel(
  config: ReturnType<typeof loadDiscordConfig>,
  userId: string,
  roleIds: string[] | null
): AccessLevel {
  const byRole = resolveAccessLevel(config, userId, roleIds);
  const byInvite = invitedLevel(userId);
  if (!byInvite) return byRole;

  return LEVEL_RANK[byInvite] > LEVEL_RANK[byRole] ? byInvite : byRole;
}

export function authRouter(): Router {
  const router = createRouter();

  router.get('/api/auth/status', (req, res) => {
    const config = loadDiscordConfig();
    const exposed = isExposed();
    res.json({
      success: true,
      requireLogin: (config.requireLogin || exposed) && Boolean(config.owner),
      exposed,
      requireLoginSetting: config.requireLogin,
      configured: Boolean(config.clientId && config.clientSecret && config.guildId),
      linked: Boolean(config.owner),
    });
  });

  router.get('/api/discord/login', (req, res) => {
    const config = loadDiscordConfig();
    if (!config.clientId || !config.clientSecret) {
      return res.status(400).json({
        success: false,
        error: tr('Discord no está configurado todavía. El dueño debe hacerlo en Ajustes.'),
      });
    }

    const origin = String(req.query.origin || req.headers.referer || '').replace(/\/+$/, '');
    if (!origin) {
      return res.status(400).json({ success: false, error: tr('Falta el origen del panel.') });
    }
    if (!isOwnPanelOrigin(origin, config.publicUrl)) {
      console.warn(`[Discord] Login rechazado: el origen "${origin}" no es este panel.`);
      return res.status(400).json({
        success: false,
        error: tr('El origen del panel no está permitido.'),
      });
    }

    const redirectUri = redirectUriFor(config, req.headers.host);
    const invite = typeof req.query.invite === 'string' ? req.query.invite : undefined;

    res.json({
      success: true,
      url: buildAuthorizeUrl(config, encodeState(config, origin, invite), redirectUri),
    });
  });

  router.get('/api/discord/callback', authAttemptLimiter, async (req, res) => {
    const config = loadDiscordConfig();

    const fail = (message: string) =>
      res
        .status(400)
        .send(
          `<!doctype html><meta charset="utf-8"><title>FiveOS</title>` +
            `<body style="font-family:system-ui;background:#0b0b0f;color:#e5e5e5;padding:3rem">` +
            tr('<h2>No se pudo completar el inicio de sesión</h2><p>{message}</p>', { message: escapeHtml(message) }) +
            `<p style="opacity:.6">Puedes cerrar esta ventana.</p></body>`
        );

    try {
      const state = decodeState(config, String(req.query.state || ''));
      if (!state) return fail(tr('La respuesta de Discord no es válida o ha caducado. Vuelve a intentarlo.'));

      const code = String(req.query.code || '');
      if (!code) return fail(tr('Discord no devolvió ningún código de autorización.'));

      const redirectUri = redirectUriFor(config, req.headers.host);
      const accessToken = await exchangeCode(config, code, redirectUri);
      const user = await fetchSelf(accessToken);

      if (!config.owner) {
        const fromThisMachine = (() => {
          if (!isLocalRequest(req) || arrivedFromInternet(req)) return false;
          try {
            return isLoopback(new URL(state.origin).hostname);
          } catch {
            return false;
          }
        })();

        if (fromThisMachine) {
          saveDiscordConfig({ owner: user });
          console.log(`[Discord] Panel vinculado a ${user.username} (${user.id})`);
        } else {
          console.warn(
            `[Discord] ${user.username} entró desde fuera y el panel aún no tiene dueño: no se vincula.`
          );
          return fail(
            tr('Este panel todavía no está vinculado a ninguna cuenta. Tiene que entrar primero su dueño, desde el ordenador donde está instalado VXCore.')
          );
        }
      }

      const current = loadDiscordConfig();
      const roleIds = await fetchMemberRoles(current, user.id, accessToken);

      if (state.invite) {
        const granted = redeemInvite(state.invite, {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
        });
        if (granted) {
          console.log(`[Invites] ${user.username} entró como ${granted} con una invitación.`);
        } else {
          return fail(tr('Ese enlace de invitación ya no vale: ha caducado, se agotó o lo han revocado.'));
        }
      }

      const byRole = resolveAccessLevel(current, user.id, roleIds);
      const level = effectiveLevel(current, user.id, roleIds);

      if (level === 'none') {
        return fail(
          roleIds === null
            ? tr('No perteneces al servidor de Discord de esta comunidad, y no traes ninguna invitación.')
            : tr('Tu cuenta no tiene ningún rol de staff configurado en este panel.')
        );
      }

      const token = createSession(
        current,
        user,
        level,
        byRole === 'none' ? 'invite' : 'discord',
        roleIds
      );
      res.redirect(`${state.origin}/acceso#token=${encodeURIComponent(token)}&level=${level}`);
    } catch (error) {
      console.error('[Discord] Error en el callback:', error);
      fail(errMsg(error));
    }
  });

  router.get('/api/discord/me', async (req, res) => {
    const config = loadDiscordConfig();
    const session = verifySession(config, bearer(req));
    if (!session) return res.status(401).json({ success: false, error: tr('Sesión no válida o caducada.') });

    const roleIds = await fetchMemberRoles(config, session.user.id).catch(() => null);
    const invited = invitedLevel(session.user.id);
    const level =
      roleIds === null && !config.botToken && !invited
        ? session.level
        : effectiveLevel(config, session.user.id, roleIds);

    if (level === 'none') {
      return res.status(403).json({ success: false, error: tr('Ya no tienes acceso a este panel.') });
    }

    res.json({ success: true, user: session.user, level, sections: sectionsForSession(session) });
  });

  return router;
}

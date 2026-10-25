import type { Request, RequestHandler } from 'express';
import { LEVEL_RANK, ruleFor } from '../access';
import {
  loadDiscordConfig,
  memberRolesByBot,
  resolveAccessLevel,
  sectionsForRoles,
  verifySession,
  type AccessLevel,
  type Session,
} from '../discord';
import { isExposed } from '../exposure';
import { tr } from '../idioma';
import { levelForUser as invitedLevel, sectionsForUser, type InviteSection } from '../invites';

type SessionRequest = Request & { session?: Session };

export function sessionOf(req: Request): Session | undefined {
  return (req as SessionRequest).session;
}

export function bearer(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

const PUBLIC_ROUTES = [
  '/api/health',
  '/api/requirements',
  '/api/locale',
  '/api/auth/status',
  '/api/discord/login',
  '/api/discord/callback',
  '/api/discord/me',
  '/api/discord/whitelist/check',
  '/api/discord/whitelist/policy',
  '/api/server/telemetry',
  '/api/server/ingame-summary',
  '/api/server/connecting',

  '/api/server/screen-frame',
  '/api/sanctions/check',
  '/api/sanctions/in-game',
  '/api/staff/in-game-access',
  '/api/branding/banner.png',
  '/api/tunnel/panel-port',
  '/api/agent/shutdown',
];

export const authGuard: RequestHandler = (req, res, next) => {
  const config = loadDiscordConfig();

  if (!req.path.toLowerCase().startsWith('/api/')) return next();
  if (PUBLIC_ROUTES.some((route) => req.path === route)) return next();

  if (!isExposed() && (!config.requireLogin || !config.owner)) return next();

  const session = verifySession(config, bearer(req));
  if (!session) {
    if (!config.owner) {
      return res.status(503).json({
        success: false,
        code: 'REMOTE_ACCESS_NOT_CONFIGURED',
        error:
          tr('Este panel está publicado pero todavía no tiene forma de identificar a nadie. Vincula Discord desde el panel local para poder entrar desde fuera.'),
      });
    }
    return res.status(401).json({
      success: false,
      code: 'LOGIN_REQUIRED',
      error: tr('Este panel exige iniciar sesión con Discord.'),
    });
  }

  (req as SessionRequest).session = session;
  next();
};

const ROLE_RECHECK_MS = 10 * 60 * 1000;

const roleLevels = new Map<string, { level: AccessLevel; checkedAt: number }>();

const roleChecks = new Map<string, Promise<void>>();

export function refreshRoleLevel(session: Session): Promise<void> {
  if (session.via === 'invite') return Promise.resolve();
  const userId = session.user.id;
  const cached = roleLevels.get(userId);
  if (cached && Date.now() - cached.checkedAt < ROLE_RECHECK_MS) return Promise.resolve();

  let check = roleChecks.get(userId);
  if (!check) {
    check = (async () => {
      const config = loadDiscordConfig();
      const roleIds = await memberRolesByBot(config, userId);
      if (roleIds === undefined) return;
      roleLevels.set(userId, { level: resolveAccessLevel(config, userId, roleIds), checkedAt: Date.now() });
    })().finally(() => roleChecks.delete(userId));
    roleChecks.set(userId, check);
  }
  return check;
}

export function currentLevel(session: Session): AccessLevel {
  const config = loadDiscordConfig();
  if (config.owner?.id === session.user.id) return 'owner';

  const byRole: AccessLevel =
    session.via === 'invite' ? 'none' : (roleLevels.get(session.user.id)?.level ?? session.level);

  const invited = invitedLevel(session.user.id);
  if (!invited) return byRole;

  return LEVEL_RANK[invited] > LEVEL_RANK[byRole] ? invited : byRole;
}

export function sectionsForSession(session: Session): InviteSection[] | null {
  const config = loadDiscordConfig();

  if (config.owner?.id === session.user.id) return null;

  const byInvite = sectionsForUser(session.user.id);
  const byRole = sectionsForRoles(config, session.roleIds ?? null);

  if (!byInvite) return byRole;
  if (!byRole) return byInvite;
  return byInvite.filter((section) => byRole.includes(section));
}

const unclassified = new Set<string>();

export const roleGuard: RequestHandler = async (req, res, next) => {
  const session = sessionOf(req);
  if (!session) return next();

  await refreshRoleLevel(session);
  const level = currentLevel(session);
  if (level === 'none') {
    return res.status(401).json({
      success: false,
      code: 'ACCESS_REVOKED',
      error: tr('Tu acceso a este panel ya no está vigente.'),
    });
  }

  const rule = ruleFor(req.method, req.path);
  if (!rule.known) {
    const signature = `${req.method} ${req.path}`;
    if (!unclassified.has(signature)) {
      unclassified.add(signature);
      console.warn(
        `[Acceso] ${signature} no está en la tabla de access.ts: se exige nivel de dueño. ` +
          'Clasifícala si tiene que alcanzarla el staff.'
      );
    }
  }

  if (LEVEL_RANK[level] < LEVEL_RANK[rule.level]) {
    return res.status(403).json({
      success: false,
      code: 'INSUFFICIENT_LEVEL',
      error:
        rule.level === 'owner'
          ? tr('Esto sólo lo puede hacer el dueño del panel.')
          : tr('Esto sólo lo puede hacer un administrador.'),
    });
  }

  const sections = sectionsForSession(session);
  if (sections && rule.section && !sections.includes(rule.section)) {
    return res.status(403).json({
      success: false,
      code: 'SECTION_NOT_ALLOWED',
      error: tr('Esta parte del panel no entra en tu acceso.'),
    });
  }

  next();
};

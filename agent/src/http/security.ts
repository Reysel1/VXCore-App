import crypto from 'crypto';
import type { CorsOptions } from 'cors';
import type { Request, RequestHandler } from 'express';
import type { ServerOptions } from 'socket.io';
import { isAllowedHostHeader, isLoopbackHostname as isLoopback, getTunnelHostname } from '../exposure';
import { tr } from '../idioma';

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  return address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.');
}

export function isLocalRequest(req: Request): boolean {
  const hostname = hostnameOf(`http://${req.headers.host || ''}`);
  return isLoopbackAddress(req.socket.remoteAddress) && hostname !== null && isLoopback(hostname);
}

function hostnameOf(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return null;
  }
}

export function extraAllowedOrigins(): string[] {
  const raw = [process.env.FIVEOS_ALLOWED_ORIGINS, process.env.FIVEOS_PUBLIC_URL]
    .filter(Boolean)
    .join(',');

  return raw
    .split(',')
    .map((value) => value.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function isAllowedOrigin(origin: string): boolean {
  const hostname = hostnameOf(origin);
  if (!hostname) return false;
  if (isLoopback(hostname)) return true;

  const tunnel = getTunnelHostname();
  if (tunnel && hostname.toLowerCase() === tunnel) return true;

  return extraAllowedOrigins().some((allowed) => allowed === origin.replace(/\/+$/, ''));
}

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
};

export const originGuard: RequestHandler = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({
      success: false,
      code: 'ORIGIN_NOT_ALLOWED',
      error: tr('Origen no permitido.'),
    });
  }

  next();
};

export const hostGuard: RequestHandler = (req, res, next) => {
  const listenHost = process.env.HOST || '127.0.0.1';
  if (!isLoopback(listenHost)) return next();

  const hostname = hostnameOf(`http://${req.headers.host || ''}`);
  if (hostname && !isAllowedHostHeader(hostname)) {
    return res.status(403).json({
      success: false,
      code: 'HOST_NOT_ALLOWED',
      error: tr('Este agente sólo atiende peticiones locales.'),
    });
  }

  next();
};

export const socketServerOptions: Partial<ServerOptions> = {
  cors: {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
  },
  allowRequest(req, callback) {
    const origin = req.headers.origin;
    if (origin && !isAllowedOrigin(origin)) return callback('ORIGIN_NOT_ALLOWED', false);

    const listenHost = process.env.HOST || '127.0.0.1';
    if (isLoopback(listenHost)) {
      const hostname = hostnameOf(`http://${req.headers.host || ''}`);
      if (hostname && !isAllowedHostHeader(hostname)) return callback('HOST_NOT_ALLOWED', false);
    }

    callback(null, true);
  },
};

const GAME_ROUTES = [
  '/api/server/telemetry',
  '/api/staff/in-game-access',
  '/api/sanctions/in-game',
  '/api/server/ingame-summary',
  '/api/server/screen-frame',
  '/api/sanctions/check',
  '/api/discord/whitelist/check',
  '/api/server/connecting',
  '/api/discord/whitelist/policy',
];

export function arrivedFromInternet(req: Request): boolean {
  const tunnel = getTunnelHostname();
  if (!tunnel) return false;

  const hostname = hostnameOf(`http://${req.headers.host || ''}`);
  return hostname !== null && hostname.toLowerCase() === tunnel;
}

function hasGameKey(req: Request, gameKey: string): boolean {
  const sent = req.headers['x-vxcore-key'];
  if (!gameKey || typeof sent !== 'string') return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(gameKey);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function gameRouteGuard(gameKey: string): RequestHandler {
  return (req, res, next) => {
    if (!GAME_ROUTES.includes(req.path)) return next();
    if (hasGameKey(req, gameKey)) return next();
    if (isLoopbackAddress(req.socket.remoteAddress) && !arrivedFromInternet(req)) return next();

    return res.status(403).json({
      success: false,
      code: 'LOCAL_ONLY',
      error: tr('Esta ruta la atiende el servidor de juego desde esta máquina, no desde internet.'),
    });
  };
}

const SETUP_ROUTES = [
  '/api/requirements',
  '/api/requirements/install/vcredist',
  '/api/requirements/install/fxserver',
];

export const setupRouteGuard: RequestHandler = (req, res, next) => {
  if (!SETUP_ROUTES.includes(req.path)) return next();
  if (!arrivedFromInternet(req)) return next();

  return res.status(403).json({
    success: false,
    code: 'LOCAL_ONLY',
    error: tr('Esta operación sólo puede hacerse desde el equipo donde corre VXCore.'),
  });
};

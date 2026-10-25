import type express from 'express';

import { getTunnelHostname } from './exposure';
import { trMsg, tr } from './idioma';

function clientKey(req: express.Request): string {
  const tunnel = getTunnelHostname();
  if (tunnel) {
    const host = String(req.headers.host || '').split(':')[0].toLowerCase();
    if (host === tunnel) {
      const forwarded = req.headers['cf-connecting-ip'];
      const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      if (ip && ip.trim()) return `cf:${ip.trim()}`;
    }
  }
  return `sock:${req.socket.remoteAddress || 'desconocida'}`;
}

interface Bucket {
  hits: number[];
}

const MAX_KEYS = 5000;

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message: string;
}

function rateLimit(options: RateLimitOptions): express.RequestHandler {
  const buckets = new Map<string, Bucket>();

  return (req, res, next) => {
    const now = Date.now();
    const key = clientKey(req);

    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= MAX_KEYS) {
        const oldest = buckets.keys().next().value;
        if (oldest !== undefined) buckets.delete(oldest);
      }
      bucket = { hits: [] };
      buckets.set(key, bucket);
    }

    const cutoff = now - options.windowMs;
    while (bucket.hits.length > 0 && bucket.hits[0] <= cutoff) bucket.hits.shift();

    if (bucket.hits.length >= options.max) {
      const retryAfter = Math.ceil((bucket.hits[0] + options.windowMs - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(retryAfter, 1)));
      return res.status(429).json({
        success: false,
        code: 'TOO_MANY_ATTEMPTS',
        error: tr(options.message),
      });
    }

    bucket.hits.push(now);
    next();
  };
}

export const authAttemptLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: trMsg('Demasiados intentos. Espera unos minutos y vuelve a probar.'),
});

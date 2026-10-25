import type { Router } from 'express';
import type { AgentContext } from '../http/context';
import { createRouter } from '../http/helpers';
import { isLocalRequest } from '../http/security';
import { LOCALES, getLocale, isLocale, isLocaleChosen, setLocale, tr } from '../idioma';
import { getInstallation } from '../installation';

export function systemRouter(ctx: AgentContext, shutdown: (signal: string) => void): Router {
  const { processManager } = ctx;
  const router = createRouter();

  router.get('/api/health', (req, res) => {
    res.json({
      status: 'Agent is running',
      version: '1.0.0',
      appVersion: process.env.VX_APP_VERSION || null,
      pid: process.pid,
      installationId: getInstallation().id,
    });
  });

  router.post('/api/agent/shutdown', (req, res) => {
    if (!isLocalRequest(req)) {
      return res.status(403).json({ success: false, error: tr('Sólo desde el propio equipo.') });
    }

    console.log('[Agent] El escritorio pide el puerto: cerrando para dejar paso a la versión nueva.');
    res.json({ success: true });
    setTimeout(() => shutdown('SHUTDOWN_REQUEST'), 150);
  });

  router.get('/api/locale', (req, res) => {
    res.json({ success: true, locale: getLocale(), chosen: isLocaleChosen(), locales: LOCALES });
  });

  router.post('/api/settings/locale', (req, res) => {
    const { locale } = req.body || {};
    if (!isLocale(locale)) {
      return res.status(400).json({ success: false, error: tr('Idioma no válido: {idioma}', { idioma: String(locale) }) });
    }
    setLocale(locale);

    const enJuego = processManager.isRunning()
      ? processManager.executeCommand(`vxcore_event vxcore:idioma ${JSON.stringify({ locale })}`).success
      : false;

    res.json({ success: true, locale, chosen: true, inGame: enJuego });
  });

  return router;
}

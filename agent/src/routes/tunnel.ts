import type { Router } from 'express';
import { sessionOf } from '../http/auth';
import { createRouter, errMsg } from '../http/helpers';
import { isLocalRequest } from '../http/security';
import { tr } from '../idioma';
import {
  clearCredentials as clearTunnelCredentials,
  getTunnelEvents,
  getTunnelState,
  retryNow as retryTunnelNow,
  setCredentials as setTunnelCredentials,
  setPanelPort,
  setRemoteAccessEnabled,
} from '../tunnel';

export function tunnelRouter(): Router {
  const router = createRouter();

  router.get('/api/tunnel/status', async (req, res) => {
    res.json({ success: true, tunnel: await getTunnelState(), events: getTunnelEvents() });
  });

  router.post('/api/tunnel/retry', async (req, res) => {
    try {
      await retryTunnelNow();
      res.json({ success: true, tunnel: await getTunnelState() });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.post('/api/tunnel/credentials', async (req, res) => {
    const session = sessionOf(req);
    if (session && session.level !== 'owner') {
      return res.status(403).json({ success: false, error: tr('Sólo el dueño del panel puede configurar el túnel.') });
    }

    try {
      const { hostname, credentials } = req.body || {};
      const result = await setTunnelCredentials(hostname, credentials);
      res.status(result.ok ? 200 : 400).json({
        success: result.ok,
        message: result.message,
        tunnel: await getTunnelState(),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.delete('/api/tunnel/credentials', async (req, res) => {
    const session = sessionOf(req);
    if (session && session.level !== 'owner') {
      return res.status(403).json({ success: false, error: tr('Sólo el dueño del panel puede quitar el túnel.') });
    }

    try {
      const result = await clearTunnelCredentials();
      res.status(result.ok ? 200 : 400).json({
        success: result.ok,
        message: result.message,
        tunnel: await getTunnelState(),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.post('/api/tunnel/enabled', (req, res) => {
    const session = sessionOf(req);
    if (session && session.level !== 'owner') {
      return res.status(403).json({
        success: false,
        error: tr('Sólo el dueño del panel puede publicarlo en internet.'),
      });
    }

    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: tr('Falta el valor.') });
    }

    setRemoteAccessEnabled(enabled);
    res.json({ success: true });
  });

  router.post('/api/tunnel/panel-port', (req, res) => {
    if (!isLocalRequest(req)) {
      return res.status(403).json({ success: false, error: tr('Sólo desde esta máquina.') });
    }

    const port = Number((req.body || {}).port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      return res.status(400).json({ success: false, error: tr('Puerto no válido.') });
    }

    setPanelPort(port);
    res.json({ success: true });
  });

  return router;
}

import type { Router } from 'express';
import { noticeCommand, noticeReply } from '../automations';
import type { AgentContext } from '../http/context';
import { createRouter, errMsg } from '../http/helpers';
import { tr } from '../idioma';
import { open77Command } from '../open77';
import { LOG_ROOM } from '../process-manager';

const ANNOUNCE_MAX_TITLE = 60;
const ANNOUNCE_MAX_MESSAGE = 280;

export function consoleRouter(ctx: AgentContext): Router {
  const { io, processManager } = ctx;
  const router = createRouter();

  router.post('/api/server/command', async (req, res) => {
    const { command } = req.body || {};
    if (typeof command !== 'string' || !command) {
      return res.status(400).json({ success: false, error: tr('El comando es requerido') });
    }

    const running = processManager.getRunningServer();
    if (running?.game === 'open77') {
      io.to(LOG_ROOM).emit('server-log', { type: 'stdin', message: `> ${command}`, time: new Date().toISOString() });
      try {
        const out = await open77Command(running.cfgPath, String(command));
        for (const line of String(out.output || '').split(/\r?\n/)) {
          if (line.trim()) io.to(LOG_ROOM).emit('server-log', { type: 'stdout', message: line, time: new Date().toISOString() });
        }
        if (out.ok) return res.json({ success: true, message: tr('Comando enviado por RCON') });
        return res.status(409).json({ success: false, code: 'RCON_FAILED', error: out.error || tr('El servidor rechazó el comando') });
      } catch (err) {
        console.warn('[Open77] RCON no disponible, uso la consola:', errMsg(err));
      }
    }

    const result = processManager.executeCommand(command);
    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.status(409).json({ success: false, code: result.code, error: result.message });
    }
  });

  router.post('/api/server/announce', async (req, res) => {
    const { title, message, type, duration, sound } = req.body || {};

    const texto = typeof message === 'string' ? message.trim() : '';
    if (!texto) {
      return res.status(400).json({ success: false, error: tr('Escribe el texto del anuncio.') });
    }
    if (texto.length > ANNOUNCE_MAX_MESSAGE) {
      return res
        .status(400)
        .json({ success: false, error: tr('El anuncio no puede pasar de {ANNOUNCE_MAX_MESSAGE} caracteres.', { ANNOUNCE_MAX_MESSAGE }) });
    }
    const titulo = typeof title === 'string' ? title.trim().slice(0, ANNOUNCE_MAX_TITLE) : '';

    const answer = processManager.waitForLine((line) => noticeReply(line) !== null, 4000);

    const result = processManager.executeCommand(
      noticeCommand(titulo || tr('Anuncio'), texto, String(type || 'info'), Number(duration), sound !== false)
    );
    if (!result.success) {
      return res.status(409).json({ success: false, code: result.code, error: result.message });
    }

    const line = await answer;
    if (line && noticeReply(line) === 'missing') {
      return res.status(409).json({
        success: false,
        code: 'VXCORE_RESOURCE_MISSING',
        error:
          tr('El recurso vxcore no está arrancado en el servidor, así que el anuncio no le llega a nadie. Instálalo desde Ajustes → Agente & In-Game y reinicia el servidor.'),
      });
    }

    res.json({
      success: true,
      confirmed: Boolean(line),
    });
  });

  return router;
}

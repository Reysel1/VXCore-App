import type { Router } from 'express';
import fs from 'fs';
import {
  EDITABLE_SETTINGS,
  isEditableSetting,
  readOneSync,
  readSetting,
  writeConvar,
  writeSetting,
} from '../cfg-convars';
import { parseServerCfg } from '../cfg-parser';
import type { AgentContext } from '../http/context';
import { createRouter, errMsg, rejectUnknownServer } from '../http/helpers';
import { tr } from '../idioma';
import { readImportableCfg } from '../path-guards';
import { resolveKnownCfg } from '../server-registry';

export function cfgRouter(ctx: AgentContext): Router {
  const { processManager } = ctx;
  const router = createRouter();

  router.get('/api/server/onesync', (req, res) => {
    try {
      const cfgPath = String(req.query.cfgPath || '');
      if (!cfgPath || !fs.existsSync(cfgPath)) {
        return res.status(400).json({ success: false, error: tr('No se encuentra el server.cfg.') });
      }
      res.json({ success: true, ...readOneSync(fs.readFileSync(cfgPath, 'utf-8')) });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.post('/api/server/onesync', (req, res) => {
    try {
      const { cfgPath, mode } = req.body || {};
      if (typeof cfgPath !== 'string' || !fs.existsSync(cfgPath)) {
        return res.status(400).json({ success: false, error: tr('No se encuentra el server.cfg.') });
      }
      if (mode !== 'on' && mode !== 'legacy' && mode !== 'off') {
        return res.status(400).json({ success: false, error: tr('Modo de OneSync no válido.') });
      }

      const before = fs.readFileSync(cfgPath, 'utf-8');
      const after = writeConvar(before, 'onesync', mode);
      if (after !== before) fs.writeFileSync(cfgPath, after, 'utf-8');

      res.json({
        success: true,
        ...readOneSync(after),
        message:
          mode === 'off'
            ? tr('OneSync desactivado. Reinicia el servidor para aplicarlo.')
            : tr('OneSync en «{mode}». Reinicia el servidor para aplicarlo.', { mode }),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.get('/api/server/settings', (req, res) => {
    try {
      const cfgPath = String(req.query.cfgPath || '');
      if (!cfgPath || !fs.existsSync(cfgPath)) {
        return res.status(400).json({ success: false, error: tr('No se encuentra el server.cfg.') });
      }

      const content = fs.readFileSync(cfgPath, 'utf-8');
      const settings: Record<string, { value: string | null; commentedOnly: boolean }> = {};
      for (const name of Object.keys(EDITABLE_SETTINGS)) {
        const reading = readSetting(content, name);
        settings[name] = { value: reading.value, commentedOnly: reading.commentedOnly };
      }

      res.json({ success: true, settings });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.post('/api/server/settings', (req, res) => {
    try {
      const { cfgPath, name, value } = req.body || {};
      if (typeof cfgPath !== 'string' || !fs.existsSync(cfgPath)) {
        return res.status(400).json({ success: false, error: tr('No se encuentra el server.cfg.') });
      }
      if (typeof name !== 'string' || !isEditableSetting(name)) {
        return res.status(400).json({ success: false, error: tr('Ese ajuste no se puede editar desde aquí.') });
      }
      if (typeof value !== 'string') {
        return res.status(400).json({ success: false, error: tr('Falta el valor.') });
      }
      if (/[\r\n]/.test(value)) {
        return res.status(400).json({ success: false, error: tr('El valor no puede tener saltos de línea.') });
      }

      const before = fs.readFileSync(cfgPath, 'utf-8');
      const after = writeSetting(before, name, value.trim());
      if (after !== before) fs.writeFileSync(cfgPath, after, 'utf-8');

      const reading = readSetting(after, name);
      res.json({ success: true, name, value: reading.value, changed: after !== before });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.post('/api/server/parse-cfg', (req, res) => {
    try {
      const { cfgContent, filePath } = req.body || {};
      let content = typeof cfgContent === 'string' ? cfgContent : '';

      if (!content && filePath) {
        const read = readImportableCfg(filePath);
        if (!read.ok) return res.status(read.status).json({ success: false, error: read.error });
        content = read.content;
      }

      if (!content) {
        return res.status(400).json({ error: tr('Debes proporcionar el contenido o la ruta del archivo server.cfg') });
      }

      const parsed = parseServerCfg(content);
      res.json({
        success: true,
        server: {
          ...parsed,
          rawContent: content,
          cfgPath: filePath,
        },
      });
    } catch (error) {
      res.status(500).json({ error: tr('Error analizando server.cfg'), details: errMsg(error) });
    }
  });

  router.post('/api/server/save-cfg', (req, res) => {
    try {
      const { cfgContent, filePath } = req.body || {};

      if (typeof cfgContent !== 'string' || !cfgContent) {
        return res.status(400).json({ error: tr('No se ha proporcionado el contenido a guardar') });
      }

      const targetPath = resolveKnownCfg(filePath, processManager);
      if (!targetPath) return rejectUnknownServer(res);

      try {
        fs.copyFileSync(targetPath, `${targetPath}.bak`);
      } catch {}

      fs.writeFileSync(targetPath, cfgContent, 'utf-8');
      const parsed = parseServerCfg(cfgContent);

      console.log(`[Agent] Saved updated server.cfg to: ${targetPath}`);
      res.json({ success: true, message: tr('Configuración server.cfg guardada correctamente en el VPS.'), server: parsed });
    } catch (error) {
      console.error('[Agent] Error saving server.cfg:', error);
      res.status(500).json({ error: tr('Error guardando server.cfg'), details: errMsg(error) });
    }
  });

  return router;
}

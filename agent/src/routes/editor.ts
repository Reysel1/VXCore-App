import type { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { EDITABLE_EXTENSIONS, resolveInsideResource, resolveResourceDir, scanResourcesOnDisk } from '../disk-resources';
import { createRouter, errMsg } from '../http/helpers';
import { tr } from '../idioma';

const SEARCH_MAX_FILE_BYTES = 1_500_000;
const SEARCH_MAX_MATCHES = 400;
const SEARCH_MAX_PER_FILE = 20;
const SEARCH_TIME_BUDGET_MS = 25_000;

const SEARCH_CONCURRENCY = 12;

export function editorRouter(): Router {
  const router = createRouter();

  router.get('/api/resource/files', (req, res) => {
    try {
      const resourceName = (req.query.name as string) || '';
      const serverDataPath = req.query.serverDataPath as string;

      if (!resourceName || !serverDataPath) {
        return res.status(400).json({ success: false, error: tr('Faltan "name" y "serverDataPath"') });
      }

      const resourceDir = resolveResourceDir(serverDataPath, resourceName);
      if (!resourceDir) {
        return res.status(404).json({
          success: false,
          code: 'NOT_FOUND',
          error: tr('El recurso "{resourceName}" no existe en {path}.', { resourceName, path: path.join(serverDataPath, 'resources') }),
        });
      }

      const fileList: { path: string; isDir: boolean; editable: boolean }[] = [];
      const readDir = (dir: string, base = '', depth = 0) => {
        if (depth > 8) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name === '.git' || entry.name === 'node_modules') continue;
          const rel = base ? `${base}/${entry.name}` : entry.name;
          const isDir = entry.isDirectory();
          fileList.push({
            path: rel,
            isDir,
            editable: !isDir && EDITABLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
          });
          if (isDir) readDir(path.join(dir, entry.name), rel, depth + 1);
        }
      };

      readDir(resourceDir);
      res.json({ success: true, resourceDir, files: fileList });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.get('/api/resource/tree', (req, res) => {
    try {
      const serverDataPath = req.query.serverDataPath as string;
      if (!serverDataPath) {
        return res.status(400).json({ success: false, error: tr('Falta "serverDataPath"') });
      }

      const resourcesDir = path.join(serverDataPath, 'resources');
      if (!fs.existsSync(resourcesDir)) {
        return res.status(404).json({
          success: false,
          error: tr('No existe la carpeta de recursos: {resourcesDir}', { resourcesDir }),
        });
      }

      const resources = scanResourcesOnDisk(resourcesDir)
        .filter((entry) => entry.hasManifest)
        .map((entry) => {
          const files: { path: string; editable: boolean }[] = [];

          const walk = (dir: string, base = '', depth = 0) => {
            if (depth > 6) return;
            let entries: fs.Dirent[];
            try {
              entries = fs.readdirSync(dir, { withFileTypes: true });
            } catch {
              return;
            }

            for (const child of entries) {
              if (child.name === '.git' || child.name === 'node_modules') continue;
              if (child.name === '.fiveos-backups') continue;

              const rel = base ? `${base}/${child.name}` : child.name;
              if (child.isDirectory()) {
                walk(path.join(dir, child.name), rel, depth + 1);
              } else if (EDITABLE_EXTENSIONS.has(path.extname(child.name).toLowerCase())) {
                files.push({ path: rel, editable: true });
              }
            }
          };

          walk(entry.path);
          return { name: entry.name, category: entry.category, fileCount: files.length, files };
        })
        .filter((r) => r.fileCount > 0)
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json({ success: true, resources });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.get('/api/resource/search', async (req, res) => {
    try {
      const { serverDataPath, q } = req.query as Record<string, string>;
      const onlyResource = ((req.query.resource as string) || '').trim();
      const caseSensitive = req.query.caseSensitive === '1';
      const wholeWord = req.query.wholeWord === '1';

      if (!serverDataPath) {
        return res.status(400).json({ success: false, error: tr('Falta "serverDataPath"') });
      }
      const needle = (q || '').trim();
      if (needle.length < 2) {
        return res.status(400).json({ success: false, error: tr('Escribe al menos dos caracteres.') });
      }

      const resourcesDir = path.join(serverDataPath, 'resources');
      if (!fs.existsSync(resourcesDir)) {
        return res.status(404).json({ success: false, error: tr('No existe la carpeta de recursos: {resourcesDir}', { resourcesDir }) });
      }

      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(wholeWord ? `\\b${escaped}\\b` : escaped, caseSensitive ? 'g' : 'gi');

      const started = Date.now();
      const matches: { resource: string; file: string; line: number; column: number; text: string }[] = [];
      let filesScanned = 0;
      let truncated = false;

      const candidates: { resource: string; file: string; full: string }[] = [];
      const resources = scanResourcesOnDisk(resourcesDir).filter((entry) => entry.hasManifest);

      for (const entry of resources) {
        if (onlyResource && entry.name !== onlyResource) continue;

        const walk = (dir: string, base = '', depth = 0): void => {
          if (depth > 6) return;
          let children: fs.Dirent[];
          try {
            children = fs.readdirSync(dir, { withFileTypes: true });
          } catch {
            return;
          }

          for (const child of children) {
            if (child.name === '.git' || child.name === 'node_modules' || child.name === '.fiveos-backups') continue;

            const rel = base ? `${base}/${child.name}` : child.name;
            if (child.isDirectory()) {
              walk(path.join(dir, child.name), rel, depth + 1);
            } else if (EDITABLE_EXTENSIONS.has(path.extname(child.name).toLowerCase())) {
              candidates.push({ resource: entry.name, file: rel, full: path.join(dir, child.name) });
            }
          }
        };

        walk(entry.path);
      }

      let next = 0;

      const worker = async (): Promise<void> => {
        for (;;) {
          if (truncated) return;
          const index = next++;
          if (index >= candidates.length) return;
          if (Date.now() - started > SEARCH_TIME_BUDGET_MS) {
            truncated = true;
            return;
          }

          const candidate = candidates[index];
          let content: string;
          try {
            const stat = await fs.promises.stat(candidate.full);
            if (stat.size > SEARCH_MAX_FILE_BYTES) continue;
            content = await fs.promises.readFile(candidate.full, 'utf-8');
          } catch {
            continue;
          }

          filesScanned += 1;
          pattern.lastIndex = 0;
          if (!pattern.test(content)) continue;

          let enFichero = 0;
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            pattern.lastIndex = 0;
            const found = pattern.exec(lines[i]);
            if (!found) continue;

            matches.push({
              resource: candidate.resource,
              file: candidate.file,
              line: i + 1,
              column: found.index,
              text: lines[i].length > 240 ? `${lines[i].slice(0, 240)}…` : lines[i],
            });

            enFichero += 1;
            if (matches.length >= SEARCH_MAX_MATCHES) {
              truncated = true;
              return;
            }
            if (enFichero >= SEARCH_MAX_PER_FILE) break;
          }
        }
      };

      await Promise.all(Array.from({ length: SEARCH_CONCURRENCY }, worker));

      matches.sort(
        (a, b) =>
          a.resource.localeCompare(b.resource) || a.file.localeCompare(b.file) || a.line - b.line
      );

      res.json({
        success: true,
        matches,
        truncated,
        filesScanned,
        filesTotal: candidates.length,
        ms: Date.now() - started,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.get('/api/resource/file', (req, res) => {
    try {
      const { name, serverDataPath, filePath } = req.query as Record<string, string>;
      if (!name || !serverDataPath || !filePath) {
        return res.status(400).json({ success: false, error: tr('Faltan "name", "serverDataPath" y "filePath"') });
      }

      const resourceDir = resolveResourceDir(serverDataPath, name);
      if (!resourceDir) {
        return res.status(404).json({ success: false, error: tr('El recurso "{name}" no existe en disco.', { name }) });
      }

      const fullPath = resolveInsideResource(resourceDir, filePath);
      if (!fullPath) {
        return res.status(400).json({ success: false, error: tr('Ruta fuera del recurso') });
      }
      if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        return res.status(404).json({ success: false, error: tr('No existe el fichero {filePath}', { filePath }) });
      }

      res.json({ success: true, content: fs.readFileSync(fullPath, 'utf-8') });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  router.post('/api/resource/save-file', (req, res) => {
    try {
      const { resourceName, filePath, content, serverDataPath } = req.body || {};
      if (!resourceName || typeof filePath !== 'string' || !filePath || !serverDataPath || typeof content !== 'string') {
        return res.status(400).json({ success: false, error: tr('Faltan datos para guardar el fichero') });
      }
      if (!EDITABLE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
        return res.status(400).json({ success: false, error: tr('Ese tipo de fichero no se puede guardar desde el editor.') });
      }

      const resourceDir = resolveResourceDir(serverDataPath, resourceName);
      if (!resourceDir) {
        return res.status(404).json({ success: false, error: tr('El recurso "{resourceName}" no existe en disco.', { resourceName }) });
      }

      const fullPath = resolveInsideResource(resourceDir, filePath);
      if (!fullPath) {
        return res.status(400).json({ success: false, error: tr('Ruta fuera del recurso') });
      }

      let backupPath: string | null = null;
      if (fs.existsSync(fullPath)) {
        const backupDir = path.join(resourceDir, '.fiveos-backups', path.dirname(filePath));
        fs.mkdirSync(backupDir, { recursive: true });

        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        backupPath = path.join(backupDir, `${path.basename(filePath)}.${stamp}.bak`);
        fs.copyFileSync(fullPath, backupPath);
      }

      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf-8');
      console.log(`[Agent] Guardado ${fullPath}${backupPath ? ` (copia: ${backupPath})` : ''}`);

      res.json({
        success: true,
        message: tr('Guardado en {fullPath}', { fullPath }),
        backupPath,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: errMsg(error) });
    }
  });

  return router;
}

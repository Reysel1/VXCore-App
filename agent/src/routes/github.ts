import type { Router } from 'express';
import * as github from '../github';
import { createRouter } from '../http/helpers';
import { tr } from '../idioma';

export function githubRouter(): Router {
  const router = createRouter();

  router.get('/api/github/status', (req, res) => {
    res.json({ success: true, config: github.toPublic(github.loadGithubConfig()) });
  });

  router.post('/api/github/config', async (req, res) => {
    const { token, repo, branch } = req.body || {};
    const current = github.loadGithubConfig();
    const result = await github.saveConfig({ token, repo, branch }, current);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error, config: result.config });
    }
    res.json({ success: true, config: result.config });
  });

  router.post('/api/github/commits', async (req, res) => {
    const config = github.loadGithubConfig();
    if (!config) return res.status(400).json({ success: false, error: tr('Conecta GitHub primero.') });
    const count = Number(req.body?.count) || 50;
    const result = await github.fetchCommits(config, count);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    res.json({ success: true, commits: result.commits });
  });

  router.post('/api/github/changelog/generate', async (req, res) => {
    const config = github.loadGithubConfig();
    if (!config) return res.status(400).json({ success: false, error: tr('Conecta GitHub primero.') });
    const { version, count } = req.body || {};
    const result = await github.fetchCommits(config, Number(count) || 50);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    const markdown = github.buildChangelog(result.commits || [], String(version || '0.1.0'));
    res.json({ success: true, markdown, commits: result.commits });
  });

  router.get('/api/github/changelog', async (req, res) => {
    const config = github.loadGithubConfig();
    if (!config) return res.status(400).json({ success: false, error: tr('Conecta GitHub primero.') });
    const result = await github.fetchChangelog(config);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    res.json({ success: true, content: result.content, sha: result.sha });
  });

  router.post('/api/github/changelog/save', async (req, res) => {
    const config = github.loadGithubConfig();
    if (!config) return res.status(400).json({ success: false, error: tr('Conecta GitHub primero.') });
    const { content, sha } = req.body || {};
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ success: false, error: tr('No hay contenido que guardar.') });
    }
    const result = await github.pushChangelog(config, content, typeof sha === 'string' ? sha : undefined);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    res.json({ success: true, commitUrl: result.commitUrl, newSha: result.newSha });
  });

  return router;
}

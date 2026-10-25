import type { Router } from 'express';
import { DbService, type DbConfig } from '../db-service';
import { createRouter } from '../http/helpers';
import { tr } from '../idioma';

interface DbConfigRequest {
  connectionString?: string;
  dbConfig?: DbConfig;
  host?: string;
  port?: number | string;
  user?: string;
  password?: string;
  database?: string;
}

function extractDbConfig(reqBody: DbConfigRequest): DbConfig {
  if (reqBody.connectionString) {
    return { connectionString: reqBody.connectionString };
  }
  if (reqBody.dbConfig) {
    return reqBody.dbConfig;
  }
  return {
    host: reqBody.host || '127.0.0.1',
    port: reqBody.port ? Number(reqBody.port) : 3306,
    user: reqBody.user || 'root',
    password: reqBody.password || '',
    database: reqBody.database || 'fivem_db',
  };
}

export function databaseRouter(): Router {
  const router = createRouter();

  router.post('/api/db/test', async (req, res) => {
    const dbConfig = extractDbConfig(req.body);
    const result = await DbService.testConnection(dbConfig);
    res.json(result);
  });

  router.post('/api/db/tables', async (req, res) => {
    const dbConfig = extractDbConfig(req.body);
    const result = await DbService.getTables(dbConfig);
    res.json(result);
  });

  router.post('/api/db/schema', async (req, res) => {
    const dbConfig = extractDbConfig(req.body);
    const { tableName } = req.body;
    if (!tableName) {
      return res.status(400).json({ success: false, error: tr('tableName es requerido') });
    }
    const result = await DbService.getTableColumns(dbConfig, tableName);
    res.json(result);
  });

  router.post('/api/db/query', async (req, res) => {
    const dbConfig = extractDbConfig(req.body);
    const { query, params } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, error: tr('La consulta SQL es requerida') });
    }
    const result = await DbService.executeQuery(dbConfig, query, params || []);
    res.json(result);
  });

  return router;
}

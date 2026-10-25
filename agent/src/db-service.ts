import mysql from 'mysql2/promise';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { tr } from './idioma';

export interface DbConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  connectionString?: string;
}

export interface DbPlayer {
  id: number;
  citizenid: string;
  name: string;
  license: string;
  discord: string;
  ip: string;
  ping: number;
  job: string;
  jobGrade: string;
  gang: string;
  cash: number;
  bank: number;
  crypto: number;
  health: number;
  armor: number;
  coords: { x: number; y: number; z: number };
  isOnline: boolean;
}

interface DbError {
  message?: string;
  code?: string;
}

interface QbCharinfo {
  firstname?: string;
  lastname?: string;
}

interface QbJob {
  name?: string;
  label?: string;
  grade?: { name?: string } | string | number | null;
}

interface QbMoney {
  cash?: number | string;
  bank?: number | string;
  crypto?: number | string;
}

interface QbMetadata {
  health?: number | string;
  armor?: number | string;
}

interface EsxAccounts {
  money?: number | string;
  bank?: number | string;
}

function jsonColumn<T>(value: unknown): T {
  return (typeof value === 'string' ? JSON.parse(value) : (value || {})) as T;
}

function parseConnectionString(connStr: string): mysql.ConnectionOptions {
  if (!connStr || typeof connStr !== 'string') {
    return { host: '127.0.0.1', port: 3306, user: 'root', password: '', database: 'fivem_db' };
  }

  const clean = connStr.trim().replace(/^set\s+mysql_connection_string\s+/i, '').replace(/^"|"$/g, '').trim();

  if (clean.startsWith('mysql://')) {
    try {
      const url = new URL(clean);
      return {
        host: url.hostname || '127.0.0.1',
        port: url.port ? parseInt(url.port, 10) : 3306,
        user: decodeURIComponent(url.username || 'root'),
        password: decodeURIComponent(url.password || ''),
        database: url.pathname ? url.pathname.replace(/^\//, '') : 'fivem_db',
      };
    } catch {}
  }

  const options: { host: string; port: number; user: string; password: string; database: string } = {
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: '',
  };

  const parts = clean.split(';').map(p => p.trim()).filter(Boolean);
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.substring(0, eqIdx).trim().toLowerCase();
    const val = part.substring(eqIdx + 1).trim();

    if (key === 'host' || key === 'server' || key === 'datasource' || key === 'data source') {
      options.host = val;
    } else if (key === 'port') {
      options.port = parseInt(val, 10) || 3306;
    } else if (key === 'user' || key === 'userid' || key === 'uid' || key === 'user id') {
      options.user = val;
    } else if (key === 'password' || key === 'pwd' || key === 'pass') {
      options.password = val;
    } else if (key === 'database' || key === 'initial catalog' || key === 'db') {
      options.database = val;
    }
  }

  return options;
}

function buildConnectionOptions(config: DbConfig): mysql.ConnectionOptions {
  if (config.connectionString) {
    return parseConnectionString(config.connectionString);
  }
  return {
    host: config.host || '127.0.0.1',
    port: config.port || 3306,
    user: config.user || 'root',
    password: config.password || '',
    database: config.database || '',
    connectTimeout: 5000,
  };
}

export class DbService {
  private static async createConn(config: DbConfig) {
    const opts = buildConnectionOptions(config);
    return await mysql.createConnection({
      ...opts,
      connectTimeout: 4000,
    });
  }

  static async testConnection(config: DbConfig) {
    let conn: mysql.Connection | null = null;
    try {
      conn = await this.createConn(config);
      await conn.ping();
      const [rows] = await conn.query('SELECT DATABASE() as currentDb, VERSION() as version');
      return {
        success: true,
        message: tr('Conexión a MySQL exitosa'),
        details: Array.isArray(rows) && rows[0] ? rows[0] : null,
      };
    } catch (err) {
      const e = err as DbError;
      return {
        success: false,
        message: tr('Error de conexión MySQL: {message}', { message: e.message }),
        error: e.code || e.message,
      };
    } finally {
      if (conn) {
        try { await conn.end(); } catch {}
      }
    }
  }

  static async getTables(config: DbConfig) {
    let conn: mysql.Connection | null = null;
    try {
      conn = await this.createConn(config);
      const [rows] = await conn.query<RowDataPacket[]>('SHOW TABLE STATUS');

      const tables = (rows || []).map((row) => ({
        name: row.Name || row.name,
        rows: row.Rows !== undefined ? Number(row.Rows) : 0,
        engine: row.Engine || 'InnoDB',
        dataLength: row.Data_length !== undefined ? Number(row.Data_length) : 0,
        collation: row.Collation || 'utf8mb4_general_ci',
        createTime: row.Create_time,
      }));

      return { success: true, tables };
    } catch (err) {
      return { success: false, error: (err as DbError).message, tables: [] };
    } finally {
      if (conn) {
        try { await conn.end(); } catch {}
      }
    }
  }

  static async getTableColumns(config: DbConfig, tableName: string) {
    let conn: mysql.Connection | null = null;
    try {
      conn = await this.createConn(config);
      const [columns] = await conn.query<RowDataPacket[]>(`SHOW FULL COLUMNS FROM \`${tableName.replace(/`/g, '')}\``);
      return {
        success: true,
        columns: (columns || []).map((col) => ({
          field: col.Field,
          type: col.Type,
          null: col.Null,
          key: col.Key,
          default: col.Default,
          extra: col.Extra,
          comment: col.Comment,
        })),
      };
    } catch (err) {
      return { success: false, error: (err as DbError).message, columns: [] };
    } finally {
      if (conn) {
        try { await conn.end(); } catch {}
      }
    }
  }

  static async executeQuery(config: DbConfig, sql: string, params: unknown[] = []) {
    let conn: mysql.Connection | null = null;
    const startTime = Date.now();
    try {
      conn = await this.createConn(config);
      const [result, fields] = await conn.query<RowDataPacket[] | ResultSetHeader>(sql, params);
      const executionTimeMs = Date.now() - startTime;

      if (Array.isArray(result)) {
        const columnNames = fields ? fields.map((f) => f.name) : (result.length > 0 ? Object.keys(result[0]) : []);
        return {
          success: true,
          type: 'select',
          rows: result,
          columns: columnNames,
          rowCount: result.length,
          executionTimeMs,
        };
      } else {
        return {
          success: true,
          type: 'mutation',
          affectedRows: result.affectedRows,
          insertId: result.insertId,
          changedRows: result.changedRows,
          executionTimeMs,
        };
      }
    } catch (err) {
      const executionTimeMs = Date.now() - startTime;
      return {
        success: false,
        error: (err as DbError).message,
        executionTimeMs,
      };
    } finally {
      if (conn) {
        try { await conn.end(); } catch {}
      }
    }
  }

  static async addPlayerMoney(config: DbConfig, citizenid: string, account: string, amount: number): Promise<void> {
    const conn = await this.createConn(config);
    try {
      const [rows] = await conn.query<RowDataPacket[]>('SELECT `money` FROM `players` WHERE `citizenid` = ?', [citizenid]);
      if (!Array.isArray(rows) || !rows[0]) return;
      const money = jsonColumn<Record<string, unknown>>(rows[0].money);
      money[account] = (Number(money[account]) || 0) + amount;
      await conn.query('UPDATE `players` SET `money` = ? WHERE `citizenid` = ?', [JSON.stringify(money), citizenid]);
    } finally {
      try { await conn.end(); } catch {}
    }
  }

  static async getPlayersFromDb(
    config: DbConfig
  ): Promise<{ success: boolean; framework?: string; players: DbPlayer[]; error?: string }> {
    let conn: mysql.Connection | null = null;
    try {
      conn = await this.createConn(config);

      const [tables] = await conn.query<RowDataPacket[]>("SHOW TABLES LIKE 'players'");
      if (Array.isArray(tables) && tables.length > 0) {
        const [rows] = await conn.query<RowDataPacket[]>('SELECT * FROM `players` ORDER BY `id` DESC LIMIT 100');
        const players = (rows || []).map((row): DbPlayer => {
          let charinfo: QbCharinfo = {};
          let job: QbJob = {};
          let money: QbMoney = {};
          let metadata: QbMetadata = {};

          try { charinfo = jsonColumn<QbCharinfo>(row.charinfo); } catch {}
          try { job = jsonColumn<QbJob>(row.job); } catch {}
          try { money = jsonColumn<QbMoney>(row.money); } catch {}
          try { metadata = jsonColumn<QbMetadata>(row.metadata); } catch {}

          const name = (charinfo.firstname && charinfo.lastname)
            ? `${charinfo.firstname} ${charinfo.lastname}`
            : (row.name || row.citizenid || `Player #${row.id}`);

          return {
            id: row.id,
            citizenid: row.citizenid || `CID-${row.id}`,
            name,
            license: row.license || '',
            discord: row.discord || '',
            ip: row.ip || '127.0.0.1',
            ping: 0,
            job: job.name || job.label || tr('Desempleado'),
            jobGrade: (typeof job.grade === 'object' ? job.grade?.name : undefined) || (typeof job.grade === 'string' ? job.grade : tr('Grado 0')),
            gang: row.gang ? (typeof row.gang === 'string' ? row.gang : JSON.stringify(row.gang)) : tr('Ninguna'),
            cash: Number(money.cash || 0),
            bank: Number(money.bank || 0),
            crypto: Number(money.crypto || 0),
            health: metadata.health !== undefined ? Number(metadata.health) : 100,
            armor: metadata.armor !== undefined ? Number(metadata.armor) : 0,
            coords: typeof row.position === 'string' ? (JSON.parse(row.position || '{}')) : (row.position || { x: 0, y: 0, z: 0 }),
            isOnline: false,
          };
        });
        return { success: true, framework: 'QBCore', players };
      }

      const [esxTables] = await conn.query<RowDataPacket[]>("SHOW TABLES LIKE 'users'");
      if (Array.isArray(esxTables) && esxTables.length > 0) {
        const [rows] = await conn.query<RowDataPacket[]>('SELECT * FROM `users` LIMIT 100');
        const players = (rows || []).map((row, idx): DbPlayer => {
          let accounts: EsxAccounts = {};
          try { accounts = typeof row.accounts === 'string' ? JSON.parse(row.accounts) : {}; } catch {}

          const name = (row.firstname && row.lastname)
            ? `${row.firstname} ${row.lastname}`
            : (row.name || row.identifier || `User #${idx + 1}`);

          return {
            id: idx + 1,
            citizenid: row.identifier || `ESX-${idx + 1}`,
            name,
            license: row.identifier || '',
            discord: '',
            ip: '127.0.0.1',
            ping: 0,
            job: row.job || 'unemployed',
            jobGrade: tr('Grado {valor}', { valor: row.job_grade || 0 }),
            gang: tr('Ninguna'),
            cash: Number(accounts.money || row.money || 0),
            bank: Number(accounts.bank || row.bank || 0),
            crypto: 0,
            health: 100,
            armor: 0,
            coords: { x: 0, y: 0, z: 0 },
            isOnline: false,
          };
        });
        return { success: true, framework: 'ESX', players };
      }

      return { success: true, framework: 'Generic', players: [] };
    } catch (err) {
      return { success: false, error: (err as DbError).message, players: [] };
    } finally {
      if (conn) {
        try { await conn.end(); } catch {}
      }
    }
  }
}

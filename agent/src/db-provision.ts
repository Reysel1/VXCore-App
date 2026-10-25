import fs from 'fs';
import mysql from 'mysql2/promise';

import type { ProvisionProgress } from './provision';
import { tr } from './idioma';

export interface DbProvisionInput {
  host?: string;
  port?: number;
  user: string;
  password: string;
  database?: string;
}

export interface DbProvisionResult {
  ok: boolean;
  message: string;
  database?: string;
  tables?: number;
}

export function defaultDatabaseFor(framework: string | null | undefined): string {
  if (framework === 'qbcore') return 'qbcore';
  if (framework === 'esx') return 'esx_legacy';
  return 'fivem_db';
}

function sanitizeDatabaseName(raw: string): string {
  return raw.trim().replace(/[^\w-]/g, '_').slice(0, 64);
}

async function importSqlFile(
  connection: mysql.Connection,
  sqlFile: string
): Promise<{ statements: number }> {
  const raw = fs.readFileSync(sqlFile, 'utf-8');

  const chunks = raw
    .split(/;\s*(?:\r?\n|$)/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  let executed = 0;
  const total = Math.max(chunks.length, 1);
  for (const chunk of chunks) {
    await connection.query(chunk);
    executed += 1;
    if (executed % 50 === 0 || executed === total) {
    }
  }
  return { statements: executed };
}

export async function provisionDatabase(
  input: DbProvisionInput,
  framework: string | null | undefined,
  sqlFile: string | undefined,
  onProgress: (progress: ProvisionProgress) => void
): Promise<DbProvisionResult> {
  const host = input.host?.trim() || '127.0.0.1';
  const port = Number(input.port) || 3306;
  const database = sanitizeDatabaseName(
    input.database?.trim() || defaultDatabaseFor(framework)
  );

  onProgress({ step: tr('Conectando a MySQL ({host}:{port})…', { host, port }), percent: null });

  let connection: mysql.Connection | null = null;
  try {
    connection = await mysql.createConnection({
      host,
      port,
      user: input.user,
      password: input.password,
      connectTimeout: 5000,
      multipleStatements: true,
    });

    onProgress({ step: tr('Creando la base de datos `{database}` si falta…', { database }), percent: null });
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await connection.query(`USE \`${database}\``);

    const [tables] = await connection.query('SHOW TABLES');
    const existing = Array.isArray(tables) ? tables.length : 0;

    if (sqlFile) {
      if (existing > 0) {
        onProgress({
          step: `La base ya tiene ${existing} tablas; no se importa nada dos veces.`,
          percent: null,
        });
        return {
          ok: true,
          message: `Base \`${database}\` lista (${existing} tablas existentes; SQL no reimportado).`,
          database,
          tables: existing,
        };
      }

      onProgress({ step: tr('Importando el SQL del framework…'), percent: 0 });
      const { statements } = await importSqlFile(connection, sqlFile);
      const [after] = await connection.query('SHOW TABLES');
      const count = Array.isArray(after) ? after.length : 0;
      onProgress({ step: tr('SQL importado ({count} tablas).', { count }), percent: 100 });

      return {
        ok: true,
        message: tr('Base `{database}` creada e importada ({count} tablas, {statements} sentencias).', { database, count, statements }),
        database,
        tables: count,
      };
    }

    onProgress({ step: tr('Base `{database}` lista.', { database }), percent: 100 });
    return {
      ok: true,
      message: tr('Base `{database}` lista ({existing} tablas).', { database, existing }),
      database,
      tables: existing,
    };
  } catch (error) {
    const err = error as { code?: string; message?: string };
    const code = err.code || '';
    const human =
      code === 'ER_ACCESS_DENIED_ERROR'
        ? tr('MySQL rechazó el usuario o la contraseña.')
        : code === 'ECONNREFUSED'
          ? tr('No hay ningún MySQL escuchando en {host}:{port}. Arranca MySQL (o XAMPP) e inténtalo de nuevo.', { host, port })
          : code === 'ER_DBACCESS_DENIED_ERROR'
            ? tr('El usuario no tiene permiso para crear bases de datos.')
            : err.message || String(error);
    return { ok: false, message: human };
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch {}
    }
  }
}

export function buildConnectionString(input: {
  host?: string;
  port?: number;
  user: string;
  password: string;
  database: string;
}): string {
  const host = input.host?.trim() || '127.0.0.1';
  const port = Number(input.port) || 3306;
  return `server=${host};port=${port};uid=${input.user};password=${input.password};database=${input.database}`;
}

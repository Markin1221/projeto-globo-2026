import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://bairro:bairro@localhost:5432/bairro',
  max: Number(process.env.DB_POOL_MAX ?? 10),
});

export type Conn = Pool | PoolClient;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function q<T = any>(sql: string, params: unknown[] = [], c: Conn = pool): Promise<T[]> {
  return (await c.query(sql, params)).rows as T[];
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? resolve(__dirname, '../../../../db/migrations');

export async function waitForDb(attempts = 30) {
  for (let i = 1; ; i++) {
    try { await pool.query('select 1'); return; } catch (e) {
      if (i >= attempts) throw e;
      console.log(`Aguardando o banco (${i}/${attempts})...`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

/** Aplica, em ordem, os arquivos .sql de db/migrations que ainda não rodaram. */
export async function migrate() {
  await pool.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await q<{ name: string }>('select name from schema_migrations')).map((r) => r.name));
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    await tx(async (c) => {
      await c.query(readFileSync(resolve(MIGRATIONS_DIR, f), 'utf8'));
      await c.query('insert into schema_migrations (name) values ($1)', [f]);
    });
    console.log(`Migração aplicada: ${f}`);
  }
}

export async function dropAll() {
  await pool.query('drop schema public cascade; create schema public;');
}

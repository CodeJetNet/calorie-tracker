import { DatabaseSync } from 'node:sqlite';
import type { Db } from '../src/db/types';

export function nodeDb(path = ':memory:'): Db {
  const db = new DatabaseSync(path);
  const bind = (p: unknown[]) => p.map(v => (v === undefined ? null : v)) as never[];
  return {
    exec: async sql => db.exec(sql),
    run: async (sql, params = []) => ({ changes: Number(db.prepare(sql).run(...bind(params)).changes) }),
    all: async (sql, params = []) => db.prepare(sql).all(...bind(params)) as never,
    tx: async fn => {
      db.exec('BEGIN');
      try { const r = await fn(); db.exec('COMMIT'); return r; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

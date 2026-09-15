import * as SQLite from 'expo-sqlite';
import type { Db } from './types';

export function wrap(db: SQLite.SQLiteDatabase): Db {
  return {
    exec: sql => db.execAsync(sql),
    run: async (sql, params = []) => ({ changes: (await db.runAsync(sql, params as SQLite.SQLiteBindValue[])).changes }),
    all: (sql, params = []) => db.getAllAsync(sql, params as SQLite.SQLiteBindValue[]),
    tx: async fn => {
      let result!: Awaited<ReturnType<typeof fn>>;
      await db.withTransactionAsync(async () => { result = await fn(); });
      return result;
    },
  };
}

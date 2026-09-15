import type { Db } from './types';

const MIGRATIONS: string[] = [
`CREATE TABLE entries (
  id TEXT PRIMARY KEY, day TEXT NOT NULL, meal TEXT NOT NULL, name TEXT NOT NULL,
  amount REAL, amount_desc TEXT, nutrients TEXT NOT NULL, food_ref TEXT,
  source TEXT NOT NULL DEFAULT 'app', health_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX entries_day ON entries(day);
CREATE TABLE custom_foods (
  id TEXT PRIMARY KEY, barcode TEXT, name TEXT NOT NULL, brand TEXT,
  serving_size REAL, serving_unit TEXT, serving_desc TEXT, nutrients TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX custom_foods_barcode ON custom_foods(barcode);
CREATE TABLE recipes (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, servings REAL NOT NULL,
  ingredients TEXT NOT NULL, nutrients TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE weights (day TEXT PRIMARY KEY, kg REAL NOT NULL);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
];

export const DIARY_SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: Db): Promise<void> {
  const [{ user_version }] = await db.all<{ user_version: number }>('PRAGMA user_version');
  for (let v = user_version; v < MIGRATIONS.length; v++) {
    await db.exec(MIGRATIONS[v]);
    await db.exec(`PRAGMA user_version = ${v + 1}`);
  }
}

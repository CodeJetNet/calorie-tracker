import type { Db } from '../db/types';
import { DEFAULT_TARGETS, type Nutrients } from '../nutrients';
import { diaryChanged } from './changed';

export const DEFAULT_MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

export async function getSetting(db: Db, key: string): Promise<string | null> {
  const [r] = await db.all<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return r?.value ?? null;
}
export async function setSetting(db: Db, key: string, value: string, notify = true): Promise<void> {
  await db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  if (notify) diaryChanged();
}
export async function getJson<T>(db: Db, key: string, fallback: T): Promise<T> {
  const v = await getSetting(db, key);
  return v ? (JSON.parse(v) as T) : fallback;
}
export async function allSettings(db: Db): Promise<Record<string, string>> {
  return Object.fromEntries((await db.all<{ key: string; value: string }>('SELECT key, value FROM settings')).map(r => [r.key, r.value]));
}
/** Per-nutrient daily goals: nutrients.json defaults with the user's overrides on top. */
export async function goals(db: Db): Promise<Nutrients> {
  return { ...DEFAULT_TARGETS, ...(await getJson<Nutrients>(db, 'goals', {})) };
}

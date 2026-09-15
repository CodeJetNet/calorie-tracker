import type { Db } from '../db/types';
import type { Nutrients } from '../nutrients';
import { diaryChanged } from './changed';

export type Entry = {
  id: string; day: string; meal: string; name: string;
  amount: number | null; amount_desc: string | null; nutrients: Nutrients;
  food_ref: string | null; source: 'app' | 'cronometer' | 'mfp'; health_id: string | null;
};
type Row = Omit<Entry, 'nutrients'> & { nutrients: string };
const COLS = 'id, day, meal, name, amount, amount_desc, nutrients, food_ref, source, health_id';
const fromRow = (r: Row): Entry => ({ ...r, nutrients: JSON.parse(r.nutrients) });
const params = (e: Entry) => [e.id, e.day, e.meal, e.name, e.amount, e.amount_desc, JSON.stringify(e.nutrients), e.food_ref, e.source, e.health_id];

export async function addEntry(db: Db, e: Entry): Promise<void> {
  await db.run(`INSERT INTO entries (${COLS}) VALUES (?,?,?,?,?,?,?,?,?,?)`, params(e));
  diaryChanged();
}

export async function updateEntry(db: Db, e: Entry): Promise<void> {
  await db.run(`UPDATE entries SET day = ?, meal = ?, name = ?, amount = ?, amount_desc = ?, nutrients = ?, food_ref = ?, health_id = ?, updated_at = datetime('now') WHERE id = ?`,
    [e.day, e.meal, e.name, e.amount, e.amount_desc, JSON.stringify(e.nutrients), e.food_ref, e.health_id, e.id]);
  diaryChanged();
}

/** Bulk insert for imports. Duplicate ids are skipped. Returns inserted count. */
export async function insertEntries(db: Db, list: Entry[]): Promise<number> {
  let n = 0;
  await db.tx(async () => {
    for (const e of list) n += (await db.run(`INSERT OR IGNORE INTO entries (${COLS}) VALUES (?,?,?,?,?,?,?,?,?,?)`, params(e))).changes;
  });
  if (n) diaryChanged();
  return n;
}

export async function deleteEntry(db: Db, id: string): Promise<Entry | null> {
  const [row] = await db.all<Row>(`SELECT ${COLS} FROM entries WHERE id = ?`, [id]);
  if (!row) return null;
  await db.run('DELETE FROM entries WHERE id = ?', [id]);
  diaryChanged();
  return fromRow(row);
}

export async function setHealthId(db: Db, id: string, healthId: string | null): Promise<void> {
  await db.run('UPDATE entries SET health_id = ? WHERE id = ?', [healthId, id]);
}

export async function entriesForDay(db: Db, day: string): Promise<Entry[]> {
  return (await db.all<Row>(`SELECT ${COLS} FROM entries WHERE day = ? ORDER BY created_at`, [day])).map(fromRow);
}

export async function entriesBetween(db: Db, from: string, to: string): Promise<Entry[]> {
  return (await db.all<Row>(`SELECT ${COLS} FROM entries WHERE day BETWEEN ? AND ? ORDER BY day, created_at`, [from, to])).map(fromRow);
}

/** Most recently logged distinct names, for the Search screen's "recents". */
export async function recentEntries(db: Db, limit = 50): Promise<Entry[]> {
  return (await db.all<Row>(`SELECT ${COLS}, max(created_at) AS last FROM entries GROUP BY name ORDER BY last DESC LIMIT ?`, [limit])).map(fromRow);
}

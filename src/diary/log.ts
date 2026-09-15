// Every path that creates, edits or removes an entry goes through here so Health Connect stays in step with the diary.
import type { Db } from '../db/types';
import { deleteNutrition, writeNutrition } from '../health';
import { addEntry, deleteEntry, setHealthId, updateEntry, type Entry } from './entries';
import { getSetting } from './settings';

const enabled = async (db: Db) => (await getSetting(db, 'health_enabled')) === '1';

export async function logEntry(db: Db, e: Entry): Promise<void> {
  await addEntry(db, e);
  if (await enabled(db)) await setHealthId(db, e.id, await writeNutrition(e));
}

export async function unlogEntry(db: Db, id: string): Promise<Entry | null> {
  const e = await deleteEntry(db, id);
  if (e?.health_id) await deleteNutrition(e.health_id);
  return e;
}

export async function relogEntry(db: Db, e: Entry): Promise<void> {
  if (e.health_id) await deleteNutrition(e.health_id);
  await updateEntry(db, { ...e, health_id: null });
  if (await enabled(db)) await setHealthId(db, e.id, await writeNutrition(e));
}

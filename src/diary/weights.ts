import type { Db } from '../db/types';
import { diaryChanged } from './changed';
export type Weight = { day: string; kg: number };
export async function setWeight(db: Db, w: Weight) { await db.run('INSERT INTO weights (day, kg) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET kg = excluded.kg', [w.day, w.kg]); diaryChanged(); }
export async function deleteWeight(db: Db, day: string) { await db.run('DELETE FROM weights WHERE day = ?', [day]); diaryChanged(); }
export async function allWeights(db: Db) { return db.all<Weight>('SELECT day, kg FROM weights ORDER BY day DESC'); }

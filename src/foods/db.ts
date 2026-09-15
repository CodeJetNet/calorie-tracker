import type { Db, Row } from '../db/types';
import { PANEL, type Nutrients } from '../nutrients';

export type Food = {
  id: number; barcode: string | null; name: string; brand: string | null; source: string; source_id: string;
  serving_size: number | null; serving_unit: string | null; serving_desc: string | null;
  per100: Nutrients;
};
export type Portion = { description: string; grams: number };

/** Stable reference for entries and recipes. Never the rowid: it changes every build. */
export const foodRef = (f: Food) => `foods:${f.source}:${f.source_id}`;

const BASE = ['id', 'barcode', 'name', 'brand', 'source', 'source_id', 'serving_size', 'serving_unit', 'serving_desc'];
const SELECT = `SELECT ${[...BASE, ...PANEL.map(n => `n${n.id}`)].map(c => `foods.${c}`).join(', ')} FROM foods`;

function toFood(r: Row): Food {
  const per100: Nutrients = {};
  for (const n of PANEL) { const v = r[`n${n.id}`]; if (typeof v === 'number') per100[n.id] = v; }
  return {
    id: r.id as number, barcode: r.barcode as string | null, name: r.name as string, brand: r.brand as string | null,
    source: r.source as string, source_id: r.source_id as string, serving_size: r.serving_size as number | null, serving_unit: r.serving_unit as string | null,
    serving_desc: r.serving_desc as string | null, per100,
  };
}

export async function byBarcode(db: Db, gtin13: string): Promise<Food | null> {
  const [r] = await db.all(`${SELECT} WHERE barcode = ? LIMIT 1`, [gtin13]);
  return r ? toFood(r) : null;
}

/** Full record including the long-tail nutrients, keyed the same way as food_ref. */
export async function bySource(db: Db, source: string, sourceId: string): Promise<Food | null> {
  const [r] = await db.all(`${SELECT} WHERE source = ? AND source_id = ?`, [source, sourceId]);
  if (!r) return null;
  const f = toFood(r);
  for (const x of await db.all<{ nutrient: number; per100: number }>('SELECT nutrient, per100 FROM food_nutrients_extra WHERE food_id = ?', [f.id])) {
    f.per100[String(x.nutrient)] = x.per100;
  }
  return f;
}

export function ftsQuery(q: string): string {
  return q.trim().split(/\s+/).filter(Boolean).map(t => `"${t.replace(/"/g, '')}"*`).join(' ');
}

/** Generic foods first, so "egg" finds "Egg, whole, raw" before branded egg noodles. Under two characters nothing runs. */
export async function search(db: Db, q: string, limit = 30): Promise<Food[]> {
  const m = ftsQuery(q);
  if (!m || q.trim().length < 2) return [];
  const sql = `${SELECT.replace('FROM foods', 'FROM foods_fts JOIN foods ON foods.id = foods_fts.rowid')} WHERE foods_fts MATCH ? ORDER BY (foods.barcode IS NULL) DESC, rank LIMIT ?`;
  return (await db.all(sql, [m, limit])).map(toFood);
}

export async function portions(db: Db, foodId: number): Promise<Portion[]> {
  return db.all<Portion>('SELECT description, grams FROM portions WHERE food_id = ? ORDER BY grams', [foodId]);
}

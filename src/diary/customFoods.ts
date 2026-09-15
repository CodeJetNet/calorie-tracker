import type { Db } from '../db/types';
import type { Nutrients } from '../nutrients';
import { diaryChanged } from './changed';

export type CustomFood = {
  id: string; barcode: string | null; name: string; brand: string | null;
  serving_size: number | null; serving_unit: 'g' | 'ml' | null; serving_desc: string | null;
  nutrients: Nutrients;   // per 100 g or ml
};
type Row = Omit<CustomFood, 'nutrients'> & { nutrients: string };
const COLS = 'id, barcode, name, brand, serving_size, serving_unit, serving_desc, nutrients';
const fromRow = (r: Row): CustomFood => ({ ...r, nutrients: JSON.parse(r.nutrients) });

export async function upsertCustomFood(db: Db, f: CustomFood): Promise<void> {
  await db.run(`INSERT INTO custom_foods (${COLS}) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET barcode = excluded.barcode, name = excluded.name, brand = excluded.brand,
    serving_size = excluded.serving_size, serving_unit = excluded.serving_unit, serving_desc = excluded.serving_desc,
    nutrients = excluded.nutrients, updated_at = datetime('now')`,
    [f.id, f.barcode, f.name, f.brand, f.serving_size, f.serving_unit, f.serving_desc, JSON.stringify(f.nutrients)]);
  diaryChanged();
}
export async function deleteCustomFood(db: Db, id: string) { await db.run('DELETE FROM custom_foods WHERE id = ?', [id]); diaryChanged(); }
export async function customFood(db: Db, id: string) { const [r] = await db.all<Row>(`SELECT ${COLS} FROM custom_foods WHERE id = ?`, [id]); return r ? fromRow(r) : null; }
export async function customFoodByBarcode(db: Db, gtin13: string) { const [r] = await db.all<Row>(`SELECT ${COLS} FROM custom_foods WHERE barcode = ?`, [gtin13]); return r ? fromRow(r) : null; }
export async function searchCustomFoods(db: Db, q: string) { return (await db.all<Row>(`SELECT ${COLS} FROM custom_foods WHERE name LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT 30`, [`%${q.replace(/[\\%_]/g, '\\$&')}%`])).map(fromRow); }
export async function allCustomFoods(db: Db) { return (await db.all<Row>(`SELECT ${COLS} FROM custom_foods ORDER BY name`)).map(fromRow); }

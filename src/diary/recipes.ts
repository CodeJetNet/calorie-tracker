import type { Db } from '../db/types';
import { round3, sum, type Nutrients } from '../nutrients';
import { diaryChanged } from './changed';

export type Ingredient = { name: string; amount: number; nutrients: Nutrients; food_ref: string | null };  // nutrients for `amount`
export type Recipe = { id: string; name: string; servings: number; ingredients: Ingredient[]; nutrients: Nutrients };  // nutrients per serving

export function recipeNutrients(ingredients: Ingredient[], servings: number): Nutrients {
  const total = sum(ingredients.map(i => i.nutrients));
  const out: Nutrients = {};
  for (const [k, v] of Object.entries(total)) out[k] = round3(v / servings);
  return out;
}

type Row = { id: string; name: string; servings: number; ingredients: string; nutrients: string };
const fromRow = (r: Row): Recipe => ({ ...r, ingredients: JSON.parse(r.ingredients), nutrients: JSON.parse(r.nutrients) });

export async function upsertRecipe(db: Db, r: Recipe): Promise<void> {
  await db.run(`INSERT INTO recipes (id, name, servings, ingredients, nutrients) VALUES (?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, servings = excluded.servings, ingredients = excluded.ingredients,
    nutrients = excluded.nutrients, updated_at = datetime('now')`,
    [r.id, r.name, r.servings, JSON.stringify(r.ingredients), JSON.stringify(r.nutrients)]);
  diaryChanged();
}
export async function deleteRecipe(db: Db, id: string) { await db.run('DELETE FROM recipes WHERE id = ?', [id]); diaryChanged(); }
export async function recipe(db: Db, id: string) { const [r] = await db.all<Row>('SELECT id, name, servings, ingredients, nutrients FROM recipes WHERE id = ?', [id]); return r ? fromRow(r) : null; }
export async function allRecipes(db: Db) { return (await db.all<Row>('SELECT id, name, servings, ingredients, nutrients FROM recipes ORDER BY name')).map(fromRow); }

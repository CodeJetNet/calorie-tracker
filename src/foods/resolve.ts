// A food_ref is "foods:<source>:<source_id>" | "custom:<id>" | "recipe:<id>". Resolve one to what Food detail needs.
import type { Db } from '../db/types';
import type { Nutrients } from '../nutrients';
import { bySource, portions } from './db';
import { customFood } from '../diary/customFoods';
import { recipe } from '../diary/recipes';
import { servingOptions, type ServingOption } from './servings';

export type Resolved = { ref: string; name: string; brand: string | null; per100: Nutrients; options: ServingOption[]; barcode: string | null };

export async function resolve(ref: string, foods: Db | null, diary: Db): Promise<Resolved | null> {
  const [kind, id, sourceId] = ref.split(':');
  if (kind === 'foods' && foods) {
    const f = await bySource(foods, id, sourceId);
    return f && { ref, name: f.name, brand: f.brand, per100: f.per100, barcode: f.barcode, options: servingOptions(f, await portions(foods, f.id)) };
  }
  if (kind === 'custom') {
    const f = await customFood(diary, id);
    return f && { ref, name: f.name, brand: f.brand, per100: f.nutrients, barcode: f.barcode, options: servingOptions(f, []) };
  }
  if (kind === 'recipe') {
    const r = await recipe(diary, id);
    // Recipes are per serving, so treat one serving as 100 "grams" of a per-100 record.
    return r && { ref, name: r.name, brand: null, per100: r.nutrients, barcode: null, options: [{ label: '1 serving', grams: 100 }] };
  }
  return null;
}

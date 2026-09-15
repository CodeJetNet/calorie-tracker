import list from '../nutrients.json';
import type { CustomFood } from '../diary/customFoods';
import type { Nutrients } from '../nutrients';

type Def = { id: string; off: string | null; off_factor: number };
const DEFS = (list as Def[]).filter(d => d.off);

export type OffProduct = { product_name?: string; brands?: string; serving_quantity?: number | string; serving_size?: string; nutriments?: Record<string, number | string> };

export function fromOffProduct(gtin13: string, p: OffProduct): Omit<CustomFood, 'id'> | null {
  const nutrients: Nutrients = {};
  for (const d of DEFS) {
    const v = Number(p.nutriments?.[`${d.off}_100g`]);
    if (Number.isFinite(v)) nutrients[d.id] = Math.round(v * d.off_factor * 1000) / 1000;
  }
  if (nutrients['1008'] === undefined) {   // kilojoules-only products, common outside the US
    const kj = Number(p.nutriments?.['energy-kj_100g'] ?? p.nutriments?.['energy_100g']);
    if (Number.isFinite(kj)) nutrients['1008'] = Math.round((kj / 4.184) * 10) / 10;
  }
  if (nutrients['1008'] === undefined || !p.product_name) return null;
  const serving = Number(p.serving_quantity);
  return {
    barcode: gtin13, name: p.product_name, brand: p.brands || null,
    serving_size: Number.isFinite(serving) && serving > 0 ? serving : null,
    serving_unit: Number.isFinite(serving) && serving > 0 ? 'g' : null,
    serving_desc: p.serving_size || null, nutrients,
  };
}

export async function lookupOff(gtin13: string): Promise<Omit<CustomFood, 'id'> | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${gtin13}.json?fields=product_name,brands,serving_quantity,serving_size,nutriments`,
    { headers: { 'User-Agent': 'CalorieTracker/1.0 (github.com/codejetnet/calorie-tracker)' } });
  if (!res.ok) return null;
  const json = await res.json();
  return json.status === 1 ? fromOffProduct(gtin13, json.product) : null;
}

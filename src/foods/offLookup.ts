import Constants from 'expo-constants';
import list from '../nutrients.json';
import type { CustomFood } from '../diary/customFoods';
import type { Nutrients } from '../nutrients';
import { normalize } from '../gtin';

type Def = { id: string; off: string | null; off_factor: number; alt?: [string, number][] };
const DEFS = (list as Def[]).filter(d => d.off);
// USDA nutrient id to [our id, factor]: our ids are USDA ids, alternates (kJ, IU) convert.
const USDA = new Map<string, [string, number]>((list as Def[]).flatMap(d => [[d.id, [d.id, 1]] as [string, [string, number]], ...(d.alt ?? []).map(([a, f]) => [a, [d.id, f]] as [string, [string, number]])]));

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

export type UsdaFood = { description?: string; brandName?: string; brandOwner?: string; gtinUpc?: string; publishedDate?: string;
  servingSize?: number; servingSizeUnit?: string; householdServingFullText?: string; foodNutrients?: { nutrientId: number; value: number }[] };

/** USDA Branded values are per 100 g or ml already. */
export function fromUsdaFood(gtin13: string, u: UsdaFood): Omit<CustomFood, 'id'> | null {
  const nutrients: Nutrients = {};
  for (const n of u.foodNutrients ?? []) {
    const m = USDA.get(String(n.nutrientId));
    if (m && Number.isFinite(n.value) && nutrients[m[0]] === undefined) nutrients[m[0]] = Math.round(n.value * m[1] * 1000) / 1000;
  }
  if (nutrients['1008'] === undefined || !u.description) return null;
  const unit = u.servingSizeUnit === 'MLT' ? 'ml' : u.servingSizeUnit === 'GRM' ? 'g' : null;
  const size = unit && u.servingSize && u.servingSize > 0 ? u.servingSize : null;
  return {
    barcode: gtin13, name: u.description, brand: u.brandName || u.brandOwner || null,
    serving_size: size, serving_unit: size ? unit : null, serving_desc: u.householdServingFullText || null, nutrients,
  };
}

// A free api.data.gov key allows 1,000 lookups an hour per phone; DEMO_KEY, the fallback for local builds, only 10.
const USDA_KEY = (Constants.expoConfig?.extra as { usdaKey?: string } | undefined)?.usdaKey || 'DEMO_KEY';
export async function lookupUsda(gtin13: string): Promise<Omit<CustomFood, 'id'> | null> {
  const q = gtin13.replace(/^0+/, '');
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${q}&dataType=Branded&pageSize=10&api_key=${USDA_KEY}`);
  if (!res.ok) return null;
  const foods: UsdaFood[] = (await res.json()).foods ?? [];
  const hit = foods.filter(f => f.gtinUpc && normalize(f.gtinUpc) === gtin13)
    .sort((a, b) => (b.publishedDate ?? '').localeCompare(a.publishedDate ?? ''))[0];   // every relabel is a new row; newest wins
  return hit ? fromUsdaFood(gtin13, hit) : null;
}

/** Open Food Facts, then USDA. Sends only the barcode. */
export async function lookupOnline(gtin13: string): Promise<Omit<CustomFood, 'id'> | null> {
  return (await lookupOff(gtin13).catch(() => null)) ?? (await lookupUsda(gtin13).catch(() => null));
}

import list from './nutrients.json';

export type Nutrients = Record<string, number>;   // key: FDC nutrient id as string
export type NutrientDef = { id: string; key: string; name: string; unit: string; panel: boolean; off: string | null; off_factor: number; target: number | null };

export const NUTRIENTS: NutrientDef[] = list as NutrientDef[];
export const PANEL = NUTRIENTS.filter(n => n.panel);
export const BY_ID: Record<string, NutrientDef> = Object.fromEntries(NUTRIENTS.map(n => [n.id, n]));
/** Daily targets for one adult, from nutrients.json. The `goals` setting overrides per nutrient. */
export const DEFAULT_TARGETS: Nutrients = Object.fromEntries(NUTRIENTS.filter(n => n.target != null).map(n => [n.id, n.target as number]));

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function scale(per100: Nutrients, grams: number): Nutrients {
  const out: Nutrients = {};
  for (const [k, v] of Object.entries(per100)) out[k] = r3((v * grams) / 100);
  return out;
}

export function sum(items: Nutrients[]): Nutrients {
  const out: Nutrients = {};
  for (const n of items) for (const [k, v] of Object.entries(n)) out[k] = r3((out[k] ?? 0) + v);
  return out;
}

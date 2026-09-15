import list from './nutrients.json';

export type Nutrients = Record<string, number>;   // key: FDC nutrient id as string
export type NutrientDef = { id: string; key: string; name: string; unit: string; panel: boolean; off: string | null; off_factor: number; target: number | null };

export const NUTRIENTS: NutrientDef[] = list as NutrientDef[];
export const PANEL = NUTRIENTS.filter(n => n.panel);
/** Energy and the macros: the Today card and the Goals inputs. */
export const MAIN = ['1008', '1003', '1005', '1004'];
/** What Food detail and the custom food editor show before "More". */
export const TOP = [...MAIN, '1079', '2000', '1093'];
export const BY_ID: Record<string, NutrientDef> = Object.fromEntries(NUTRIENTS.map(n => [n.id, n]));
/** Daily targets for one adult, from nutrients.json. The `goals` setting overrides per nutrient. */
export const DEFAULT_TARGETS: Nutrients = Object.fromEntries(NUTRIENTS.filter(n => n.target != null).map(n => [n.id, n.target as number]));

export const round3 = (x: number) => Math.round(x * 1000) / 1000;

export function scale(per100: Nutrients, grams: number): Nutrients {
  const out: Nutrients = {};
  for (const [k, v] of Object.entries(per100)) out[k] = round3((v * grams) / 100);
  return out;
}

export function sum(items: Nutrients[]): Nutrients {
  const out: Nutrients = {};
  for (const n of items) for (const [k, v] of Object.entries(n)) out[k] = round3((out[k] ?? 0) + v);
  return out;
}

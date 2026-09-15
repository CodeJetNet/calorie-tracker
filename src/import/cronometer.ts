import { parseCsv } from './csv';
import { stableId } from './hash';
import type { Entry } from '../diary/entries';
import type { Weight } from '../diary/weights';
import type { Nutrients } from '../nutrients';

/** Cronometer column label -> [FDC nutrient id, factor to our unit]. Vitamin D IU -> µg is 0.025. */
export const COLUMN_MAP: Record<string, [string, number]> = {
  'Energy (kcal)': ['1008', 1], 'Protein (g)': ['1003', 1], 'Carbs (g)': ['1005', 1], 'Fat (g)': ['1004', 1],
  'Fiber (g)': ['1079', 1], 'Sugars (g)': ['2000', 1], 'Added Sugars (g)': ['1235', 1],
  'Saturated (g)': ['1258', 1], 'Trans-Fats (g)': ['1257', 1], 'Monounsaturated (g)': ['1292', 1], 'Polyunsaturated (g)': ['1293', 1],
  'Cholesterol (mg)': ['1253', 1], 'Sodium (mg)': ['1093', 1], 'Potassium (mg)': ['1092', 1], 'Calcium (mg)': ['1087', 1],
  'Iron (mg)': ['1089', 1], 'Magnesium (mg)': ['1090', 1], 'Phosphorus (mg)': ['1091', 1], 'Zinc (mg)': ['1095', 1],
  'Vitamin A (µg)': ['1106', 1], 'Vitamin C (mg)': ['1162', 1], 'Vitamin D (IU)': ['1114', 0.025], 'Vitamin E (mg)': ['1109', 1],
  'Vitamin K (µg)': ['1185', 1], 'B1 (Thiamine) (mg)': ['1165', 1], 'B2 (Riboflavin) (mg)': ['1166', 1], 'B3 (Niacin) (mg)': ['1167', 1],
  'B6 (Pyridoxine) (mg)': ['1175', 1], 'Folate (µg)': ['1177', 1], 'B12 (Cobalamin) (µg)': ['1178', 1],
  'Caffeine (mg)': ['1057', 1], 'Alcohol (g)': ['1018', 1], 'Water (g)': ['1051', 1],
};

export const isCronometerServings = (h: string[]) => h.includes('Day') && h.includes('Food Name');
export const isCronometerBiometrics = (h: string[]) => h.includes('Day') && h.includes('Metric') && h.includes('Amount');

export function parseServings(text: string): Entry[] {
  const [header, ...rows] = parseCsv(text);
  const col = (name: string) => header.indexOf(name);
  const iDay = col('Day'), iGroup = col('Group'), iName = col('Food Name'), iAmount = col('Amount');
  const nutCols = header.flatMap((h, i) => (COLUMN_MAP[h] ? [[i, COLUMN_MAP[h]] as const] : []));
  if (!nutCols.length) throw new Error('No recognised nutrient columns in header');
  const seen = new Map<string, number>();
  const out: Entry[] = [];
  for (const r of rows) {
    if (!r[iDay] || !r[iName]) continue;
    const nutrients: Nutrients = {};
    for (const [i, [id, factor]] of nutCols) {
      const v = parseFloat(r[i]);
      if (Number.isFinite(v)) nutrients[id] = Math.round(v * factor * 1000) / 1000;
    }
    const day = r[iDay].slice(0, 10);
    const meal = r[iGroup] || 'Uncategorized';
    const amountDesc = r[iAmount]?.trim() || null;
    const grams = amountDesc && /^([\d.]+)\s*g$/i.exec(amountDesc);
    // No nutrients in the key: Cronometer recomputes old rows from a food's current profile, so they drift between exports. The counter below makes identical rows unique.
    const key = [day, meal, r[iName], amountDesc ?? ''].join('|');
    const n = (seen.get(key) ?? 0) + 1; seen.set(key, n);
    out.push({
      id: 'cro-' + stableId(`${key}#${n}`), day, meal, name: r[iName],
      amount: grams ? parseFloat(grams[1]) : null, amount_desc: amountDesc, nutrients,
      food_ref: null, source: 'cronometer', health_id: null,
    });
  }
  return out;
}

const UNIT_TO_KG: Record<string, number> = { kg: 1, lb: 0.45359237, lbs: 0.45359237 };

export function parseBiometrics(text: string): Weight[] {
  const [header, ...rows] = parseCsv(text);
  const iDay = header.indexOf('Day'), iMetric = header.indexOf('Metric'), iUnit = header.indexOf('Unit'), iAmount = header.indexOf('Amount');
  const byDay = new Map<string, number>();
  for (const r of rows) {
    if (r[iMetric] !== 'Weight') continue;
    const v = parseFloat(r[iAmount]);
    if (!Number.isFinite(v)) continue;
    const factor = UNIT_TO_KG[(r[iUnit] ?? '').trim().toLowerCase()];
    if (factor === undefined) continue;
    const kg = v * factor;
    byDay.set(r[iDay].slice(0, 10), Math.round(kg * 100) / 100);
  }
  return [...byDay].map(([day, kg]) => ({ day, kg }));
}

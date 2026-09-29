import { BY_ID, type Nutrients } from '../nutrients';

/** One piece of recognized text. Coordinates are fractions of the image, y down. */
export type Fragment = { text: string; x: number; y: number; w: number; h: number };

const mid = (f: Fragment) => f.y + f.h / 2;

/** Fragments whose vertical centers are within 0.6 of the shorter line height of a row's first fragment join that row. */
export function rows(frags: Fragment[]): string[] {
  const out: Fragment[][] = [];
  for (const f of [...frags].sort((a, b) => mid(a) - mid(b))) {
    const row = out[out.length - 1];
    if (row && Math.abs(mid(f) - mid(row[0])) < Math.min(f.h, row[0].h) * 0.6) row.push(f);
    else out.push([f]);
  }
  return out.map(r => r.sort((a, b) => a.x - b.x).map(f => f.text).join(' '));
}

export type LabelFood = { serving_size: number | null; serving_unit: 'g' | 'ml' | null; serving_desc: string | null; nutrients: Nutrients };

const NUM = '([0-9OoIl]+(?:[.,][0-9Oo]+)?)';   // OCR reads 0 as O or o, and 1 as I or l
const UNIT = '\\s*(mcg|µg|ug|mg|g|IU)\\b';
const DOT = '\\s*\\.?';                          // "Sat. Fat", and OCR's "Sat . Fat"
// Nutrient id and the row words before its amount. Every rule is tried on every row, since linear labels print the
// whole panel as one paragraph, and each match is blanked out before the next rule. So the specific fats come before
// total fat and added sugars before total sugars.
const RULES: [string, string][] = [
  ['1235', `incl(?:udes)?${DOT}`], ['1235', 'added\\s*sugars'],
  ['1258', `\\bsat(?:urated|${DOT})\\s*fat`], ['1257', 'trans\\s*fat'],
  ['1293', `poly(?:unsat(?:urated)?)?${DOT}\\s*fat`], ['1292', `mono(?:unsat(?:urated)?)?${DOT}\\s*fat`], ['1004', 'total\\s*fat'],
  ['1253', `cholest(?:erol)?${DOT}`], ['1093', 'sodium'], ['1005', `total\\s*carb(?:ohydrate)?s?${DOT}`], ['1079', '(?:dietary\\s*)?fiber'],
  ['2000', '(?:total\\s*)?sugars'], ['1003', 'protein'], ['1114', `vit(?:amin)?${DOT}\\s*d`], ['1106', `vit(?:amin)?${DOT}\\s*a`],
  ['1162', `vit(?:amin)?${DOT}\\s*c`], ['1087', 'calcium'], ['1089', 'iron'], ['1092', 'potassium'], ['1090', 'magnesium'],
  ['1091', 'phosphorus'], ['1095', 'zinc'], ['1057', 'caffeine'],
];
const PATTERNS = RULES.map(([id, words]) => [id, new RegExp(`\\b${words}\\s*:?\\s*(?:less than|<)?\\s*${NUM}${UNIT}`, 'i')] as const);
const SUGAR_ALCOHOL = new RegExp(`sugar\\s*alcohols?\\s*${NUM}${UNIT}`, 'ig');
const TO_BASE: Record<string, number> = { g: 1, mg: 1e-3, mcg: 1e-6, 'µg': 1e-6, ug: 1e-6 };   // to grams
const IU: Record<string, number> = { '1114': 0.025, '1106': 0.3 };                               // IU to µg

const num = (s: string) => Number(s.replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(',', '.'));
const blank = (line: string, m: RegExpExecArray) => line.slice(0, m.index) + ' '.repeat(m[0].length) + line.slice(m.index + m[0].length);

function amount(id: string, value: number, unit: string): number | null {
  if (unit.toUpperCase() === 'IU') return IU[id] !== undefined ? value * IU[id] : null;
  const from = TO_BASE[unit.toLowerCase()], to = TO_BASE[BY_ID[id].unit];
  return from && to ? Math.round((value * from / to) * 1000) / 1000 : null;
}

/** Rows of a US Nutrition Facts panel to per-serving values in the app's nutrient ids. Missing rows are left out. */
export function parseLabel(lines: string[]): LabelFood {
  const out: LabelFood = { serving_size: null, serving_unit: null, serving_desc: null, nutrients: {} };
  for (let line of lines) {
    const serving = /serv(?:ing)?\s*\.?\s*size\s*:?\s*([^)]*\)?)/i.exec(line);   // up to the first ")", so "(58g)" ends it
    if (serving) {
      line = blank(line, serving);
      if (out.serving_desc === null) {
        out.serving_desc = serving[1].replace(/\(\s*/g, '(').replace(/\s*\)/g, ')').replace(/[\s,;:.]+$/, '').trim();
        const g = /\((\d+(?:\.\d+)?)\s*(g|ml)\b/i.exec(out.serving_desc) ?? /(\d+(?:\.\d+)?)\s*(g|ml)\s*$/i.exec(out.serving_desc);
        if (g) { out.serving_size = Number(g[1]); out.serving_unit = g[2].toLowerCase() as 'g' | 'ml'; }
      }
    }
    const cal = /\bcalories\b\D*(\d{1,4})/i.exec(line);
    if (cal) { out.nutrients['1008'] ??= Number(cal[1]); line = blank(line, cal); }
    line = line.replace(SUGAR_ALCOHOL, m => ' '.repeat(m.length));
    for (const [id, re] of PATTERNS) {
      const m = re.exec(line);
      if (!m) continue;
      const v = amount(id, num(m[1]), m[2]);
      if (v !== null && Number.isFinite(v)) out.nutrients[id] ??= v;
      line = blank(line, m);
    }
  }
  return out;
}

/** food-data's plausibility rule (rules.py): stated energy vs 4P + 4 max(C - fiber, 0) + 2 fiber + 9F + 7 alcohol, off by more than max(30%, 25 kcal). */
export function energyMismatch(n: Nutrients): boolean {
  const kcal = n['1008'], p = n['1003'], c = n['1005'], f = n['1004'];
  if (kcal === undefined || p === undefined || c === undefined || f === undefined) return false;
  const fiber = n['1079'] ?? 0, alcohol = n['1018'] ?? 0;
  const est = 4 * p + 4 * Math.max(c - fiber, 0) + 2 * fiber + 9 * f + 7 * alcohol;
  return Math.abs(est - kcal) > Math.max(0.3 * kcal, 25);
}

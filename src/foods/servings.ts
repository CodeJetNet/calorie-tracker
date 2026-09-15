import type { Portion } from './db';
export type ServingOption = { label: string; grams: number };
type HasServing = { serving_size: number | null; serving_unit: string | null; serving_desc: string | null };

export function servingOptions(f: HasServing, portions: Portion[]): ServingOption[] {
  const out: ServingOption[] = [];
  if (f.serving_size && f.serving_size > 0) {
    out.push({ label: f.serving_desc ?? `1 serving (${f.serving_size} ${f.serving_unit ?? 'g'})`, grams: f.serving_size });
  }
  out.push({ label: `100 ${f.serving_unit ?? 'g'}`, grams: 100 });
  for (const p of portions) if (!out.some(o => o.grams === p.grams || o.label === p.description)) out.push({ label: p.description, grams: p.grams });
  return out;
}

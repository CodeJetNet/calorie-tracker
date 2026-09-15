import { PANEL } from '../nutrients';
import type { Entry } from '../diary/entries';
const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function entriesToCsv(entries: Entry[]): string {
  const header = ['day', 'meal', 'name', 'amount_g', 'amount_desc', ...PANEL.map(n => `${n.key}_${n.unit.replace('µ', 'u')}`)];
  const lines = entries.map(e => [e.day, e.meal, e.name, e.amount, e.amount_desc, ...PANEL.map(n => e.nutrients[n.id])].map(cell).join(','));
  return [header.join(','), ...lines].join('\r\n');
}

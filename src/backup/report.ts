import { BY_ID, DEFAULT_TARGETS, sum, type Nutrients } from '../nutrients';
import { addDays } from '../dates';
import type { DiaryFile } from './serialize';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmt = (v: number | undefined) => (v === undefined ? '' : String(Math.round(v * 10) / 10));
const COLS = ['1008', '1003', '1005', '1004', '1079'];

export function renderReport(file: DiaryFile, from: string, to: string): string {
  const goals: Nutrients = { ...DEFAULT_TARGETS, ...(file.settings.goals ? JSON.parse(file.settings.goals) : {}) };
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const byDay = days.map(d => file.entries.filter(e => e.day === d));
  const totals = byDay.map(es => sum(es.map(e => e.nutrients)));

  const kcalMax = Math.max(goals['1008'] ?? 0, ...totals.map(t => t['1008'] ?? 0), 1);
  const w = 600 / days.length;
  const bars = totals.map((t, i) => {
    const h = ((t['1008'] ?? 0) / kcalMax) * 100;
    return `<rect x="${(i * w).toFixed(1)}" y="${(100 - h).toFixed(1)}" width="${Math.max(w - 2, 1).toFixed(1)}" height="${h.toFixed(1)}" fill="#3a7d5c"/>`;
  }).join('');
  const goalY = goals['1008'] ? (100 - (goals['1008'] / kcalMax) * 100).toFixed(1) : null;
  const goalLine = goalY ? `<line x1="0" x2="600" y1="${goalY}" y2="${goalY}" stroke="#b33" stroke-dasharray="4 3"/>` : '';

  const header = COLS.map(id => `<th>${esc(BY_ID[id].name)} (${BY_ID[id].unit})</th>`).join('');
  const rows = days.map((d, i) => `<tr><td>${d}</td>${COLS.map(id => `<td>${fmt(totals[i][id])}</td>`).join('')}</tr>`).join('');

  const detail = days.map((d, i) => byDay[i].length === 0 ? '' :
    `<details><summary>${d} · ${fmt(totals[i]['1008'] ?? 0)} kcal</summary><table><tr><th>Meal</th><th>Food</th><th>Amount</th><th>kcal</th><th>Protein</th></tr>` +
    byDay[i].map(e => `<tr><td>${esc(e.meal)}</td><td>${esc(e.name)}</td><td>${esc(e.amount_desc ?? (e.amount ? `${e.amount} g` : ''))}</td><td>${fmt(e.nutrients['1008'])}</td><td>${fmt(e.nutrients['1003'])}</td></tr>`).join('') +
    `</table></details>`).join('');

  const ws = file.weights.filter(x => x.day >= from && x.day <= to).sort((a, b) => a.day.localeCompare(b.day));
  const weights = ws.map(x => `<tr><td>${x.day}</td><td>${x.kg}</td></tr>`).join('');
  const lo = Math.min(...ws.map(x => x.kg)), span = Math.max(...ws.map(x => x.kg)) - lo || 1;
  const weightChart = ws.length < 2 ? '' :
    `<svg viewBox="0 0 600 100" width="100%" height="120" role="img" aria-label="Weight"><polyline fill="none" stroke="#3a7d5c" stroke-width="2" points="${
      ws.map((x, i) => `${((i * 600) / (ws.length - 1)).toFixed(1)},${(95 - ((x.kg - lo) / span) * 90).toFixed(1)}`).join(' ')}"/></svg>`;

  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Food diary ${esc(from)} to ${esc(to)}</title>
<style>body{font:14px system-ui,sans-serif;margin:24px;max-width:900px}table{border-collapse:collapse;margin:8px 0}td,th{padding:4px 8px;border-bottom:1px solid #ddd;text-align:right}td:first-child,th:first-child{text-align:left}summary{cursor:pointer;margin:6px 0}</style>
<h1>Food diary</h1><p>${esc(from)} to ${esc(to)}. Generated ${esc(file.exportedAt)}.${goals['1008'] ? ` Goal ${goals['1008']} kcal (dashed line).` : ''}</p>
<svg viewBox="0 0 600 100" width="100%" height="120" role="img" aria-label="Daily energy">${bars}${goalLine}</svg>
<h2>Daily totals</h2><table><tr><th>Day</th>${header}</tr>${rows}</table>
<h2>Detail</h2>${detail || '<p>No entries.</p>'}
${weights ? `<h2>Weight</h2>${weightChart}<table><tr><th>Day</th><th>kg</th></tr>${weights}</table>` : ''}`;
}

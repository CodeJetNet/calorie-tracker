import { renderReport } from './report';
import type { DiaryFile } from './serialize';

const file: DiaryFile = {
  app: 'calorie-tracker', schemaVersion: 1, exportedAt: '2026-09-15T20:00:00Z',
  entries: [
    { id: 'a', day: '2026-09-14', meal: 'Lunch', name: 'Rice <white>', amount: 200, amount_desc: '1 cup', nutrients: { '1008': 260, '1003': 5.4 }, food_ref: null, source: 'app', health_id: null },
    { id: 'b', day: '2026-09-15', meal: 'Dinner', name: 'Salmon', amount: 150, amount_desc: null, nutrients: { '1008': 312, '1003': 30 }, food_ref: null, source: 'app', health_id: null },
  ],
  custom_foods: [], recipes: [], weights: [{ day: '2026-09-15', kg: 80.2 }, { day: '2026-09-14', kg: 80.6 }], settings: { goals: '{"1008":2000}' },
};

test('report is self-contained and carries totals, detail, weight', () => {
  const html = renderReport(file, '2026-09-14', '2026-09-15');
  expect(html).not.toMatch(/https?:\/\//);
  expect(html).toContain('<td>2026-09-14</td><td>260</td>');
  expect(html).toContain('Rice &lt;white&gt;');
  expect(html).toContain('80.2');
  expect(html).toContain('<rect');
  expect(html).toContain('<polyline');   // weight chart
});

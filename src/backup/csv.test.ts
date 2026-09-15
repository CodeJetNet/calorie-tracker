import { entriesToCsv } from './csv';
test('csv has panel columns and escapes quotes', () => {
  const csv = entriesToCsv([{ id: 'a', day: '2026-09-15', meal: 'Lunch', name: 'Rice, "white"', amount: 200, amount_desc: '1 cup', nutrients: { '1008': 260 }, food_ref: null, source: 'app', health_id: null }]);
  const [header, row] = csv.split('\r\n');
  expect(header.startsWith('day,meal,name,amount_g,amount_desc,energy_kcal,protein_g')).toBe(true);
  expect(row.startsWith('2026-09-15,Lunch,"Rice, ""white""",200,1 cup,260,')).toBe(true);
});

import { readFileSync } from 'node:fs';
import { isCronometerBiometrics, isCronometerServings, parseBiometrics, parseServings } from './cronometer';
import { parseCsv } from './csv';

// The fixtures are synthetic: no real Cronometer export existed when they were written.
// Their header rows follow COLUMN_MAP and must be re-checked against a real export (Task 0.1).
const servings = readFileSync(`${__dirname}/../../fixtures/cronometer-servings.csv`, 'utf8');
const biometrics = readFileSync(`${__dirname}/../../fixtures/cronometer-biometrics.csv`, 'utf8');

test('detects file kinds by header', () => {
  expect(isCronometerServings(parseCsv(servings)[0])).toBe(true);
  expect(isCronometerBiometrics(parseCsv(biometrics)[0])).toBe(true);
  expect(isCronometerServings(['Date', 'Meal', 'Calories'])).toBe(false);
});

test('servings become entries with nutrients keyed by FDC id', () => {
  const entries = parseServings(servings);
  expect(entries).toHaveLength(10);
  const e = entries[0];
  expect(e.source).toBe('cronometer');
  expect(e.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(e.nutrients['1008']).toBeGreaterThan(0);
  expect(e.nutrients['1003']).toBeDefined();
  expect(e.nutrients).toMatchObject({ '1008': 379, '1003': 13.15, '1005': 67.7, '1004': 6.52 });   // fixture row 1: Oats
  expect(entries[1].nutrients['1114']).toBe(120 * 0.025);   // Vitamin D IU -> µg, fixture row 2: Milk
  expect(entries[8].nutrients['1235']).toBeUndefined();   // empty Added Sugars cell
});

test('a servings header with no known nutrient columns fails loudly', () => {
  expect(() => parseServings('Day,Time,Group,Food Name,Amount\n2026-09-01,08:00 AM,Breakfast,Toast,1.00 slice')).toThrow('No recognised nutrient columns');
});

test('ids are deterministic and unique even for identical rows', () => {
  const a = parseServings(servings), b = parseServings(servings);
  expect(a.map(e => e.id)).toEqual(b.map(e => e.id));
  expect(new Set(a.map(e => e.id)).size).toBe(a.length);
});

test('gram amounts are parsed, other units keep only the description', () => {
  const entries = parseServings(servings);
  expect(entries.some(e => e.amount !== null && /g$/i.test(e.amount_desc ?? ''))).toBe(true);
  expect(entries.some(e => e.amount === null && e.amount_desc)).toBe(true);
});

test('biometrics yield weights in kg', () => {
  const w = parseBiometrics(biometrics);
  expect(w.length).toBeGreaterThan(0);
  expect(w.every(x => x.kg > 20 && x.kg < 300)).toBe(true);
  expect(w).toHaveLength(3);   // four Weight days minus the "st" row; 2026-09-03 has two rows and the last one wins
  expect(w).toContainEqual({ day: '2026-09-02', kg: 72.21 });   // 159.20 lb
  expect(w).toContainEqual({ day: '2026-09-03', kg: 72.6 });
  expect(w.some(x => x.day === '2026-09-04')).toBe(false);   // unit "st" is not mapped, so the row is skipped
});

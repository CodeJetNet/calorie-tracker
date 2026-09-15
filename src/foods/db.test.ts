import { foodsFixture } from '../../test/foodsFixture';
import { byBarcode, bySource, foodRef, ftsQuery, portions, search } from './db';

test('byBarcode maps panel columns to per100', async () => {
  const db = await foodsFixture();
  const f = await byBarcode(db, '3017620422003');
  expect(f?.name).toBe('Nutella');
  expect(f?.per100).toEqual({ '1008': 539, '1003': 6.3, '1005': 57.5, '1004': 30.9 });
  expect(await byBarcode(db, '0000000000000')).toBeNull();
});

test('bySource merges the long-tail nutrients and is the food_ref lookup', async () => {
  const db = await foodsFixture();
  const f = await bySource(db, 'usda_sr', '171077');
  expect(f?.per100['1210']).toBe(1.2);
  expect(f && foodRef(f)).toBe('foods:usda_sr:171077');
  expect(await portions(db, 2)).toEqual([{ description: 'breast, bone and skin removed', grams: 118 }]);
});

test('ftsQuery makes prefix terms', () => expect(ftsQuery(' chick brea ')).toBe('"chick"* "brea"*'));
test('ftsQuery quotes away operators and stray syntax', () => expect(ftsQuery('a"b OR *')).toBe('"ab"* "OR"* "*"*'));

test('search uses full text, needs two characters, and puts generic foods first', async () => {
  const db = await foodsFixture();
  expect((await search(db, 'chicken breast')).map(f => f.id)).toEqual([2]);
  expect((await search(db, 'nut')).map(f => f.id)).toEqual([1]);
  expect(await search(db, 'n')).toEqual([]);
  // id 0 sorts before 2 by rowid, so this only passes with the generic-first ORDER BY
  await db.run(`INSERT INTO foods (id, barcode, name, source, source_id, n1008) VALUES (0, '0012345678905', 'CHICKEN BREAST STRIPS', 'usda_branded', '10', 110)`);
  await db.exec(`INSERT INTO foods_fts(foods_fts) VALUES ('rebuild')`);
  expect((await search(db, 'chicken')).map(f => f.id)).toEqual([2, 0]);
});

import { nodeDb } from '../../test/nodeDb';
import { migrate } from '../db/diary';
import { customFoodByBarcode, searchCustomFoods, upsertCustomFood, type CustomFood } from './customFoods';

const f = (over: Partial<CustomFood> = {}): CustomFood => ({
  id: 'cf1', barcode: '0012345678905', name: 'Plain', brand: null,
  serving_size: 100, serving_unit: 'g', serving_desc: null, nutrients: { '1008': 100 }, ...over,
});

test('upsert replaces by id and finds by barcode', async () => {
  const db = nodeDb(); await migrate(db);
  await upsertCustomFood(db, f());
  await upsertCustomFood(db, f({ name: 'Plain yogurt' }));
  expect((await customFoodByBarcode(db, '0012345678905'))?.name).toBe('Plain yogurt');
});

test('search treats % and _ literally', async () => {
  const db = nodeDb(); await migrate(db);
  await upsertCustomFood(db, f());
  expect(await searchCustomFoods(db, 'P_ain')).toEqual([]);
  expect((await searchCustomFoods(db, 'lain')).map(x => x.name)).toEqual(['Plain']);
});

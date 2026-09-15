import { nodeDb } from '../../test/nodeDb';
import { migrate, DIARY_SCHEMA_VERSION } from '../db/diary';
import { addEntry } from '../diary/entries';
import { upsertCustomFood } from '../diary/customFoods';
import { setWeight } from '../diary/weights';
import { setSetting } from '../diary/settings';
import { exportDiary, importDiary, validateDiaryFile } from './serialize';

async function seeded() {
  const db = nodeDb(); await migrate(db);
  await addEntry(db, { id: 'e1', day: '2026-09-15', meal: 'Lunch', name: 'Nutella', amount: 15, amount_desc: '1 tbsp', nutrients: { '1008': 80.85 }, food_ref: 'foods:off:3017620422003', source: 'app', health_id: null });
  await upsertCustomFood(db, { id: 'c1', barcode: null, name: 'Mom soup', brand: null, serving_size: 250, serving_unit: 'ml', serving_desc: '1 bowl', nutrients: { '1008': 40 } });
  await setWeight(db, { day: '2026-09-15', kg: 80.2 });
  await setSetting(db, 'goals', '{"1008":2100}');
  await setSetting(db, 'foods_md5', 'device-only', false);
  return db;
}

test('export excludes device-local settings', async () => {
  const file = await exportDiary(await seeded());
  expect(file.schemaVersion).toBe(DIARY_SCHEMA_VERSION);
  expect(file.settings).toEqual({ goals: '{"1008":2100}' });
  expect(file.entries).toHaveLength(1);
});

test('import into an empty diary reproduces the export', async () => {
  const file = await exportDiary(await seeded());
  const db2 = nodeDb(); await migrate(db2);
  await importDiary(db2, file);
  const again = await exportDiary(db2);
  expect({ ...again, exportedAt: 0 }).toEqual({ ...file, exportedAt: 0 });
});

test('newer schema is refused', () => {
  expect(() => validateDiaryFile({ app: 'calorie-tracker', schemaVersion: DIARY_SCHEMA_VERSION + 1, entries: [], custom_foods: [], recipes: [], weights: [], settings: {} }))
    .toThrow(/newer version/);
  expect(() => validateDiaryFile({ hello: 1 })).toThrow(/not a calorie-tracker backup/);
});

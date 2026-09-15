import type { Db } from '../db/types';
import { DIARY_SCHEMA_VERSION } from '../db/diary';
import { allEntries, entryParams, INSERT_ENTRY, type Entry } from '../diary/entries';
import { allCustomFoods, upsertCustomFood, type CustomFood } from '../diary/customFoods';
import { allRecipes, upsertRecipe, type Recipe } from '../diary/recipes';
import { allWeights, setWeight, type Weight } from '../diary/weights';
import { allSettings, setSetting } from '../diary/settings';
import { diaryChanged } from '../diary/changed';

export type DiaryFile = {
  app: 'calorie-tracker'; schemaVersion: number; exportedAt: string;
  entries: Entry[]; custom_foods: CustomFood[]; recipes: Recipe[]; weights: Weight[]; settings: Record<string, string>;
};

const DEVICE_KEYS = /^(foods_|backup_|app_uuid$)/;   // device-local; never leaves in a backup

export async function exportDiary(db: Db): Promise<DiaryFile> {
  const settings = Object.fromEntries(Object.entries(await allSettings(db)).filter(([k]) => !DEVICE_KEYS.test(k)));
  return {
    app: 'calorie-tracker', schemaVersion: DIARY_SCHEMA_VERSION, exportedAt: new Date().toISOString(),
    entries: await allEntries(db), custom_foods: await allCustomFoods(db), recipes: await allRecipes(db),
    weights: await allWeights(db), settings,
  };
}

export function validateDiaryFile(x: unknown): DiaryFile {
  const f = x as Partial<DiaryFile> | null;
  if (!f || f.app !== 'calorie-tracker' || typeof f.schemaVersion !== 'number') throw new Error('This file is not a calorie-tracker backup.');
  if (f.schemaVersion > DIARY_SCHEMA_VERSION) throw new Error('This backup was made by a newer version of the app. Update the app first.');
  for (const k of ['entries', 'custom_foods', 'recipes', 'weights'] as const) if (!Array.isArray(f[k])) throw new Error(`Backup is missing ${k}.`);
  if (f.settings?.goals !== undefined) JSON.parse(f.settings.goals);
  return { ...f, settings: f.settings ?? {} } as DiaryFile;
}

/** Replace the whole diary with the file's content, atomically. Device-local settings are kept. */
export async function importDiary(db: Db, file: DiaryFile): Promise<void> {
  await db.tx(async () => {
    await db.run('DELETE FROM entries'); await db.run('DELETE FROM custom_foods');
    await db.run('DELETE FROM recipes'); await db.run('DELETE FROM weights');
    await db.run(`DELETE FROM settings WHERE key NOT GLOB 'foods_*' AND key NOT GLOB 'backup_*' AND key != 'app_uuid'`);
    for (const e of file.entries) await db.run(INSERT_ENTRY, entryParams(e));
    for (const c of file.custom_foods) await upsertCustomFood(db, c, false);
    for (const r of file.recipes) await upsertRecipe(db, r, false);
    for (const w of file.weights) await setWeight(db, w, false);
    for (const [k, v] of Object.entries(file.settings)) if (!DEVICE_KEYS.test(k)) await setSetting(db, k, v, false);
  });
  diaryChanged();
}

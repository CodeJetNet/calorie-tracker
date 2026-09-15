import { nodeDb } from '../../test/nodeDb';
import { migrate } from '../db/diary';
import { addEntry, deleteEntry, entriesForDay, entry, insertEntries, recentEntries, updateEntry, type Entry } from './entries';

const e = (id: string, day = '2026-09-15', over: Partial<Entry> = {}): Entry => ({
  id, day, meal: 'Lunch', name: 'Nutella', amount: 15, amount_desc: '1 tbsp',
  nutrients: { '1008': 80.85, '1003': 0.945 }, food_ref: 'foods:off:3017620422003', source: 'app', health_id: null, ...over,
});

test('add, list, delete round trip', async () => {
  const db = nodeDb(); await migrate(db);
  await addEntry(db, e('a'));
  await addEntry(db, e('b', '2026-09-16'));
  expect((await entriesForDay(db, '2026-09-15')).map(x => x.id)).toEqual(['a']);
  expect(await entry(db, 'b')).toEqual(e('b', '2026-09-16'));
  expect(await entry(db, 'zzz')).toBeNull();
  expect((await deleteEntry(db, 'a'))?.nutrients).toEqual({ '1008': 80.85, '1003': 0.945 });
  expect(await entriesForDay(db, '2026-09-15')).toEqual([]);
});

test('updateEntry changes amount, meal and day in place', async () => {
  const db = nodeDb(); await migrate(db);
  await addEntry(db, e('a'));
  await updateEntry(db, { ...e('a'), amount: 30, nutrients: { '1008': 161.7 }, meal: 'Dinner', day: '2026-09-16' });
  expect(await entriesForDay(db, '2026-09-15')).toEqual([]);
  expect((await entriesForDay(db, '2026-09-16')).map(x => [x.meal, x.amount])).toEqual([['Dinner', 30]]);
});

test('insertEntries ignores duplicate ids and reports the count', async () => {
  const db = nodeDb(); await migrate(db);
  expect(await insertEntries(db, [e('a'), e('b')])).toBe(2);
  expect(await insertEntries(db, [e('a'), e('c')])).toBe(1);
});

test('recentEntries lists distinct names, latest day first, with no extra fields', async () => {
  const db = nodeDb(); await migrate(db);
  await addEntry(db, e('a', '2026-09-14'));
  await addEntry(db, e('b', '2026-09-16'));
  await addEntry(db, e('c', '2026-09-15', { name: 'Oats' }));
  const recents = await recentEntries(db);
  expect(recents.map(x => x.name)).toEqual(['Nutella', 'Oats']);
  expect(recents[0]).toEqual(e('b', '2026-09-16'));   // the latest row for a repeated name, so re-logging pre-fills the last amount
  expect(recents[1]).toEqual(e('c', '2026-09-15', { name: 'Oats' }));
});

import { nodeDb } from '../../test/nodeDb';
import { migrate } from '../db/diary';
import { goals, setSetting } from './settings';

test('goals layers overrides on defaults', async () => {
  const db = nodeDb(); await migrate(db);
  await setSetting(db, 'goals', JSON.stringify({ '1008': 1800 }));
  const g = await goals(db);
  expect(g['1008']).toBe(1800);
  expect(g['1003']).toBe(50);
});

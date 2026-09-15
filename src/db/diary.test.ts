import { nodeDb } from '../../test/nodeDb';
import { DIARY_SCHEMA_VERSION, migrate } from './diary';

test('migrate creates the schema and is idempotent', async () => {
  const db = nodeDb();
  await migrate(db);
  await migrate(db);
  const tables = (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).map(t => t.name);
  expect(tables).toEqual(['custom_foods', 'entries', 'recipes', 'settings', 'weights']);
  expect(await db.all('PRAGMA user_version')).toEqual([{ user_version: DIARY_SCHEMA_VERSION }]);
});

import { readFileSync } from 'node:fs';
import { nodeDb } from '../../test/nodeDb';
import { migrate } from '../db/diary';
import { detect, importText } from './index';

test('detects and imports, and re-import skips duplicates', async () => {
  const text = readFileSync(`${__dirname}/../../fixtures/cronometer-servings.csv`, 'utf8');
  expect(detect(text)).toBe('cronometer-servings');
  const db = nodeDb(); await migrate(db);
  const first = await importText(db, text);
  expect(first.entries).toBeGreaterThan(0);
  const second = await importText(db, text);
  expect(second.entries).toBe(0);
  expect(second.skipped).toBe(first.entries);
});

test('unknown files are rejected', () => expect(detect('foo,bar\n1,2')).toBeNull());

import { DatabaseSync } from 'node:sqlite';
test('node:sqlite is available in tests', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE t(x)');
  db.prepare('INSERT INTO t VALUES (?)').run(1);
  expect(db.prepare('SELECT count(*) AS n FROM t').get()).toEqual({ n: 1 });
});

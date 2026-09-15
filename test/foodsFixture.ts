import { readFileSync } from 'node:fs';
import { PANEL } from '../src/nutrients';
import type { Db } from '../src/db/types';
import { nodeDb } from './nodeDb';

export async function foodsFixture(): Promise<Db> {
  const db = nodeDb();
  const ddl = readFileSync(`${__dirname}/foods.v1.sql`, 'utf8')
    .replace('  -- PANEL_COLUMNS', ',' + PANEL.map(n => `  n${n.id} REAL`).join(',\n').slice(1));
  await db.exec(ddl);
  await db.run(`INSERT INTO foods (id, barcode, name, brand, source, source_id, serving_size, serving_unit, serving_desc, n1008, n1003, n1005, n1004)
                VALUES (1, '3017620422003', 'Nutella', 'Ferrero', 'off', '3017620422003', 15, 'g', '1 tbsp (15 g)', 539, 6.3, 57.5, 30.9)`);
  await db.run(`INSERT INTO foods (id, barcode, name, source, source_id, serving_size, serving_unit, serving_desc, n1008, n1003, n1005, n1004)
                VALUES (2, NULL, 'Chicken, broilers or fryers, breast, meat only, raw', 'usda_sr', '171077', 100, 'g', '100 g', 120, 22.5, 0, 2.6)`);
  await db.run(`INSERT INTO food_nutrients_extra VALUES (2, 1210, 1.2)`);
  await db.run(`INSERT INTO portions VALUES (2, 'breast, bone and skin removed', 118)`);
  await db.exec(`INSERT INTO foods_fts(foods_fts) VALUES ('rebuild')`);
  return db;
}

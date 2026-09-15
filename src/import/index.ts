import type { Db } from '../db/types';
import { insertEntries } from '../diary/entries';
import { setWeight } from '../diary/weights';
import { parseCsv } from './csv';
import { isCronometerBiometrics, isCronometerServings, parseBiometrics, parseServings } from './cronometer';

export type Kind = 'cronometer-servings' | 'cronometer-biometrics';
export type ImportResult = { kind: Kind; entries: number; weights: number; skipped: number };

export function detect(text: string): Kind | null {
  const header = parseCsv(text.slice(0, 4000))[0] ?? [];
  if (isCronometerServings(header)) return 'cronometer-servings';
  if (isCronometerBiometrics(header)) return 'cronometer-biometrics';
  return null;
}

export async function importText(db: Db, text: string): Promise<ImportResult> {
  const kind = detect(text);
  if (!kind) throw new Error('Not a Cronometer export. Expected a CSV with a recognizable header row.');
  if (kind === 'cronometer-biometrics') {
    const w = parseBiometrics(text);
    await db.tx(async () => { for (const x of w) await setWeight(db, x); });
    return { kind, entries: 0, weights: w.length, skipped: 0 };
  }
  const entries = parseServings(text);
  const inserted = await insertEntries(db, entries);
  return { kind, entries: inserted, weights: 0, skipped: entries.length - inserted };
}

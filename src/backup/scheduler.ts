import type { Db } from '../db/types';
import { getSetting, setSetting } from '../diary/settings';
import { addDays, today } from '../dates';
import { exportDiary } from './serialize';
import { renderReport } from './report';
import { overwrite } from './documents';

let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;

export function scheduleBackup(db: Db, withDiary = false, delayMs = 5000): void {
  clearTimeout(timer);
  timer = setTimeout(() => { void runBackup(db, withDiary); }, delayMs);
}

/** Overwrite report.html; also diary.json when asked to, or when a previous attempt failed. */
export async function runBackup(db: Db, withDiary: boolean): Promise<'skipped' | 'ok' | 'failed'> {
  if (running) { scheduleBackup(db, withDiary); return 'skipped'; }
  const reportUri = await getSetting(db, 'backup_uri_report');
  const diaryUri = await getSetting(db, 'backup_uri_diary');
  if (!reportUri || !diaryUri) return 'skipped';
  running = true;
  try {
    const file = await exportDiary(db);
    const t = today();
    await overwrite(reportUri, renderReport(file, addDays(t, -29), t));
    if (withDiary || (await getSetting(db, 'backup_pending')) === '1') {
      await overwrite(diaryUri, JSON.stringify(file));
      await setSetting(db, 'backup_dirty', '0', false);
    }
    await setSetting(db, 'backup_pending', '0', false);
    await setSetting(db, 'backup_last_ok', new Date().toISOString(), false);
    return 'ok';
  } catch {
    await setSetting(db, 'backup_pending', '1', false);
    return 'failed';
  } finally {
    running = false;
  }
}

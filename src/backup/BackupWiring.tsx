import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useDb } from '../db/provider';
import { onDiaryChanged } from '../diary/changed';
import { getSetting, setSetting } from '../diary/settings';
import { runBackup, scheduleBackup } from './scheduler';

export function BackupWiring() {
  const { diary } = useDb();
  useEffect(() => {
    onDiaryChanged(() => { void setSetting(diary, 'backup_dirty', '1', false); scheduleBackup(diary); });
    // Write the diary when it is dirty and the app leaves the foreground, or when a previous attempt failed.
    const flush = async () => {
      const dirty = (await getSetting(diary, 'backup_dirty')) === '1';
      const pending = (await getSetting(diary, 'backup_pending')) === '1';
      if (dirty || pending) void runBackup(diary, true);
    };
    void flush();   // the last session may have died before its background write
    const sub = AppState.addEventListener('change', s => { if (s === 'background' || s === 'active') void flush(); });
    return () => sub.remove();
  }, [diary]);
  return null;
}

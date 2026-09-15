import { useRef, useState } from 'react';
import { useDb } from '../db/provider';
import { getSetting, setSetting } from '../diary/settings';
import { fetchManifest, installFoods, PAUSED, pickFile, SUPPORTED_SCHEMA, type Manifest, type ManifestFile } from './update';

type State = {
  manifest: Manifest | null;
  file: ManifestFile | null;   // the country file when its md5 differs from the installed one
  status: 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'paused' | 'error';
  progress: number;
  error: string;
};

/** Settings' "Check for update" and "Download" flow. The foods connection is closed around the install and reopened even on failure. */
export function useFoodsUpdate() {
  const { diary, closeFoods, reopenFoods } = useDb();
  const [s, set] = useState<State>({ manifest: null, file: null, status: 'idle', progress: 0, error: '' });
  const patch = (p: Partial<State>) => set(prev => ({ ...prev, ...p }));
  const installing = useRef(false);

  const check = async (country: string) => {
    patch({ status: 'checking', error: '' });
    try {
      const manifest = await fetchManifest();
      const f = pickFile(manifest, country, SUPPORTED_SCHEMA);
      if (!f) return patch({ manifest, file: null, status: 'error', error: 'No database for this country, or this app version is too old.' });
      const same = f.md5 === (await getSetting(diary, 'foods_md5'));
      patch({ manifest, file: same ? null : f, status: same ? 'current' : 'available' });
    } catch (e) { patch({ status: 'error', error: (e as Error).message }); }
  };

  const download = async () => {
    if (!s.file || installing.current) return;
    installing.current = true;
    patch({ status: 'downloading', progress: 0, error: '' });
    try {
      await closeFoods();
      await installFoods(s.file, p => {
        const q = Math.round(p * 100) / 100;   // native chunk events are frequent; re-render only when the percent changes
        set(prev => (prev.progress === q ? prev : { ...prev, progress: q }));
      });
      await setSetting(diary, 'foods_md5', s.file.md5, false);
      await setSetting(diary, 'foods_built_at', s.manifest!.builtAt, false);
      patch({ status: 'current', file: null });
    } catch (e) {
      const msg = (e as Error).message;
      patch(msg === PAUSED ? { status: 'paused' } : { status: 'error', error: msg });
    } finally { installing.current = false; await reopenFoods(); }   // the old file is still in place after a failure
  };

  return { ...s, check, download };
}

import { AppState } from 'react-native';
import * as FS from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { unzip } from 'react-native-zip-archive';

/** `country` is a code, or "starter" for the small generic-only file the app embeds. */
export type ManifestFile = { name: string; country: string; bytes: number; md5: string; url: string; mirror: string };
export type Manifest = { schemaVersion: number; builtAt: string; files: ManifestFile[] };

/** The data repo's latest GitHub Release: free, no bandwidth cap. A second host goes here if that ever changes. */
export const MANIFEST_URLS = ['https://github.com/codejetnet/food-data/releases/latest/download/manifest.json'];
export const SUPPORTED_SCHEMA = 1;
export const FOODS_DIR = `${FS.documentDirectory}SQLite/`;
export const FOODS_FILE = 'foods.db';

export function pickFile(m: Manifest, country: string, supported: number): ManifestFile | null {
  if (m.schemaVersion > supported) return null;
  return m.files.find(f => f.country === country) ?? null;
}

/** Once a day with jitter: 20 hours plus up to 8 more, so a weekly build's downloads spread over a day instead of one spike. */
export function checkDue(lastMs: number | null, nowMs: number, rand: number): boolean {
  return lastMs === null || nowMs - lastMs >= (20 + 8 * rand) * 3_600_000;
}

export async function firstOk<T>(urls: string[], get: (url: string) => Promise<T>): Promise<T> {
  let err: unknown;
  for (const u of urls) { try { return await get(u); } catch (e) { err = e; } }
  throw err;
}

export function fetchManifest(): Promise<Manifest> {
  return firstOk(MANIFEST_URLS, async url => {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    return res.json();
  });
}

/**
 * Download, verify, and install the country file. The caller must close the foods
 * connection before calling and reopen after. Throws on network or checksum failure.
 */
export async function installFoods(f: ManifestFile, onProgress?: (fraction: number) => void): Promise<void> {
  const zip = `${FS.cacheDirectory}foods.zip`;
  const dir = `${FS.cacheDirectory}foods-unzip/`;
  await FS.deleteAsync(dir, { idempotent: true });
  const done = await firstOk([f.url, f.mirror], url => download(url, zip, f.bytes, onProgress));
  if (!done) throw new Error(PAUSED);
  try {
    await unzip(zip, dir);
    const inner = `${dir}${f.name.replace(/\.zip$/, '.db')}`;
    const info = await FS.getInfoAsync(inner, { md5: true });
    if (!info.exists || info.md5 !== f.md5) throw new Error('checksum mismatch');
    await FS.makeDirectoryAsync(FOODS_DIR, { intermediates: true });
    await FS.deleteAsync(FOODS_DIR + FOODS_FILE, { idempotent: true });
    await FS.moveAsync({ from: inner, to: FOODS_DIR + FOODS_FILE });
  } finally {
    await FS.deleteAsync(zip, { idempotent: true });
    await FS.deleteAsync(dir, { idempotent: true });
  }
}

/**
 * Resumes across interruptions and app restarts. Only `pauseAsync` yields a resume token, so when the app
 * goes to background the download is paused and the token saved; `downloadAsync` then resolves undefined, which
 * returns false so `installFoods` surfaces it as PAUSED, and the next tap on Download resumes from the token when the URL matches.
 * Only 'background' pauses: iOS fires 'inactive' for Control Center and the notification shade.
 */
const RESUME = `${FS.cacheDirectory}foods.resume.json`;
export const PAUSED = 'paused';
async function download(url: string, to: string, bytes: number, onProgress?: (fraction: number) => void): Promise<boolean> {
  let resumeData: string | undefined;
  try { const s = JSON.parse(await FS.readAsStringAsync(RESUME)); if (s.url === url) resumeData = s.resumeData; } catch { /* nothing to resume */ }
  const dl = FS.createDownloadResumable(url, to, {}, p => onProgress?.(p.totalBytesWritten / bytes), resumeData);
  const sub = AppState.addEventListener('change', async s => {
    if (s === 'background') { await dl.pauseAsync(); await FS.writeAsStringAsync(RESUME, JSON.stringify(dl.savable())); }
  });
  try {
    const r = resumeData ? await dl.resumeAsync() : await dl.downloadAsync();
    if (!r) return false;
    if (r.status !== 200 && r.status !== 206) throw new Error(`download ${r.status}`);
    await FS.deleteAsync(RESUME, { idempotent: true });
    return true;
  } finally { sub.remove(); }
}

/** First launch: copy the bundled generic-foods file into place so search and logging work before any download. */
export async function installStarter(): Promise<void> {
  const asset = Asset.fromModule(require('../../assets/foods-starter.db'));
  await asset.downloadAsync();
  await FS.makeDirectoryAsync(FOODS_DIR, { intermediates: true });
  await FS.copyAsync({ from: asset.localUri!, to: FOODS_DIR + FOODS_FILE });
}

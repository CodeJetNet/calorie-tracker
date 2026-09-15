import * as DocumentPicker from 'expo-document-picker';
import * as FS from 'expo-file-system/legacy';
import { useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import { Button, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { unzip } from 'react-native-zip-archive';
import { entriesToCsv } from '../../src/backup/csv';
import { createDocument } from '../../src/backup/documents';
import { renderReport } from '../../src/backup/report';
import { runBackup } from '../../src/backup/scheduler';
import { exportDiary, importDiary, validateDiaryFile, type DiaryFile } from '../../src/backup/serialize';
import { addDays, today } from '../../src/dates';
import { useDb } from '../../src/db/provider';
import { entriesBetween } from '../../src/diary/entries';
import { DEFAULT_MEALS, getJson, getSetting, goals, setSetting } from '../../src/diary/settings';
import { fetchManifest } from '../../src/foods/update';
import { available as healthAvailable, requestPermissions } from '../../src/health';
import { useFoodsUpdate } from '../../src/foods/useFoodsUpdate';
import { importText, type ImportResult } from '../../src/import';
import { BY_ID, DEFAULT_TARGETS, MAIN, PANEL, type Nutrients } from '../../src/nutrients';
import { Chips } from '../../src/ui/Chips';

const COUNTRIES = ['US', 'CA', 'GB', 'AU', 'FR', 'DE'];   // when the manifest cannot be fetched
const h = { fontWeight: 'bold', fontSize: 16, marginTop: 12 } as const;
const row = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 } as const;
const input = { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, minWidth: 90, textAlign: 'right' } as const;

/** Every .csv under `dir` (trailing slash), any depth; an export zip may hold a folder. */
async function csvsIn(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const n of await FS.readDirectoryAsync(dir)) {
    if ((await FS.getInfoAsync(dir + n)).isDirectory) out.push(...(await csvsIn(`${dir}${n}/`)));
    else if (/\.csv$/i.test(n)) out.push(dir + n);
  }
  return out;
}
const describe = (r: ImportResult) =>
  r.kind === 'cronometer-biometrics' ? `${r.weights.toLocaleString()} weights added` : `${r.entries.toLocaleString()} entries added, ${r.skipped.toLocaleString()} skipped`;

export default function Settings() {
  const { diary } = useDb();
  const up = useFoodsUpdate();
  const [goal, setGoal] = useState<Record<string, string>>({});
  const [more, setMore] = useState(false);
  const [mealsText, setMealsText] = useState('');
  const [country, setCountry] = useState('US');
  const [countries, setCountries] = useState(COUNTRIES);
  const [installed, setInstalled] = useState<{ md5: string | null; builtAt: string | null }>({ md5: null, builtAt: null });
  const [off, setOff] = useState(false);
  const [backup, setBackup] = useState<{ lastOk: string | null; pending: boolean }>({ lastOk: null, pending: false });
  const [restore, setRestore] = useState<DiaryFile | null>(null);   // picked and validated, awaiting Replace
  const [restoreMsg, setRestoreMsg] = useState('');
  const [armed, setArmed] = useState(false);   // first Replace tap arms, second replaces
  const [from, setFrom] = useState(addDays(today(), -29));
  const [to, setTo] = useState(today());
  const [imports, setImports] = useState<string[]>([]);   // one line per imported file
  const [health, setHealth] = useState(false);
  const [healthDenied, setHealthDenied] = useState(false);

  const loadInstalled = useCallback(async () => {
    setInstalled({ md5: await getSetting(diary, 'foods_md5'), builtAt: await getSetting(diary, 'foods_built_at') });
  }, [diary]);
  const loadBackup = useCallback(async () => {
    setBackup({ lastOk: await getSetting(diary, 'backup_last_ok'), pending: (await getSetting(diary, 'backup_pending')) === '1' });
  }, [diary]);
  useEffect(() => {   // country picker from the manifest; the fallback list stays when offline
    fetchManifest().then(m => setCountries([...new Set(m.files.map(f => f.country).filter(c => c !== 'starter'))])).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => {
    (async () => {
      setGoal(Object.fromEntries(Object.entries(await goals(diary)).map(([k, v]) => [k, String(v)])));
      setMealsText((await getJson<string[]>(diary, 'meals', DEFAULT_MEALS)).join(', '));
      setCountry((await getSetting(diary, 'foods_country')) ?? 'US');
      setOff((await getSetting(diary, 'off_lookup')) === '1');
      setHealth((await getSetting(diary, 'health_enabled')) === '1');
      await loadInstalled();
      await loadBackup();
    })();
  }, [diary, loadInstalled, loadBackup]));

  const saveGoals = async () => {   // only overrides are stored, so a later change to the defaults still reaches everyone
    const over: Nutrients = {};
    for (const [k, v] of Object.entries(goal)) { const n = Number(v.replace(',', '.')); if (v.trim() && Number.isFinite(n) && n !== DEFAULT_TARGETS[k]) over[k] = n; }
    await setSetting(diary, 'goals', JSON.stringify(over));
  };
  const saveMeals = async () => {
    const list = [...new Set(mealsText.split(',').map(s => s.trim()).filter(Boolean))];
    const meals = list.length ? list : DEFAULT_MEALS;
    setMealsText(meals.join(', '));
    await setSetting(diary, 'meals', JSON.stringify(meals));
  };
  const pickCountry = async (c: string) => { setCountry(c); await setSetting(diary, 'foods_country', c, false); };
  const download = async () => { await up.download(); await loadInstalled(); };

  const setUpBackup = async () => {   // two picked files, not a folder: Drive has no folder grant
    const file = await exportDiary(diary), t = today();
    const report = await createDocument('report.html', 'text/html', renderReport(file, addDays(t, -29), t));
    const json = report && (await createDocument('diary.json', 'application/json', JSON.stringify(file)));
    if (!report || !json) return;   // cancelled: store nothing, status stays "Backup not set up"
    await setSetting(diary, 'backup_uri_report', report, false);
    await setSetting(diary, 'backup_uri_diary', json, false);
    await setSetting(diary, 'backup_dirty', '0', false);
    await setSetting(diary, 'backup_pending', '0', false);
    await setSetting(diary, 'backup_last_ok', new Date().toISOString(), false);
    await loadBackup();
  };
  const retryBackup = async () => { await runBackup(diary, true); await loadBackup(); };

  const pickRestore = async () => {
    setRestore(null); setArmed(false); setRestoreMsg('');
    const r = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (r.canceled) return;
    try { setRestore(validateDiaryFile(JSON.parse(await FS.readAsStringAsync(r.assets[0].uri)))); }
    catch (e) { setRestoreMsg((e as Error).message); }
  };
  const replace = async () => {
    if (!armed) { setArmed(true); return; }
    const f = restore!;
    await importDiary(diary, f);
    setRestore(null); setArmed(false);
    setRestoreMsg(`Restored ${f.entries.length} entries, ${f.custom_foods.length} custom foods, ${f.recipes.length} recipes, ${f.weights.length} weights.`);
  };

  const share = async (name: string, mimeType: string, content: string) => {
    const uri = `${FS.cacheDirectory}${name}`;
    await FS.writeAsStringAsync(uri, content);
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: 'Share diary' });
  };
  const shareCsv = async () => share('export.csv', 'text/csv', entriesToCsv(await entriesBetween(diary, from, to)));
  const shareReport = async () => share('export.html', 'text/html', renderReport(await exportDiary(diary), from, to));

  const importFile = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['text/*', 'application/zip', 'application/octet-stream'], copyToCacheDirectory: true });
    if (r.canceled) return;
    let files = [r.assets[0].uri];
    if (/\.zip$/i.test(r.assets[0].name)) {
      const dir = `${FS.cacheDirectory}import-unzip/`;
      await FS.deleteAsync(dir, { idempotent: true });
      await unzip(r.assets[0].uri, dir);
      files = await csvsIn(dir);
    }
    const lines: string[] = [];
    for (const uri of files) {
      const name = decodeURIComponent(uri.slice(uri.lastIndexOf('/') + 1)).replace(/\.csv$/i, '');
      try { lines.push(`${name}: ${describe(await importText(diary, await FS.readAsStringAsync(uri)))}`); }
      catch (e) { lines.push(`${name}: ${(e as Error).message}`); }
      setImports([...lines]);
    }
  };

  const toggleHealth = async (v: boolean) => {   // on: only after Health Connect grants both permissions, else the switch snaps back
    const on = v && (await requestPermissions());
    setHealth(on); setHealthDenied(v && !on);
    await setSetting(diary, 'health_enabled', on ? '1' : '0');
  };

  const goalInput = (id: string) => {
    const n = BY_ID[id];
    return (
      <View key={id} style={row}>
        <Text>{n.name} ({n.unit})</Text>
        <TextInput value={goal[id] ?? ''} onChangeText={v => setGoal({ ...goal, [id]: v })} onBlur={saveGoals} keyboardType="decimal-pad"
          placeholder={DEFAULT_TARGETS[id] != null ? String(DEFAULT_TARGETS[id]) : '-'} style={input} />
      </View>
    );
  };
  const busy = up.status === 'checking' || up.status === 'downloading';

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }} keyboardShouldPersistTaps="handled">
      <Text style={h}>Goals</Text>
      {MAIN.map(goalInput)}
      <Button title={more ? 'Less' : 'More'} onPress={() => setMore(!more)} />
      {more && PANEL.filter(n => !MAIN.includes(n.id)).map(n => goalInput(n.id))}

      <Text style={h}>Meals</Text>
      <TextInput value={mealsText} onChangeText={setMealsText} onBlur={saveMeals} placeholder={DEFAULT_MEALS.join(', ')} style={{ ...input, textAlign: 'left' }} />

      <Text style={h}>Food database</Text>
      <Chips options={countries} value={country} onChange={pickCountry} />
      <Text>{installed.md5 ? `Installed database built ${installed.builtAt}` : 'Starter database: generic foods only'}</Text>
      <Button title="Check for update" onPress={() => up.check(country)} disabled={busy} />
      {up.status === 'checking' && <Text>Checking...</Text>}
      {up.status === 'current' && <Text>Up to date.</Text>}
      {up.file && up.file.country === country && (
        <>
          <Text>Full database available, {Math.round(up.file.bytes / 1e6)} MB</Text>
          {up.status === 'paused' && <Text>Paused. Tap Download to continue.</Text>}
          <Button title="Download" onPress={download} disabled={busy} />
          {up.status === 'downloading' && (
            <View style={{ height: 6, backgroundColor: '#ddd', borderRadius: 3 }}>
              <View style={{ height: 6, width: `${Math.min(up.progress, 1) * 100}%`, backgroundColor: '#3a3', borderRadius: 3 }} />
            </View>
          )}
          <Text style={{ color: '#666' }}>Keep the app open. If interrupted, the download resumes where it left off.</Text>
        </>
      )}
      {!!up.error && <Text style={{ color: '#c33' }}>{up.error}</Text>}

      <Text style={h}>Privacy</Text>
      <View style={row}>
        <Text style={{ flex: 1 }}>Look up missing barcodes on Open Food Facts automatically</Text>
        <Switch value={off} onValueChange={async v => { setOff(v); await setSetting(diary, 'off_lookup', v ? '1' : '0'); }} />
      </View>
      <Text style={{ color: '#666' }}>Sends only the barcode. When off, the Scan screen asks each time.</Text>

      <Text style={h}>Backup</Text>
      <Button title="Set up backup" onPress={setUpBackup} />
      {backup.pending ? (
        <View style={row}><Text style={{ color: '#c33' }}>Backup failed</Text><Button title="Retry" onPress={retryBackup} /></View>
      ) : (
        <Text>{backup.lastOk ? `Last backup: ${new Date(backup.lastOk).toLocaleString()}` : 'Backup not set up'}</Text>
      )}
      <Text style={{ color: '#666' }}>To share with a coach, share the folder that holds report.html from your cloud app. They can open it in any browser; it refreshes every time you log.</Text>
      <Button title="Restore from backup" onPress={pickRestore} />
      {restore && (
        <>
          <Text>{restore.entries.length} entries, {restore.custom_foods.length} custom foods, {restore.recipes.length} recipes, exported {restore.exportedAt}. This replaces everything in this app.</Text>
          <Button title={armed ? 'Tap again to replace' : 'Replace'} color="#c33" onPress={replace} />
        </>
      )}
      {!!restoreMsg && <Text style={{ color: restoreMsg.startsWith('Restored') ? undefined : '#c33' }}>{restoreMsg}</Text>}

      <Text style={h}>Import and export</Text>
      <View style={row}>
        <Text>From</Text><TextInput value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" style={input} />
        <Text>To</Text><TextInput value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" style={input} />
      </View>
      <Button title="Share CSV" onPress={shareCsv} />
      <Button title="Share report" onPress={shareReport} />
      <Button title="Import Cronometer file" onPress={importFile} />
      {imports.map((m, i) => <Text key={i}>{m}</Text>)}

      {healthAvailable && (
        <>
          <Text style={h}>Health</Text>
          <View style={row}>
            <Text style={{ flex: 1 }}>Sync with Health Connect</Text>
            <Switch value={health} onValueChange={toggleHealth} />
          </View>
          <Text style={{ color: '#666' }}>Reads active calories burned and writes the meals you log as nutrition records.</Text>
          {healthDenied && <Text style={{ color: '#c33' }}>Permission not granted. Health Connect may need to be installed or updated.</Text>}
        </>
      )}
    </ScrollView>
  );
}

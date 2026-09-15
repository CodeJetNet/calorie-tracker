import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Button, Pressable, ScrollView, Text, View } from 'react-native';
import { useDb } from '../../src/db/provider';
import { addDays, today } from '../../src/dates';
import { entriesForDay, type Entry } from '../../src/diary/entries';
import { logEntry, unlogEntry } from '../../src/diary/log';
import { DEFAULT_MEALS, getJson, getSetting, goals, setSetting } from '../../src/diary/settings';
import { checkDue, fetchManifest, pickFile, SUPPORTED_SCHEMA } from '../../src/foods/update';
import { readActiveCalories } from '../../src/health';
import { MAIN, PANEL, sum, type Nutrients } from '../../src/nutrients';
import { fmt, NutrientBar } from '../../src/ui/NutrientBar';

const row = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } as const;

export default function Today() {
  const { diary } = useDb();
  const router = useRouter();
  const [day, setDay] = useState(today());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [targets, setTargets] = useState<Nutrients>({});
  const [meals, setMeals] = useState(DEFAULT_MEALS);
  const [more, setMore] = useState(false);
  const [deleted, setDeleted] = useState<Entry | null>(null);
  const [md5, setMd5] = useState<string | null>(null);        // installed file; null while on the bundled starter
  const [latest, setLatest] = useState<string | null>(null);  // the manifest's file for the chosen country
  const [backupPending, setBackupPending] = useState(false);
  const [burned, setBurned] = useState<number | null>(null);   // Health Connect active calories; null when off or unavailable

  const load = useCallback(async () => {
    setEntries(await entriesForDay(diary, day));
    setTargets(await goals(diary));
    setMeals(await getJson<string[]>(diary, 'meals', DEFAULT_MEALS));
    setMd5(await getSetting(diary, 'foods_md5'));
    setBackupPending((await getSetting(diary, 'backup_pending')) === '1');
    setBurned((await getSetting(diary, 'health_enabled')) === '1' ? await readActiveCalories(day) : null);
  }, [diary, day]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {   // on launch and foreground: once a day, ask the manifest whether a newer file exists. Nothing downloads without a tap.
    const check = async () => {
      const last = await getSetting(diary, 'foods_checked_at');
      if (!checkDue(last ? Number(last) : null, Date.now(), Math.random())) return;
      try {
        const f = pickFile(await fetchManifest(), (await getSetting(diary, 'foods_country')) ?? 'US', SUPPORTED_SCHEMA);
        await setSetting(diary, 'foods_checked_at', String(Date.now()), false);
        if (f) setLatest(f.md5);
      } catch { /* offline: try again next foreground */ }
    };
    check();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') check(); });
    return () => sub.remove();
  }, [diary]);

  const starter = !md5, newer = !!md5 && !!latest && latest !== md5;
  const totals = sum(entries.map(e => e.nutrients));

  const remove = async (e: Entry) => {
    await unlogEntry(diary, e.id);
    await load();
    setDeleted(e);
    setTimeout(() => setDeleted(d => (d === e ? null : d)), 5000);
  };
  const undo = async () => {
    if (!deleted) return;
    await logEntry(diary, { ...deleted, health_id: null });   // the old Health Connect record went with the delete
    setDeleted(null);
    await load();
  };

  const sections = [...meals, 'Other']
    .map(m => [m, entries.filter(e => (m === 'Other' ? !meals.includes(e.meal) : e.meal === m))] as const)
    .filter(([m, es]) => m !== 'Other' || es.length);

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
      <View style={row}>
        <Button title="<" onPress={() => setDay(addDays(day, -1))} />
        <Text style={{ fontSize: 18 }}>{day === today() ? 'Today' : day}</Text>
        <Button title=">" onPress={() => setDay(addDays(day, 1))} />
        <Button title="Weight" onPress={() => router.push('/weight')} />
      </View>
      {(starter || newer) && (
        <Pressable onPress={() => router.push('/settings')} style={{ padding: 8, borderRadius: 8, backgroundColor: '#fff3cd' }}>
          <Text>{starter ? 'Download the full food database' : 'New food database available'}</Text>
        </Pressable>
      )}
      {backupPending && (
        <Pressable onPress={() => router.push('/settings')} style={{ padding: 8, borderRadius: 8, backgroundColor: '#f8d7da' }}>
          <Text>Backup failed. Retry from Settings.</Text>
        </Pressable>
      )}

      <View style={{ padding: 12, borderRadius: 8, backgroundColor: '#f2f2f2' }}>
        {MAIN.map(id => <NutrientBar key={id} id={id} value={totals[id] ?? 0} goal={targets[id]} />)}
        <Button title={more ? 'Less' : 'More'} onPress={() => setMore(!more)} />
        {more && PANEL.filter(n => !MAIN.includes(n.id)).map(n => {
          const v = totals[n.id] ?? 0, t = targets[n.id];
          return <Text key={n.id}>{n.name}: {fmt(v)}{t ? ` / ${fmt(t)}` : ''} {n.unit}{t ? ` (${Math.round((v / t) * 100)}%)` : ''}</Text>;
        })}
        {burned != null && <Text>Burned: {fmt(burned)} kcal</Text>}
        {burned != null && targets['1008'] != null && <Text>Remaining: {fmt(targets['1008'] - (totals['1008'] ?? 0) + burned)} kcal</Text>}
      </View>

      {sections.map(([meal, es]) => (
        <View key={meal}>
          <View style={row}>
            <Text style={{ fontWeight: 'bold' }}>{meal}</Text>
            {meal !== 'Other' && (
              <View style={{ flexDirection: 'row' }}>
                <Button title="Add" onPress={() => router.push({ pathname: '/search', params: { day, meal } })} />
                <Button title="Scan" onPress={() => router.push({ pathname: '/scan', params: { day, meal } })} />
              </View>
            )}
          </View>
          {es.map(e => (
            <Pressable key={e.id} style={{ ...row, paddingVertical: 8 }}
              onPress={() => router.push({ pathname: '/food/[ref]', params: { ref: e.food_ref ?? 'entry', entry: e.id } })}
              onLongPress={() => remove(e)}>
              <View style={{ flex: 1 }}>
                <Text>{e.name}</Text>
                <Text style={{ color: '#666' }}>{e.amount_desc ?? `${e.amount} g`}</Text>
              </View>
              <Text>{fmt(e.nutrients['1008'] ?? 0)} kcal</Text>
            </Pressable>
          ))}
        </View>
      ))}

      {deleted && (
        <View style={{ ...row, padding: 12, backgroundColor: '#333', borderRadius: 8 }}>
          <Text style={{ color: '#fff' }}>Deleted.</Text>
          <Button title="Undo" onPress={undo} />
        </View>
      )}
    </ScrollView>
  );
}

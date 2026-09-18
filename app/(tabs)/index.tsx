import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { useDb } from '../../src/db/provider';
import { addDays, today } from '../../src/dates';
import { entriesForDay, type Entry } from '../../src/diary/entries';
import { logEntry, unlogEntry } from '../../src/diary/log';
import { DEFAULT_MEALS, getJson, getSetting, goals, setSetting } from '../../src/diary/settings';
import { checkDue, fetchManifest, pickFile, SUPPORTED_SCHEMA } from '../../src/foods/update';
import { readActiveCalories } from '../../src/health';
import { MAIN, PANEL, sum, type Nutrients } from '../../src/nutrients';
import { Banner, Btn, Card, IconBtn, Line, Ring, row, Screen, Txt } from '../../src/ui/kit';
import { fmt, NutrientBar } from '../../src/ui/NutrientBar';
import { color, radius, shadow } from '../../src/ui/theme';

const ENERGY = '1008';
const pretty = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

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

  const eaten = totals[ENERGY] ?? 0, energyGoal = targets[ENERGY];

  return (
    <Screen tab title={day === today() ? 'Today' : pretty(day)}
      right={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <IconBtn icon="prev" label="Previous day" onPress={() => setDay(addDays(day, -1))} />
          <IconBtn icon="next" label="Next day" onPress={() => setDay(addDays(day, 1))} />
          <IconBtn icon="weight" label="Weight log" onPress={() => router.push('/weight')} />
        </View>
      }
      overlay={deleted && (
        <View style={{ ...row, paddingLeft: 20, paddingRight: 8, minHeight: 52, borderRadius: radius.pill, backgroundColor: color.charcoal, boxShadow: shadow.chrome }}>
          <Txt style={{ color: color.white }}>Deleted.</Txt>
          <Pressable onPress={undo} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}>
            <Text style={{ color: color.green, fontSize: 16, fontWeight: '700' }}>Undo</Text>
          </Pressable>
        </View>
      )}>
      {(starter || newer) && <Banner text={starter ? 'Download the full food database' : 'New food database available'} onPress={() => router.push('/settings')} />}
      {backupPending && <Banner kind="error" text="Backup failed. Retry from Settings." onPress={() => router.push('/settings')} />}

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Ring size={132} width={13} frac={energyGoal ? eaten / energyGoal : 0}>
            <Txt v="title" style={{ fontSize: 28, fontVariant: ['tabular-nums'] }}>{fmt(eaten)}</Txt>
            <Txt v="muted">{energyGoal ? `of ${fmt(energyGoal)} kcal` : 'kcal'}</Txt>
          </Ring>
          <View style={{ flex: 1, gap: 10 }}>
            {MAIN.filter(id => id !== ENERGY).map(id => <NutrientBar key={id} id={id} value={totals[id] ?? 0} goal={targets[id]} />)}
          </View>
        </View>
        {burned != null && <Line label="Burned" value={`${fmt(burned)} kcal`} />}
        {burned != null && energyGoal != null && <Line label="Remaining" value={`${fmt(energyGoal - eaten + burned)} kcal`} />}
        <Btn kind="plain" small title={more ? 'Show less' : 'All nutrients'} onPress={() => setMore(!more)} />
        {more && PANEL.filter(n => !MAIN.includes(n.id)).map(n => {
          const v = totals[n.id] ?? 0, t = targets[n.id];
          return <Line key={n.id} label={n.name} value={`${fmt(v)}${t ? ` / ${fmt(t)}` : ''} ${n.unit}${t ? `  ${Math.round((v / t) * 100)}%` : ''}`} />;
        })}
      </Card>

      {sections.map(([meal, es]) => (
        <Card key={meal} style={{ gap: 0 }}>
          <View style={row}>
            <View style={{ flex: 1 }}>
              <Txt v="headline">{meal}</Txt>
              {es.length > 0 && <Txt v="muted">{fmt(sum(es.map(e => e.nutrients))[ENERGY] ?? 0)} kcal</Txt>}
            </View>
            {meal !== 'Other' && (
              <>
                <Btn small icon="add" title="Add" onPress={() => router.push({ pathname: '/search', params: { day, meal } })} />
                <Btn small kind="plain" icon="scan" title="Scan" onPress={() => router.push({ pathname: '/scan', params: { day, meal } })} />
              </>
            )}
          </View>
          {es.map((e, i) => (
            <Pressable key={e.id} style={{ ...row, minHeight: 52, paddingVertical: 8, marginTop: i ? 0 : 12, borderTopWidth: 1, borderTopColor: color.track }}
              onPress={() => router.push({ pathname: '/food/[ref]', params: { ref: e.food_ref ?? 'entry', entry: e.id } })}
              onLongPress={() => remove(e)}>
              <View style={{ flex: 1 }}>
                <Txt numberOfLines={2}>{e.name}</Txt>
                <Txt v="muted">{e.amount_desc ?? `${e.amount} g`}</Txt>
              </View>
              <Txt style={{ fontVariant: ['tabular-nums'] }}>{fmt(e.nutrients[ENERGY] ?? 0)} kcal</Txt>
            </Pressable>
          ))}
        </Card>
      ))}
      {entries.length > 0 && <Txt v="muted" style={{ textAlign: 'center' }}>Long-press an entry to delete it.</Txt>}
    </Screen>
  );
}

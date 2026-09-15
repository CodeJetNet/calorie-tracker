import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Button, Pressable, ScrollView, Text, View } from 'react-native';
import { useDb } from '../../src/db/provider';
import { addDays, today } from '../../src/dates';
import { addEntry, deleteEntry, entriesForDay, type Entry } from '../../src/diary/entries';
import { DEFAULT_MEALS, getJson, goals } from '../../src/diary/settings';
import { PANEL, sum, type Nutrients } from '../../src/nutrients';
import { fmt, NutrientBar } from '../../src/ui/NutrientBar';

const MAIN = ['1008', '1003', '1005', '1004'];
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

  const load = useCallback(async () => {
    setEntries(await entriesForDay(diary, day));
    setTargets(await goals(diary));
    setMeals(await getJson<string[]>(diary, 'meals', DEFAULT_MEALS));
  }, [diary, day]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totals = sum(entries.map(e => e.nutrients));
  const burned: number | null = null;   // Milestone 5

  const remove = async (e: Entry) => {
    await deleteEntry(diary, e.id);
    await load();
    setDeleted(e);
    setTimeout(() => setDeleted(d => (d === e ? null : d)), 5000);
  };
  const undo = async () => {
    if (!deleted) return;
    await addEntry(diary, deleted);
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
      </View>

      <View style={{ padding: 12, borderRadius: 8, backgroundColor: '#f2f2f2' }}>
        {MAIN.map(id => <NutrientBar key={id} id={id} value={totals[id] ?? 0} goal={targets[id]} />)}
        <Button title={more ? 'Less' : 'More'} onPress={() => setMore(!more)} />
        {more && PANEL.filter(n => !MAIN.includes(n.id)).map(n => {
          const v = totals[n.id] ?? 0, t = targets[n.id];
          return <Text key={n.id}>{n.name}: {fmt(v)}{t ? ` / ${fmt(t)}` : ''} {n.unit}{t ? ` (${Math.round((v / t) * 100)}%)` : ''}</Text>;
        })}
        {burned != null && <Text>Burned: {fmt(burned)} kcal</Text>}
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

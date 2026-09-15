import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useDb } from '../../src/db/provider';
import { allCustomFoods, searchCustomFoods, type CustomFood } from '../../src/diary/customFoods';
import { recentEntries } from '../../src/diary/entries';
import { allRecipes, type Recipe } from '../../src/diary/recipes';
import { getSetting } from '../../src/diary/settings';
import { foodRef, search, type Food } from '../../src/foods/db';

type Row = { key: string; ref: string; title: string; sub?: string; relog?: string };
const custom = (f: CustomFood): Row => ({ key: f.id, ref: `custom:${f.id}`, title: f.name, sub: f.brand ?? undefined });
const rec = (r: Recipe): Row => ({ key: r.id, ref: `recipe:${r.id}`, title: r.name, sub: `${r.servings} servings` });
const dbFood = (f: Food): Row => ({ key: String(f.id), ref: foodRef(f), title: f.name, sub: f.brand ?? undefined });

export default function Search() {
  const { diary, foods } = useDb();
  const router = useRouter();
  const { day, meal, pick } = useLocalSearchParams<{ day?: string; meal?: string; pick?: string }>();
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState<[string, Row[]][]>([]);
  const [starter, setStarter] = useState(false);
  const [tick, setTick] = useState(0);   // reload lists when the tab regains focus

  useFocusEffect(useCallback(() => {
    setTick(t => t + 1);
    getSetting(diary, 'foods_md5').then(v => setStarter(!v));
  }, [diary]));

  useEffect(() => {
    const t = setTimeout(async () => {
      const s = q.trim();
      if (s.length < 2) {
        setGroups([
          ['Recent', (await recentEntries(diary)).map(e => ({ key: e.id, ref: e.food_ref ?? 'entry', title: e.name, sub: e.amount_desc ?? undefined, relog: e.id }))],
          ['Custom foods', (await allCustomFoods(diary)).map(custom)],
          ['Recipes', (await allRecipes(diary)).map(rec)],
        ]);
      } else {
        const l = s.toLowerCase();
        setGroups([
          ['Custom foods', (await searchCustomFoods(diary, s)).map(custom)],
          ['Recipes', (await allRecipes(diary)).filter(r => r.name.toLowerCase().includes(l)).map(rec)],
          ['Foods', foods ? (await search(foods, s)).map(dbFood) : []],
        ]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, tick, diary, foods]);

  const open = (r: Row) => router.push({ pathname: '/food/[ref]', params: { ref: r.ref, day, meal, pick, relog: r.relog } });

  return (
    <View style={{ flex: 1 }}>
      <TextInput value={q} onChangeText={setQ} placeholder="Search foods" autoFocus clearButtonMode="while-editing"
        style={{ margin: 12, padding: 10, borderWidth: 1, borderColor: '#ccc', borderRadius: 8 }} />
      {starter && <Text style={{ marginHorizontal: 12, color: '#666' }}>Generic foods only. Packaged foods arrive with the full database, in Settings.</Text>}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12 }}>
        {groups.filter(([, rows]) => rows.length).map(([title, rows]) => (
          <View key={title} style={{ marginBottom: 12 }}>
            <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>{title}</Text>
            {rows.map(r => (
              <Pressable key={r.key} onPress={() => open(r)} style={{ paddingVertical: 8 }}>
                <Text>{r.title}</Text>
                {r.sub && <Text style={{ color: '#666' }}>{r.sub}</Text>}
              </Pressable>
            ))}
          </View>
        ))}
        <Pressable onPress={() => router.push({ pathname: '/custom/[id]', params: { id: 'new', day, meal, pick } })} style={{ paddingVertical: 8 }}>
          <Text style={{ color: '#2a6' }}>New custom food</Text>
        </Pressable>
        {!pick && (
          <Pressable onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: 'new' } })} style={{ paddingVertical: 8 }}>
            <Text style={{ color: '#2a6' }}>New recipe</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useDb } from '../../src/db/provider';
import { allCustomFoods, searchCustomFoods, type CustomFood } from '../../src/diary/customFoods';
import { recentEntries } from '../../src/diary/entries';
import { allRecipes, type Recipe } from '../../src/diary/recipes';
import { getSetting } from '../../src/diary/settings';
import { foodRef, search, type Food } from '../../src/foods/db';
import { Btn, Icon, row, Screen, Section, Txt } from '../../src/ui/kit';
import { color, radius } from '../../src/ui/theme';

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
    let live = true;   // results for "a" must not land after "ab"
    const t = setTimeout(async () => {
      const s = q.trim();
      let g: [string, Row[]][];
      if (s.length < 2) {
        g = [
          ['Recent', (await recentEntries(diary)).map(e => ({ key: e.id, ref: e.food_ref ?? 'entry', title: e.name, sub: e.amount_desc ?? undefined, relog: e.id }))],
          ['Custom foods', (await allCustomFoods(diary)).map(custom)],
          ['Recipes', (await allRecipes(diary)).map(rec)],
        ];
      } else {
        const l = s.toLowerCase();
        g = [
          ['Custom foods', (await searchCustomFoods(diary, s)).map(custom)],
          ['Recipes', (await allRecipes(diary)).filter(r => r.name.toLowerCase().includes(l)).map(rec)],
          ['Foods', foods ? (await search(foods, s)).map(dbFood) : []],
        ];
      }
      if (live) setGroups(g);
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, tick, diary, foods]);

  const open = (r: Row) => router.push({ pathname: '/food/[ref]', params: { ref: r.ref, day, meal, pick, relog: r.relog } });

  return (
    <Screen tab title="Search">
      <View style={{ ...row, justifyContent: 'flex-start', minHeight: 48, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: color.field, borderWidth: 1, borderColor: color.edge }}>
        <Icon name="search" size={20} tint={color.textMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search foods" placeholderTextColor={color.textMuted} autoFocus clearButtonMode="while-editing"
          accessibilityLabel="Search foods" style={{ flex: 1, minHeight: 44, fontSize: 16, color: color.text }} />
      </View>
      {starter && <Txt v="muted">Generic foods only. Packaged foods arrive with the full database, in Settings.</Txt>}
      {groups.filter(([, rows]) => rows.length).map(([title, rows]) => (
        <Section key={title} title={title}>
          <View>
            {rows.map((r, i) => (
              <Pressable key={r.key} onPress={() => open(r)} style={{ minHeight: 48, paddingVertical: 8, justifyContent: 'center', borderTopWidth: i ? 1 : 0, borderTopColor: color.track }}>
                <Txt numberOfLines={2}>{r.title}</Txt>
                {r.sub && <Txt v="muted" numberOfLines={1}>{r.sub}</Txt>}
              </Pressable>
            ))}
          </View>
        </Section>
      ))}
      <Btn icon="add" title="New custom food" onPress={() => router.push({ pathname: '/custom/[id]', params: { id: 'new', day, meal, pick } })} />
      {!pick && <Btn icon="add" title="New recipe" onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: 'new' } })} />}
    </Screen>
  );
}

import * as Crypto from 'expo-crypto';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Button, ScrollView, Text, TextInput, View } from 'react-native';
import { useDb } from '../../src/db/provider';
import { addDays, today } from '../../src/dates';
import { addEntry, entry as loadEntry, updateEntry, type Entry } from '../../src/diary/entries';
import { DEFAULT_MEALS, getJson } from '../../src/diary/settings';
import { resolve, type Resolved } from '../../src/foods/resolve';
import { BY_ID, PANEL, scale } from '../../src/nutrients';
import { Chips } from '../../src/ui/Chips';
import { fmt } from '../../src/ui/NutrientBar';

const TOP = ['1008', '1003', '1005', '1004', '1079', '2000', '1093'];
const row = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } as const;

export default function FoodDetail() {
  const { diary, foods } = useDb();
  const router = useRouter();
  const p = useLocalSearchParams<{ ref: string; day?: string; meal?: string; entry?: string; relog?: string; pick?: string }>();
  const [r, setR] = useState<Resolved | null>(null);
  const [existing, setExisting] = useState<Entry | null>(null);   // edit mode
  const [missing, setMissing] = useState(false);
  const [meals, setMeals] = useState(DEFAULT_MEALS);
  const [meal, setMeal] = useState(p.meal ?? '');
  const [day, setDay] = useState(p.day ?? today());
  const [opt, setOpt] = useState(0);
  const [qtyText, setQtyText] = useState('1');
  const [more, setMore] = useState(false);

  useEffect(() => {
    (async () => {
      const ms = await getJson<string[]>(diary, 'meals', DEFAULT_MEALS);
      setMeals(ms);
      const e = p.entry || p.relog ? await loadEntry(diary, p.entry ?? p.relog!) : null;
      let res = p.ref === 'entry' ? null : await resolve(p.ref, foods, diary);
      if (!res && e) {   // imported row, or the food left the database: rescale from the logged amount
        res = { ref: p.ref, name: e.name, brand: null, per100: scale(e.nutrients, 10000 / (e.amount ?? 100)), options: [{ label: 'as logged', grams: e.amount ?? 100 }], barcode: null };
      }
      if (!res) { setMissing(true); return; }
      if (e) {
        if (e.amount != null && !res.options.some(o => o.grams === e.amount)) res.options.push({ label: `${e.amount} g`, grams: e.amount });
        setOpt(Math.max(0, res.options.findIndex(o => o.grams === e.amount)));
      }
      if (p.entry && e) { setExisting(e); setMeal(e.meal); setDay(e.day); }
      else if (!p.meal) setMeal(ms[0]);
      setR(res);
    })();
  }, []);

  const [kind, id] = p.ref.split(':');
  const editPath = kind === 'custom' ? '/custom/[id]' : kind === 'recipe' ? '/recipe/[id]' : null;
  const qty = Number(qtyText);
  const option = r?.options[opt];
  const grams = option ? option.grams * qty : 0;
  const n = r ? scale(r.per100, grams) : {};
  const extra = Object.keys(n).filter(k => !PANEL.some(x => x.id === k));
  const valid = r && qty > 0 && (p.pick || meal);

  const save = async () => {
    if (!r || !option) return;
    const base = { name: r.name, amount: grams, amount_desc: qty === 1 ? option.label : `${qty} × ${option.label}`, nutrients: n };
    if (p.pick) {
      const picked = JSON.stringify({ name: r.name, amount: grams, nutrients: n, food_ref: p.ref === 'entry' ? null : p.ref });
      router.dismissTo({ pathname: '/recipe/[id]', params: { id: p.pick, picked } });
    } else if (existing) {
      await updateEntry(diary, { ...existing, ...base, day, meal });   // keeps id, source, health_id, food_ref
      router.back();
    } else {
      await addEntry(diary, { id: Crypto.randomUUID(), day, meal, ...base, food_ref: p.ref === 'entry' ? null : p.ref, source: 'app', health_id: null });
      router.dismissTo('/');
    }
  };

  const line = (k: string) => <Text key={k}>{BY_ID[k]?.name ?? k}: {fmt(n[k] ?? 0)} {BY_ID[k]?.unit ?? ''}</Text>;

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
      <Stack.Screen options={{ title: r?.name ?? '', headerRight: () => (editPath ? <Button title="Edit" onPress={() => router.push({ pathname: editPath, params: { id } })} /> : null) }} />
      {missing && <Text>This food is no longer available.</Text>}
      {r && (
        <>
          <Text style={{ fontSize: 20 }}>{r.name}</Text>
          {r.brand && <Text style={{ color: '#666' }}>{r.brand}</Text>}
          <Chips options={r.options.map(o => o.label)} value={option!.label} onChange={l => setOpt(r.options.findIndex(o => o.label === l))} />
          <View style={row}>
            <Text>Quantity</Text>
            <TextInput value={qtyText} onChangeText={setQtyText} keyboardType="decimal-pad" selectTextOnFocus
              style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, width: 80, textAlign: 'right' }} />
          </View>
          <Text style={{ color: '#666' }}>{fmt(grams)} g</Text>
          {!p.pick && <Chips options={meals.includes(meal) ? meals : [...meals, meal]} value={meal} onChange={setMeal} />}
          {existing && (
            <View style={row}>
              <Button title="<" onPress={() => setDay(addDays(day, -1))} />
              <Text>{day === today() ? 'Today' : day}</Text>
              <Button title=">" onPress={() => setDay(addDays(day, 1))} />
            </View>
          )}
          <View style={{ padding: 12, borderRadius: 8, backgroundColor: '#f2f2f2' }}>
            {TOP.map(line)}
            <Button title={more ? 'Less' : 'More'} onPress={() => setMore(!more)} />
            {more && [...PANEL.filter(x => !TOP.includes(x.id)).map(x => x.id), ...extra].map(line)}
          </View>
          <Button title={p.pick ? 'Add to recipe' : existing ? 'Save' : `Add to ${meal}`} onPress={save} disabled={!valid} />
          {r.barcode && <Button title="Contribute to Open Food Facts" disabled onPress={() => {}} />}{/* Milestone 6 */}
        </>
      )}
    </ScrollView>
  );
}

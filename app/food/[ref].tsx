import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useDb } from '../../src/db/provider';
import { addDays, today } from '../../src/dates';
import { entry as loadEntry, type Entry } from '../../src/diary/entries';
import { logEntry, relogEntry } from '../../src/diary/log';
import { DEFAULT_MEALS, getJson } from '../../src/diary/settings';
import { resolve, type Resolved } from '../../src/foods/resolve';
import { BY_ID, PANEL, scale, TOP } from '../../src/nutrients';
import { Chips } from '../../src/ui/Chips';
import { Btn, Field, IconBtn, Line, row, Screen, Section, Txt } from '../../src/ui/kit';
import { fmt } from '../../src/ui/NutrientBar';

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
        res = { ref: p.ref, name: e.name, brand: null, per100: scale(e.nutrients, 10000 / (e.amount || 100)), options: [{ label: 'as logged', grams: e.amount || 100 }], barcode: null };
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

  const [kind, id, sourceId] = p.ref.split(':');
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
      await relogEntry(diary, { ...existing, ...base, day, meal });   // keeps id, source, food_ref
      router.back();
    } else {
      await logEntry(diary, { id: Crypto.randomUUID(), day, meal, ...base, food_ref: p.ref === 'entry' ? null : p.ref, source: 'app', health_id: null });
      router.dismissTo('/');
    }
  };

  // Contributions happen on Open Food Facts' own site, under the person's own account: the app holds no credentials.
  const openOff = () => Linking.openURL(`https://world.openfoodfacts.org/cgi/product.pl?type=edit&code=${r?.barcode}`);

  const line = (k: string) => <Line key={k} label={BY_ID[k]?.name ?? k} value={`${fmt(n[k] ?? 0)} ${BY_ID[k]?.unit ?? ''}`} />;

  return (
    <Screen title={r?.name ?? ''}
      right={editPath ? <IconBtn icon="edit" label="Edit" onPress={() => router.push({ pathname: editPath, params: { id, day: p.day, meal: p.meal, pick: p.pick } })} /> : null}>
      {missing && <Txt>This food is no longer available.</Txt>}
      {r && (
        <>
          {r.brand && <Txt v="muted">{r.brand}</Txt>}
          <Section title="Serving">
            <Chips options={r.options.map(o => o.label)} value={option!.label} onChange={l => setOpt(r.options.findIndex(o => o.label === l))} />
            <View style={row}>
              <Txt style={{ flex: 1 }}>Quantity</Txt>
              <Field value={qtyText} onChangeText={setQtyText} keyboardType="decimal-pad" selectTextOnFocus accessibilityLabel="Quantity" style={{ width: 96, textAlign: 'right' }} />
            </View>
            <Txt v="muted" style={{ textAlign: 'right' }}>{fmt(grams)} g</Txt>
          </Section>
          {(!p.pick || existing) && (
            <Section title="Meal">
              {!p.pick && <Chips options={meals.includes(meal) ? meals : [...meals, meal]} value={meal} onChange={setMeal} />}
              {existing && (
                <View style={row}>
                  <IconBtn icon="prev" label="Previous day" onPress={() => setDay(addDays(day, -1))} />
                  <Txt v="headline">{day === today() ? 'Today' : day}</Txt>
                  <IconBtn icon="next" label="Next day" onPress={() => setDay(addDays(day, 1))} />
                </View>
              )}
            </Section>
          )}
          <Section title="Nutrition">
            {TOP.map(line)}
            <Btn kind="plain" small title={more ? 'Show less' : 'All nutrients'} onPress={() => setMore(!more)} />
            {more && [...PANEL.filter(x => !TOP.includes(x.id)).map(x => x.id), ...extra].map(line)}
          </Section>
          <Btn kind="primary" title={p.pick ? 'Add to recipe' : existing ? 'Save' : `Add to ${meal}`} onPress={save} disabled={!valid} />
          {r.barcode && kind !== 'recipe' && <Btn kind="plain" title={kind === 'custom' ? 'Add to Open Food Facts' : 'Suggest a correction on Open Food Facts'} onPress={openOff} />}
        </>
      )}
    </Screen>
  );
}

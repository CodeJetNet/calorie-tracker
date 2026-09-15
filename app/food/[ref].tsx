import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Button, ScrollView, Text, TextInput, View } from 'react-native';
import { CAN_CONTRIBUTE, contribute } from '../../src/contribute';
import { useDb } from '../../src/db/provider';
import { addDays, today } from '../../src/dates';
import { customFood } from '../../src/diary/customFoods';
import { entry as loadEntry, type Entry } from '../../src/diary/entries';
import { logEntry, relogEntry } from '../../src/diary/log';
import { DEFAULT_MEALS, getJson } from '../../src/diary/settings';
import { bySource } from '../../src/foods/db';
import { resolve, type Resolved } from '../../src/foods/resolve';
import { BY_ID, PANEL, scale, TOP } from '../../src/nutrients';
import { Chips } from '../../src/ui/Chips';
import { fmt } from '../../src/ui/NutrientBar';

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
  const [contrib, setContrib] = useState<'idle' | 'ask' | 'photo' | 'sending' | 'done'>('idle');
  const [contribMsg, setContribMsg] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);

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

  // Open Food Facts contribution: custom foods post directly; database foods open a prefilled custom copy to correct first.
  const suggest = async () => {
    const f = foods && (await bySource(foods, id, sourceId));
    if (!f) return;
    const prefill = JSON.stringify({ barcode: f.barcode, name: f.name, brand: f.brand, serving_size: f.serving_size, serving_unit: f.serving_unit, serving_desc: f.serving_desc, nutrients: f.per100 });
    router.push({ pathname: '/custom/[id]', params: { id: 'new', prefill, day: p.day, meal: p.meal } });
  };
  const addPhoto = async () => {
    if (camPerm?.granted || (await requestCamPerm()).granted) setContrib('photo');
  };
  const snap = async () => {
    const pic = await cam.current?.takePictureAsync({ quality: 0.5 });
    if (pic) setPhoto(pic.uri);
    setContrib('ask');
  };
  const send = async () => {
    setContrib('sending'); setContribMsg('');
    const f = await customFood(diary, id);
    const msg = f?.barcode ? await contribute(diary, { ...f, barcode: f.barcode }, photo ?? undefined).catch(e => (e as Error).message) : 'This food has no barcode.';
    if (msg) { setContribMsg(msg); setContrib('ask'); } else setContrib('done');
  };

  const line = (k: string) => <Text key={k}>{BY_ID[k]?.name ?? k}: {fmt(n[k] ?? 0)} {BY_ID[k]?.unit ?? ''}</Text>;

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
      <Stack.Screen options={{ title: r?.name ?? '', headerRight: () => (editPath ? <Button title="Edit" onPress={() => router.push({ pathname: editPath, params: { id, day: p.day, meal: p.meal, pick: p.pick } })} /> : null) }} />
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
          {CAN_CONTRIBUTE && r.barcode && kind === 'foods' && <Button title="Suggest a correction" onPress={suggest} />}
          {CAN_CONTRIBUTE && r.barcode && kind === 'custom' && contrib === 'idle' && <Button title="Contribute to Open Food Facts" onPress={() => setContrib('ask')} />}
          {CAN_CONTRIBUTE && r.barcode && kind === 'custom' && contrib === 'done' && <Text>Thanks. It will be in this app's database after the next weekly build.</Text>}
          {CAN_CONTRIBUTE && r.barcode && kind === 'custom' && contrib !== 'idle' && contrib !== 'done' && (
            <>
              <Text>This sends the name, brand, serving and nutrition values for this barcode to Open Food Facts, the public food database. Nothing else about you is sent.</Text>
              {contrib === 'photo' ? (
                <>
                  <CameraView ref={cam} style={{ height: 320 }} />
                  <Button title="Take photo" onPress={snap} />
                </>
              ) : photo ? <Text style={{ color: '#666' }}>Photo added.</Text> : <Button title="Add a photo of the nutrition label" onPress={addPhoto} />}
              <Button title={contrib === 'sending' ? 'Sending...' : 'Send'} onPress={send} disabled={contrib !== 'ask'} />
              {!!contribMsg && <Text style={{ color: '#c33' }}>{contribMsg}</Text>}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

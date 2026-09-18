import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, type TextInputProps } from 'react-native';
import { useDb } from '../../src/db/provider';
import { customFood, deleteCustomFood, upsertCustomFood, type CustomFood } from '../../src/diary/customFoods';
import { toPer100 } from '../../src/foods/per100';
import { normalize } from '../../src/gtin';
import { BY_ID, PANEL, TOP, type Nutrients } from '../../src/nutrients';
import { Chips } from '../../src/ui/Chips';
import { Btn, Field, row, Screen, Section, Txt } from '../../src/ui/kit';

export default function CustomFoodEditor() {
  const { diary } = useDb();
  const router = useRouter();
  const p = useLocalSearchParams<{ id: string; barcode?: string; prefill?: string; day?: string; meal?: string; pick?: string }>();   // prefill: JSON of a food to correct
  const isNew = p.id === 'new';
  const [id] = useState(() => (isNew ? Crypto.randomUUID() : p.id));
  const [f, setF] = useState({ name: '', brand: '', barcode: p.barcode ?? '', serving_size: '', serving_desc: '' });
  const [unit, setUnit] = useState<'g' | 'ml'>('g');
  const [perServing, setPerServing] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [more, setMore] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    (async () => {
      const parse = (s: string): Omit<CustomFood, 'id'> | null => { try { return JSON.parse(s); } catch { return null; } };
      const src = isNew ? (p.prefill ? parse(p.prefill) : null) : await customFood(diary, p.id);
      if (!src) return;
      setF({ name: src.name ?? '', brand: src.brand ?? '', barcode: src.barcode ?? p.barcode ?? '', serving_size: src.serving_size ? String(src.serving_size) : '', serving_desc: src.serving_desc ?? '' });
      setUnit(src.serving_unit ?? 'g');
      setVals(Object.fromEntries(Object.entries(src.nutrients ?? {}).map(([k, v]) => [k, String(v)])));
    })();
  }, []);

  const size = Number(f.serving_size.replace(',', '.'));
  const basis = perServing ? size : 100;
  const barcode = f.barcode.trim() ? normalize(f.barcode) : null;
  const badBarcode = !!f.barcode.trim() && !barcode;
  const canSave = !!f.name.trim() && basis > 0 && !badBarcode;

  const save = async () => {
    const raw: Nutrients = {};
    for (const [k, v] of Object.entries(vals)) { const n = Number(v.replace(',', '.')); if (v.trim() && Number.isFinite(n)) raw[k] = n; }
    await upsertCustomFood(diary, {
      id, name: f.name.trim(), brand: f.brand.trim() || null, barcode,
      serving_size: size > 0 ? size : null, serving_unit: size > 0 ? unit : null, serving_desc: f.serving_desc.trim() || null,
      nutrients: perServing ? toPer100(raw, basis) : raw,
    });
    router.replace({ pathname: '/food/[ref]', params: { ref: `custom:${id}`, day: p.day, meal: p.meal, pick: p.pick } });
  };
  const del = async () => {
    if (!confirm) return setConfirm(true);
    await deleteCustomFood(diary, id);
    router.dismissTo('/search');
  };

  const field = (key: keyof typeof f, label: string, props?: TextInputProps) => (
    <View style={{ gap: 4 }}>
      <Txt v="muted">{label}</Txt>
      <Field value={f[key]} onChangeText={v => setF({ ...f, [key]: v })} accessibilityLabel={label} {...props} />
    </View>
  );
  const nutrient = (nid: string) => {
    const n = BY_ID[nid];
    return (
      <View key={nid} style={row}>
        <Txt style={{ flex: 1 }}>{n.name} ({n.unit})</Txt>
        <Field value={vals[nid] ?? ''} onChangeText={v => setVals({ ...vals, [nid]: v })} keyboardType="decimal-pad" accessibilityLabel={`${n.name}, ${n.unit}`} style={{ width: 104, textAlign: 'right' }} />
      </View>
    );
  };

  return (
    <Screen title={isNew ? 'New custom food' : 'Edit custom food'}>
      <Section title="Food">
        {field('name', 'Name')}
        {field('brand', 'Brand')}
        {field('barcode', 'Barcode', { keyboardType: 'number-pad' })}
        {badBarcode && <Txt v="error">Not a valid barcode</Txt>}
      </Section>
      <Section title="Serving">
        {field('serving_size', 'Serving size', { keyboardType: 'decimal-pad' })}
        <Chips options={['g', 'ml']} value={unit} onChange={u => setUnit(u as 'g' | 'ml')} />
        {field('serving_desc', 'Serving description', { placeholder: '1 tbsp (15 g)' })}
      </Section>
      <Section title="Nutrition">
        <Txt v="muted">Values are per</Txt>
        <Chips options={['serving', `100 ${unit}`]} value={perServing ? 'serving' : `100 ${unit}`} onChange={v => setPerServing(v === 'serving')} />
        {perServing && !(size > 0) && <Txt v="error">Enter the serving size first</Txt>}
        {TOP.map(nutrient)}
        <Btn kind="plain" small title={more ? 'Show less' : 'All nutrients'} onPress={() => setMore(!more)} />
        {more && PANEL.filter(n => !TOP.includes(n.id)).map(n => nutrient(n.id))}
      </Section>
      <Btn kind="primary" title="Save" onPress={save} disabled={!canSave} />
      {!isNew && <Btn kind={confirm ? 'danger' : 'destructive'} title={confirm ? 'Tap again to delete' : 'Delete'} onPress={del} />}
    </Screen>
  );
}

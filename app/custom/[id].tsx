import * as Crypto from 'expo-crypto';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Button, ScrollView, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useDb } from '../../src/db/provider';
import { customFood, deleteCustomFood, upsertCustomFood, type CustomFood } from '../../src/diary/customFoods';
import { toPer100 } from '../../src/foods/per100';
import { normalize } from '../../src/gtin';
import { BY_ID, PANEL, TOP, type Nutrients } from '../../src/nutrients';
import { Chips } from '../../src/ui/Chips';

const row = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 } as const;
const input = { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, minWidth: 120, flex: 1 } as const;

export default function CustomFoodEditor() {
  const { diary } = useDb();
  const router = useRouter();
  const p = useLocalSearchParams<{ id: string; barcode?: string; day?: string; meal?: string; pick?: string }>();
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
      const src: CustomFood | null = isNew ? null : await customFood(diary, p.id);
      if (!src) return;
      setF({ name: src.name ?? '', brand: src.brand ?? '', barcode: src.barcode ?? p.barcode ?? '', serving_size: src.serving_size ? String(src.serving_size) : '', serving_desc: src.serving_desc ?? '' });
      setUnit(src.serving_unit ?? 'g');
      setVals(Object.fromEntries(Object.entries(src.nutrients).map(([k, v]) => [k, String(v)])));
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
    <View style={row}>
      <Text>{label}</Text>
      <TextInput value={f[key]} onChangeText={v => setF({ ...f, [key]: v })} style={input} {...props} />
    </View>
  );
  const nutrient = (nid: string) => {
    const n = BY_ID[nid];
    return (
      <View key={nid} style={row}>
        <Text>{n.name} ({n.unit})</Text>
        <TextInput value={vals[nid] ?? ''} onChangeText={v => setVals({ ...vals, [nid]: v })} keyboardType="decimal-pad" style={input} />
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'New custom food' : 'Edit custom food' }} />
      {field('name', 'Name')}
      {field('brand', 'Brand')}
      {field('barcode', 'Barcode', { keyboardType: 'number-pad' })}
      {badBarcode && <Text style={{ color: '#c33' }}>Not a valid barcode</Text>}
      {field('serving_size', 'Serving size', { keyboardType: 'decimal-pad' })}
      <Chips options={['g', 'ml']} value={unit} onChange={u => setUnit(u as 'g' | 'ml')} />
      {field('serving_desc', 'Serving description', { placeholder: '1 tbsp (15 g)' })}
      <Text>Values are per</Text>
      <Chips options={['serving', `100 ${unit}`]} value={perServing ? 'serving' : `100 ${unit}`} onChange={v => setPerServing(v === 'serving')} />
      {perServing && !(size > 0) && <Text style={{ color: '#c33' }}>Enter the serving size first</Text>}
      {TOP.map(nutrient)}
      <Button title={more ? 'Less' : 'More'} onPress={() => setMore(!more)} />
      {more && PANEL.filter(n => !TOP.includes(n.id)).map(n => nutrient(n.id))}
      <Button title="Save" onPress={save} disabled={!canSave} />
      {!isNew && <Button title={confirm ? 'Tap again to delete' : 'Delete'} color={confirm ? '#c33' : undefined} onPress={del} />}
    </ScrollView>
  );
}

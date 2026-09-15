import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Button, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useDb } from '../src/db/provider';
import { today } from '../src/dates';
import { getSetting, setSetting } from '../src/diary/settings';
import { allWeights, deleteWeight, setWeight, type Weight } from '../src/diary/weights';
import { Chips } from '../src/ui/Chips';

const LB = 0.45359237;
const row = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 } as const;

export default function WeightLog() {
  const { diary } = useDb();
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg');
  const [text, setText] = useState('');
  const [list, setList] = useState<Weight[]>([]);

  const load = useCallback(async () => {
    setUnit((await getSetting(diary, 'weight_unit')) === 'lb' ? 'lb' : 'kg');
    setList(await allWeights(diary));
  }, [diary]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const show = (kg: number) => `${(unit === 'lb' ? kg / LB : kg).toFixed(1)} ${unit}`;
  const save = async () => {
    const v = Number(text);
    await setWeight(diary, { day: today(), kg: unit === 'lb' ? v * LB : v });
    setText('');
    await load();
  };
  const changeUnit = async (u: string) => { await setSetting(diary, 'weight_unit', u); setUnit(u as 'kg' | 'lb'); };

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Weight' }} />
      <View style={row}>
        <TextInput value={text} onChangeText={setText} keyboardType="decimal-pad" placeholder={`Today, ${unit}`}
          style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, flex: 1 }} />
        <Chips options={['kg', 'lb']} value={unit} onChange={changeUnit} />
        <Button title="Save" onPress={save} disabled={!(Number(text) > 0)} />
      </View>
      {list.map(w => (
        <Pressable key={w.day} onLongPress={async () => { await deleteWeight(diary, w.day); await load(); }} style={{ ...row, paddingVertical: 8 }}>
          <Text>{w.day}</Text>
          <Text>{show(w.kg)}</Text>
        </Pressable>
      ))}
      {list.length > 0 && <Text style={{ color: '#666' }}>Long-press an entry to delete it.</Text>}
    </ScrollView>
  );
}

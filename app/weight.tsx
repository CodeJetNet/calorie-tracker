import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useDb } from '../src/db/provider';
import { today } from '../src/dates';
import { getSetting, setSetting } from '../src/diary/settings';
import { allWeights, deleteWeight, setWeight, type Weight } from '../src/diary/weights';
import { Chips } from '../src/ui/Chips';
import { Btn, Card, Field, row, Screen, Section, Txt } from '../src/ui/kit';
import { color } from '../src/ui/theme';

const LB = 0.45359237;

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
    <Screen title="Weight">
      <Card>
        <View style={row}>
          <Field value={text} onChangeText={setText} keyboardType="decimal-pad" placeholder={`Today, ${unit}`} accessibilityLabel={`Today's weight in ${unit}`} style={{ flex: 1 }} />
          <Chips options={['kg', 'lb']} value={unit} onChange={changeUnit} />
        </View>
        <Btn kind="primary" title="Save" onPress={save} disabled={!(Number(text) > 0)} />
      </Card>
      {list.length > 0 && (
        <Section title="History">
          <View>
            {list.map((w, i) => (
              <Pressable key={w.day} onLongPress={async () => { await deleteWeight(diary, w.day); await load(); }}
                style={{ ...row, minHeight: 48, borderTopWidth: i ? 1 : 0, borderTopColor: color.track }}>
                <Txt>{w.day}</Txt>
                <Txt style={{ fontVariant: ['tabular-nums'], fontWeight: '600' }}>{show(w.kg)}</Txt>
              </Pressable>
            ))}
          </View>
          <Txt v="muted">Long-press an entry to delete it.</Txt>
        </Section>
      )}
    </Screen>
  );
}

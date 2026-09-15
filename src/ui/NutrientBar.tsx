import { Text, View } from 'react-native';
import { BY_ID } from '../nutrients';

/** One decimal under 100, whole numbers above: "6.3 g", "539 kcal". */
export const fmt = (v: number) => String(Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10);

export function NutrientBar({ id, value, goal }: { id: string; value: number; goal?: number }) {
  const n = BY_ID[id];
  const frac = goal ? Math.min(value / goal, 1) : 0;
  return (
    <View style={{ marginVertical: 4 }}>
      <Text>{n.name}: {fmt(value)}{goal ? ` / ${fmt(goal)}` : ''} {n.unit}</Text>
      <View style={{ height: 6, backgroundColor: '#ddd', borderRadius: 3 }}>
        <View style={{ height: 6, width: `${frac * 100}%`, backgroundColor: frac >= 1 ? '#c33' : '#3a3', borderRadius: 3 }} />
      </View>
    </View>
  );
}

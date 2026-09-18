import { View } from 'react-native';
import { BY_ID } from '../nutrients';
import { row, Txt } from './kit';
import { color } from './theme';

/** One decimal under 100, whole numbers above: "6.3 g", "539 kcal". */
export const fmt = (v: number) => String(Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10);

/** Green while working toward the goal, orange once it is reached. */
export function NutrientBar({ id, value, goal }: { id: string; value: number; goal?: number }) {
  const n = BY_ID[id];
  const frac = goal ? Math.min(value / goal, 1) : 0;
  return (
    <View style={{ gap: 4 }}>
      <View style={row}>
        <Txt v="muted" style={{ color: color.text }}>{n.name}</Txt>
        <Txt v="muted" style={{ fontVariant: ['tabular-nums'] }}>{fmt(value)}{goal ? ` / ${fmt(goal)}` : ''} {n.unit}</Txt>
      </View>
      <View style={{ height: 8, backgroundColor: color.track, borderRadius: 4 }}>
        <View style={{ height: 8, width: `${frac * 100}%`, backgroundColor: frac >= 1 ? color.orange : color.green, borderRadius: 4 }} />
      </View>
    </View>
  );
}

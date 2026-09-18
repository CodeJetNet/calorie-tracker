import { Pressable, Text, View } from 'react-native';
import { color, radius } from './theme';

/** A row of tappable labels with one selected. */
export function Chips({ options, value, onChange }: { options: string[]; value: string; onChange(v: string): void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup">
      {options.map(o => (
        <Pressable key={o} onPress={() => onChange(o)} hitSlop={4} accessibilityRole="radio" accessibilityState={{ selected: o === value }}
          style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1,
            backgroundColor: o === value ? color.green : color.field, borderColor: o === value ? color.green : color.track }}>
          <Text style={{ color: color.text, fontSize: 14, fontWeight: o === value ? '700' : '500' }}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

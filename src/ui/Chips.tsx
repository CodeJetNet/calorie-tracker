import { Pressable, Text, View } from 'react-native';

/** A row of tappable labels with one selected. */
export function Chips({ options, value, onChange }: { options: string[]; value: string; onChange(v: string): void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map(o => (
        <Pressable key={o} onPress={() => onChange(o)}
          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: o === value ? '#2a6' : '#e5e5e5' }}>
          <Text style={{ color: o === value ? '#fff' : '#000' }}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

import { Tabs } from 'expo-router/js-tabs';
import { Text } from 'react-native';

// Today's Add and Scan buttons put day/meal on these tabs; tab params persist, so a plain tab tap must not log to a past day.
const clearMealParams = ({ navigation }: { navigation: { setParams(p: object): void } }) =>
  ({ tabPress: () => navigation.setParams({ day: undefined, meal: undefined }) });
// Without an icon react-navigation draws a glyph Android's fonts do not have; emoji render everywhere.
const icon = (glyph: string) => ({ size }: { size: number }) => <Text style={{ fontSize: size }}>{glyph}</Text>;
export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('📅') }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: icon('🔍') }} listeners={clearMealParams} />
      <Tabs.Screen name="scan" options={{ title: 'Scan', tabBarIcon: icon('📷') }} listeners={clearMealParams} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('⚙️') }} />
    </Tabs>
  );
}

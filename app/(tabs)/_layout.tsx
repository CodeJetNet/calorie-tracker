import { Tabs } from 'expo-router/js-tabs';

// Today's Add and Scan buttons put day/meal on these tabs; tab params persist, so a plain tab tap must not log to a past day.
const clearMealParams = ({ navigation }: { navigation: { setParams(p: object): void } }) =>
  ({ tabPress: () => navigation.setParams({ day: undefined, meal: undefined }) });
export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} listeners={clearMealParams} />
      <Tabs.Screen name="scan" options={{ title: 'Scan' }} listeners={clearMealParams} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

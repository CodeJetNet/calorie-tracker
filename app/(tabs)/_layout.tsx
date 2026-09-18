import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass, Icon, type IconName } from '../../src/ui/kit';
import { color } from '../../src/ui/theme';

// Today's Add and Scan buttons put day/meal on these tabs; tab params persist, so a plain tab tap must not log to a past day.
const clearMealParams = ({ navigation }: { navigation: { setParams(p: object): void } }) =>
  ({ tabPress: () => navigation.setParams({ day: undefined, meal: undefined }) });
const ICON: Record<string, IconName> = { index: 'today', search: 'search', scan: 'scan', settings: 'settings' };

/** A floating glass pill; screens scroll underneath it and pad their content by TAB_BAR. */
function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <Glass style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 12, height: 64, borderRadius: 32, flexDirection: 'row', padding: 6 }}>
      {state.routes.map((route, i) => {
        const focused = state.index === i, title = descriptors[route.key].options.title ?? route.name;
        const ink = focused ? color.greenDeep : color.textMuted;
        const onPress = () => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        return (
          <Pressable key={route.key} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={title}
            style={{ flex: 1, borderRadius: 26, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: focused ? color.greenTint : 'transparent' }}>
            <Icon name={ICON[route.name]} tint={ink} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: ink }}>{title}</Text>
          </Pressable>
        );
      })}
    </Glass>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={p => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} listeners={clearMealParams} />
      <Tabs.Screen name="scan" options={{ title: 'Scan' }} listeners={clearMealParams} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

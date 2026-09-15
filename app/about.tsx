import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, Text } from 'react-native';
import { useDb } from '../src/db/provider';
import { getSetting } from '../src/diary/settings';

const REPO = 'https://github.com/codejetnet/calorie-tracker';
const link = (title: string, url: string) => <Text style={{ color: '#06c' }} onPress={() => Linking.openURL(url).catch(() => {})}>{title}</Text>;

export default function About() {
  const { diary } = useDb();
  const [builtAt, setBuiltAt] = useState<string | null>(null);
  useEffect(() => { getSetting(diary, 'foods_built_at').then(setBuiltAt); }, [diary]);
  const c = Constants.expoConfig;

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
      <Stack.Screen options={{ title: 'About' }} />
      <Text style={{ fontSize: 20 }}>{c?.name ?? 'Calorie Tracker'} {c?.version}</Text>
      <Text>No accounts, no analytics, no servers. Your diary stays on this device and in the backup folder you choose.</Text>
      <Text>
        Food data from {link('Open Food Facts', 'https://world.openfoodfacts.org')}, licensed {link('ODbL', 'https://opendatacommons.org/licenses/odbl/1-0/')},
        and {link('USDA FoodData Central', 'https://fdc.nal.usda.gov')}, public domain.
      </Text>
      <Text>{builtAt ? `Installed database built ${builtAt}` : 'Starter database: generic foods only'}</Text>
      {link('App source on GitHub', REPO)}
      {link('Food database pipeline on GitHub', 'https://github.com/codejetnet/food-data')}
      {link('Privacy policy', 'https://codejetnet.github.io/calorie-tracker/privacy')}
      <Text>{link('MIT License', `${REPO}/blob/main/LICENSE`)}. Copyright (c) 2026 Josh Houghtelin.</Text>
    </ScrollView>
  );
}

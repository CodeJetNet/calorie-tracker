import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useDb } from '../src/db/provider';
import { getSetting } from '../src/diary/settings';
import { Card, Logo, Screen, Txt } from '../src/ui/kit';

const REPO = 'https://github.com/codejetnet/calorie-tracker';
const link = (title: string, url: string) => <Txt v="link" accessibilityRole="link" onPress={() => Linking.openURL(url).catch(() => {})}>{title}</Txt>;

export default function About() {
  const { diary } = useDb();
  const [builtAt, setBuiltAt] = useState<string | null>(null);
  useEffect(() => { getSetting(diary, 'foods_built_at').then(setBuiltAt); }, [diary]);
  const c = Constants.expoConfig;

  return (
    <Screen title="About">
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 12 }}>
        <Logo size={112} />
        <Txt v="title">{c?.name ?? 'Calorie Tracker'}</Txt>
        <Txt v="muted">Version {c?.version}</Txt>
      </View>
      <Card>
        <Txt>No accounts, no analytics, no servers. Your diary stays on this device and in the backup folder you choose.</Txt>
        <Txt>
          Food data from {link('Open Food Facts', 'https://world.openfoodfacts.org')}, licensed {link('ODbL', 'https://opendatacommons.org/licenses/odbl/1-0/')},
          and {link('USDA FoodData Central', 'https://fdc.nal.usda.gov')}, public domain.
        </Txt>
        <Txt v="muted">{builtAt ? `Installed database built ${builtAt}` : 'Starter database: generic foods only'}</Txt>
      </Card>
      <Card style={{ gap: 14 }}>
        {link('App source on GitHub', REPO)}
        {link('Food database pipeline on GitHub', 'https://github.com/codejetnet/food-data')}
        {link('Privacy policy', 'https://codejetnet.github.io/calorie-tracker/privacy')}
        <Txt>{link('MIT License', `${REPO}/blob/main/LICENSE`)}. Copyright (c) 2026 Josh Houghtelin.</Txt>
      </Card>
    </Screen>
  );
}

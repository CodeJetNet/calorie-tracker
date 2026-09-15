import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Button, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useDb } from '../../src/db/provider';
import { DEFAULT_MEALS, getJson, getSetting, goals, setSetting } from '../../src/diary/settings';
import { fetchManifest } from '../../src/foods/update';
import { useFoodsUpdate } from '../../src/foods/useFoodsUpdate';
import { BY_ID, DEFAULT_TARGETS, MAIN, PANEL, type Nutrients } from '../../src/nutrients';
import { Chips } from '../../src/ui/Chips';

const COUNTRIES = ['US', 'CA', 'GB', 'AU', 'FR', 'DE'];   // when the manifest cannot be fetched
const h = { fontWeight: 'bold', fontSize: 16, marginTop: 12 } as const;
const row = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 } as const;
const input = { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, minWidth: 90, textAlign: 'right' } as const;

export default function Settings() {
  const { diary } = useDb();
  const up = useFoodsUpdate();
  const [goal, setGoal] = useState<Record<string, string>>({});
  const [more, setMore] = useState(false);
  const [mealsText, setMealsText] = useState('');
  const [country, setCountry] = useState('US');
  const [countries, setCountries] = useState(COUNTRIES);
  const [installed, setInstalled] = useState<{ md5: string | null; builtAt: string | null }>({ md5: null, builtAt: null });
  const [off, setOff] = useState(false);

  const loadInstalled = useCallback(async () => {
    setInstalled({ md5: await getSetting(diary, 'foods_md5'), builtAt: await getSetting(diary, 'foods_built_at') });
  }, [diary]);
  useEffect(() => {   // country picker from the manifest; the fallback list stays when offline
    fetchManifest().then(m => setCountries([...new Set(m.files.map(f => f.country).filter(c => c !== 'starter'))])).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => {
    (async () => {
      setGoal(Object.fromEntries(Object.entries(await goals(diary)).map(([k, v]) => [k, String(v)])));
      setMealsText((await getJson<string[]>(diary, 'meals', DEFAULT_MEALS)).join(', '));
      setCountry((await getSetting(diary, 'foods_country')) ?? 'US');
      setOff((await getSetting(diary, 'off_lookup')) === '1');
      await loadInstalled();
    })();
  }, [diary, loadInstalled]));

  const saveGoals = async () => {   // only overrides are stored, so a later change to the defaults still reaches everyone
    const over: Nutrients = {};
    for (const [k, v] of Object.entries(goal)) { const n = Number(v.replace(',', '.')); if (v.trim() && Number.isFinite(n) && n !== DEFAULT_TARGETS[k]) over[k] = n; }
    await setSetting(diary, 'goals', JSON.stringify(over));
  };
  const saveMeals = async () => {
    const list = [...new Set(mealsText.split(',').map(s => s.trim()).filter(Boolean))];
    const meals = list.length ? list : DEFAULT_MEALS;
    setMealsText(meals.join(', '));
    await setSetting(diary, 'meals', JSON.stringify(meals));
  };
  const pickCountry = async (c: string) => { setCountry(c); await setSetting(diary, 'foods_country', c, false); };
  const download = async () => { await up.download(); await loadInstalled(); };

  const goalInput = (id: string) => {
    const n = BY_ID[id];
    return (
      <View key={id} style={row}>
        <Text>{n.name} ({n.unit})</Text>
        <TextInput value={goal[id] ?? ''} onChangeText={v => setGoal({ ...goal, [id]: v })} onBlur={saveGoals} keyboardType="decimal-pad"
          placeholder={DEFAULT_TARGETS[id] != null ? String(DEFAULT_TARGETS[id]) : '-'} style={input} />
      </View>
    );
  };
  const busy = up.status === 'checking' || up.status === 'downloading';

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }} keyboardShouldPersistTaps="handled">
      <Text style={h}>Goals</Text>
      {MAIN.map(goalInput)}
      <Button title={more ? 'Less' : 'More'} onPress={() => setMore(!more)} />
      {more && PANEL.filter(n => !MAIN.includes(n.id)).map(n => goalInput(n.id))}

      <Text style={h}>Meals</Text>
      <TextInput value={mealsText} onChangeText={setMealsText} onBlur={saveMeals} placeholder={DEFAULT_MEALS.join(', ')} style={{ ...input, textAlign: 'left' }} />

      <Text style={h}>Food database</Text>
      <Chips options={countries} value={country} onChange={pickCountry} />
      <Text>{installed.md5 ? `Installed database built ${installed.builtAt}` : 'Starter database: generic foods only'}</Text>
      <Button title="Check for update" onPress={() => up.check(country)} disabled={busy} />
      {up.status === 'checking' && <Text>Checking...</Text>}
      {up.status === 'current' && <Text>Up to date.</Text>}
      {up.file && up.file.country === country && (
        <>
          <Text>Full database available, {Math.round(up.file.bytes / 1e6)} MB</Text>
          {up.status === 'paused' && <Text>Paused. Tap Download to continue.</Text>}
          <Button title="Download" onPress={download} disabled={busy} />
          {up.status === 'downloading' && (
            <View style={{ height: 6, backgroundColor: '#ddd', borderRadius: 3 }}>
              <View style={{ height: 6, width: `${Math.min(up.progress, 1) * 100}%`, backgroundColor: '#3a3', borderRadius: 3 }} />
            </View>
          )}
          <Text style={{ color: '#666' }}>Keep the app open. If interrupted, the download resumes where it left off.</Text>
        </>
      )}
      {!!up.error && <Text style={{ color: '#c33' }}>{up.error}</Text>}

      <Text style={h}>Privacy</Text>
      <View style={row}>
        <Text style={{ flex: 1 }}>Look up missing barcodes on Open Food Facts automatically</Text>
        <Switch value={off} onValueChange={async v => { setOff(v); await setSetting(diary, 'off_lookup', v ? '1' : '0'); }} />
      </View>
      <Text style={{ color: '#666' }}>Sends only the barcode. When off, the Scan screen asks each time.</Text>
    </ScrollView>
  );
}

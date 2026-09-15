import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Linking, Text, View } from 'react-native';
import { useDb } from '../../src/db/provider';
import { customFoodByBarcode, upsertCustomFood } from '../../src/diary/customFoods';
import { getSetting } from '../../src/diary/settings';
import { byBarcode, foodRef } from '../../src/foods/db';
import { lookupOff } from '../../src/foods/offLookup';
import { normalize } from '../../src/gtin';

type Miss = { gtin: string; off: 'ask' | 'looking' | 'miss' };

export default function Scan() {
  const { diary, foods } = useDb();
  const router = useRouter();
  const { day, meal } = useLocalSearchParams<{ day?: string; meal?: string }>();
  const [perm, requestPerm] = useCameraPermissions();
  const [active, setActive] = useState(false);   // camera only while this tab is focused
  const [note, setNote] = useState('');
  const [miss, setMiss] = useState<Miss | null>(null);
  const [starter, setStarter] = useState(false);
  const last = useRef({ raw: '', at: 0 });

  useEffect(() => { requestPerm(); }, []);
  useFocusEffect(useCallback(() => {
    setActive(true);
    setMiss(null);
    getSetting(diary, 'foods_md5').then(v => setStarter(!v));
    return () => setActive(false);
  }, [diary]));

  const open = (ref: string) => { setMiss(null); router.push({ pathname: '/food/[ref]', params: { ref, day, meal } }); };

  const lookup = async (gtin: string) => {
    setMiss({ gtin, off: 'looking' });
    const f = await lookupOff(gtin).catch(() => null);
    if (!f) return setMiss({ gtin, off: 'miss' });
    const id = Crypto.randomUUID();
    await upsertCustomFood(diary, { id, ...f });   // cached in SQLite, so next time it is a local hit
    open(`custom:${id}`);
  };

  const onScan = async ({ data, type }: BarcodeScanningResult) => {
    const now = Date.now();
    if (data === last.current.raw && now - last.current.at < 2000) return;
    last.current = { raw: data, at: now };
    const gtin = normalize(data, type);
    if (!gtin) { setNote('Not a product barcode'); setTimeout(() => setNote(''), 2000); return; }
    const c = await customFoodByBarcode(diary, gtin);
    if (c) return open(`custom:${c.id}`);
    const f = foods && (await byBarcode(foods, gtin));
    if (f) return open(foodRef(f));
    if ((await getSetting(diary, 'off_lookup')) === '1') lookup(gtin);
    else setMiss({ gtin, off: 'ask' });
  };

  if (!perm?.granted) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 12 }}>
        <Text>Camera access is needed to scan barcodes.</Text>
        <Button title="Open settings" onPress={() => Linking.openSettings()} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      {active && <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }} onBarcodeScanned={miss ? undefined : onScan} />}
      {!!note && <Text style={{ position: 'absolute', top: 24, alignSelf: 'center', padding: 8, backgroundColor: '#333', color: '#fff', borderRadius: 8 }}>{note}</Text>}
      {miss && (
        <View style={{ padding: 12, gap: 8 }}>
          {miss.off === 'looking' ? <Text>Looking up on Open Food Facts…</Text> : (
            <>
              <Text style={{ fontWeight: 'bold' }}>{miss.off === 'miss' ? 'Not in Open Food Facts either' : 'Not on this phone'}</Text>
              {miss.off === 'ask' && <Button title="Look up on Open Food Facts (sends only the barcode)" onPress={() => lookup(miss.gtin)} />}
              <Button title="Create custom food" onPress={() => { setMiss(null); router.push({ pathname: '/custom/[id]', params: { id: 'new', barcode: miss.gtin, day, meal } }); }} />
              {starter && <Text style={{ color: '#666' }}>It may be in the full database. Download it in Settings.</Text>}
              <Button title="Cancel" onPress={() => setMiss(null)} />
            </>
          )}
        </View>
      )}
    </View>
  );
}

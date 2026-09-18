import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useDb } from '../../src/db/provider';
import { customFoodByBarcode, upsertCustomFood } from '../../src/diary/customFoods';
import { getSetting } from '../../src/diary/settings';
import { byBarcode, foodRef } from '../../src/foods/db';
import { lookupOff } from '../../src/foods/offLookup';
import { normalize } from '../../src/gtin';
import { Btn, Card, Glass, Icon, Screen, TAB_BAR, Txt, useInsets } from '../../src/ui/kit';
import { backdrop, color, radius } from '../../src/ui/theme';

type Miss = { gtin: string; off: 'ask' | 'looking' | 'miss' };

export default function Scan() {
  const { diary, foods } = useDb();
  const router = useRouter();
  const insets = useInsets();
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

  if (!perm) return <View style={[{ flex: 1 }, backdrop]} />;   // permission state still loading
  if (!perm.granted) {
    return (
      <Screen tab title="Scan">
        <Card style={{ alignItems: 'center', gap: 14, paddingVertical: 28 }}>
          <Icon name="scan" size={44} tint={color.greenDeep} />
          <Txt style={{ textAlign: 'center' }}>Camera access is needed to scan barcodes. Nothing leaves your phone.</Txt>
          {perm.canAskAgain
            ? <Btn kind="primary" title="Allow camera" onPress={() => requestPerm()} />
            : <Btn kind="primary" title="Open settings" onPress={() => Linking.openSettings()} />}
        </Card>
      </Screen>
    );
  }
  const pill = { alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill } as const;
  return (
    <View style={{ flex: 1, backgroundColor: color.charcoal }}>
      {active && <CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }} onBarcodeScanned={miss ? undefined : onScan} />}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <View style={{ width: '72%', aspectRatio: 1.5, borderRadius: radius.card, borderWidth: 3, borderColor: color.edge }} />
      </View>
      <Glass style={{ ...pill, position: 'absolute', top: insets.top + 12 }}>
        <Txt style={{ fontWeight: '600' }}>{note || (meal ? `Scan a barcode for ${meal}` : 'Scan a barcode')}</Txt>
      </Glass>
      {miss && (
        <Glass style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + TAB_BAR + 12, padding: 16, gap: 10 }}>
          {miss.off === 'looking' ? <Txt>Looking up on Open Food Facts…</Txt> : (
            <>
              <Txt v="headline">{miss.off === 'miss' ? 'Not in Open Food Facts either' : 'Not on this phone'}</Txt>
              {miss.off === 'miss' && starter && <Txt v="muted">It may be in the full database. Download it in Settings.</Txt>}
              {miss.off === 'ask' && <Btn kind="primary" title="Look up on Open Food Facts" onPress={() => lookup(miss.gtin)} />}
              {miss.off === 'ask' && <Txt v="muted" style={{ textAlign: 'center' }}>Sends only the barcode.</Txt>}
              <Btn kind={miss.off === 'ask' ? 'tinted' : 'primary'} title="Create custom food" onPress={() => { setMiss(null); router.push({ pathname: '/custom/[id]', params: { id: 'new', barcode: miss.gtin, day, meal } }); }} />
              <Btn kind="plain" title="Cancel" onPress={() => setMiss(null)} />
            </>
          )}
        </Glass>
      )}
    </View>
  );
}

import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { readLabel } from '../src/label/read';
import { Btn, Glass, Txt, useInsets } from '../src/ui/kit';
import { color, radius } from '../src/ui/theme';

export default function LabelCamera() {
  const router = useRouter();
  const insets = useInsets();
  const p = useLocalSearchParams<{ barcode?: string; day?: string; meal?: string }>();
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [state, setState] = useState<'aim' | 'reading' | 'none'>('aim');
  useEffect(() => { if (perm && !perm.granted && perm.canAskAgain) requestPerm(); }, [perm?.granted]);

  const manual = () => router.replace({ pathname: '/custom/[id]', params: { id: 'new', barcode: p.barcode, day: p.day, meal: p.meal } });
  const snap = async () => {
    const pic = await cam.current?.takePictureAsync({ quality: 0.8 }).catch(() => null);
    if (!pic) return;
    setState('reading');
    const food = await readLabel(pic.uri).catch(() => null);
    if (!food) return setState('none');
    router.replace({ pathname: '/custom/[id]', params: {
      id: 'new', barcode: p.barcode, day: p.day, meal: p.meal, basis: 'serving', photo: pic.uri,
      prefill: JSON.stringify({ name: '', brand: null, barcode: p.barcode ?? null, ...food }),
    } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.charcoal }}>
      {perm?.granted && <CameraView ref={cam} style={StyleSheet.absoluteFill} />}
      <Glass style={{ position: 'absolute', top: insets.top + 12, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill }}>
        <Txt style={{ fontWeight: '600' }}>{state === 'reading' ? 'Reading the label…' : 'Fit the whole Nutrition Facts panel in view'}</Txt>
      </Glass>
      <Glass style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 12, padding: 16, gap: 10 }}>
        {state === 'none' && <Txt v="headline">Couldn't read a label in that photo. Try again closer, without glare.</Txt>}
        {perm && !perm.granted && <Txt>Camera access is needed to read the label. You can still enter it by hand.</Txt>}
        <Btn kind="primary" title="Take photo" onPress={snap} disabled={state === 'reading' || !perm?.granted} />
        <Btn kind="plain" title="Enter it by hand" onPress={manual} />
      </Glass>
    </View>
  );
}

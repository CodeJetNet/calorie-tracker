// The shared building blocks. Rules and rationale: docs/design/design-system.md.
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Image, Pressable, ScrollView, StatusBar, Text, TextInput, View, type TextInputProps, type TextProps, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { backdrop, color, radius, shadow, type } from './theme';

export const row = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 } as const;
/** Room a tab screen leaves at the bottom for the floating tab bar. */
export const TAB_BAR = 88;

/** Safe-area insets. On a Pixel 7 (Android 17) the first launch after install reported top 0 until the next redraw, putting the
 *  title under the clock, so Android never goes below the status bar height it knows at startup. */
export function useInsets() {
  const i = useSafeAreaInsets();
  return { ...i, top: Math.max(i.top, StatusBar.currentHeight ?? 0) };
}

export function Txt({ v = 'body', style, ...p }: TextProps & { v?: keyof typeof type }) {
  return <Text style={[type[v], style]} {...p} />;
}

// SF Symbols on iOS, Material Symbols on Android; add a pair here rather than naming symbols in screens.
const ICONS = {
  today: { ios: 'calendar', android: 'calendar_today' },
  search: { ios: 'magnifyingglass', android: 'search' },
  scan: { ios: 'barcode.viewfinder', android: 'barcode_scanner' },
  settings: { ios: 'gearshape', android: 'settings' },
  back: { ios: 'chevron.left', android: 'arrow_back_ios_new' },
  prev: { ios: 'chevron.left', android: 'chevron_left' },
  next: { ios: 'chevron.right', android: 'chevron_right' },
  weight: { ios: 'scalemass', android: 'monitor_weight' },
  add: { ios: 'plus', android: 'add' },
  edit: { ios: 'pencil', android: 'edit' },
  warn: { ios: 'exclamationmark.triangle', android: 'warning' },
  download: { ios: 'arrow.down.circle', android: 'download' },
} as const;
export type IconName = keyof typeof ICONS;
/** Decorative: the control around it carries the label, so screen readers skip the glyph. */
export function Icon({ name, size = 22, tint = color.text }: { name: IconName; size?: number; tint?: string }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SymbolView name={ICONS[name]} size={size} tintColor={tint} />
    </View>
  );
}

const LIQUID = isLiquidGlassAvailable();
/** Floating chrome: system Liquid Glass on iOS 26+, a bright translucent sheet elsewhere. Content goes on Card, never on this. */
export function Glass({ style, ...p }: ViewProps) {
  return LIQUID
    ? <GlassView glassEffectStyle="regular" style={[{ borderRadius: radius.card }, style]} {...p} />
    : <View style={[{ borderRadius: radius.card, backgroundColor: color.chrome, borderWidth: 1, borderColor: color.edge, boxShadow: shadow.chrome }, style]} {...p} />;
}

/** A frosted content surface. */
export function Card({ style, ...p }: ViewProps) {
  return <View style={[{ padding: 16, gap: 10, borderRadius: radius.card, backgroundColor: color.frost, borderWidth: 1, borderColor: color.edge, boxShadow: shadow.card }, style]} {...p} />;
}

type BtnProps = { title: string; onPress(): void; disabled?: boolean; kind?: 'primary' | 'tinted' | 'plain' | 'destructive' | 'danger'; small?: boolean; icon?: IconName };
const FILL = { primary: color.green, tinted: color.greenTint, plain: 'transparent', destructive: color.dangerTint, danger: color.danger } as const;
const INK = { primary: color.text, tinted: color.greenDeep, plain: color.greenDeep, destructive: color.danger, danger: color.white } as const;
/** One primary per screen; everything else is tinted or plain. Deleting is `destructive`, and `danger` once armed by the first tap. */
export function Btn({ title, onPress, disabled, kind = 'tinted', small, icon }: BtnProps) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={small ? 6 : 0} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        ...row, justifyContent: 'center', gap: 6, minHeight: small ? 36 : 48, paddingHorizontal: small ? 14 : 20,
        borderRadius: radius.pill, backgroundColor: FILL[kind], opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}>
      {icon && <Icon name={icon} size={18} tint={INK[kind]} />}
      <Text style={{ color: INK[kind], fontSize: small ? 14 : 16, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

export function IconBtn({ icon, label, onPress }: { icon: IconName; label: string; onPress(): void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <Glass style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={20} /></Glass>
    </Pressable>
  );
}

export function Field({ style, ...p }: TextInputProps) {
  return (
    <TextInput placeholderTextColor={color.textMuted} {...p}
      style={[{ minHeight: 44, paddingHorizontal: 14, borderRadius: radius.control, backgroundColor: color.field, borderWidth: 1, borderColor: color.track, color: color.text, fontSize: 16 }, style]} />
  );
}

/** A captioned group of related rows: the iOS grouped list. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Txt v="caption" style={{ marginLeft: 16 }} accessibilityRole="header">{title}</Txt>
      <Card>{children}</Card>
    </View>
  );
}

/** A label with its value at the right edge: nutrition lines, settings rows. */
export function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ ...row, paddingVertical: 4 }}>
      <Txt style={{ flex: 1 }}>{label}</Txt>
      <Txt style={{ fontVariant: ['tabular-nums'] }}>{value}</Txt>
    </View>
  );
}

/** Orange asks for attention, red reports a failure. The colour lives in the badge so the text stays on a clean surface. */
export function Banner({ text, kind = 'warn', onPress }: { text: string; kind?: 'warn' | 'error'; onPress(): void }) {
  const warn = kind === 'warn';
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={text}>
      <Card style={{ ...row, padding: 12, gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: warn ? color.orange : color.danger }}>
          <Icon name={warn ? 'download' : 'warn'} size={20} tint={warn ? color.text : color.white} />
        </View>
        <Txt style={{ flex: 1, fontWeight: '600' }}>{text}</Txt>
        <Icon name="next" size={20} tint={color.textMuted} />
      </Card>
    </Pressable>
  );
}

export function Logo({ size = 96 }: { size?: number }) {
  return <Image source={require('../../assets/logo.png')} style={{ width: size, height: size }} accessibilityLabel="Calorie Tracker" />;
}

/** The brand mark's progress ring. Two half-discs, each clipping a rotated two-sided border, sweep 0 to 360 degrees. */
export function Ring({ size, width, frac, children }: { size: number; width: number; frac: number; children?: ReactNode }) {
  const deg = Math.max(0, Math.min(frac, 1)) * 360;
  const ink = frac >= 1 ? color.orange : color.green;
  const half = (side: 'left' | 'right', turn: number) => (
    <View style={{ position: 'absolute', [side]: 0, width: size / 2, height: size, overflow: 'hidden' }}>
      <View style={{
        position: 'absolute', [side]: 0, width: size, height: size, borderRadius: size / 2, borderWidth: width,
        borderColor: 'transparent', borderTopColor: ink, borderRightColor: ink, transform: [{ rotate: `${turn}deg` }],
      }} />
    </View>
  );
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: width, borderColor: color.track }} />
      {deg > 0 && half('right', -135 + Math.min(deg, 180))}
      {deg > 180 && half('left', 45 + deg - 180)}
      {children}
    </View>
  );
}

type ScreenProps = { title: string; right?: ReactNode; tab?: boolean; scroll?: boolean; overlay?: ReactNode; children: ReactNode };
/** Every screen: the backdrop, the safe areas and the header. Stack screens get a back button, tab screens a large title. */
export function Screen({ title, right, tab, scroll = true, overlay, children }: ScreenProps) {
  const router = useRouter();
  const insets = useInsets();
  const bottom = insets.bottom + (tab ? TAB_BAR : 0);
  const pad = { paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: bottom + 24, gap: 14 };
  const header = (
    <View style={{ ...row, minHeight: 44 }}>
      {!tab && router.canGoBack() && <IconBtn icon="back" label="Back" onPress={() => router.back()} />}
      <Txt v={tab ? 'largeTitle' : 'title'} style={{ flex: 1 }} numberOfLines={2} accessibilityRole="header">{title}</Txt>
      {right}
    </View>
  );
  return (
    <View style={[{ flex: 1 }, backdrop]}>
      {scroll
        ? <ScrollView contentContainerStyle={pad} keyboardShouldPersistTaps="handled">{header}{children}</ScrollView>
        : <View style={[{ flex: 1 }, pad]}>{header}{children}</View>}
      {overlay && <View style={{ position: 'absolute', left: 16, right: 16, bottom: bottom + 12 }}>{overlay}</View>}
    </View>
  );
}

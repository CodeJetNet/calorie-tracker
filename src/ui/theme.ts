// Design tokens. The rules behind them live in docs/design/design-system.md; change that document first.

/** The five brand colours, exactly as labelled on docs/design/brand/brand-sheet.png. */
export const brand = { green: '#33C36B', teal: '#18B7A5', orange: '#FF9F43', charcoal: '#24323D', mist: '#F3F7F6' } as const;

export const color = {
  ...brand,
  white: '#FFFFFF',
  text: brand.charcoal,
  textMuted: '#52606B',     // charcoal lightened; 6:1 on mist so it survives the tinted backdrop
  greenDeep: '#15713C',     // the brand hues fail contrast as text on a light surface; these darker cuts pass
  tealDeep: '#0E7C70',
  danger: '#B42D33',        // destructive actions and errors only; "over goal" is orange
  frost: 'rgba(255,255,255,0.62)',        // content cards
  chrome: 'rgba(255,255,255,0.94)',       // floating controls where system Liquid Glass is unavailable
  edge: 'rgba(255,255,255,0.9)',          // the lit rim on every glass surface
  track: 'rgba(36,50,61,0.10)',           // progress tracks, hairlines, field borders
  field: 'rgba(255,255,255,0.7)',
  switchOff: 'rgba(36,50,61,0.28)',       // an off switch must still read as a control
  greenTint: 'rgba(51,195,107,0.14)',     // tinted buttons, selected tab; GREEN_TINT_ON_MIST in the test is this over mist
  dangerTint: 'rgba(180,45,51,0.12)',
  scrim: 'rgba(36,50,61,0.55)',           // over the camera
} as const;

export const radius = { card: 24, control: 14, pill: 999 } as const;
export const shadow = { card: '0 8 24 rgba(36,50,61,0.08)', chrome: '0 12 32 rgba(36,50,61,0.18)' } as const;

/** Soft Mist with the three brand hues glowing in from the corners: what the glass sits on. */
export const backdrop = {
  backgroundColor: brand.mist,
  experimental_backgroundImage:
    'radial-gradient(circle at 0% 0%, rgba(51,195,107,0.20) 0%, rgba(51,195,107,0) 60%), ' +
    'radial-gradient(circle at 100% 12%, rgba(24,183,165,0.16) 0%, rgba(24,183,165,0) 55%), ' +
    'radial-gradient(circle at 85% 100%, rgba(255,159,67,0.13) 0%, rgba(255,159,67,0) 55%)',
} as const;

const base = { color: color.text } as const;
export const type = {
  largeTitle: { ...base, fontSize: 34, fontWeight: '700', letterSpacing: 0.2 },
  title: { ...base, fontSize: 22, fontWeight: '700' },
  headline: { ...base, fontSize: 17, fontWeight: '600' },
  body: { ...base, fontSize: 16 },
  muted: { fontSize: 14, color: color.textMuted },
  caption: { fontSize: 12, fontWeight: '600', color: color.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' },
  link: { fontSize: 16, fontWeight: '600', color: color.greenDeep },
  error: { fontSize: 14, color: color.danger },
} as const;

/** WCAG 2 contrast ratio between two #RRGGBB colours. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

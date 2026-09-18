import { brand, color, contrast } from './theme';

// Every text-on-surface pairing the design system allows. 4.5:1 is WCAG AA for body text.
const GREEN_TINT_ON_MIST = '#D8F0E3';   // color.greenTint composited over brand.mist
const DANGER_TINT_ON_MIST = '#EBDFDF';  // color.dangerTint composited over brand.mist
const PAIRS: [string, string, string][] = [
  ['text on mist', color.text, brand.mist],
  ['muted text on mist', color.textMuted, brand.mist],
  ['deep green text on mist', color.greenDeep, brand.mist],
  ['deep green label on a tinted button', color.greenDeep, GREEN_TINT_ON_MIST],
  ['deep teal text on mist', color.tealDeep, brand.mist],
  ['danger text on mist', color.danger, brand.mist],
  ['danger label on a destructive button', color.danger, DANGER_TINT_ON_MIST],
  ['charcoal label on a green button', color.text, brand.green],
  ['charcoal label on an orange banner', color.text, brand.orange],
  ['charcoal label on a teal fill', color.text, brand.teal],
  ['white label on a danger button', color.white, color.danger],
  ['white text on charcoal', color.white, brand.charcoal],
  ['green action on the charcoal toast', brand.green, brand.charcoal],
];

test.each(PAIRS)('%s passes AA', (_name, fg, bg) => {
  expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
});

test('white on the brand green fails, which is why green buttons carry a charcoal label', () => {
  expect(contrast(color.white, brand.green)).toBeLessThan(3);
});

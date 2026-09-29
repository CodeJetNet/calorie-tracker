import { rows } from './parse';
const f = (text: string, x: number, y: number, w = 0.2, h = 0.03) => ({ text, x, y, w, h });

test('fragments on one line join left to right; lines come out top to bottom', () => {
  expect(rows([f('17%', 0.8, 0.301), f('Sodium 220mg', 0.1, 0.35), f('Total Fat 13g', 0.1, 0.3)]))
    .toEqual(['Total Fat 13g 17%', 'Sodium 220mg']);
});
test('a slightly tilted row still joins', () => {
  expect(rows([f('Protein', 0.1, 0.5), f('15g', 0.35, 0.512)])).toEqual(['Protein 15g']);
});
test('a short word box still joins its row', () => {   // "Iron" has no descenders, so its box is shorter than the amounts beside it
  expect(rows([f('Iron', 0.03, 0.8501, 0.08, 0.0237), f('0.7mg 4 %', 0.43, 0.8554, 0.5, 0.0368)])).toEqual(['Iron 0.7mg 4 %']);
});

import { readFileSync } from 'fs';
import { parseLabel } from './parse';

test('reads a clean US label per serving', () => {
  const r = parseLabel([
    'Nutrition Facts', 'Serving size 1 cookie (58g)', 'Calories 210', 'Total Fat 13g 17%', 'Saturated Fat 4g 20%', 'Trans Fat 0g',
    'Cholesterol 25mg 8%', 'Sodium 220mg 10%', 'Total Carbohydrate 23g 8%', 'Dietary Fiber 11g 39%', 'Total Sugars 1g',
    'Includes 0g Added Sugars 0%', 'Sugar Alcohols 7g', 'Protein 15g 30%', 'Vitamin D 0mcg 0%', 'Calcium 130mg 10%', 'Iron 0.3mg 2%', 'Potassium 130mg 2%',
  ]);
  expect(r).toEqual({
    serving_size: 58, serving_unit: 'g', serving_desc: '1 cookie (58g)',
    nutrients: { '1008': 210, '1004': 13, '1258': 4, '1257': 0, '1253': 25, '1093': 220, '1005': 23, '1079': 11, '2000': 1, '1235': 0,
      '1003': 15, '1114': 0, '1087': 130, '1089': 0.3, '1092': 130 },
  });
});
test('OCR letter-for-digit swaps are read as digits', () => {
  expect(parseLabel(['Includes Og Added Sugars', 'Trans Fat O g', 'Iron l.2mg']).nutrients).toEqual({ '1235': 0, '1257': 0, '1089': 1.2 });
});
test('units convert to the app units', () => {
  expect(parseLabel(['Sodium 0.4g', 'Vitamin D 400IU', 'Vitamin A 90µg']).nutrients).toEqual({ '1093': 400, '1114': 10, '1106': 90 });
});
test('a dual-column label takes the first (per serving) column', () => {
  expect(parseLabel(['Calories 140 280', 'Protein 3g 6g']).nutrients).toEqual({ '1008': 140, '1003': 3 });
});
test('drinks keep ml servings', () => {
  expect(parseLabel(['Serving size 1 can (355 mL)'])).toMatchObject({ serving_size: 355, serving_unit: 'ml' });
});
test('sugar alcohols and percent-only rows are not sugars or nutrients', () => {
  expect(parseLabel(['Sugar Alcohols 7g', 'Vitamin C 2%']).nutrients).toEqual({});
});
test('two nutrients on one row are both read', () => {
  expect(parseLabel(['Vitamin D 0mcg 0% Calcium 20mg 0%']).nutrients).toEqual({ '1114': 0, '1087': 20 });
});
test('a linear label reads every nutrient in the paragraph, with abbreviations', () => {
  const r = parseLabel(['Servings: 16, Serv. size: 1 cup (240mL), Amount per serving: Calories 160, Total Fat 8g (10% DV), Sat. Fat 5g (25% DV), '
    + 'Polyunsat. Fat 0g, Monounsat. Fat 2.5g, Cholest. 35mg (12% DV), Total Carb. 13g, Total Sugars 12g (Incl. 0g Added Sugars), Protein 8g']);
  expect(r).toEqual({ serving_size: 240, serving_unit: 'ml', serving_desc: '1 cup (240mL)',
    nutrients: { '1008': 160, '1004': 8, '1258': 5, '1293': 0, '1292': 2.5, '1253': 35, '1005': 13, '2000': 12, '1235': 0, '1003': 8 } });
});
test('added sugars printed after the words', () => {
  expect(parseLabel(['Total Sugars 4g', 'Incl. Added Sugars 2g 4%']).nutrients).toEqual({ '2000': 4, '1235': 2 });
});
test('spaced parentheses in the serving size', () => {
  expect(parseLabel(['Serving size 1 cup ( 249g )'])).toMatchObject({ serving_size: 249, serving_unit: 'g', serving_desc: '1 cup (249g)' });
});

// Values below were read from each photo by eye, not copied from the parser.
const fixture = (code: string) => rows(JSON.parse(readFileSync(`fixtures/labels/${code}.json`, 'utf8')));

test('Quest cookie photo: cropped calories are read as printed', () => {
  const r = parseLabel(fixture('0888849006038'));
  expect(r.nutrients).toMatchObject({ '1004': 13, '1258': 3.5, '1257': 0, '1253': 15, '1093': 220, '1005': 22, '1079': 12, '2000': 1, '1235': 0, '1003': 15, '1087': 130 });
  expect(r.nutrients['1008']).toBe(22);   // the photo cuts off the 0; Task 4's check must flag this
});
test('Campbell\'s soup photo: per-serving column of a dual-column label', () => {
  expect(parseLabel(fixture('0041196910759'))).toEqual({ serving_size: 249, serving_unit: 'g', serving_desc: '1 cup (249g)',
    nutrients: { '1008': 100, '1004': 1.5, '1258': 0.5, '1257': 0, '1253': 10, '1093': 670, '1005': 17, '1079': 1, '2000': 4, '1235': 2,
      '1003': 6, '1114': 0, '1087': 0, '1089': 0.7, '1092': 440 } });
});
test('Great Value whole milk photo: a linear label in mL', () => {
  expect(parseLabel(fixture('0078742351865'))).toEqual({ serving_size: 240, serving_unit: 'ml', serving_desc: '1 cup (240mL)',
    nutrients: { '1008': 160, '1004': 8, '1258': 5, '1257': 0, '1293': 0, '1292': 2.5, '1253': 35, '1093': 130, '1005': 13, '1079': 0,
      '2000': 12, '1235': 0, '1003': 8 } });
});
test('Quaker oats photo: vitamins in mcg, two nutrients per row', () => {
  // OCR read "Serving size" as "Serving e", so the serving is left for the user.
  expect(parseLabel(fixture('0030000010402')).nutrients).toEqual({ '1008': 150, '1004': 3, '1258': 0.5, '1257': 0, '1293': 1, '1292': 1,
    '1253': 0, '1093': 0, '1005': 27, '1079': 4, '2000': 1, '1235': 0, '1003': 5, '1114': 0, '1087': 20, '1089': 1.5, '1092': 150,
    '1091': 130, '1090': 40 });
});

import { energyMismatch } from './parse';
test('calories that disagree with the macros are flagged', () => {
  expect(energyMismatch({ '1008': 210, '1003': 15, '1005': 23, '1004': 13, '1079': 11 })).toBe(false);   // 247 estimated, within 30%
  expect(energyMismatch({ '1008': 22, '1003': 15, '1005': 22, '1004': 13, '1079': 12 })).toBe(true);     // the cropped cookie photo
  expect(energyMismatch({ '1008': 22 })).toBe(false);                                                    // nothing to compare against
});

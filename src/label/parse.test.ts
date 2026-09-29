import { rows } from './parse';
const f = (text: string, x: number, y: number, w = 0.2, h = 0.03) => ({ text, x, y, w, h });

test('fragments on one line join left to right; lines come out top to bottom', () => {
  expect(rows([f('17%', 0.8, 0.301), f('Sodium 220mg', 0.1, 0.35), f('Total Fat 13g', 0.1, 0.3)]))
    .toEqual(['Total Fat 13g 17%', 'Sodium 220mg']);
});
test('a slightly tilted row still joins', () => {
  expect(rows([f('Protein', 0.1, 0.5), f('15g', 0.35, 0.512)])).toEqual(['Protein 15g']);
});

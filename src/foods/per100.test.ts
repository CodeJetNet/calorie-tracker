import { toPer100 } from './per100';
test('label values per serving become per 100 g', () => {
  expect(toPer100({ '1008': 190, '1003': 7 }, 32)).toEqual({ '1008': 593.75, '1003': 21.875 });
});

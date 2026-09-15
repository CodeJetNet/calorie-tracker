import { expandUpcE, normalize, valid } from './gtin';
test.each([
  ['3017620422003', undefined, '3017620422003'],
  ['012345678905', 'upc_a', '0012345678905'],
  ['96385074', 'ean8', '0000096385074'],
  ['03017620422003', undefined, '3017620422003'],
  ['04252614', 'upc_e', '0042100005264'],
  ['3017620422004', undefined, null],
  ['abc', undefined, null],
])('normalize(%s, %s) -> %s', (code, sym, expected) => {
  expect(normalize(code, sym)).toBe(expected);
});
test('expandUpcE', () => expect(expandUpcE('04252614')).toBe('042100005264'));
test('valid', () => { expect(valid('3017620422003')).toBe(true); expect(valid('3017620422000')).toBe(false); });

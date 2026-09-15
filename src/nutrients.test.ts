import { DEFAULT_TARGETS, PANEL, scale, sum } from './nutrients';

test('scale per-100 values to grams consumed', () => {
  expect(scale({ '1008': 539, '1003': 6.3 }, 15)).toEqual({ '1008': 80.85, '1003': 0.945 });
});

test('sum adds sparse nutrient records', () => {
  expect(sum([{ '1008': 100, '1003': 5 }, { '1008': 50 }])).toEqual({ '1008': 150, '1003': 5 });
});

test('panel includes energy and macros first', () => {
  expect(PANEL.slice(0, 4).map(n => n.id)).toEqual(['1008', '1003', '1005', '1004']);
});

test('default targets come from the list', () => {
  expect(DEFAULT_TARGETS['1093']).toBe(2300);
  expect('1057' in DEFAULT_TARGETS).toBe(false);   // caffeine has no target
});

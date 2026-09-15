import { servingOptions } from './servings';
test('options: label serving, 100 g, then portions', () => {
  expect(servingOptions({ serving_size: 15, serving_unit: 'g', serving_desc: '1 tbsp (15 g)' }, [{ description: 'jar', grams: 400 }]))
    .toEqual([{ label: '1 tbsp (15 g)', grams: 15 }, { label: '100 g', grams: 100 }, { label: 'jar', grams: 400 }]);
});
test('portions matching an existing option by grams or by label are skipped', () => {
  expect(servingOptions({ serving_size: 15, serving_unit: 'g', serving_desc: '1 tbsp' }, [{ description: '1 tbsp', grams: 16 }, { description: '100 g', grams: 100 }, { description: 'cup', grams: 240 }]))
    .toEqual([{ label: '1 tbsp', grams: 15 }, { label: '100 g', grams: 100 }, { label: 'cup', grams: 240 }]);
});
test('no serving info yields just 100 g', () => {
  expect(servingOptions({ serving_size: null, serving_unit: null, serving_desc: null }, [])).toEqual([{ label: '100 g', grams: 100 }]);
});

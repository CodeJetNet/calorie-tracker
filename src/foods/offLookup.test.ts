import { fromOffProduct } from './offLookup';
test('maps OFF API product to a custom food per 100 g', () => {
  const f = fromOffProduct('3017620422003', { product_name: 'Nutella', brands: 'Ferrero', serving_quantity: 15, serving_size: '15 g',
    nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, sodium_100g: 0.043 } });
  expect(f).toMatchObject({ barcode: '3017620422003', name: 'Nutella', brand: 'Ferrero', serving_size: 15, serving_unit: 'g',
    nutrients: { '1008': 539, '1003': 6.3, '1005': 57.5, '1004': 30.9, '1093': 43 } });
});
test('product without energy yields null', () => expect(fromOffProduct('x', { nutriments: {} })).toBeNull());
test('kilojoules-only product gets kcal', () => expect(fromOffProduct('x', { product_name: 'Snack', nutriments: { 'energy-kj_100g': 1674 } })?.nutrients['1008']).toBe(400.1));

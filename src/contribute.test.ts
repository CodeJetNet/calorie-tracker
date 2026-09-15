import { offFields } from './contribute';

test('builds the Open Food Facts product form in our units', () => {
  const f = offFields({ barcode: '3017620422003', name: 'Nutella', brand: 'Ferrero', serving_size: 15, serving_unit: 'g', serving_desc: '1 tbsp (15 g)',
    nutrients: { '1008': 539, '1003': 6.3, '1093': 43, '1106': 12 } });
  expect(f).toMatchObject({
    code: '3017620422003', product_name: 'Nutella', brands: 'Ferrero', serving_size: '1 tbsp (15 g)', nutrition_data_per: '100g',
    'nutriment_energy-kcal': '539', 'nutriment_energy-kcal_unit': 'kcal', nutriment_proteins: '6.3', nutriment_proteins_unit: 'g',
    nutriment_sodium: '43', nutriment_sodium_unit: 'mg', 'nutriment_vitamin-a': '12', 'nutriment_vitamin-a_unit': 'mcg',
  });
  expect(Object.keys(f).some(k => k.includes('1008'))).toBe(false);   // FDC ids never leave the app
});

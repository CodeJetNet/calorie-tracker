import { recipeNutrients } from './recipes';
test('per-serving nutrients from ingredients', () => {
  const ingredients = [
    { name: 'Oats', amount: 100, nutrients: { '1008': 389, '1003': 16.9 }, food_ref: 'foods:usda_sr:173904' },
    { name: 'Milk', amount: 200, nutrients: { '1008': 122, '1003': 6.6 }, food_ref: 'foods:usda_sr:171265' },
  ];
  expect(recipeNutrients(ingredients, 2)).toEqual({ '1008': 255.5, '1003': 11.75 });
});

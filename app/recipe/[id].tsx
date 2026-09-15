import * as Crypto from 'expo-crypto';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Button, ScrollView, Text, TextInput, View } from 'react-native';
import { useDb } from '../../src/db/provider';
import { deleteRecipe, recipe as loadRecipe, recipeNutrients, upsertRecipe, type Ingredient } from '../../src/diary/recipes';
import { fmt } from '../../src/ui/NutrientBar';

const row = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 } as const;
const input = { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, flex: 1 } as const;

export default function RecipeEditor() {
  const { diary } = useDb();
  const router = useRouter();
  const p = useLocalSearchParams<{ id: string; picked?: string }>();
  const isNew = p.id === 'new';
  const [id] = useState(() => (isNew ? Crypto.randomUUID() : p.id));
  const [name, setName] = useState('');
  const [servingsText, setServingsText] = useState('1');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (isNew) return;
    loadRecipe(diary, p.id).then(r => { if (r) { setName(r.name); setServingsText(String(r.servings)); setIngredients(r.ingredients); } });
  }, []);

  useEffect(() => {   // Food detail in pick mode returns here with the chosen ingredient
    if (!p.picked) return;
    setIngredients(list => [...list, JSON.parse(p.picked!) as Ingredient]);
    router.setParams({ picked: '' });
  }, [p.picked]);

  const servings = Number(servingsText);
  const perServing = servings > 0 ? recipeNutrients(ingredients, servings) : {};
  const canSave = !!name.trim() && servings > 0 && ingredients.length > 0;

  const save = async () => {
    await upsertRecipe(diary, { id, name: name.trim(), servings, ingredients, nutrients: perServing });
    router.replace({ pathname: '/food/[ref]', params: { ref: `recipe:${id}` } });
  };
  const del = async () => {
    if (!confirm) return setConfirm(true);
    await deleteRecipe(diary, id);
    router.dismissTo('/search');
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'New recipe' : 'Edit recipe' }} />
      <View style={row}><Text>Name</Text><TextInput value={name} onChangeText={setName} style={input} /></View>
      <View style={row}><Text>Servings</Text><TextInput value={servingsText} onChangeText={setServingsText} keyboardType="decimal-pad" style={input} /></View>
      <Text style={{ fontWeight: 'bold' }}>Ingredients</Text>
      {ingredients.map((i, k) => (
        <View key={k} style={row}>
          <View style={{ flex: 1 }}>
            <Text>{i.name}</Text>
            <Text style={{ color: '#666' }}>{fmt(i.amount)} g · {fmt(i.nutrients['1008'] ?? 0)} kcal</Text>
          </View>
          <Button title="Remove" onPress={() => setIngredients(ingredients.filter((_, j) => j !== k))} />
        </View>
      ))}
      <Button title="Add ingredient" onPress={() => router.push({ pathname: '/search', params: { pick: p.id } })} />
      <Text>Per serving: {fmt(perServing['1008'] ?? 0)} kcal, {fmt(perServing['1003'] ?? 0)} g protein, {fmt(perServing['1005'] ?? 0)} g carbs, {fmt(perServing['1004'] ?? 0)} g fat</Text>
      <Button title="Save" onPress={save} disabled={!canSave} />
      {!isNew && <Button title={confirm ? 'Tap again to delete' : 'Delete'} color={confirm ? '#c33' : undefined} onPress={del} />}
    </ScrollView>
  );
}

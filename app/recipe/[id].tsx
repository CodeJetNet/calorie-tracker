import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useDb } from '../../src/db/provider';
import { deleteRecipe, recipe as loadRecipe, recipeNutrients, upsertRecipe, type Ingredient } from '../../src/diary/recipes';
import { Btn, Field, Line, row, Screen, Section, Txt } from '../../src/ui/kit';
import { fmt } from '../../src/ui/NutrientBar';
import { color } from '../../src/ui/theme';

export default function RecipeEditor() {
  const { diary } = useDb();
  const router = useRouter();
  const p = useLocalSearchParams<{ id: string; picked?: string; day?: string; meal?: string; pick?: string }>();
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
    router.replace({ pathname: '/food/[ref]', params: { ref: `recipe:${id}`, day: p.day, meal: p.meal, pick: p.pick } });
  };
  const del = async () => {
    if (!confirm) return setConfirm(true);
    await deleteRecipe(diary, id);
    router.dismissTo('/search');
  };

  return (
    <Screen title={isNew ? 'New recipe' : 'Edit recipe'}>
      <Section title="Recipe">
        <View style={{ gap: 4 }}><Txt v="muted">Name</Txt><Field value={name} onChangeText={setName} accessibilityLabel="Name" /></View>
        <View style={row}>
          <Txt style={{ flex: 1 }}>Servings</Txt>
          <Field value={servingsText} onChangeText={setServingsText} keyboardType="decimal-pad" accessibilityLabel="Servings" style={{ width: 96, textAlign: 'right' }} />
        </View>
      </Section>
      <Section title="Ingredients">
        {ingredients.map((i, k) => (
          <View key={k} style={{ ...row, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: color.track }}>
            <View style={{ flex: 1 }}>
              <Txt numberOfLines={2}>{i.name}</Txt>
              <Txt v="muted">{fmt(i.amount)} g · {fmt(i.nutrients['1008'] ?? 0)} kcal</Txt>
            </View>
            <Btn kind="destructive" small title="Remove" onPress={() => setIngredients(ingredients.filter((_, j) => j !== k))} />
          </View>
        ))}
        <Btn icon="add" title="Add ingredient" onPress={() => router.push({ pathname: '/search', params: { pick: p.id } })} />
      </Section>
      <Section title="Per serving">
        <Line label="Energy" value={`${fmt(perServing['1008'] ?? 0)} kcal`} />
        <Line label="Protein" value={`${fmt(perServing['1003'] ?? 0)} g`} />
        <Line label="Carbohydrate" value={`${fmt(perServing['1005'] ?? 0)} g`} />
        <Line label="Fat" value={`${fmt(perServing['1004'] ?? 0)} g`} />
      </Section>
      <Btn kind="primary" title="Save" onPress={save} disabled={!canSave} />
      {!isNew && <Btn kind={confirm ? 'danger' : 'destructive'} title={confirm ? 'Tap again to delete' : 'Delete'} onPress={del} />}
    </Screen>
  );
}

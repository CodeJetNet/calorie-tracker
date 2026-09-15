import { aggregateRecord, deleteRecordsByUuids, getSdkStatus, initialize, insertRecords, requestPermission, SdkAvailabilityStatus } from 'react-native-health-connect';
import type { Entry } from '../diary/entries';

export const available = true;
const PERMS = [
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'write', recordType: 'Nutrition' },
] as const;

let ready: Promise<boolean> | null = null;
const init = () => (ready ??= (async () => (await getSdkStatus()) === SdkAvailabilityStatus.SDK_AVAILABLE && (await initialize()))());

export async function requestPermissions(): Promise<boolean> {
  if (!(await init())) return false;
  const granted = await requestPermission([...PERMS]);
  return granted.length >= PERMS.length;
}

function dayRange(day: string) {
  const start = new Date(`${day}T00:00:00`);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { operator: 'between' as const, startTime: start.toISOString(), endTime: end.toISOString() };
}

export async function readActiveCalories(day: string): Promise<number | null> {
  try {
    if (!(await init())) return null;
    const r = await aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter: dayRange(day) });
    return Math.round(r.ACTIVE_CALORIES_TOTAL.inKilocalories);
  } catch { return null; }
}

type MassUnit = 'grams' | 'milligrams' | 'micrograms';
const mass = (v: number | undefined, unit: MassUnit) => (v === undefined ? undefined : { value: v, unit });
const MEAL: Record<string, number> = { breakfast: 1, lunch: 2, dinner: 3 };

export async function writeNutrition(e: Entry): Promise<string | null> {
  try {
    if (!(await init())) return null;
    const start = new Date(`${e.day}T12:00:00`);
    const end = new Date(start.getTime() + 60_000);
    const n = e.nutrients;
    const ids = await insertRecords([{
      recordType: 'Nutrition', startTime: start.toISOString(), endTime: end.toISOString(),
      name: e.name, mealType: MEAL[e.meal.toLowerCase()] ?? 4,
      energy: n['1008'] === undefined ? undefined : { value: n['1008'], unit: 'kilocalories' },
      protein: mass(n['1003'], 'grams'), totalCarbohydrate: mass(n['1005'], 'grams'), totalFat: mass(n['1004'], 'grams'),
      dietaryFiber: mass(n['1079'], 'grams'), sugar: mass(n['2000'], 'grams'), saturatedFat: mass(n['1258'], 'grams'),
      transFat: mass(n['1257'], 'grams'), monounsaturatedFat: mass(n['1292'], 'grams'), polyunsaturatedFat: mass(n['1293'], 'grams'),
      cholesterol: mass(n['1253'], 'milligrams'), sodium: mass(n['1093'], 'milligrams'), potassium: mass(n['1092'], 'milligrams'),
      calcium: mass(n['1087'], 'milligrams'), iron: mass(n['1089'], 'milligrams'), magnesium: mass(n['1090'], 'milligrams'),
      phosphorus: mass(n['1091'], 'milligrams'), zinc: mass(n['1095'], 'milligrams'), vitaminA: mass(n['1106'], 'micrograms'),
      vitaminC: mass(n['1162'], 'milligrams'), vitaminD: mass(n['1114'], 'micrograms'), vitaminE: mass(n['1109'], 'milligrams'),
      vitaminK: mass(n['1185'], 'micrograms'), thiamin: mass(n['1165'], 'milligrams'), riboflavin: mass(n['1166'], 'milligrams'),
      niacin: mass(n['1167'], 'milligrams'), vitaminB6: mass(n['1175'], 'milligrams'), folate: mass(n['1177'], 'micrograms'),
      vitaminB12: mass(n['1178'], 'micrograms'), caffeine: mass(n['1057'], 'milligrams'),
    }]);
    return ids[0] ?? null;
  } catch { return null; }
}

export async function deleteNutrition(id: string): Promise<void> {
  try { await deleteRecordsByUuids('Nutrition', [id], []); } catch { /* record already gone */ }
}

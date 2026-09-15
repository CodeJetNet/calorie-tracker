import { deleteObjects, queryStatisticsForQuantity, requestAuthorization, saveCorrelationSample } from '@kingstinct/react-native-healthkit';
import type { QuantityTypeIdentifierWriteable } from '@kingstinct/react-native-healthkit';
import type { Entry } from '../diary/entries';

export const available = true;

// HealthKit stores nutrition as one sample per nutrient; a food correlation groups them into one meal item.
const MAP: [string, QuantityTypeIdentifierWriteable, string][] = [   // [our id, HealthKit identifier, HealthKit unit]
  ['1008', 'HKQuantityTypeIdentifierDietaryEnergyConsumed', 'kcal'], ['1003', 'HKQuantityTypeIdentifierDietaryProtein', 'g'],
  ['1005', 'HKQuantityTypeIdentifierDietaryCarbohydrates', 'g'], ['1004', 'HKQuantityTypeIdentifierDietaryFatTotal', 'g'],
  ['1079', 'HKQuantityTypeIdentifierDietaryFiber', 'g'], ['2000', 'HKQuantityTypeIdentifierDietarySugar', 'g'],
  ['1258', 'HKQuantityTypeIdentifierDietaryFatSaturated', 'g'], ['1292', 'HKQuantityTypeIdentifierDietaryFatMonounsaturated', 'g'],
  ['1293', 'HKQuantityTypeIdentifierDietaryFatPolyunsaturated', 'g'], ['1253', 'HKQuantityTypeIdentifierDietaryCholesterol', 'mg'],
  ['1093', 'HKQuantityTypeIdentifierDietarySodium', 'mg'], ['1092', 'HKQuantityTypeIdentifierDietaryPotassium', 'mg'],
  ['1087', 'HKQuantityTypeIdentifierDietaryCalcium', 'mg'], ['1089', 'HKQuantityTypeIdentifierDietaryIron', 'mg'],
  ['1090', 'HKQuantityTypeIdentifierDietaryMagnesium', 'mg'], ['1091', 'HKQuantityTypeIdentifierDietaryPhosphorus', 'mg'],
  ['1095', 'HKQuantityTypeIdentifierDietaryZinc', 'mg'], ['1106', 'HKQuantityTypeIdentifierDietaryVitaminA', 'mcg'],
  ['1162', 'HKQuantityTypeIdentifierDietaryVitaminC', 'mg'], ['1114', 'HKQuantityTypeIdentifierDietaryVitaminD', 'mcg'],
  ['1109', 'HKQuantityTypeIdentifierDietaryVitaminE', 'mg'], ['1185', 'HKQuantityTypeIdentifierDietaryVitaminK', 'mcg'],
  ['1165', 'HKQuantityTypeIdentifierDietaryThiamin', 'mg'], ['1166', 'HKQuantityTypeIdentifierDietaryRiboflavin', 'mg'],
  ['1167', 'HKQuantityTypeIdentifierDietaryNiacin', 'mg'], ['1175', 'HKQuantityTypeIdentifierDietaryVitaminB6', 'mg'],
  ['1177', 'HKQuantityTypeIdentifierDietaryFolate', 'mcg'], ['1178', 'HKQuantityTypeIdentifierDietaryVitaminB12', 'mcg'],
  ['1057', 'HKQuantityTypeIdentifierDietaryCaffeine', 'mg'],
];
const ACTIVE = 'HKQuantityTypeIdentifierActiveEnergyBurned';
const FOOD = 'HKCorrelationTypeIdentifierFood' as const;

export async function requestPermissions(): Promise<boolean> {
  try { return await requestAuthorization({ toRead: [ACTIVE], toShare: MAP.map(m => m[1]) }); } catch { return false; }
}

/** Each entry gets its own one-second window inside the noon hour, so it can be deleted by time range without touching neighbours. */
function windowFor(e: Entry) {
  let h = 0; for (const c of e.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const start = new Date(`${e.day}T12:00:00`); start.setSeconds(h % 3600);
  return { start, end: new Date(start.getTime() + 1000) };
}

/** strictStartDate makes the range [start, end), so adjacent one-second windows and adjacent days never overlap. */
const between = (startDate: Date, endDate: Date) => ({ date: { startDate, endDate, strictStartDate: true } });

export async function readActiveCalories(day: string): Promise<number | null> {
  try {
    const from = new Date(`${day}T00:00:00`), to = new Date(from); to.setDate(to.getDate() + 1);
    const r = await queryStatisticsForQuantity(ACTIVE, ['cumulativeSum'], { filter: between(from, to), unit: 'kcal' });
    return r.sumQuantity ? Math.round(r.sumQuantity.quantity) : 0;
  } catch { return null; }
}

export async function writeNutrition(e: Entry): Promise<string | null> {
  try {
    const { start, end } = windowFor(e);
    const samples = MAP.filter(([id]) => e.nutrients[id] !== undefined)
      .map(([id, hk, unit]) => ({ quantityType: hk, unit, quantity: e.nutrients[id], startDate: start, endDate: end }));
    if (!samples.length) return null;
    await saveCorrelationSample(FOOD, samples, start, end, { HKFoodType: e.name, entryId: e.id });
    return `${start.toISOString()}|${end.toISOString()}`;   // health_id holds the window, which is what deletion needs
  } catch { return null; }
}

export async function deleteNutrition(id: string): Promise<void> {
  const [start, end] = id.split('|').map(s => new Date(s));
  try { await Promise.all([FOOD, ...MAP.map(m => m[1])].map(t => deleteObjects(t, between(start, end)))); } catch { /* already gone */ }
}

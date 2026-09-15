// Default module: tests, web and (until Task 8.1) iOS. React Native's resolver picks index.android.ts on Android.
import type { Entry } from '../diary/entries';
export const available = false;
export async function requestPermissions(): Promise<boolean> { return false; }
export async function readActiveCalories(_day: string): Promise<number | null> { return null; }
export async function writeNutrition(_e: Entry): Promise<string | null> { return null; }
export async function deleteNutrition(_id: string): Promise<void> {}

import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { NUTRIENTS } from './nutrients';
import type { CustomFood } from './diary/customFoods';
import type { Db } from './db/types';
import { getSetting, setSetting } from './diary/settings';

const UA = 'CalorieTracker/1.0 (github.com/codejetnet/calorie-tracker)';
// Release builds carry the app's global OFF account in extra (Task 7.2). Local builds may set OFF_APP_STAGING=1 with a staging
// account created once in a browser; off/off is only the staging proxy's HTTP gate. With no password there is nothing to post with.
const extra = (Constants.expoConfig?.extra ?? {}) as { offUser?: string; offPassword?: string; offStaging?: boolean };
export const CAN_CONTRIBUTE = !!extra.offPassword;
const BASE = extra.offStaging ? 'https://world.openfoodfacts.net' : 'https://world.openfoodfacts.org';
const AUTH = { user_id: extra.offUser ?? 'codejet-calorie-tracker', password: extra.offPassword ?? '' };
const STAGING_HEADER: Record<string, string> = extra.offStaging ? { Authorization: 'Basic ' + btoa('off:off') } : {};

/** Per-100 g values in our units; OFF converts from the `_unit` field. */
export function offFields(f: Omit<CustomFood, 'id'> & { barcode: string }): Record<string, string> {
  const out: Record<string, string> = { code: f.barcode, product_name: f.name, nutrition_data_per: '100g' };
  if (f.brand) out.brands = f.brand;
  if (f.serving_desc) out.serving_size = f.serving_desc;
  else if (f.serving_size) out.serving_size = `${f.serving_size} ${f.serving_unit ?? 'g'}`;
  for (const n of NUTRIENTS) {
    const v = f.nutrients[n.id];
    if (n.off && v !== undefined) { out[`nutriment_${n.off}`] = String(v); out[`nutriment_${n.off}_unit`] = n.unit === 'µg' ? 'mcg' : n.unit; }
  }
  return out;
}

async function deviceId(db: Db): Promise<string> {
  let id = await getSetting(db, 'app_uuid');
  if (!id) { id = Crypto.randomUUID(); await setSetting(db, 'app_uuid', id, false); }
  return id;
}

/** Post the food, then the label photo if given. Returns null on success or a message to show. */
export async function contribute(db: Db, f: Omit<CustomFood, 'id'> & { barcode: string }, photoUri?: string): Promise<string | null> {
  const app = { app_name: 'CalorieTracker', app_version: Constants.expoConfig?.version ?? '0', app_uuid: await deviceId(db) };
  const body = new URLSearchParams({ ...offFields(f), ...app, ...AUTH });
  const res = await fetch(`${BASE}/cgi/product_jqm2.pl`, {
    method: 'POST', body: body.toString(),
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', ...STAGING_HEADER },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status !== 1) return `Open Food Facts said: ${json.status_verbose ?? res.status}`;
  if (photoUri) {
    const form = new FormData();
    for (const [k, v] of Object.entries({ code: f.barcode, imagefield: 'nutrition_en', ...app, ...AUTH })) form.append(k, v);
    form.append('imgupload_nutrition_en', { uri: photoUri, name: 'nutrition.jpg', type: 'image/jpeg' } as unknown as Blob);
    const up = await fetch(`${BASE}/cgi/product_image_upload.pl`, { method: 'POST', body: form, headers: { 'User-Agent': UA, ...STAGING_HEADER } });
    if (!up.ok) return 'Values saved, but the photo upload failed.';
  }
  return null;
}

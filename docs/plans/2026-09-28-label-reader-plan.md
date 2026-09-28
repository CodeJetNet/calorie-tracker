# Nutrition Label Reader Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a scanned barcode is missing everywhere, the user photographs the nutrition label and gets a custom food with every value filled in, ready to check, save and contribute.

**Architecture:** A local Expo module (`modules/label-text`) runs the platform's own on-device text recognizer, ML Kit on Android and Apple Vision on iOS, and returns text lines with normalized boxes. Pure TypeScript in `src/label/` groups the lines into label rows, reads the US Nutrition Facts rows with one regex per nutrient, and flags values whose calories disagree with the macros. A camera screen (`app/label.tsx`) ties them together and hands the result to the existing custom food editor in its per-serving mode, with the photo carried through to Contribute.

**Tech Stack:** Expo SDK 57 local modules (Kotlin, Swift), Google ML Kit Text Recognition v2 (bundled Latin model), Apple Vision `VNRecognizeTextRequest`, expo-camera (installed), Jest.

---

## Decisions already made

- **On-device OCR, not a server.** Free, offline, instant, and only the user's own Contribute tap ever sends the photo. Robotoff (Open Food Facts' server-side extractor) was tested on 2026-09-28 and works, but needs an upload first and a volunteer-run service. It is a possible later fallback, not part of this plan.
- **A local module, not an npm package.** `@react-native-ml-kit/text-recognition` is a legacy-bridge module last published 2025-09. The repo already carries a local module (`modules/create-document`) in the same shape, and the native code here is under 80 lines per platform.
- **US Nutrition Facts only.** The FDA panel has fixed row names. EU "per 100 g" tables and other languages are out of scope; the parser just finds fewer values and the user types the rest.
- **The user always confirms.** The result opens in the editor, never saves by itself. A live energy check warns when calories disagree with protein, carbs and fat, which catches the commonest misread (a cropped or glare-hit calorie number).
- **Name stays manual.** The panel carries no product name. One text field is the only typing left.

## Privacy consequence (must ship with the feature)

ML Kit sends Google usage metrics (device and app info, API performance) even with the bundled model. Check the current wording at <https://developers.google.com/ml-kit/android-data-disclosure> during Task 9, then update `docs/privacy.md`, the README's "Everything stays on your phone" line if needed, and tell the maintainer that the Play Data safety form needs the same change. The photo itself and the recognized text stay on the phone. Apple Vision sends nothing.

---

### Task 1: Real OCR fixtures from Open Food Facts

Open Food Facts stores Google Vision OCR for every uploaded photo at `https://images.openfoodfacts.org/images/products/<path>/<imgid>.json`. Its noise matches what the phone produces: rows split into pieces and out of order, `Og` for `0g`, cropped numbers. Convert a few into the module's output shape so the parser is tested against real labels.

**Files:**
- Create: `scripts/off-ocr-fixture.py`
- Create: `fixtures/labels/0888849006038.json` and 3 more

**Step 1: Write the converter**

```python
"""Open Food Facts OCR JSON (Google Vision) to the label-text module's output: [{text, x, y, w, h}], normalized 0..1, y down.
Usage: python3 scripts/off-ocr-fixture.py <gtin13> <imgid>   writes fixtures/labels/<gtin13>.json"""
import json, sys, urllib.request

code, imgid = sys.argv[1], sys.argv[2]
path = f'{code[:3]}/{code[3:6]}/{code[6:9]}/{code[9:]}' if len(code) > 8 else code
req = urllib.request.Request(f'https://images.openfoodfacts.org/images/products/{path}/{imgid}.json',
                             headers={'User-Agent': 'CalorieTracker/1.0 (github.com/codejetnet/calorie-tracker)'})
r = json.load(urllib.request.urlopen(req))['responses'][0]
page = r['fullTextAnnotation']['pages'][0]
W, H = page['width'], page['height']
out = []
for block in page['blocks']:
    for para in block['paragraphs']:
        line = []   # a Vision paragraph can span several label rows; split it where Vision saw a line break
        for w in para['words']:
            line.append(w)
            brk = (w['symbols'][-1].get('property', {}).get('detectedBreak') or {}).get('type')
            if brk in ('EOL_SURE_SPACE', 'LINE_BREAK') or w is para['words'][-1]:
                text = ' '.join(''.join(s['text'] for s in x['symbols']) for x in line)
                xs = [v.get('x', 0) for x in line for v in x['boundingBox']['vertices']]
                ys = [v.get('y', 0) for x in line for v in x['boundingBox']['vertices']]
                out.append({'text': text, 'x': min(xs) / W, 'y': min(ys) / H, 'w': (max(xs) - min(xs)) / W, 'h': (max(ys) - min(ys)) / H})
                line = []
json.dump(out, open(f'fixtures/labels/{code}.json', 'w'), indent=1)
print(len(out), 'fragments')
```

**Step 2: Generate the Quest cookie fixture**

Run: `python3 scripts/off-ocr-fixture.py 0888849006038 7`
Expected: `25 fragments`, and `fixtures/labels/0888849006038.json` exists. This photo is cropped at the right edge, so calories read as `22` (the real value is 210) and the serving grams are cut off. Keep it: it is the test that the energy check catches a misread. On 2026-09-28 the Task 2 to 4 code in this plan read 12 values from it, all correct except the cropped calories, and flagged the mismatch.

**Step 3: Pick three more US labels**

Find candidates:

```sh
curl -s -A 'CalorieTracker/1.0' 'https://world.openfoodfacts.org/api/v2/search?countries_tags_en=united-states&states_tags=en:nutrition-photo-selected&fields=code,product_name,images&page_size=40&sort_by=unique_scans_n' \
  | python3 -c "import json,sys; [print(p['code'], p.get('product_name'), [k for k in p.get('images',{}) if k.isdigit()]) for p in json.load(sys.stdin)['products']]"
```

For each candidate, open `https://images.openfoodfacts.org/images/products/<path>/<imgid>.jpg` and view it. Keep three whose label is upright and fully in frame: one dual-column label (per serving and per container), one drink in ml, one with vitamins in mcg. Run the converter for each. Write each label's true values by hand, from the photo, into the test in Task 3. Do not copy them from the parser's output.

**Step 4: Commit**

```bash
git add scripts/off-ocr-fixture.py fixtures/labels
git commit -m "test: nutrition label OCR fixtures from Open Food Facts"
```

---

### Task 2: Group text fragments into label rows

OCR returns "Total Fat 13g" and "17%" as separate pieces, often in reading order by column. Rows are rebuilt from box centers.

**Files:**
- Create: `src/label/parse.ts`
- Test: `src/label/parse.test.ts`

**Step 1: Write the failing test**

```ts
import { rows } from './parse';
const f = (text: string, x: number, y: number, w = 0.2, h = 0.03) => ({ text, x, y, w, h });

test('fragments on one line join left to right; lines come out top to bottom', () => {
  expect(rows([f('17%', 0.8, 0.301), f('Sodium 220mg', 0.1, 0.35), f('Total Fat 13g', 0.1, 0.3)]))
    .toEqual(['Total Fat 13g 17%', 'Sodium 220mg']);
});
test('a slightly tilted row still joins', () => {
  expect(rows([f('Protein', 0.1, 0.5), f('15g', 0.35, 0.512)])).toEqual(['Protein 15g']);
});
```

**Step 2: Run it to see it fail**

Run: `npx jest src/label/parse.test.ts`
Expected: FAIL, `Cannot find module './parse'`.

**Step 3: Implement**

```ts
/** One piece of recognized text. Coordinates are fractions of the image, y down. */
export type Fragment = { text: string; x: number; y: number; w: number; h: number };

const mid = (f: Fragment) => f.y + f.h / 2;

/** Fragments whose vertical centers are within half a line height of a row's first fragment join that row. */
export function rows(frags: Fragment[]): string[] {
  const out: Fragment[][] = [];
  for (const f of [...frags].sort((a, b) => mid(a) - mid(b))) {
    const row = out[out.length - 1];
    if (row && Math.abs(mid(f) - mid(row[0])) < Math.min(f.h, row[0].h) / 2) row.push(f);
    else out.push([f]);
  }
  return out.map(r => r.sort((a, b) => a.x - b.x).map(f => f.text).join(' '));
}
```

**Step 4: Run it to see it pass**

Run: `npx jest src/label/parse.test.ts`
Expected: PASS, 2 tests.

**Step 5: Commit**

```bash
git add src/label
git commit -m "feat: group OCR fragments into nutrition label rows"
```

---

### Task 3: Read nutrient values from label rows

**Files:**
- Modify: `src/label/parse.ts`
- Test: `src/label/parse.test.ts`

**Step 1: Write the failing tests**

Append:

```ts
import { parseLabel } from './parse';

test('reads a clean US label per serving', () => {
  const r = parseLabel([
    'Nutrition Facts', 'Serving size 1 cookie (58g)', 'Calories 210', 'Total Fat 13g 17%', 'Saturated Fat 4g 20%', 'Trans Fat 0g',
    'Cholesterol 25mg 8%', 'Sodium 220mg 10%', 'Total Carbohydrate 23g 8%', 'Dietary Fiber 11g 39%', 'Total Sugars 1g',
    'Includes 0g Added Sugars 0%', 'Sugar Alcohols 7g', 'Protein 15g 30%', 'Vitamin D 0mcg 0%', 'Calcium 130mg 10%', 'Iron 0.3mg 2%', 'Potassium 130mg 2%',
  ]);
  expect(r).toEqual({
    serving_size: 58, serving_unit: 'g', serving_desc: '1 cookie (58g)',
    nutrients: { '1008': 210, '1004': 13, '1258': 4, '1257': 0, '1253': 25, '1093': 220, '1005': 23, '1079': 11, '2000': 1, '1235': 0,
      '1003': 15, '1114': 0, '1087': 130, '1089': 0.3, '1092': 130 },
  });
});
test('OCR letter-for-digit swaps are read as digits', () => {
  expect(parseLabel(['Includes Og Added Sugars', 'Trans Fat O g', 'Iron l.2mg']).nutrients).toEqual({ '1235': 0, '1257': 0, '1089': 1.2 });
});
test('units convert to the app units', () => {
  expect(parseLabel(['Sodium 0.4g', 'Vitamin D 400IU', 'Vitamin A 90µg']).nutrients).toEqual({ '1093': 400, '1114': 10, '1106': 90 });
});
test('a dual-column label takes the first (per serving) column', () => {
  expect(parseLabel(['Calories 140 280', 'Protein 3g 6g']).nutrients).toEqual({ '1008': 140, '1003': 3 });
});
test('drinks keep ml servings', () => {
  expect(parseLabel(['Serving size 1 can (355 mL)'])).toMatchObject({ serving_size: 355, serving_unit: 'ml' });
});
test('sugar alcohols and percent-only rows are not sugars or nutrients', () => {
  expect(parseLabel(['Sugar Alcohols 7g', 'Vitamin C 2%']).nutrients).toEqual({});
});
```

Then one test per fixture from Task 1, using the hand-written values:

```ts
import { readFileSync } from 'fs';
const fixture = (code: string) => rows(JSON.parse(readFileSync(`fixtures/labels/${code}.json`, 'utf8')));

test('Quest cookie photo: cropped calories are read as printed', () => {
  const r = parseLabel(fixture('0888849006038'));
  expect(r.nutrients).toMatchObject({ '1004': 13, '1258': 3.5, '1257': 0, '1253': 15, '1093': 220, '1005': 22, '1079': 12, '2000': 1, '1235': 0, '1003': 15, '1087': 130 });
  expect(r.nutrients['1008']).toBe(22);   // the photo cuts off the 0; Task 4's check must flag this
});
// ...one test per extra fixture, expected values read from the photo by eye
```

**Step 2: Run them to see them fail**

Run: `npx jest src/label/parse.test.ts`
Expected: FAIL, `parseLabel is not a function`.

**Step 3: Implement**

Add to `src/label/parse.ts`:

```ts
import { BY_ID, type Nutrients } from '../nutrients';

export type LabelFood = { serving_size: number | null; serving_unit: 'g' | 'ml' | null; serving_desc: string | null; nutrients: Nutrients };

const NUM = '([0-9OoIl]+(?:[.,][0-9Oo]+)?)';   // OCR reads 0 as O or o, and 1 as I or l
const UNIT = '\\s*(mcg|µg|ug|mg|g|IU)\\b';
// Nutrient id and the row words before its amount. Order matters: the first rule that matches a row wins it,
// so the specific fats come before total fat and added sugars before total sugars.
const RULES: [string, string][] = [
  ['1235', 'includes'], ['1258', 'sat(?:urated)?\\.?\\s*fat'], ['1257', 'trans\\s*fat'],
  ['1293', 'poly(?:unsaturated)?\\s*fat'], ['1292', 'mono(?:unsaturated)?\\s*fat'], ['1004', 'total\\s*fat'],
  ['1253', 'cholest(?:erol)?'], ['1093', 'sodium'], ['1005', 'total\\s*carb(?:ohydrate)?s?\\.?'], ['1079', '(?:dietary\\s*)?fiber'],
  ['2000', '(?:total\\s*)?sugars'], ['1003', 'protein'], ['1114', 'vit(?:amin)?\\.?\\s*d'], ['1106', 'vit(?:amin)?\\.?\\s*a'],
  ['1162', 'vit(?:amin)?\\.?\\s*c'], ['1087', 'calcium'], ['1089', 'iron'], ['1092', 'potassium'], ['1090', 'magnesium'],
  ['1091', 'phosphorus'], ['1095', 'zinc'], ['1057', 'caffeine'],
];
const PATTERNS = RULES.map(([id, words]) => [id, new RegExp(`\\b${words}\\s*(?:less than|<)?\\s*${NUM}${UNIT}`, 'i')] as const);
const TO_BASE: Record<string, number> = { g: 1, mg: 1e-3, mcg: 1e-6, 'µg': 1e-6, ug: 1e-6 };   // to grams
const IU: Record<string, number> = { '1114': 0.025, '1106': 0.3 };                               // IU to µg

const num = (s: string) => Number(s.replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(',', '.'));

function amount(id: string, value: number, unit: string): number | null {
  const target = BY_ID[id].unit;
  if (unit.toUpperCase() === 'IU') return IU[id] !== undefined ? value * IU[id] : null;
  const from = TO_BASE[unit.toLowerCase()], to = TO_BASE[target === 'µg' ? 'µg' : target];
  return from && to ? Math.round((value * from / to) * 1000) / 1000 : null;
}

/** Rows of a US Nutrition Facts panel to per-serving values in the app's nutrient ids. Missing rows are left out. */
export function parseLabel(lines: string[]): LabelFood {
  const out: LabelFood = { serving_size: null, serving_unit: null, serving_desc: null, nutrients: {} };
  for (const line of lines) {
    const serving = /serving\s*size\s*:?\s*(.+)/i.exec(line);
    if (serving) {
      out.serving_desc = serving[1].trim();
      const g = /(\d+(?:\.\d+)?)\s*(g|ml)\b\)?\s*$/i.exec(out.serving_desc) ?? /\((\d+(?:\.\d+)?)\s*(g|ml)\b/i.exec(out.serving_desc);
      if (g) { out.serving_size = Number(g[1]); out.serving_unit = g[2].toLowerCase() as 'g' | 'ml'; }
      continue;
    }
    const cal = /\bcalories\b\D*(\d{1,4})/i.exec(line);
    if (cal) { out.nutrients['1008'] ??= Number(cal[1]); continue; }
    if (/sugar\s*alcohol/i.test(line)) continue;
    for (const [id, re] of PATTERNS) {
      const m = re.exec(line);
      if (!m) continue;
      const v = amount(id, num(m[1]), m[2]);
      if (v !== null && Number.isFinite(v)) out.nutrients[id] ??= v;
      break;
    }
  }
  return out;
}
```

If a fixture test fails, fix the rule, not the fixture expectation. Add a synthetic test for each new rule.

**Step 4: Run them to see them pass**

Run: `npx jest src/label/parse.test.ts`
Expected: PASS, all tests.

**Step 5: Commit**

```bash
git add src/label
git commit -m "feat: read US Nutrition Facts rows into nutrient values"
```

---

### Task 4: Energy check

The same rule the food-data build uses to drop implausible rows, applied live in the editor.

**Files:**
- Modify: `src/label/parse.ts`
- Test: `src/label/parse.test.ts`

**Step 1: Write the failing test**

```ts
import { energyMismatch } from './parse';
test('calories that disagree with the macros are flagged', () => {
  expect(energyMismatch({ '1008': 210, '1003': 15, '1005': 23, '1004': 13, '1079': 11 })).toBe(false);   // 247 estimated, within 30%
  expect(energyMismatch({ '1008': 22, '1003': 15, '1005': 22, '1004': 13, '1079': 12 })).toBe(true);     // the cropped cookie photo
  expect(energyMismatch({ '1008': 22 })).toBe(false);                                                    // nothing to compare against
});
```

**Step 2: Run it to see it fail**

Run: `npx jest src/label/parse.test.ts -t energy`
Expected: FAIL, `energyMismatch is not a function`.

**Step 3: Implement**

```ts
/** food-data's plausibility rule: stated energy vs 4P + 4(C - fiber) + 2 fiber + 9F + 7 alcohol, off by more than max(30%, 25 kcal). */
export function energyMismatch(n: Nutrients): boolean {
  const kcal = n['1008'], p = n['1003'], c = n['1005'], f = n['1004'];
  if (kcal === undefined || p === undefined || c === undefined || f === undefined) return false;
  const fiber = n['1079'] ?? 0, alcohol = n['1018'] ?? 0;
  const est = 4 * p + 4 * (c - fiber) + 2 * fiber + 9 * f + 7 * alcohol;
  return Math.abs(est - kcal) > Math.max(0.3 * kcal, 25);
}
```

**Step 4: Run it to see it pass**

Run: `npx jest src/label/parse.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/label
git commit -m "feat: flag label values whose calories disagree with the macros"
```

---

### Task 5: The `label-text` native module

Copy the shape of `modules/create-document`. No unit tests: native code is checked on the Pixel 7 in Task 10.

**Files:**
- Create: `modules/label-text/expo-module.config.json`
- Create: `modules/label-text/index.ts`
- Create: `modules/label-text/android/build.gradle`
- Create: `modules/label-text/android/src/main/java/expo/modules/labeltext/LabelTextModule.kt`
- Create: `modules/label-text/ios/LabelText.podspec` (copy `modules/create-document/ios/*.podspec`, rename, add `s.frameworks = 'Vision'`)
- Create: `modules/label-text/ios/LabelTextModule.swift`

**Step 1: Config and JS wrapper**

`expo-module.config.json`:

```json
{
  "platforms": ["android", "apple"],
  "android": { "modules": ["expo.modules.labeltext.LabelTextModule"] },
  "apple": { "modules": ["LabelTextModule"] }
}
```

`index.ts`:

```ts
import { requireNativeModule } from 'expo';
import type { Fragment } from '../../src/label/parse';

/** Text lines in a photo, found on the device. `rotation` turns the image clockwise first, in degrees (0, 90, 180, 270). */
export function recognize(uri: string, rotation = 0): Promise<Fragment[]> {
  return requireNativeModule('LabelText').recognize(uri, rotation);
}
```

**Step 2: Android**

`build.gradle`: the create-document file with `labeltext` in place of `createdocument`, plus:

```gradle
dependencies {
  implementation 'com.google.mlkit:text-recognition:16.0.1'        // bundled Latin model, works offline on first use
  implementation 'androidx.exifinterface:exifinterface:1.4.1'
}
```

Check both versions on Maven Central (`https://maven.google.com/web/index.html`) and take the newest stable. The bundled artifact is chosen over `play-services-mlkit-text-recognition` because the unbundled model downloads in the background and fails until it arrives.

`LabelTextModule.kt`:

```kotlin
package expo.modules.labeltext

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LabelTextModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LabelText")

    AsyncFunction("recognize") { uri: String, rotation: Int, promise: Promise ->
      val resolver = appContext.reactContext?.contentResolver ?: throw CodedException("No context")
      val u = Uri.parse(uri)
      val exif = resolver.openInputStream(u)!!.use { ExifInterface(it).rotationDegrees }
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      resolver.openInputStream(u)!!.use { BitmapFactory.decodeStream(it, null, bounds) }
      // A 12 MP photo is ~48 MB as a bitmap; ML Kit needs nothing near that for a label.
      var sample = 1
      while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 2000) sample *= 2
      val bmp = resolver.openInputStream(u)!!.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
        ?: throw CodedException("Could not read the photo")
      val up = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, Matrix().apply { postRotate(((exif + rotation) % 360).toFloat()) }, true)
      TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).process(InputImage.fromBitmap(up, 0))
        .addOnSuccessListener { text ->
          val w = up.width.toDouble(); val h = up.height.toDouble()
          promise.resolve(text.textBlocks.flatMap { it.lines }.mapNotNull { l ->
            l.boundingBox?.let { b -> mapOf("text" to l.text, "x" to b.left / w, "y" to b.top / h, "w" to b.width() / w, "h" to b.height() / h) }
          })
        }
        .addOnFailureListener { promise.reject(CodedException(it.message ?: "Text recognition failed", it)) }
    }
  }
}
```

**Step 3: iOS**

`LabelTextModule.swift`:

```swift
import ExpoModulesCore
import ImageIO
import Vision

public class LabelTextModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LabelText")

    AsyncFunction("recognize") { (uri: URL, rotation: Int, promise: Promise) in
      guard let src = CGImageSourceCreateWithURL(uri as CFURL, nil), let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
        return promise.reject("E_IMAGE", "Could not read the photo")
      }
      let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any]
      let exifDeg: [UInt32: Int] = [1: 0, 6: 90, 3: 180, 8: 270]
      let deg = ((exifDeg[props?[kCGImagePropertyOrientation] as? UInt32 ?? 1] ?? 0) + rotation) % 360
      let orientation: CGImagePropertyOrientation = [0: .up, 90: .right, 180: .down, 270: .left][deg] ?? .up
      let req = VNRecognizeTextRequest { req, err in
        if let err { return promise.reject("E_OCR", err.localizedDescription) }
        promise.resolve((req.results as? [VNRecognizedTextObservation] ?? []).compactMap { o -> [String: Any]? in
          guard let t = o.topCandidates(1).first?.string else { return nil }
          let b = o.boundingBox   // normalized, origin bottom-left, in the oriented image
          return ["text": t, "x": b.minX, "y": 1 - b.maxY, "w": b.width, "h": b.height]
        })
      }
      req.recognitionLevel = .accurate
      req.usesLanguageCorrection = false   // "Og" must not become "Of"; the parser fixes digits itself
      DispatchQueue.global(qos: .userInitiated).async {
        do { try VNImageRequestHandler(cgImage: img, orientation: orientation, options: [:]).perform([req]) }
        catch { promise.reject("E_OCR", error.localizedDescription) }
      }
    }
  }
}
```

**Step 4: Check it compiles**

Run: `npm run typecheck`
Expected: no errors.

Run (Android, recipe in the Pixel 7 memory): `ANDROID_HOME=~/Library/Android/sdk CI=1 npx expo prebuild --platform android --clean --no-install && cd android && ./gradlew --stop; ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`
Expected: `BUILD SUCCESSFUL`. Note the APK size against the previous build; the bundled model should add roughly 4 MB per ABI.

iOS compiles in the iOS milestone; mark its device check as pending in the commit message.

**Step 5: Commit**

```bash
git add modules/label-text
git commit -m "feat: on-device text recognition module (ML Kit, Apple Vision)"
```

---

### Task 6: Read a label photo, trying rotations

People photograph labels sideways (see the 2026-09-28 photos in the brainstorm). Try upright first, then the two quarter turns, and keep whichever reads the most values.

**Files:**
- Create: `src/label/read.ts`
- Test: `src/label/read.test.ts`

**Step 1: Write the failing test**

```ts
jest.mock('../../modules/label-text', () => ({ recognize: jest.fn() }));
import { recognize } from '../../modules/label-text';
import { readLabel } from './read';
const line = (text: string, y: number) => ({ text, x: 0.1, y, w: 0.5, h: 0.03 });
const upright = [line('Calories 210', 0.1), line('Total Fat 13g', 0.2), line('Protein 15g', 0.3), line('Sodium 220mg', 0.4)];

test('an upright label reads on the first try', async () => {
  (recognize as jest.Mock).mockResolvedValueOnce(upright);
  expect((await readLabel('file:///x.jpg'))?.nutrients).toMatchObject({ '1008': 210, '1003': 15 });
  expect(recognize).toHaveBeenCalledTimes(1);
});
test('a sideways label is retried turned', async () => {
  (recognize as jest.Mock).mockReset().mockResolvedValueOnce([line('lelnoN', 0.1)]).mockResolvedValueOnce(upright);
  expect((await readLabel('file:///x.jpg'))?.nutrients['1004']).toBe(13);
  expect(recognize).toHaveBeenLastCalledWith('file:///x.jpg', 90);
});
test('no values in any orientation is null', async () => {
  (recognize as jest.Mock).mockReset().mockResolvedValue([line('a photo of a cat', 0.1)]);
  expect(await readLabel('file:///x.jpg')).toBeNull();
});
```

**Step 2: Run it to see it fail**

Run: `npx jest src/label/read.test.ts`
Expected: FAIL, `Cannot find module './read'`.

**Step 3: Implement**

```ts
import { recognize } from '../../modules/label-text';
import { parseLabel, rows, type LabelFood } from './parse';

const count = (f: LabelFood) => Object.keys(f.nutrients).length;

/** Per-serving values from a label photo, or null if nothing on it reads as a nutrition label. */
export async function readLabel(uri: string): Promise<LabelFood | null> {
  let best: LabelFood | null = null;
  for (const rotation of [0, 90, 270]) {
    const f = parseLabel(rows(await recognize(uri, rotation)));
    if (!best || count(f) > count(best)) best = f;
    if (count(f) >= 4) break;   // a real label has at least calories and three macros
  }
  return best && count(best) > 0 ? best : null;
}
```

**Step 4: Run it to see it pass**

Run: `npx jest src/label/read.test.ts`
Expected: PASS, 3 tests.

**Step 5: Commit**

```bash
git add src/label
git commit -m "feat: read a nutrition label photo in any quarter-turn"
```

---

### Task 7: Label camera screen

**Files:**
- Create: `app/label.tsx`

Match the Scan screen's look (`app/(tabs)/scan.tsx`): full-bleed camera, Glass pill on top, Glass sheet at the bottom. Read `docs/design/design-system.md` before styling.

**Step 1: Implement**

```tsx
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { readLabel } from '../src/label/read';
import { Btn, Glass, Txt, useInsets } from '../src/ui/kit';
import { color, radius } from '../src/ui/theme';

export default function LabelCamera() {
  const router = useRouter();
  const insets = useInsets();
  const p = useLocalSearchParams<{ barcode?: string; day?: string; meal?: string }>();
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [state, setState] = useState<'aim' | 'reading' | 'none'>('aim');
  useEffect(() => { if (perm && !perm.granted) requestPerm(); }, [perm?.granted]);

  const manual = () => router.replace({ pathname: '/custom/[id]', params: { id: 'new', barcode: p.barcode, day: p.day, meal: p.meal } });
  const snap = async () => {
    const pic = await cam.current?.takePictureAsync({ quality: 0.8 }).catch(() => null);
    if (!pic) return;
    setState('reading');
    const food = await readLabel(pic.uri).catch(() => null);
    if (!food) return setState('none');
    router.replace({ pathname: '/custom/[id]', params: {
      id: 'new', barcode: p.barcode, day: p.day, meal: p.meal, basis: 'serving', photo: pic.uri,
      prefill: JSON.stringify({ name: '', brand: null, barcode: p.barcode ?? null, ...food }),
    } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.charcoal }}>
      {perm?.granted && <CameraView ref={cam} style={StyleSheet.absoluteFill} />}
      <Glass style={{ position: 'absolute', top: insets.top + 12, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill }}>
        <Txt style={{ fontWeight: '600' }}>{state === 'reading' ? 'Reading the label…' : 'Fit the whole Nutrition Facts panel in view'}</Txt>
      </Glass>
      <Glass style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 12, padding: 16, gap: 10 }}>
        {state === 'none' && <Txt v="headline">Couldn't read a label in that photo. Try again closer, without glare.</Txt>}
        <Btn kind="primary" title="Take photo" onPress={snap} disabled={state === 'reading'} />
        <Btn kind="plain" title="Enter it by hand" onPress={manual} />
      </Glass>
    </View>
  );
}
```

Check the prop names against `src/ui/kit.tsx` (`Btn` `disabled`, `Txt` variants) and fix any that differ.

**Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

**Step 3: Commit**

```bash
git add app/label.tsx
git commit -m "feat: nutrition label camera screen"
```

---

### Task 8: Editor and food detail take the label result

**Files:**
- Modify: `app/custom/[id].tsx`
- Modify: `app/food/[ref].tsx`

**Step 1: Editor**

In `app/custom/[id].tsx`:

1. Add `basis?: string; photo?: string` to the `useLocalSearchParams` type.
2. Start in per-serving mode when asked: `const [perServing, setPerServing] = useState(p.basis === 'serving');`
3. Under the Nutrition section's chips, a live warning built from the values as typed:

   ```tsx
   const typed = Object.fromEntries(Object.entries(vals).filter(([, v]) => v.trim() && Number.isFinite(Number(v.replace(',', '.')))).map(([k, v]) => [k, Number(v.replace(',', '.'))]));
   // ...
   {energyMismatch(typed) && <Txt v="error">Calories don't match the protein, carbs and fat. Check calories against the label.</Txt>}
   ```

   This helps hand entry too, so it is not limited to label reads.
4. When `p.photo` is set, show `<Txt v="muted">Read from your label photo. Check each value against the package, and add a name.</Txt>` at the top of the Food section.
5. For a new food, above Save: `<Btn kind="tinted" title="Read from nutrition label" onPress={() => router.replace({ pathname: '/label', params: { barcode: f.barcode, day: p.day, meal: p.meal } })} />`, shown only when `isNew && !p.photo`.
6. In `save`, pass the photo on: add `photo: p.photo` to the `router.replace` params.

**Step 2: Food detail**

In `app/food/[ref].tsx`, add `photo?: string` to the params type and start with it: `useState<string | null>(p.photo ?? null)`. The existing Contribute flow then shows "Photo added." and uploads it with the values.

**Step 3: Typecheck and tests**

Run: `npm run typecheck && npx jest`
Expected: no type errors, all tests pass.

**Step 4: Commit**

```bash
git add app/custom app/food
git commit -m "feat: editor opens label reads per serving, warns on bad calories, carries the photo to Contribute"
```

---

### Task 9: Scan miss goes straight to the label, and docs

**Files:**
- Modify: `app/(tabs)/scan.tsx`
- Modify: `docs/privacy.md`, `README.md`, `docs/plans/2026-09-15-calorie-tracker-design.md`

**Step 1: Scan miss sheet**

Replace the "Create custom food" button with two:

```tsx
<Btn kind={miss.off === 'ask' ? 'tinted' : 'primary'} title="Read the nutrition label" onPress={() => { setMiss(null); router.push({ pathname: '/label', params: { barcode: miss.gtin, day, meal } }); }} />
<Btn kind="plain" title="Enter it by hand" onPress={() => { setMiss(null); router.push({ pathname: '/custom/[id]', params: { id: 'new', barcode: miss.gtin, day, meal } }); }} />
```

**Step 2: Docs**

- `docs/privacy.md`: a bullet for the label reader. The photo and its text stay on the phone unless the user taps Contribute. On Android, Google's ML Kit sends Google usage metrics; quote the categories from <https://developers.google.com/ml-kit/android-data-disclosure>.
- `README.md`: in "Contribute food data", one sentence that a scan miss can read the label from a photo.
- Design doc: under Screens, Scan, describe the label path; under network traffic, add ML Kit's metrics.

**Step 3: Commit**

```bash
git add app docs README.md
git commit -m "feat: scan misses offer to read the nutrition label"
```

---

### Task 10: Device check on the Pixel 7

Needs the maintainer's phone. Build with the Pixel 7 memory's recipe and `adb install -r`.

1. Scan the Quest cookie with the lookup turned off in Settings. Tap "Read the nutrition label" and photograph the label sideways, as in the 2026-09-28 photos. Expected: the editor opens per serving with 58 g, 210 kcal, 13 g fat, 23 g carbs, 15 g protein and the rest, and no calorie warning.
2. Photograph it again with the calorie number half out of frame. Expected: the calorie warning shows.
3. Photograph a plain wall. Expected: "Couldn't read a label", and "Enter it by hand" opens an empty editor with the barcode.
4. Type a name, save, and open Contribute on the food. Expected: "Photo added." shows without taking another photo.
5. Turn airplane mode on and repeat step 1. Expected: it still reads, because the model is on the phone.

Record anything that misreads as a new fixture (save the ML Kit output with a temporary `console.log(JSON.stringify(...))` in `readLabel`, read with `adb logcat`) and a parser test before fixing it.

iOS: same five checks in the iOS milestone.

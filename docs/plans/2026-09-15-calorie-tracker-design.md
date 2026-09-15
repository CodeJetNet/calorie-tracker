# Free Calorie Tracker: Design

Date: 2026-09-15
Status: approved in brainstorm, ready for implementation planning

## Goals

- Replace MyFitnessPal and Cronometer for two real users first, then anyone.
- Free as in beer: no ads, no accounts, no servers, no recurring cost to users or maintainer.
- User data never leaves the device except to places the user explicitly chooses.
- The public can add and correct food data through GitHub pull requests.
- Coach sharing that feels like Cronometer's professional sharing, without a server.

## Non-goals for v1

- iOS release. The design keeps the door open. Shipping iOS costs $99/year for the Apple Developer Program.
- Multi-device sync beyond "two phones, one backup folder, last write wins".
- Exercise logging UI. Burned calories come from the platform health store only.
- Full 60+ nutrient display. Storage keeps everything the source provides; the UI shows a ~30 nutrient panel.
- Matching imported foods to database foods.
- Pushing data directly to Garmin or Whoop. Neither accepts third-party nutrition writes outside the platform health store (Health Connect on Android, HealthKit on iOS).

## Constraints

- Android first, Google Play. One-time $25 developer fee.
- Open Food Facts data is ODbL: attribute in-app and publish the derived database under ODbL.
- USDA FoodData Central is public domain.
- Both repos are public. CI must deploy to Google Play without any secret committed to git.

## Architecture

Three pieces, no servers.

1. **Data repo (`food-data`).** Build script, community layer, canonical nutrient list. A scheduled GitHub Actions job downloads upstream dumps, merges the community layer, validates, builds SQLite files, and publishes them as GitHub Release assets with a manifest.
2. **App repo (`calorie-tracker`).** Expo React Native app. Offline first. Two SQLite databases on device: a read-only foods file replaced wholesale on update, and a diary file holding all user data.
3. **User's own cloud folder.** Picked once through the Android Storage Access Framework picker, where Google Drive, Dropbox, and OneDrive appear as providers. After every diary change the app writes a diary export and a self-contained HTML report there. Sharing that folder with a coach is the entire coach feature. Restore is the same picker in reverse.

Network traffic the app ever generates:
- manifest check and database download from GitHub Releases
- the on-device health store
- the user's cloud provider through the system picker
- an off-by-default Open Food Facts barcode lookup for scans that miss the local file

## Data repo

### Sources

| Source | Content | License | Format used by build |
|---|---|---|---|
| Open Food Facts | ~4.75M products worldwide, barcodes, nutrients, country tags | ODbL | Parquet on Hugging Face |
| USDA FoodData Central Branded Foods | ~2M US products with GTIN/UPC, per 100 g plus serving | Public domain | JSON or CSV zip, monthly |
| USDA SR Legacy, FNDDS, Foundation Foods | Generic foods with household portions | Public domain | CSV zip |

### Layout

```
food-data/
  build/                      build script (DuckDB; Python)
  nutrients.json              canonical nutrient list: USDA nutrient number, key, unit, display name, panel flag
  community/
    products/<gtin13>.json    additions and overrides, one file per barcode
    generic/<slug>.json       community generic foods
  schema/                     SQLite DDL, versioned
  tests/                      validation rule tests with small fixtures, smoke test of output
  .github/workflows/build.yml
```

### Build steps

Runs weekly on a schedule and on every merge to main.

1. Download the Open Food Facts Parquet and the USDA zips. Cache by ETag in the Actions cache.
2. Load into DuckDB. Normalize every row to per-100 g or per-100 ml plus serving size, serving unit, and serving description. Map nutrients to USDA nutrient numbers.
3. Precedence for the same barcode: community layer, then USDA Branded, then Open Food Facts. Keep a `source` column on every row.
4. Validate. Drop rows that fail any of: missing energy; energy above 900 kcal per 100 g; when protein, carbs, and fat are all present, `4*protein + 4*carbs + 9*fat` differs from stated energy by more than 25 percent; barcode fails GTIN checksum; empty name.
5. Emit `foods-<CC>.db` per country using Open Food Facts country tags plus USDA for US, `foods-generic.db`, and `manifest.json` shaped `{ schemaVersion, builtAt, files: [{ name, country, bytes, sha256, url }] }`.
6. Publish as a GitHub Release tagged `data-YYYYMMDD`. Fallback host if release bandwidth ever becomes a problem: Cloudflare R2 free tier.

Runner budget: GitHub Actions is free for public repos, with a 14 GB disk and a 6 hour job limit. The Parquet export is the only way the Open Food Facts data fits comfortably; the CSV is 9 GB uncompressed.

### Foods SQLite schema, v1

```sql
CREATE TABLE foods (
  id INTEGER PRIMARY KEY,
  barcode TEXT,               -- normalized GTIN-13, NULL for generic foods
  name TEXT NOT NULL,
  brand TEXT,
  source TEXT NOT NULL,       -- community | usda_branded | off | usda_sr | usda_fndds | usda_foundation
  source_id TEXT,
  serving_size REAL,          -- in serving_unit
  serving_unit TEXT,          -- g | ml
  serving_desc TEXT,          -- e.g. "1 cup (240 ml)"
  -- panel nutrients per 100 g/ml; column name is n + USDA nutrient number
  n1008 REAL,                 -- energy kcal
  n1003 REAL,                 -- protein g
  n1005 REAL,                 -- carbohydrate g
  n1004 REAL                  -- fat g
  -- ... remaining ~26 panel columns generated from nutrients.json where panel = true
);
CREATE INDEX foods_barcode ON foods(barcode);
CREATE VIRTUAL TABLE foods_fts USING fts5(name, brand, content='foods', content_rowid='id');
CREATE TABLE food_nutrients_extra (
  food_id INTEGER, nutrient INTEGER, per100 REAL, PRIMARY KEY (food_id, nutrient)
);                            -- long tail, mostly USDA generic foods
CREATE TABLE portions (food_id INTEGER, description TEXT, grams REAL);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);   -- schemaVersion, builtAt, attribution text
```

Size target for the US file: 50 to 100 MB compressed. Measure in the first build. If it is larger, drop Open Food Facts rows that carry fewer than three nutrients.

### Contribution

- Pull request adding or editing `community/products/<gtin13>.json`. CI validates the JSON against a schema and the same nutrition sanity rules; failures produce a readable message on the PR.
- In-app "Suggest to public database" opens the GitHub new-file URL in the browser, prefilled with filename and JSON content. GitHub handles the fork and pull request for the contributor. No authentication on our side.
- README points contributors to Open Food Facts as the upstream alternative. The build ingests it automatically.

## App

### Stack

Expo with a custom dev client (Health Connect rules out Expo Go), TypeScript, expo-router, expo-sqlite, expo-camera for barcodes, expo-file-system for Storage Access Framework, expo-document-picker, expo-sharing, react-native-health-connect. iOS later adds @kingstinct/react-native-healthkit. No state library: SQLite is the state, React context carries settings.

### Screens

1. **Today.** Date navigation, meal groups with entries, panel totals against goals, burned calories from the health store, remaining.
2. **Scan.** Camera. On hit, open Food detail. On miss, offer a custom food prefilled with the barcode, and the optional Open Food Facts lookup if enabled.
3. **Search.** Full-text search over the foods file plus custom foods and recipes. Recents first.
4. **Food detail.** Serving picker from portions or grams, quantity, meal group, add. Nutrient panel with a "more" expander.
5. **Custom food and recipe editor.** Name, serving, nutrients. A recipe is a list of ingredients from any source and yields N servings.
6. **Weight.** Log and simple chart.
7. **Settings.** Goals, meal groups, backup folder, health permissions, database country and update, import, export, attribution and licenses.

### Diary SQLite schema, v1

```sql
CREATE TABLE entries (
  id TEXT PRIMARY KEY,          -- uuid
  day TEXT NOT NULL,            -- YYYY-MM-DD, local
  meal TEXT NOT NULL,           -- meal group name
  name TEXT NOT NULL,
  amount REAL NOT NULL,         -- grams or ml consumed
  amount_desc TEXT,             -- "1 cup"
  nutrients TEXT NOT NULL,      -- JSON {"1008": 250, "1003": 12, ...} for the consumed amount
  food_ref TEXT,                -- "foods:<barcode or source_id>" | "custom:<id>" | "recipe:<id>" | NULL
  source TEXT NOT NULL,         -- app | cronometer | mfp
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX entries_day ON entries(day);
CREATE TABLE custom_foods (
  id TEXT PRIMARY KEY, barcode TEXT, name TEXT NOT NULL, brand TEXT,
  serving_size REAL, serving_unit TEXT, serving_desc TEXT,
  nutrients TEXT NOT NULL,      -- JSON per 100 g/ml
  created_at TEXT, updated_at TEXT
);
CREATE TABLE recipes (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, servings REAL NOT NULL,
  ingredients TEXT NOT NULL,    -- JSON [{ name, amount, nutrients, food_ref }]
  nutrients TEXT NOT NULL,      -- JSON per serving, derived
  created_at TEXT, updated_at TEXT
);
CREATE TABLE weights (day TEXT PRIMARY KEY, kg REAL NOT NULL);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);   -- goals, meal groups, backup uri, schemaVersion
```

Entries snapshot their nutrients at log time. A later foods database update never rewrites history.

### Nutrient model

- Canonical key is the USDA nutrient number as a string. `nutrients.json` is owned by the data repo; the app vendors a copy and CI fails if they drift.
- About 30 nutrients are flagged `panel: true` and shown by default. Everything else the source provides is still stored and shown behind "more".
- Daily totals are a SQL sum over `json_extract(nutrients, '$.1008')` and friends. A personal diary is a few thousand rows; no index needed.

### Foods database update

At most once a day on app foreground: fetch `manifest.json`. If `schemaVersion` is supported and the sha256 of the chosen country file differs from the installed one, download to a temp file, verify the hash, close the connection, rename over the old file, reopen. Wi-Fi only by default. Country selection lives in Settings.

### Backup and coach sharing, rung 2

- Settings has "Choose backup folder", which calls the Storage Access Framework directory picker and persists the granted URI.
- After any diary write: debounce five seconds, then write `diary.json` (full export with `schemaVersion` inside) and `report.html` to the folder, overwriting in place so the coach always opens one current file.
- `report.html` is self-contained: the last 30 days by default, a daily totals table, per-meal detail, a macro chart in inline SVG, and the weight log. No external assets.
- Keep a weekly `diary-YYYY-MM-DD.json` snapshot, last eight retained, for recovery from accidental deletion.
- Restore: document picker, choose a `diary.json`, check `schemaVersion` is not newer than the app's, replace the diary inside one transaction.
- Coach access: the user shares the Drive, Dropbox, or OneDrive folder with the coach using the provider's own sharing. Nothing else.
- Two phones can point at the same folder. Last write wins. Nothing smarter until someone asks.

### Import

- Settings, Import, document picker, sniff the header row, pick a parser.
- Cronometer: `servings.csv` (Day, Group, Food Name, Amount, roughly 55 nutrient columns) becomes entries; `biometrics.csv` weight rows become weights. A static table maps Cronometer column names to USDA nutrient numbers.
- MyFitnessPal: the privacy "Download Your Data" export is reportedly per entry and free for all users; its layout must be confirmed from a real export before the parser is written. The premium Nutrition Summary export is per meal and becomes one entry per meal named "MyFitnessPal <meal>".
- Import runs in one transaction, dedupes on (source, day, meal, name, amount), and reports imported and skipped counts. Any parse error aborts the whole import with a row number and reason.
- Fixtures come from real exports from the two maintainers' accounts, scrubbed, stored under `fixtures/`.

### Export

Settings, Export, choose a date range, choose CSV (one row per entry, panel nutrients as columns) or the HTML report, then the system share sheet.

### Health store

One module, two platform files: `src/health/index.android.ts` and `src/health/index.ios.ts`. Two functions:

- `readActiveCalories(day): Promise<number | null>`
- `writeNutrition(entry): Promise<void>`, plus removal when an entry is deleted

Permission is requested only from Settings. Today hides burned calories when permission is absent.

### Barcode

expo-camera `onBarcodeScanned` for EAN-13, EAN-8, UPC-A, and UPC-E. Normalize to GTIN-13 (pad UPC-A, expand UPC-E). Look up in the foods file, then custom foods.

## Release and CI/CD for a public repo

- Release workflow runs only on `v*` tags pushed by maintainers. The pull request workflow runs lint, type check, and tests, and has no access to secrets. GitHub already withholds secrets from workflows triggered by fork pull requests.
- GitHub Actions encrypted secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `PLAY_SERVICE_ACCOUNT_JSON`. None of these ever appear in git.
- Enroll in Play App Signing so the keystore held in CI is only the upload key. If it leaks, it can be reset in the Play Console without losing the app identity.
- Build on the free ubuntu runner: `npx expo prebuild --platform android`, then `./gradlew bundleRelease` with the signing config read from environment variables. No Expo cloud build, whose free tier is limited.
- Upload the AAB with r0adkll/upload-google-play to the `internal` track. Promotion to production is a manual click in the Play Console.
- `versionCode` is the GitHub run number; `versionName` is the tag.
- Attach the signed APK to the GitHub Release for sideloaders.
- Privacy policy page on GitHub Pages. Play data safety form declares no data collected. Health Connect data access declared in the Play Console.

## Error handling

| Situation | Behavior |
|---|---|
| Foods download fails or hash mismatch | Keep current file, retry next day, status line in Settings |
| Manifest `schemaVersion` newer than app supports | Skip download, Settings says "update the app to get new food data" |
| Backup folder write fails | Set pending flag, small banner on Today, retry on next foreground |
| Restore file has newer schema | Refuse with a clear message |
| Import parse error | Abort transaction, show row number and reason |
| Barcode miss | Custom food prefilled with barcode; optional Open Food Facts lookup |
| Health permission denied | Hide burned calories |

## Testing

- App: Jest unit tests for nutrient scaling, GTIN normalization, the Cronometer and MyFitnessPal parsers against fixtures, report HTML generation, diary JSON round trip, and migrations. UI is checked manually on device. Add Maestro only if regressions bite.
- Data repo: validation rules against fixture rows; a smoke test that opens the produced SQLite, checks row counts, runs one full-text query, and finds one known barcode.
- Every non-trivial module leaves one runnable check behind. Trivial code gets none.

## Costs

| Item | Cost |
|---|---|
| Google Play developer account | $25 once |
| GitHub Actions, Releases, Pages for public repos | $0 |
| Cloudflare R2 fallback | $0 within free tier |
| Apple Developer Program, only if iOS ships | $99/year |

## Verify early

1. Google Drive's document provider accepts a folder grant and repeated in-place overwrites through the Storage Access Framework on real devices. Test on day one. Fallback: Dropbox or OneDrive, or a local folder that the provider's own app syncs.
2. MyFitnessPal privacy export layout. Request one now; delivery takes up to a day.
3. US foods file size after validation. Tighten filters if above 100 MB compressed.
4. Whoop on Android reading nutrition from Health Connect. Not our bug if it fails, but set expectations in the README.
5. Open Food Facts Parquet plus DuckDB fits in a GitHub Actions runner within the time limit.

## Decisions log

- Coach sharing: rung 2, a shared cloud folder with an auto-refreshed report. No server.
- Nutrients: store everything the source provides, display a ~30 panel by default. Canonical key is the USDA nutrient number.
- Exercise: read burned calories from the platform health store; no exercise logging UI.
- Contribution: community delta layer in git, not the full dataset.
- Two repos: `food-data` and `calorie-tracker`.
- Android first. iOS when someone is willing to pay Apple's yearly fee.

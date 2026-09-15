# Free Calorie Tracker: Design

Date: 2026-09-15
Status: approved in brainstorm, ready for implementation planning. Revised 2026-09-15 after plan review.

## Goals

- Replace MyFitnessPal and Cronometer for two real users first, then anyone.
- Free as in beer: no ads, no accounts, no servers, no cost to users ever. The maintainer pays the store fees.
- User data never leaves the device except to places the user explicitly chooses.
- Anyone can add or correct a food from inside the app. Contributions go to Open Food Facts, the public commons, and come back through the weekly build. No account with us.
- Coach sharing that feels like Cronometer's professional sharing, without a server.
- Ship on Google Play and the App Store. Android first because it is cheaper to iterate on, iOS right after.
- App code under the MIT license; the food database under ODbL.

## Non-goals for v1


- Multi-device sync. Restoring a backup file is the only way to move data to another phone.
- Exercise logging UI. Burned calories come from the platform health store only.
- Full 60+ nutrient display. Storage keeps everything the source provides; the UI shows a ~30 nutrient panel.
- Matching imported foods to database foods.
- Pushing data directly to Garmin or Whoop. Neither accepts third-party nutrition writes outside the platform health store (Health Connect on Android, HealthKit on iOS).

## Constraints

- Android first, then iOS. Google Play is $25 once and the Apple Developer Program $99 a year, both paid by the maintainer.
- Open Food Facts data is ODbL: attribute in-app and publish the derived database under ODbL.
- USDA FoodData Central is public domain.
- Both repos are public. CI must deploy to Google Play without any secret committed to git.
- Google Play: target the API level Play currently requires (36 as of August 2026) by following the Expo SDK default, never a pinned `targetSdkVersion`. A personal developer account must run a closed test with 12 opted-in testers for 14 continuous days before it can request production access.

## Architecture

Three pieces, no servers.

1. **Data repo (`food-data`).** Build script, curator layer, canonical nutrient list. A scheduled GitHub Actions job downloads upstream dumps, merges the curator layer, validates, builds SQLite files, and publishes them with a manifest to a free-egress CDN (Cloudflare R2 behind a custom domain), with a GitHub Release as the mirror.
2. **App repo (`calorie-tracker`).** Expo React Native app. Offline first. Two SQLite databases on device: a read-only foods file replaced wholesale on update, and a diary file holding all user data. The app ships with a starter foods file, the generic USDA foods without barcodes, so search and logging work on first launch; the full country file is a resumable download the user starts when they choose.
3. **Two files in the user's own cloud storage.** Google Drive does not offer folder access through the Storage Access Framework, so the app never asks for a folder. The user creates `report.html` and `diary.json` once each through the system create-document dialog, where Drive and OneDrive appear as providers, and the app keeps the two document URIs and overwrites them in place. Sharing the folder that holds them with a coach is the entire coach feature. Restore is the open-document dialog in reverse.

Network traffic the app ever generates:
- manifest check and database download from the CDN, falling back to the GitHub Release mirror
- the Open Food Facts write API, only when the user taps Contribute on a food
- the on-device health store
- the user's cloud provider through the two picked documents
- an Open Food Facts barcode lookup for scans that miss the local file, one tap each, or automatic when the setting is on

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
    products/<gtin13>.json    curator overrides for wrong upstream rows, one file per barcode
  schema/                     SQLite DDL, versioned
  tests/                      validation rule tests with small fixtures, smoke test of output
  .github/workflows/build.yml
```

### Build steps

Runs weekly on a schedule and on every merge to main.

1. Download the Open Food Facts Parquet and the USDA zips. Cache by ETag in the Actions cache.
2. Load into DuckDB. Normalize every row to per-100 g or per-100 ml plus serving size, serving unit, and serving description. Map nutrients to USDA nutrient numbers, including the alternate ids some sources use for the same nutrient (vitamin A 1104 IU, vitamin D 1110 IU, sugars 1063, energy 1062 kJ) with conversion factors from `nutrients.json`. Energy falls back to kJ / 4.184 in both sources when only kJ is present. USDA portion descriptions join `measure_unit.csv` so the unit name is kept.
3. Precedence for the same barcode: community layer, then USDA Branded, then Open Food Facts; within USDA Branded the newest `publication_date` wins, because every relabel gets a new fdc_id. Generic foods with the same name across Foundation, SR Legacy, and FNDDS keep one row, in that order. Keep a `source` column on every row.
4. Validate. Drop rows that fail any of: missing energy; energy above 950 kcal per 100 g, since labels round pure oils up to 929; when protein, carbs, and fat are all present, `4*protein + 4*(carbs - fiber) + 2*fiber + 9*fat + 7*alcohol` (fiber and alcohol count as 0 when absent) differs from stated energy by more than the larger of 30 percent and 25 kcal; barcode fails GTIN checksum; empty name. The fiber and alcohol terms keep beer, wine, spirits, and bran cereals in the database.
5. Emit one `foods-<CC>.zip` per country, each holding the generic USDA foods plus that country's barcoded products from Open Food Facts country tags and, for US, USDA Branded, so a user downloads one file. Also emit `foods-starter.zip`: the generic foods only, panel nutrients and portions, no long tail, under 10 MB, which the app's release build embeds so the app works before any download. `manifest.json` is shaped `{ schemaVersion, builtAt, files: [{ name, country, bytes, md5, url }] }`; `bytes` is the zip size and `md5` is of the inner `.db`, because expo-file-system computes MD5 natively and hashing 300 MB in JavaScript is not practical.
6. Publish. Primary: upload the zips to Cloudflare R2 under `builds/<tag>/`, then a GitHub Release tagged `data-YYYYMMDD` as the mirror, then `manifest.json` to the bucket root last, so it never names a file that is not there yet. Each manifest entry carries `url` (R2) and `mirror` (the release asset), both pinned to that tag and never `latest`, so a client that downloads after the next build still gets the file its manifest describes. R2 has no egress fee and its free tier holds the two newest builds; GitHub Releases would throttle at real adoption, so it is only the mirror. The workflow deletes R2 builds and releases older than the newest two. `r2.dev` is rate-limited, so the bucket sits behind a subdomain of a domain you already own.

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
CREATE INDEX foods_source ON foods(source, source_id);   -- food_ref target; id is insert order and changes every build
CREATE VIRTUAL TABLE foods_fts USING fts5(name, brand, content='foods', content_rowid='id');
CREATE TABLE food_nutrients_extra (
  food_id INTEGER, nutrient INTEGER, per100 REAL, PRIMARY KEY (food_id, nutrient)
);                            -- long tail, mostly USDA generic foods
CREATE TABLE portions (food_id INTEGER, description TEXT, grams REAL);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);   -- schemaVersion, builtAt, attribution text
```

Size target for the US file: 50 to 100 MB compressed. Measure in the first build. If it is larger, drop Open Food Facts rows that carry fewer than three nutrients, then try `detail=none` on the FTS table, which roughly halves the index, and check that prefix search and ranking still hold.

### Contribution

- In-app "Contribute to Open Food Facts" on any custom food with a barcode, and "Suggest a correction" on any database food with one. The app posts the name, brand, serving and per-100 g values to the Open Food Facts write API, optionally with a photo of the nutrition label, and shows the result. Contributions are attributed to a global app account plus a random per-device id; nothing else is sent and there is no account with us. The next weekly build ingests the change, and the user's custom food covers the gap until then.
- The curator layer `community/products/<gtin13>.json` is for maintainers only: overrides for upstream rows that are wrong and cannot be fixed upstream quickly. A pull request edits one file; CI validates the JSON against a schema and the same nutrition sanity rules. It is not the public contribution path, because non-developers do not open pull requests.
- README points anyone who wants to help to Open Food Facts, whose data the build ingests automatically.

## App

### Stack

Expo with a custom dev client (Health Connect rules out Expo Go), TypeScript, expo-router, expo-sqlite, expo-camera for barcodes, expo-file-system, expo-document-picker for restore and import, a local Expo module for the create-document dialog that makes the two backup files (the picker library is kept for the iOS folder grant), expo-sharing, react-native-health-connect on Android and @kingstinct/react-native-healthkit on iOS. No state library: SQLite is the state, React context carries settings.

### Screens

1. **Today.** Date navigation, meal groups with entries, panel totals against goals, burned calories from the health store, remaining. Tap an entry to edit its amount, meal, or day. Delete offers undo for a few seconds.
2. **Scan.** Camera. On hit, open Food detail. On miss, a one-tap Open Food Facts lookup that sends only the barcode, automatic when the setting is on; a hit is saved as a custom food and opened, so scanning works from the first launch and the result is cached in SQLite. A miss there offers a custom food prefilled with the barcode.
3. **Search.** Full-text search over the foods file plus custom foods and recipes. Recents first. Nothing runs under two characters. Generic foods rank above branded ones so "egg" finds "Egg, whole, raw" before egg noodles.
4. **Food detail.** Serving picker from portions or grams, quantity, meal group, add. Nutrient panel with a "more" expander. Opens in edit mode for an existing entry. "Contribute to Open Food Facts" on custom foods with a barcode, "Suggest a correction" on database foods with one.
5. **Custom food and recipe editor.** Name, serving, nutrients. A recipe is a list of ingredients from any source and yields N servings.
6. **Weight.** Log as a list. The chart lives in the HTML report.
7. **Settings.** Goals, meal groups, backup files, health permissions, database country and update, import, export, attribution and licenses.

### Diary SQLite schema, v1

```sql
CREATE TABLE entries (
  id TEXT PRIMARY KEY,          -- uuid
  day TEXT NOT NULL,            -- YYYY-MM-DD, local
  meal TEXT NOT NULL,           -- meal group name
  name TEXT NOT NULL,
  amount REAL,                  -- grams or ml consumed; NULL for imported rows that only carry a description
  amount_desc TEXT,             -- "1 cup"
  nutrients TEXT NOT NULL,      -- JSON {"1008": 250, "1003": 12, ...} for the consumed amount
  food_ref TEXT,                -- "foods:<source>:<source_id>" | "custom:<id>" | "recipe:<id>" | NULL; never the foods rowid
  source TEXT NOT NULL,         -- app | cronometer | mfp
  health_id TEXT,               -- Health Connect record id, so deleting the entry deletes the record
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

- Canonical key is the USDA nutrient number as a string. `nutrients.json` is owned by the data repo; the app vendors a copy and CI fails if they drift. Each entry also carries the alternate source ids with factors, and a default daily target for one adult.
- Goals: energy and macros are set by the user. Every other panel nutrient defaults to the target in `nutrients.json`, overridable per nutrient in Settings, and the panel shows percent of target. This is the Cronometer feature worth keeping.
- About 30 nutrients are flagged `panel: true` and shown by default. Everything else the source provides is still stored and shown behind "more".
- Daily totals are summed in TypeScript from the day's entries, which the screen already loads.

### Foods database update

First launch copies the bundled starter file into place, so the app is never without a foods database. Settings shows "Starter database: generic foods only" with the full file's size and a Download button; Today carries a one-line reminder until the full file is installed. The download resumes where it left off after an interruption or a restart, which is what people on bad networks need.

On app foreground, when the last check is older than 20 hours plus a random delay of up to 8 hours, fetch `manifest.json` from the CDN, or from the GitHub mirror if that fails. The jitter spreads a weekly build's downloads across a day instead of one Monday-morning spike. If `schemaVersion` is supported and the `md5` of the chosen country file differs from the installed one, download the zip from `url`, or from `mirror` if that fails, unzip, verify the MD5, close the connection, move over the old file, reopen. Wi-Fi only by default. Country selection lives in Settings.

The foods file is excluded from Android Auto Backup through backup rules. Auto Backup stops entirely above 25 MB, so without the exclusion the diary would get no free device-to-device restore either.

### Backup and coach sharing, rung 2

- Settings has "Set up backup", which opens the system create-document dialog twice, once for `report.html` and once for `diary.json`. The user picks the provider and folder inside that dialog. The app persists the two document URIs and takes persistable permission on them. Google Drive supports this; it does not support folder grants, which is why there is no folder picker.
- expo-file-system exposes only the folder-grant API and the picker library's save call never takes a persistable grant, which dies at the next reboot, so the create-document call is a forty-line local Expo module (`modules/create-document`) that launches `ACTION_CREATE_DOCUMENT` and calls `takePersistableUriPermission` on the result.
- On iOS the Files app offers iCloud Drive, Google Drive and OneDrive, and its file providers do support folder grants through a security-scoped bookmark, so the iOS build asks for a folder once and writes the same two files into it. Its own spike, before the iOS milestone, confirms the grant survives a restart; the fallback is the Android two-file shape.
- After any diary write: debounce five seconds, then overwrite `report.html` in place so the coach always opens one current file. `diary.json` (full export with `schemaVersion` inside) is overwritten when the app goes to the background, which on a phone is every time the screen locks, and on the next launch if that write was missed. A diary with years of imported history is tens of megabytes and must not be uploaded on every entry.
- `report.html` is self-contained: the last 30 days by default, a daily totals table, per-meal detail, a macro chart and a weight chart in inline SVG. No external assets.
- No snapshots. Drive and OneDrive keep prior versions of a file for 30 days, which covers recovery from a bad write.
- Restore: open-document dialog, choose a `diary.json`, check `schemaVersion` is not newer than the app's, replace the diary inside one transaction.
- Coach access: the user shares the folder holding the two files with the coach using the provider's own sharing. Nothing else.
- One phone per pair of files. A second phone sets up its own pair; moving data between phones is a restore.

### Import

- Settings, Import, document picker, sniff the header row, pick a parser.
- Cronometer: `servings.csv` (Day, Group, Food Name, Amount, roughly 55 nutrient columns) becomes entries; `biometrics.csv` weight rows become weights. A static table maps Cronometer column names to USDA nutrient numbers.
- MyFitnessPal: the privacy "Download Your Data" export is reportedly per entry and free for all users; its layout must be confirmed from a real export before the parser is written. The premium Nutrition Summary export is per meal and becomes one entry per meal named "MyFitnessPal <meal>".
- Import runs in one transaction, gives each row a deterministic id from (day, meal, name, amount) plus an occurrence counter, never from nutrient values, which Cronometer recomputes between exports, so a re-import skips what is already there, and reports imported and skipped counts. Any parse error aborts the whole import with a row number and reason.
- Fixtures are synthesized rows in the exact header layout of the real exports, stored under `fixtures/`. The real exports stay in `fixtures/raw/`, which is gitignored, because both repos are public.

### Export

Settings, Export, choose a date range, choose CSV (one row per entry, panel nutrients as columns) or the HTML report, then the system share sheet.

### Health store

One module, two platform files: `src/health/index.android.ts` and `src/health/index.ios.ts`. Two functions:

- `readActiveCalories(day): Promise<number | null>`
- `writeNutrition(entry): Promise<string | null>`, returning the record id kept in `entries.health_id`; the record is deleted when the entry is deleted and rewritten when it is edited

Permission is requested only from Settings. Today hides burned calories when permission is absent. On iOS a logged entry becomes one HealthKit food correlation holding a sample per nutrient, so Apple Health and the apps that read it see one meal item.

### Barcode

expo-camera `onBarcodeScanned` for EAN-13, EAN-8, UPC-A, and UPC-E. Normalize to GTIN-13 (pad UPC-A, expand UPC-E). Look up in the foods file, then custom foods.

## Release and CI/CD for a public repo

- Release workflow runs only on `v*` tags pushed by maintainers. The pull request workflow runs lint, type check, and tests, and has no access to secrets. GitHub already withholds secrets from workflows triggered by fork pull requests.
- GitHub Actions encrypted secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `PLAY_SERVICE_ACCOUNT_JSON`, and `OFF_APP_PASSWORD`, the password of the app's global Open Food Facts account, baked into release builds only; local builds may point at the Open Food Facts staging server with a staging account the developer creates once in a browser, since `off`/`off` is only that server's HTTP gate, and with no password at all the Contribute button is hidden. None of these ever appear in git. The data repo holds `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`; its build workflow runs on schedule and on pushes to main, never on pull requests.
- Enroll in Play App Signing so the keystore held in CI is only the upload key. If it leaks, it can be reset in the Play Console without losing the app identity.
- Build on the free ubuntu runner: `npx expo prebuild --platform android`, then `./gradlew bundleRelease` with the signing config read from environment variables. No Expo cloud build, whose free tier is limited.
- Upload the AAB with r0adkll/upload-google-play to the `internal` track. Promotion to production is a manual click in the Play Console.
- `versionCode` is the GitHub run number plus 100, so it clears the manually uploaded first build; `versionName` is the tag.
- Attach the signed APK to the GitHub Release for sideloaders.
- iOS builds on the macOS runner, also free for public repos: `npx expo prebuild --platform ios`, `xcodebuild archive` with a distribution certificate and provisioning profile installed from secrets into a throwaway keychain, then upload to TestFlight with an App Store Connect API key. Promotion to the App Store is a manual click. Secrets: `IOS_CERT_P12_BASE64`, `IOS_CERT_PASSWORD`, `IOS_PROFILE_BASE64`, `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64`.
- App Store listing: App Privacy answers "Data Not Collected", the HealthKit usage strings explain the read of active energy and the write of nutrition, and the review notes say the app works without an account.
- Privacy policy page on GitHub Pages. Play data safety form declares no data collected. Health Connect data access declared in the Play Console.
- Production access: start the closed test with 12 testers as soon as the first internal build exists, since the 14-day clock only runs while all 12 stay opted in. The APK on the GitHub Release serves sideloaders in the meantime.
- Target SDK follows the Expo SDK default. Nothing in `expo-build-properties` pins it.

## Error handling

| Situation | Behavior |
|---|---|
| Foods download fails | Try the mirror once, else keep current file, retry next day, status line in Settings |
| Foods file fails its checksum | Keep current file, show the error; URLs are pinned per build, so a mismatch is a corrupt transfer and a retry is the fix |
| Manifest `schemaVersion` newer than app supports | Skip download, Settings says "update the app to get new food data" |
| Backup file write fails or its URI is revoked | Set pending flag, small banner on Today, retry on next foreground; Settings offers "Set up backup" again |
| Restore file has newer schema | Refuse with a clear message |
| Import parse error | Abort transaction, show row number and reason |
| Barcode miss | Custom food prefilled with barcode; optional Open Food Facts lookup |
| Open Food Facts contribution fails | Keep the custom food, show the returned message, the button stays for a retry |
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
| Cloudflare R2 as the food CDN | $0 within the free tier: 10 GB stored, free egress, 10M reads a month, which is about 300k daily manifest checks |
| A subdomain on a domain you already own, for the R2 custom domain | $0 |
| Apple Developer Program | $99/year, paid by the maintainer |

## Verify early

1. Google Drive's document provider accepts a create-document pick, repeated in-place overwrites, a shorter write after a longer one with no leftover bytes, and a URI that still works after the app restarts. Test on day one. Fallback: OneDrive, or export through the share sheet by hand.
2. MyFitnessPal privacy export layout. Request one now; delivery takes up to a day.
3. US foods file size after validation. Tighten filters if above 100 MB compressed.
4. Whoop on Android reading nutrition from Health Connect. Not our bug if it fails, but set expectations in the README.
5. Open Food Facts Parquet plus DuckDB fits in a GitHub Actions runner within the time limit.
6. The Open Food Facts write API on the staging server accepts a product post from the app's global account with `app_name`, `app_version` and `app_uuid`, and a nutrition photo upload. Confirm the exact field names before Task 6.1.
7. An R2 bucket behind a custom domain serves a 100 MB zip with HTTP range requests, which the resumable download needs.
8. iOS: the Files app folder picker grants long-term access to an iCloud Drive folder and the app can overwrite files inside it after a restart. This spike runs before the iOS milestone, not on day one.
9. The starter file stays under 10 MB zipped after the first build; drop portions before dropping foods if it does not.

## Decisions log

- Coach sharing: rung 2, two user-created documents in the user's cloud storage, the report auto-refreshed. No server, no folder grant, because Google Drive has none.
- Food references: `source:source_id`, never the foods rowid, which changes every build.
- Micronutrient targets: a default per nutrient in `nutrients.json`, overridable in Settings.
- Plausibility: fiber and alcohol are in the energy check so alcohol and bran survive.
- Nutrients: store everything the source provides, display a ~30 panel by default. Canonical key is the USDA nutrient number.
- Exercise: read burned calories from the platform health store; no exercise logging UI.
- Contribution: in-app to Open Food Facts, no account with us. The git delta layer is for curators only.
- Distribution: Cloudflare R2 primary because egress is free, GitHub Release as mirror, jittered daily checks, URLs pinned to the build.
- First launch: a starter foods file inside the app binary and a one-tap Open Food Facts lookup on scan misses, so nothing waits on the big download. The full file is a resumable download on request.
- Two repos: `food-data` and `calorie-tracker`.
- Android first, iOS second, both store fees paid by the maintainer. App code MIT, data ODbL.

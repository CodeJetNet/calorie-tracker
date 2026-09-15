# Calorie Tracker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a free, MIT-licensed, offline-first calorie tracker for Android and then iOS, with a public food database built from Open Food Facts and USDA data, backup to two files in the user's own cloud storage for coach sharing, and zero servers. The maintainer pays the store fees.

**Architecture:** Two public repos. `food-data` builds per-country SQLite food files with DuckDB inside GitHub Actions and publishes them to a free-egress CDN with a GitHub Release mirror. `calorie-tracker` is an Expo React Native app that ships with a starter foods file, downloads the full country file on request, keeps all user data in a local SQLite diary, and backs the diary up by overwriting two documents the user created once in their cloud storage.

**Tech Stack:** Python 3.12, DuckDB, pytest (data repo). Expo SDK latest with a custom dev client, TypeScript, expo-router, expo-sqlite, expo-camera, expo-file-system (legacy API), expo-document-picker, @react-native-documents/picker (create-document dialog for the two backup files), expo-sharing, expo-crypto, react-native-health-connect (Android), @kingstinct/react-native-healthkit (iOS), react-native-zip-archive, expo-asset, Jest with jest-expo (app). GitHub Actions for everything, including the macOS runner for iOS.

Design document: `docs/plans/2026-09-15-calorie-tracker-design.md`

---

## Conventions

- Repos live side by side: `~/projects/codejet/calorie-tracker` (this repo, the app) and `~/projects/codejet/food-data` (the data pipeline). Tasks say which repo they are in.
- Commit after every green step. Prefixes: `feat:`, `test:`, `chore:`, `ci:`, `docs:`.
- Nutrient key is the FoodData Central nutrient id as a string, e.g. `"1008"` for energy in kcal. Everywhere: build output columns `n1008`, JSON objects, TypeScript records.
- Barcode key is a GTIN-13 string. Everywhere. UPC-A gets a leading zero, EAN-8 gets five leading zeros, UPC-E is expanded first.
- Node 24, Python 3.12, Java 17.
- Tests cover pure logic only. Screens are checked by hand on a device with the checklist in each task.
- Ponytail rules: no abstraction with one implementation, no dependency for what ten lines do, no scaffolding for later.
- Tests in the app that need SQLite use Node's built-in `node:sqlite`, not a third-party binding.
- Food references are `foods:<source>:<source_id>`. The foods rowid changes every build and never leaves `src/foods/db.ts`.

## Design alignment

The design doc was revised on 2026-09-15 after review and this plan matches it. When the two disagree, fix both in the same commit.

---

## Milestone 0: Spikes

These answer the "verify early" list before real work starts. Half a day total plus waiting on emails.

### Task 0.1: Request the real exports

**Files:** none yet. Output lands in `calorie-tracker/fixtures/` in Task 4.2.

**Step 1:** On a desktop browser, log into MyFitnessPal, go to Settings, Account, and request the privacy "Download Your Data" export. Note the date requested. Delivery takes up to a day.

**Step 2:** Log into Cronometer on the web (your wife's account, with her consent). Account Settings, Export Data. Export Food & Recipe Entries and Biometrics with the range set to All Time. Save the CSVs.

**Step 3:** When both arrive, open each CSV and record the exact header row in `docs/plans/export-headers.md`. Those headers drive Tasks 4.2 and 4.3.

### Task 0.2: Open Food Facts Parquet through DuckDB

**Repo:** `food-data` (create the directory now, `git init` happens in Task 1.1).

**Step 1:** Create a venv and install DuckDB.

```bash
mkdir -p ~/projects/codejet/food-data && cd ~/projects/codejet/food-data
python3.12 -m venv .venv && . .venv/bin/activate && pip install duckdb
```

**Step 2:** Inspect the schema. The column shapes below are what the build assumes; if they differ, fix the build queries in Milestone 1 to match what you see here.

```bash
python - <<'EOF'
import duckdb
con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs;")
p = "hf://datasets/openfoodfacts/product-database/food.parquet"
print(con.sql(f"DESCRIBE SELECT code, product_name, brands, countries_tags, serving_size, serving_quantity, nutriments FROM read_parquet('{p}')"))
print(con.sql(f"SELECT count(*) FROM read_parquet('{p}') WHERE list_contains(countries_tags, 'en:united-states') AND len(nutriments) > 0"))
print(con.sql(f"SELECT count(*) FROM read_parquet('{p}') WHERE list_contains(countries_tags, 'en:united-states') AND NOT list_contains(list_transform(nutriments, x -> x.name), 'energy-kcal') AND list_contains(list_transform(nutriments, x -> x.name), 'energy-kj')"))
EOF
```

Expected: `nutriments` is a list of structs with fields including `name`, `100g`, `unit`; `product_name` is a list of structs with `lang`, `text`; `countries_tags` is a list of strings. The US count is in the hundreds of thousands. The second count is how many US rows carry only kilojoules; the build converts those instead of dropping them.

**Step 3:** Record the row count, the runtime, and any schema differences in `docs/plans/export-headers.md` under a heading "OFF Parquet shape".

### Task 0.3: Open Food Facts write API on staging

**Files:** none. Output lands in `docs/plans/export-headers.md`.

**Step 1:** Post a throwaway product to the staging server, which uses the public test login `off` / `off` for both HTTP auth and the API.

```bash
curl -s -u off:off -A 'CalorieTracker/0 (spike)' -X POST https://world.openfoodfacts.net/cgi/product_jqm2.pl \
  -d 'code=0000000000017&product_name=Spike&nutrition_data_per=100g&nutriment_energy-kcal=100&nutriment_energy-kcal_unit=kcal&nutriment_sodium=43&nutriment_sodium_unit=mg&user_id=off&password=off&app_name=CalorieTracker&app_version=0&app_uuid=spike'
```

Expected: `{"status":1,"status_verbose":"fields saved"}`, and `https://world.openfoodfacts.net/product/0000000000017` shows 100 kcal and 43 mg sodium, converted from the `_unit` fields.

**Step 2:** Upload a photo the same way against `cgi/product_image_upload.pl` with `-F imagefield=nutrition_en -F imgupload_nutrition_en=@label.jpg` plus the same `code`, `user_id`, `password` and `app_*` fields. Expected: `"status":"status ok"` and the photo on the product page.

**Step 3:** Record the exact field names that worked, and whether `µg` was accepted as a unit, under "OFF write API" in `docs/plans/export-headers.md`. Task 6.1 uses them.

---

## Milestone 1: food-data repo

### Task 1.1: Repo skeleton, nutrient list, schema

**Repo:** `food-data`

**Files:**
- Create: `requirements.txt`, `nutrients.json`, `countries.json`, `sources.json`, `schema/v1.sql`, `community/products/.gitkeep`, `community/schema.json`, `README.md`, `.gitignore`, `tests/__init__.py`

**Step 1:** Initialize and add dependencies.

```bash
cd ~/projects/codejet/food-data && git init
printf 'duckdb>=1.1\npytest>=8\njsonschema>=4\n' > requirements.txt
printf '.venv/\ncache/\nout/\n__pycache__/\n' > .gitignore
. .venv/bin/activate && pip install -r requirements.txt
```

**Step 2:** Write `nutrients.json`. `off` is the Open Food Facts nutriment name and `off_factor` converts OFF's gram values to the unit column. Open Food Facts stores mass nutrients in grams; USDA uses mg and µg for minerals and vitamins. `alt` lists other USDA nutrient ids that carry the same nutrient, with the factor into our unit; the build coalesces them, so a branded food that reports vitamin A only in IU still gets a value. `target` is the default daily target for one adult, taken from the FDA Daily Values; `null` means no target.

```json
[
 {"id":"1008","key":"energy","name":"Energy","unit":"kcal","panel":true,"off":"energy-kcal","off_factor":1,"alt":[["2048",1],["2047",1],["1062",0.239006]],"target":2000},
 {"id":"1003","key":"protein","name":"Protein","unit":"g","panel":true,"off":"proteins","off_factor":1,"target":50},
 {"id":"1005","key":"carbs","name":"Carbohydrate","unit":"g","panel":true,"off":"carbohydrates","off_factor":1,"target":275},
 {"id":"1004","key":"fat","name":"Fat","unit":"g","panel":true,"off":"fat","off_factor":1,"target":78},
 {"id":"1079","key":"fiber","name":"Fiber","unit":"g","panel":true,"off":"fiber","off_factor":1,"target":28},
 {"id":"2000","key":"sugars","name":"Sugars","unit":"g","panel":true,"off":"sugars","off_factor":1,"alt":[["1063",1]],"target":null},
 {"id":"1235","key":"added_sugars","name":"Added sugars","unit":"g","panel":true,"off":"added-sugars","off_factor":1,"target":50},
 {"id":"1258","key":"sat_fat","name":"Saturated fat","unit":"g","panel":true,"off":"saturated-fat","off_factor":1,"target":20},
 {"id":"1257","key":"trans_fat","name":"Trans fat","unit":"g","panel":true,"off":"trans-fat","off_factor":1,"target":null},
 {"id":"1292","key":"mufa","name":"Monounsaturated fat","unit":"g","panel":true,"off":"monounsaturated-fat","off_factor":1,"target":null},
 {"id":"1293","key":"pufa","name":"Polyunsaturated fat","unit":"g","panel":true,"off":"polyunsaturated-fat","off_factor":1,"target":null},
 {"id":"1253","key":"cholesterol","name":"Cholesterol","unit":"mg","panel":true,"off":"cholesterol","off_factor":1000,"target":300},
 {"id":"1093","key":"sodium","name":"Sodium","unit":"mg","panel":true,"off":"sodium","off_factor":1000,"target":2300},
 {"id":"1092","key":"potassium","name":"Potassium","unit":"mg","panel":true,"off":"potassium","off_factor":1000,"target":4700},
 {"id":"1087","key":"calcium","name":"Calcium","unit":"mg","panel":true,"off":"calcium","off_factor":1000,"target":1300},
 {"id":"1089","key":"iron","name":"Iron","unit":"mg","panel":true,"off":"iron","off_factor":1000,"target":18},
 {"id":"1090","key":"magnesium","name":"Magnesium","unit":"mg","panel":true,"off":"magnesium","off_factor":1000,"target":420},
 {"id":"1091","key":"phosphorus","name":"Phosphorus","unit":"mg","panel":true,"off":"phosphorus","off_factor":1000,"target":1250},
 {"id":"1095","key":"zinc","name":"Zinc","unit":"mg","panel":true,"off":"zinc","off_factor":1000,"target":11},
 {"id":"1106","key":"vit_a","name":"Vitamin A","unit":"µg","panel":true,"off":"vitamin-a","off_factor":1000000,"alt":[["1104",0.3]],"target":900},
 {"id":"1162","key":"vit_c","name":"Vitamin C","unit":"mg","panel":true,"off":"vitamin-c","off_factor":1000,"target":90},
 {"id":"1114","key":"vit_d","name":"Vitamin D","unit":"µg","panel":true,"off":"vitamin-d","off_factor":1000000,"alt":[["1110",0.025]],"target":20},
 {"id":"1109","key":"vit_e","name":"Vitamin E","unit":"mg","panel":true,"off":"vitamin-e","off_factor":1000,"target":15},
 {"id":"1185","key":"vit_k","name":"Vitamin K","unit":"µg","panel":true,"off":"vitamin-k","off_factor":1000000,"target":120},
 {"id":"1165","key":"thiamin","name":"Thiamin (B1)","unit":"mg","panel":true,"off":"vitamin-b1","off_factor":1000,"target":1.2},
 {"id":"1166","key":"riboflavin","name":"Riboflavin (B2)","unit":"mg","panel":true,"off":"vitamin-b2","off_factor":1000,"target":1.3},
 {"id":"1167","key":"niacin","name":"Niacin (B3)","unit":"mg","panel":true,"off":"vitamin-pp","off_factor":1000,"target":16},
 {"id":"1175","key":"vit_b6","name":"Vitamin B6","unit":"mg","panel":true,"off":"vitamin-b6","off_factor":1000,"target":1.7},
 {"id":"1177","key":"folate","name":"Folate","unit":"µg","panel":true,"off":"vitamin-b9","off_factor":1000000,"target":400},
 {"id":"1178","key":"vit_b12","name":"Vitamin B12","unit":"µg","panel":true,"off":"vitamin-b12","off_factor":1000000,"target":2.4},
 {"id":"1057","key":"caffeine","name":"Caffeine","unit":"mg","panel":true,"off":"caffeine","off_factor":1000,"target":null},
 {"id":"1018","key":"alcohol","name":"Alcohol","unit":"g","panel":true,"off":"alcohol","off_factor":1,"target":null},
 {"id":"1051","key":"water","name":"Water","unit":"g","panel":false,"off":null,"off_factor":1,"target":null}
]
```

**Step 3:** Write `countries.json` (country code to Open Food Facts tag) and `sources.json` (USDA download URLs; update by hand when USDA publishes, about twice a year; check the download page for current filenames).

```json
{"US":"en:united-states","CA":"en:canada","GB":"en:united-kingdom","AU":"en:australia","FR":"en:france","DE":"en:germany"}
```

```json
{
  "usda_branded": "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_csv_2025-12.zip",
  "usda_sr": "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip",
  "usda_fndds": "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_csv_2024-10-31.zip",
  "usda_foundation": "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2025-12.zip"
}
```

Verify each URL with `curl -sI <url> | head -1` and fix filenames until all return `200`.

**Step 4:** Write `schema/v1.sql`. The panel columns are generated by the build from `nutrients.json`, so this file holds everything except them and the build splices them in at the marker.

```sql
CREATE TABLE foods (
  id INTEGER PRIMARY KEY,
  barcode TEXT,
  name TEXT NOT NULL,
  brand TEXT,
  source TEXT NOT NULL,
  source_id TEXT,
  serving_size REAL,
  serving_unit TEXT,
  serving_desc TEXT
  -- PANEL_COLUMNS
);
CREATE INDEX foods_barcode ON foods(barcode);
CREATE INDEX foods_source ON foods(source, source_id);   -- food_ref target; id is insert order and changes every build
CREATE VIRTUAL TABLE foods_fts USING fts5(name, brand, content='foods', content_rowid='id');
CREATE TABLE food_nutrients_extra (
  food_id INTEGER NOT NULL, nutrient INTEGER NOT NULL, per100 REAL NOT NULL,
  PRIMARY KEY (food_id, nutrient)
);
CREATE TABLE portions (food_id INTEGER NOT NULL, description TEXT NOT NULL, grams REAL NOT NULL);
CREATE INDEX portions_food ON portions(food_id);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```

**Step 5:** Write `community/schema.json` (JSON Schema for one community product file).

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["barcode", "name", "nutrients"],
  "additionalProperties": false,
  "properties": {
    "barcode": {"type": "string", "pattern": "^[0-9]{13}$"},
    "name": {"type": "string", "minLength": 1},
    "brand": {"type": "string"},
    "serving_size": {"type": "number", "exclusiveMinimum": 0},
    "serving_unit": {"enum": ["g", "ml"]},
    "serving_desc": {"type": "string"},
    "countries": {"type": "array", "items": {"type": "string", "pattern": "^[A-Z]{2}$"}},
    "nutrients": {
      "type": "object",
      "description": "per 100 g or 100 ml, keyed by FDC nutrient id",
      "patternProperties": {"^[0-9]{4}$": {"type": "number", "minimum": 0}},
      "additionalProperties": false
    },
    "note": {"type": "string"}
  }
}
```

**Step 6:** Write a short `README.md`: what the repo is, the two upstream sources with licenses, that the way to contribute a food is Open Food Facts (from the app, or on their site), and that `community/` is a curator layer for maintainers to override wrong upstream rows (one JSON per barcode, per 100 g, nutrient ids from `nutrients.json`). State that the output database is ODbL and where it is served from.

**Step 7:** Commit.

```bash
git add -A && git commit -m "chore: food-data skeleton, nutrient list, schema, community JSON schema"
```

### Task 1.2: GTIN normalization

**Repo:** `food-data`
**Files:** Create `gtin.py`, `tests/test_gtin.py`

**Step 1:** Write the failing tests.

```python
# tests/test_gtin.py
from gtin import normalize, valid, expand_upc_e

def test_ean13_passthrough():
    assert normalize("3017620422003") == "3017620422003"

def test_upc_a_gets_leading_zero():
    assert normalize("012345678905") == "0012345678905"

def test_ean8_padded():
    assert normalize("96385074") == "0000096385074"

def test_gtin14_with_leading_zero_trimmed():
    assert normalize("03017620422003") == "3017620422003"

def test_bad_checksum_rejected():
    assert normalize("3017620422004") is None

def test_garbage_rejected():
    assert normalize("abc") is None
    assert normalize("") is None

def test_upc_e_expands():
    # the textbook example: UPC-E 04252614 is UPC-A 042100005264
    assert expand_upc_e("04252614") == "042100005264"
    assert normalize("04252614", symbology="upc_e") == "0042100005264"

def test_valid():
    assert valid("3017620422003")
    assert not valid("3017620422000")
```

**Step 2:** Run to verify failure.

```bash
pytest tests/test_gtin.py -q
```
Expected: `ModuleNotFoundError: No module named 'gtin'`

**Step 3:** Implement.

```python
# gtin.py
"""GTIN-13 normalization. Every barcode in the database is a 13-digit string."""

def valid(d: str) -> bool:
    if len(d) != 13 or not d.isdigit():
        return False
    s = sum(int(c) * (3 if i % 2 else 1) for i, c in enumerate(d[:12]))
    return (10 - s % 10) % 10 == int(d[12])

def expand_upc_e(d: str) -> str:
    """8-digit UPC-E (number system + 6 digits + check) to 12-digit UPC-A."""
    n, x, c = d[0], d[1:7], d[7]
    a, b, cc, dd, e, f = x
    if f in "012":
        body = f"{a}{b}{f}0000{cc}{dd}{e}"
    elif f == "3":
        body = f"{a}{b}{cc}00000{dd}{e}"
    elif f == "4":
        body = f"{a}{b}{cc}{dd}00000{e}"
    else:
        body = f"{a}{b}{cc}{dd}{e}0000{f}"
    return n + body + c

def normalize(code: str | None, symbology: str | None = None) -> str | None:
    if not code:
        return None
    d = "".join(ch for ch in code if ch.isdigit())
    if symbology == "upc_e" and len(d) == 8:
        d = expand_upc_e(d)
    if len(d) == 14 and d[0] == "0":
        d = d[1:]
    if len(d) in (8, 12):
        d = d.rjust(13, "0")
    return d if valid(d) else None
```

**Step 4:** Run tests.

```bash
pytest tests/test_gtin.py -q
```
Expected: `8 passed`

**Step 5:** Commit.

```bash
git add gtin.py tests/test_gtin.py && git commit -m "feat: GTIN-13 normalization with UPC-E expansion"
```

### Task 1.3: Nutrition sanity rule

**Repo:** `food-data`
**Files:** Create `rules.py`, `tests/test_rules.py`

The rule is a SQL fragment because it runs inside DuckDB over millions of rows. The test runs the same fragment in an in-memory DuckDB.

**Step 1:** Write the failing test.

```python
# tests/test_rules.py
import duckdb
from rules import PLAUSIBLE

ROWS = [
    # (label, energy, protein, carbs, fat, fiber, alcohol, expected_kept)
    ("nutella", 539, 6.3, 57.5, 30.9, None, None, True),
    ("water", 0, 0, 0, 0, None, None, True),
    ("diet_soda_rounding", 1, 0, 0.2, 0, None, None, True),
    ("missing_energy", None, 10, 10, 10, None, None, False),
    ("energy_too_high", 950, 0, 0, 100, None, None, False),
    ("macros_dont_add_up", 100, 30, 30, 30, None, None, False),     # 510 kcal implied
    ("only_energy_known", 200, None, None, None, None, None, True),
    ("negative_protein", 100, -1, 20, 2, None, None, False),
    ("macros_over_100g", 400, 60, 60, 0, None, None, False),
    ("beer", 43, 0.5, 3.6, 0, 0, 3.9, True),                        # 16 kcal from macros, 27 from alcohol
    ("wheat_bran", 216, 15.5, 64.5, 4.25, 42.8, None, True),         # fiber at 4 kcal/g would imply 358
]

def test_plausible_rule():
    con = duckdb.connect()
    con.execute("CREATE TABLE t(label VARCHAR, n1008 DOUBLE, n1003 DOUBLE, n1005 DOUBLE, n1004 DOUBLE, n1079 DOUBLE, n1018 DOUBLE)")
    con.executemany("INSERT INTO t VALUES (?, ?, ?, ?, ?, ?, ?)", [r[:7] for r in ROWS])
    kept = {r[0] for r in con.execute(f"SELECT label FROM t WHERE {PLAUSIBLE}").fetchall()}
    for label, *_, expected in ROWS:
        assert (label in kept) == expected, label
```

**Step 2:** Run to verify failure: `pytest tests/test_rules.py -q`. Expected: `ModuleNotFoundError`.

**Step 3:** Implement.

```python
# rules.py
"""Row filters applied inside DuckDB. Values are per 100 g or 100 ml."""

# Energy check: fiber counts 2 kcal/g instead of 4 and alcohol adds 7 kcal/g, so beer, wine,
# spirits and bran cereals survive. Band: the larger of 30 percent and 25 kcal.
PLAUSIBLE = """
  n1008 IS NOT NULL AND n1008 BETWEEN 0 AND 900
  AND (n1003 IS NULL OR n1003 BETWEEN 0 AND 100)
  AND (n1005 IS NULL OR n1005 BETWEEN 0 AND 100)
  AND (n1004 IS NULL OR n1004 BETWEEN 0 AND 100)
  AND coalesce(n1003, 0) + coalesce(n1005, 0) + coalesce(n1004, 0) <= 100.5
  AND (n1003 IS NULL OR n1005 IS NULL OR n1004 IS NULL
       OR abs(4 * n1003 + 4 * greatest(n1005 - coalesce(n1079, 0), 0) + 2 * coalesce(n1079, 0)
              + 9 * n1004 + 7 * coalesce(n1018, 0) - n1008) <= greatest(0.30 * n1008, 25))
"""
```

**Step 4:** Run: `pytest tests/test_rules.py -q`. Expected: `1 passed`.

**Step 5:** Commit: `git add rules.py tests/test_rules.py && git commit -m "feat: nutrition plausibility rule"`

### Task 1.4: Build script, USDA generic foods only

**Repo:** `food-data`
**Files:** Create `build.py`, `tests/test_build.py`

Start with the smallest source so the output path is proven before the big ones. The script grows in Tasks 1.5 and 1.6.

**Step 1:** Write the failing test. It runs the build against tiny fixture CSVs, not real downloads.

```python
# tests/test_build.py
import sqlite3, pathlib, csv
import build

def write_csv(path, header, rows):
    with open(path, "w", newline="") as f:
        w = csv.writer(f); w.writerow(header); w.writerows(rows)

def make_usda_fixture(root: pathlib.Path):
    d = root / "usda_sr"; d.mkdir(parents=True)
    write_csv(d / "food.csv", ["fdc_id", "data_type", "description", "food_category_id", "publication_date"],
              [[1, "sr_legacy_food", "Chicken, broilers or fryers, breast, meat only, raw", 5, "2019-04-01"],
               [2, "sr_legacy_food", "Nonsense with impossible macros", 5, "2019-04-01"]])
    write_csv(d / "food_nutrient.csv", ["id", "fdc_id", "nutrient_id", "amount"],
              [[1, 1, 1008, 120], [2, 1, 1003, 22.5], [3, 1, 1005, 0], [4, 1, 1004, 2.6], [5, 1, 1093, 45],
               [6, 1, 1210, 1.2],                       # tryptophan: not in panel, goes to extra table
               [7, 2, 1008, 100], [8, 2, 1003, 30], [9, 2, 1005, 30], [10, 2, 1004, 30]])
    write_csv(d / "food_portion.csv", ["id", "fdc_id", "seq_num", "amount", "measure_unit_id", "portion_description", "modifier", "gram_weight"],
              [[1, 1, 1, 1, 9999, "", "breast, bone and skin removed", 118],
               [2, 1, 2, 0.5, 1000, "", "chopped", 70]])
    write_csv(d / "measure_unit.csv", ["id", "name"], [[9999, "undetermined"], [1000, "cup"]])
    return d

def test_generic_build(tmp_path):
    fixture = make_usda_fixture(tmp_path)
    con = build.connect(tmp_path)
    build.load_usda_generic(con, "usda_sr", fixture)
    build.merge(con)
    out = tmp_path / "foods-US.db"
    build.write_sqlite(con, "US", out)
    db = sqlite3.connect(out)
    rows = db.execute("SELECT name, source, n1008, n1003, n1093 FROM foods").fetchall()
    assert rows == [("Chicken, broilers or fryers, breast, meat only, raw", "usda_sr", 120.0, 22.5, 45.0)]
    assert db.execute("SELECT nutrient, per100 FROM food_nutrients_extra").fetchall() == [(1210, 1.2)]
    assert db.execute("SELECT description, grams FROM portions ORDER BY grams").fetchall() == [("0.5 cup chopped", 70.0), ("1 breast, bone and skin removed", 118.0)]
    assert db.execute("SELECT count(*) FROM foods_fts WHERE foods_fts MATCH 'chicken'").fetchone()[0] == 1
    build.write_sqlite(con, None, tmp_path / "starter.db", starter=True)
    s = sqlite3.connect(tmp_path / "starter.db")
    assert s.execute("SELECT count(*) FROM foods").fetchone()[0] == 1
    assert s.execute("SELECT count(*) FROM food_nutrients_extra").fetchone()[0] == 0     # no long tail in the starter
    assert db.execute("SELECT value FROM meta WHERE key = 'schemaVersion'").fetchone()[0] == "1"
```

**Step 2:** Run: `pytest tests/test_build.py -q`. Expected: `ModuleNotFoundError: No module named 'build'`.

**Step 3:** Implement `build.py`.

```python
# build.py
"""Build per-country SQLite food databases.

  python build.py                 full build into out/
  python build.py --skip-off      USDA and community only (fast local iteration)
"""
import datetime, hashlib, json, os, pathlib, sqlite3, sys, urllib.request, zipfile
import duckdb
from gtin import normalize
from rules import PLAUSIBLE

ROOT = pathlib.Path(__file__).parent
NUTRIENTS = json.loads((ROOT / "nutrients.json").read_text())
PANEL = [n for n in NUTRIENTS if n["panel"]]
PANEL_IDS = [int(n["id"]) for n in PANEL]
ALT_IDS = [int(a[0]) for n in PANEL for a in n.get("alt", [])]   # folded into the panel column, so not long tail
COUNTRIES = json.loads((ROOT / "countries.json").read_text())
SOURCES = json.loads((ROOT / "sources.json").read_text())
SCHEMA_VERSION = 1
OFF_PARQUET = "hf://datasets/openfoodfacts/product-database/food.parquet"
# Barcoded rows: first source wins. Generic rows sharing a name: Foundation, then SR Legacy, then FNDDS.
PRECEDENCE = {"community": 0, "usda_branded": 1, "off": 2, "usda_foundation": 3, "usda_sr": 4, "usda_fndds": 5}
CHUNK = 50_000

STAGED_COLS = ["barcode", "name", "brand", "source", "source_id", "serving_size", "serving_unit",
               "serving_desc", "countries", "published"] + [f"n{i}" for i in PANEL_IDS]


def connect(workdir: pathlib.Path) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    (workdir / "tmp").mkdir(parents=True, exist_ok=True)
    con.execute(f"SET temp_directory = '{workdir / 'tmp'}'")
    con.create_function("gtin13", lambda c: normalize(c), [str], str, null_handling="special")
    con.execute("CREATE TABLE staged (" + ", ".join(
        f"{c} VARCHAR[]" if c == "countries" else f"{c} DOUBLE" if c.startswith("n") and c[1:].isdigit()
        else f"{c} DOUBLE" if c == "serving_size" else f"{c} VARCHAR" for c in STAGED_COLS) + ")")
    con.execute("CREATE TABLE extra (source VARCHAR, source_id VARCHAR, nutrient INTEGER, per100 DOUBLE)")
    con.execute("CREATE TABLE portion (source VARCHAR, source_id VARCHAR, description VARCHAR, grams DOUBLE)")
    return con


def fetch(url: str, cache: pathlib.Path) -> pathlib.Path:
    cache.mkdir(exist_ok=True)
    dest = cache / url.rsplit("/", 1)[1]
    if not dest.exists():
        print("download", url, file=sys.stderr)
        urllib.request.urlretrieve(url, dest)
    folder = dest.with_suffix("")
    if not folder.exists():
        zipfile.ZipFile(dest).extractall(folder)
    return next(folder.rglob("food.csv")).parent


def panel_pivot(id_col: str, amount_col: str) -> str:
    """One column per panel nutrient. Alternate ids from nutrients.json fill in when the primary is absent."""
    cols = []
    for n in PANEL:
        ids = [(n["id"], 1)] + [tuple(a) for a in n.get("alt", [])]
        cols.append("coalesce(" + ", ".join(f"max(CASE WHEN {id_col} = {i} THEN {amount_col} END) * {f}" for i, f in ids) + f") AS n{n['id']}")
    return ",\n".join(cols)


def load_usda_generic(con, source: str, folder: pathlib.Path) -> None:
    """SR Legacy, FNDDS, Foundation: no barcode, has portions."""
    con.execute(f"""
      CREATE OR REPLACE TEMP TABLE nut AS
      SELECT fdc_id, {panel_pivot('nutrient_id', 'amount')}
      FROM read_csv('{folder}/food_nutrient.csv', header = true)
      GROUP BY fdc_id""")
    con.execute(f"""
      INSERT INTO staged
      SELECT NULL, f.description, NULL, '{source}', CAST(f.fdc_id AS VARCHAR), 100, 'g', '100 g', NULL,
             CAST(f.publication_date AS VARCHAR), {", ".join(f"n{i}" for i in PANEL_IDS)}
      FROM read_csv('{folder}/food.csv', header = true) f JOIN nut USING (fdc_id)""")
    con.execute(f"""
      INSERT INTO extra
      SELECT '{source}', CAST(fdc_id AS VARCHAR), nutrient_id, amount
      FROM read_csv('{folder}/food_nutrient.csv', header = true)
      WHERE nutrient_id NOT IN ({", ".join(map(str, PANEL_IDS + ALT_IDS))}) AND amount IS NOT NULL AND amount > 0""")
    # measure_unit.csv holds the unit name ("cup"); 9999 means the description already says it all
    con.execute(f"""
      INSERT INTO portion
      SELECT '{source}', CAST(p.fdc_id AS VARCHAR),
             trim(concat_ws(' ', rtrim(rtrim(CAST(CAST(p.amount AS DOUBLE) AS VARCHAR), '0'), '.'),
                            CASE WHEN p.measure_unit_id <> 9999 THEN m.name END,
                            nullif(p.portion_description, ''), nullif(p.modifier, ''))),
             p.gram_weight
      FROM read_csv('{folder}/food_portion.csv', header = true) p
      LEFT JOIN read_csv('{folder}/measure_unit.csv', header = true) m ON m.id = p.measure_unit_id
      WHERE p.gram_weight > 0""")


def merge(con) -> None:
    """One row per barcode and one per generic name: source precedence, then newest publication
    (USDA Branded issues a new fdc_id on every relabel), then the plausibility rule. Result table: merged."""
    prec = " ".join(f"WHEN '{k}' THEN {v}" for k, v in PRECEDENCE.items())
    con.execute(f"""
      CREATE OR REPLACE TABLE merged AS
      SELECT {", ".join(STAGED_COLS)} FROM (
        SELECT *, row_number() OVER (
          PARTITION BY coalesce(barcode, 'name:' || lower(name))
          ORDER BY CASE source {prec} ELSE 9 END, published DESC NULLS LAST) AS rn
        FROM staged
      ) WHERE rn = 1 AND {PLAUSIBLE}""")


def schema_sql() -> str:
    cols = ",\n".join(f"  n{n['id']} REAL" for n in PANEL)
    return (ROOT / "schema" / "v1.sql").read_text().replace("  -- PANEL_COLUMNS", "," + cols[1:])


def write_sqlite(con, country: str | None, out: pathlib.Path, starter: bool = False) -> None:
    """One country file. With starter=True, the generic foods only, no barcodes and no long tail: the file the app ships with."""
    out.unlink(missing_ok=True)
    db = sqlite3.connect(out)
    db.executescript(schema_sql())
    where = "WHERE barcode IS NULL" if starter else f"WHERE barcode IS NULL OR list_contains(countries, '{country}')" if country else ""
    cols = ["barcode", "name", "brand", "source", "source_id", "serving_size", "serving_unit", "serving_desc"] + [f"n{i}" for i in PANEL_IDS]
    cur = con.execute(f"SELECT {', '.join(cols)} FROM merged {where} ORDER BY source, source_id")
    ins = f"INSERT INTO foods ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})"
    while rows := cur.fetchmany(CHUNK):
        db.executemany(ins, rows)
    if not starter:   # the long tail is most of the generic foods' bytes; the starter file does without it
        db.execute("CREATE TEMP TABLE x(source TEXT, source_id TEXT, nutrient INTEGER, per100 REAL)")
        cur = con.execute("SELECT source, source_id, nutrient, per100 FROM extra")
        while rows := cur.fetchmany(CHUNK):
            db.executemany("INSERT INTO x VALUES (?, ?, ?, ?)", rows)
        db.execute("INSERT OR IGNORE INTO food_nutrients_extra SELECT f.id, x.nutrient, x.per100 FROM x JOIN foods f ON f.source = x.source AND f.source_id = x.source_id")
    db.execute("CREATE TEMP TABLE p(source TEXT, source_id TEXT, description TEXT, grams REAL)")
    cur = con.execute("SELECT source, source_id, description, grams FROM portion")
    while rows := cur.fetchmany(CHUNK):
        db.executemany("INSERT INTO p VALUES (?, ?, ?, ?)", rows)
    db.execute("INSERT INTO portions SELECT f.id, p.description, p.grams FROM p JOIN foods f ON f.source = p.source AND f.source_id = p.source_id")
    db.execute("INSERT INTO foods_fts(foods_fts) VALUES ('rebuild')")
    db.executemany("INSERT INTO meta VALUES (?, ?)", [
        ("schemaVersion", str(SCHEMA_VERSION)),
        ("builtAt", datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds")),
        ("country", country or ""),
        ("attribution", "Open Food Facts (ODbL, https://world.openfoodfacts.org), USDA FoodData Central (public domain, https://fdc.nal.usda.gov)"),
    ])
    db.commit()
    db.execute("VACUUM")
    db.close()


def md5(path: pathlib.Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def main(argv: list[str]) -> None:
    root = ROOT
    cache, out = root / "cache", root / "out"
    out.mkdir(exist_ok=True)
    con = connect(root)
    for key in ("usda_sr", "usda_fndds", "usda_foundation"):
        load_usda_generic(con, key, fetch(SOURCES[key], cache))
    # Tasks 1.5 to 1.7 add: load_usda_branded, load_off, load_community
    merge(con)
    files = []
    for country in [*COUNTRIES, "starter"]:   # "starter" is the small generic-only file the app embeds
        db = out / f"foods-{country}.db"
        write_sqlite(con, country, db, starter=country == "starter")
        zip_path = db.with_suffix(".zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            z.write(db, db.name)
        files.append({"name": zip_path.name, "country": country, "bytes": zip_path.stat().st_size,
                      "md5": md5(db), "url": f"{cdn_url()}/{zip_path.name}", "mirror": f"{mirror_url()}/{zip_path.name}"})
        print(country, db.stat().st_size >> 20, "MB db,", zip_path.stat().st_size >> 20, "MB zip", file=sys.stderr)
    (out / "manifest.json").write_text(json.dumps({
        "schemaVersion": SCHEMA_VERSION,
        "builtAt": datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds"),
        "files": files}, indent=2))


REPO = "https://github.com/codejetnet/food-data"
TAG = os.environ.get("RELEASE_TAG", "local")


def cdn_url() -> str:
    """Cloudflare R2 behind a custom domain: free egress. Pinned to this build's tag, never `latest`."""
    return f"{os.environ.get('CDN_URL', 'https://food.codejet.net')}/builds/{TAG}"


def mirror_url() -> str:
    """The GitHub Release for the same tag. Only a fallback: release bandwidth throttles at real adoption."""
    return f"{REPO}/releases/download/{TAG}"


if __name__ == "__main__":
    main(sys.argv[1:])
```

**Step 4:** Run: `pytest tests/test_build.py -q`. Expected: `1 passed`. If DuckDB complains about the `countries` column type in `CREATE TABLE staged`, change the generated type for that column to `VARCHAR[]` explicitly (the comprehension already does; check the output of `con.sql("DESCRIBE staged")`).

**Step 5:** Run the real generic build once locally to confirm the downloads and CSV shapes match.

```bash
python -c "import build, pathlib; con = build.connect(build.ROOT); [build.load_usda_generic(con, k, build.fetch(build.SOURCES[k], build.ROOT / 'cache')) for k in ('usda_sr','usda_fndds','usda_foundation')]; build.merge(con); build.write_sqlite(con, None, pathlib.Path('out/generic.db')); print(con.sql('SELECT source, count(*) FROM merged GROUP BY 1'))"
```
Expected: three sources with counts in the thousands each, `out/generic.db` under 50 MB. If a CSV column name differs (USDA has renamed columns between releases), adjust the query and note it in the README.

**Step 6:** Commit.

```bash
git add build.py tests/test_build.py && git commit -m "feat: build USDA generic foods into per-country SQLite"
```

### Task 1.5: USDA Branded Foods

**Repo:** `food-data`
**Files:** Modify `build.py`, `tests/test_build.py`

**Step 1:** Extend the fixture and add a test.

```python
def make_branded_fixture(root):
    d = root / "usda_branded"; d.mkdir(parents=True)
    # the same GTIN twice: USDA issues a new fdc_id on every relabel, and the newest must win
    write_csv(d / "food.csv", ["fdc_id", "data_type", "description", "food_category_id", "publication_date"],
              [[10, "branded_food", "PEANUT BUTTER, CREAMY", None, "2025-12-01"],
               [11, "branded_food", "PEANUT BUTTER CREAMY (OLD LABEL)", None, "2021-03-01"]])
    write_csv(d / "branded_food.csv", ["fdc_id", "brand_owner", "brand_name", "gtin_upc", "ingredients", "serving_size", "serving_size_unit", "household_serving_fulltext"],
              [[10, "Acme Foods", "ACME", "012345678905", "PEANUTS", 32, "GRM", "2 Tbsp (32 g)"],
               [11, "Acme Foods", "ACME", "012345678905", "PEANUTS", 32, "GRM", "2 Tbsp (32 g)"]])
    write_csv(d / "food_nutrient.csv", ["id", "fdc_id", "nutrient_id", "amount"],
              [[1, 10, 1008, 588], [2, 10, 1003, 25], [3, 10, 1005, 20], [4, 10, 1004, 50],
               [5, 11, 1008, 588], [6, 11, 1003, 25], [7, 11, 1005, 20], [8, 11, 1004, 50],
               [9, 10, 1104, 300]])                      # vitamin A in IU: an alt id, lands in n1106 as 90 µg
    return d

def test_branded_build(tmp_path):
    con = build.connect(tmp_path)
    build.load_usda_branded(con, make_branded_fixture(tmp_path))
    build.merge(con)
    out = tmp_path / "foods-US.db"
    build.write_sqlite(con, "US", out)
    db = sqlite3.connect(out)
    rows = db.execute("SELECT barcode, name, brand, serving_size, serving_unit, serving_desc, n1008, n1106 FROM foods").fetchall()
    assert rows == [("0012345678905", "PEANUT BUTTER, CREAMY", "ACME", 32.0, "g", "2 Tbsp (32 g)", 588.0, 90.0)]
    # not in the CA file
    build.write_sqlite(con, "CA", tmp_path / "foods-CA.db")
    assert sqlite3.connect(tmp_path / "foods-CA.db").execute("SELECT count(*) FROM foods").fetchone()[0] == 0
    # and never in the starter, which has no barcodes
    build.write_sqlite(con, "US", tmp_path / "starter.db", starter=True)
    assert sqlite3.connect(tmp_path / "starter.db").execute("SELECT count(*) FROM foods").fetchone()[0] == 0
```

**Step 2:** Run: `pytest tests/test_build.py -q`. Expected: `AttributeError: module 'build' has no attribute 'load_usda_branded'`.

**Step 3:** Add to `build.py` after `load_usda_generic`.

```python
def load_usda_branded(con, folder: pathlib.Path) -> None:
    con.execute(f"""
      CREATE OR REPLACE TEMP TABLE nut AS
      SELECT fdc_id, {panel_pivot('nutrient_id', 'amount')}
      FROM read_csv('{folder}/food_nutrient.csv', header = true)
      GROUP BY fdc_id""")
    con.execute(f"""
      INSERT INTO staged
      SELECT gtin13(b.gtin_upc), f.description, coalesce(nullif(b.brand_name, ''), b.brand_owner), 'usda_branded',
             CAST(f.fdc_id AS VARCHAR), b.serving_size,
             CASE lower(b.serving_size_unit) WHEN 'grm' THEN 'g' WHEN 'g' THEN 'g' WHEN 'mlt' THEN 'ml' WHEN 'ml' THEN 'ml' END,
             nullif(b.household_serving_fulltext, ''), ['US'], CAST(f.publication_date AS VARCHAR),
             {", ".join(f"n{i}" for i in PANEL_IDS)}
      FROM read_csv('{folder}/food.csv', header = true) f
      JOIN read_csv('{folder}/branded_food.csv', header = true, all_varchar = false) b USING (fdc_id)
      JOIN nut USING (fdc_id)
      WHERE gtin13(b.gtin_upc) IS NOT NULL""")
```

And in `main`, after the generic loop: `load_usda_branded(con, fetch(SOURCES["usda_branded"], cache))`.

**Step 4:** Run: `pytest -q`. Expected: all pass. If `read_csv` mis-types `gtin_upc` as a number and loses leading zeros, add `types = {'gtin_upc': 'VARCHAR'}` to that `read_csv` call.

**Step 5:** Commit: `git commit -am "feat: load USDA Branded Foods with GTIN normalization"`

### Task 1.6: Open Food Facts

**Repo:** `food-data`
**Files:** Modify `build.py`, `tests/test_build.py`

This is the one query that depends on the Parquet shape you recorded in Task 0.2. Adjust field names to match.

**Step 1:** Add a test using a tiny local Parquet written by DuckDB with the same shape.

```python
def make_off_fixture(root):
    p = root / "off.parquet"
    duckdb.connect().execute(f"""
      COPY (SELECT * FROM (VALUES
        ('3017620422003', [{{'lang': 'main', 'text': 'Nutella'}}], 'Ferrero', ['en:france', 'en:united-states'], 15.0, '15 g',
         [{{'name': 'energy-kcal', '100g': 539.0}}, {{'name': 'proteins', '100g': 6.3}}, {{'name': 'carbohydrates', '100g': 57.5}},
          {{'name': 'fat', '100g': 30.9}}, {{'name': 'sodium', '100g': 0.043}}]),
        ('96385074', [{{'lang': 'main', 'text': 'Mystery snack'}}], NULL, ['en:germany'], NULL, NULL,
         [{{'name': 'energy-kj', '100g': 1674.0}}])      # kilojoules only, as many European products are
      ) t(code, product_name, brands, countries_tags, serving_quantity, serving_size, nutriments)) TO '{p}' (FORMAT PARQUET)""")
    return p

def test_off_build(tmp_path):
    import duckdb
    con = build.connect(tmp_path)
    build.load_off(con, str(make_off_fixture(tmp_path)))
    build.merge(con)
    build.write_sqlite(con, "US", tmp_path / "us.db")
    build.write_sqlite(con, "DE", tmp_path / "de.db")
    us = sqlite3.connect(tmp_path / "us.db").execute("SELECT barcode, name, brand, serving_size, n1008, n1093 FROM foods").fetchall()
    assert us == [("3017620422003", "Nutella", "Ferrero", 15.0, 539.0, 43.0)]      # sodium g -> mg
    de = sqlite3.connect(tmp_path / "de.db").execute("SELECT barcode, name, round(n1008) FROM foods").fetchall()
    assert de == [("0000096385074", "Mystery snack", 400.0)]      # 1674 kJ / 4.184

def test_precedence_prefers_usda_branded_over_off(tmp_path):
    con = build.connect(tmp_path)
    build.load_usda_branded(con, make_branded_fixture(tmp_path))
    con.execute("INSERT INTO staged (barcode, name, source, source_id, countries, n1008, n1003, n1005, n1004) VALUES ('0012345678905', 'OFF duplicate', 'off', 'x', ['US'], 500, 20, 20, 40)")
    build.merge(con)
    assert con.execute("SELECT name FROM merged").fetchall() == [("PEANUT BUTTER, CREAMY",)]
```

Add `import duckdb` at the top of the test file.

**Step 2:** Run: `pytest -q`. Expected: `AttributeError ... load_off`.

**Step 3:** Add to `build.py`.

```python
def load_off(con, parquet: str = OFF_PARQUET) -> None:
    if parquet.startswith("hf://"):
        con.execute("INSTALL httpfs; LOAD httpfs;")
    con.execute("CREATE OR REPLACE TEMP TABLE country_map(tag VARCHAR, cc VARCHAR)")
    con.executemany("INSERT INTO country_map VALUES (?, ?)", [(tag, cc) for cc, tag in COUNTRIES.items()])
    con.execute(f"""
      CREATE OR REPLACE TEMP VIEW off_raw AS
      SELECT code, product_name, brands, countries_tags, serving_quantity, serving_size, nutriments
      FROM read_parquet('{parquet}')
      WHERE len(nutriments) > 0 AND len(countries_tags) > 0""")
    con.execute("""
      CREATE OR REPLACE TEMP TABLE off_countries AS
      SELECT r.code, list(DISTINCT m.cc) AS countries
      FROM off_raw r, unnest(r.countries_tags) AS t(tag) JOIN country_map m ON m.tag = t.tag
      GROUP BY r.code""")
    def col(n):
        v = f"""max(CASE WHEN name = '{n["off"]}' THEN "100g" * {n["off_factor"]} END)"""
        if n["id"] == "1008":   # kilojoules-only products: OFF's `energy` and `energy-kj` are both kJ
            v = f"""coalesce({v}, max(CASE WHEN name IN ('energy-kj', 'energy') THEN "100g" / 4.184 END))"""
        return f"{v} AS n{n['id']}"
    off_pivot = ",\n".join(col(n) for n in PANEL if n["off"])
    missing = [f"NULL AS n{n['id']}" for n in PANEL if not n["off"]]
    con.execute(f"""
      CREATE OR REPLACE TEMP TABLE off_nut AS
      SELECT code, {off_pivot}{"," if missing else ""} {", ".join(missing)}
      FROM (SELECT code, unnest(nutriments, recursive := true) FROM off_raw)
      GROUP BY code""")
    con.execute(f"""
      INSERT INTO staged
      SELECT gtin13(r.code),
             coalesce(list_extract(list_filter(r.product_name, x -> x.lang = 'main'), 1).text, r.product_name[1].text),
             nullif(r.brands, ''), 'off', r.code, r.serving_quantity,
             CASE WHEN r.serving_quantity IS NOT NULL THEN 'g' END, nullif(r.serving_size, ''), c.countries, NULL,
             {", ".join(f"n.n{i}" for i in PANEL_IDS)}
      FROM off_raw r JOIN off_countries c USING (code) JOIN off_nut n USING (code)
      WHERE gtin13(r.code) IS NOT NULL AND coalesce(list_extract(list_filter(r.product_name, x -> x.lang = 'main'), 1).text, r.product_name[1].text) IS NOT NULL""")
```

In `main`, add `if "--skip-off" not in argv: load_off(con)` after the branded load.

**Step 4:** Run: `pytest -q`. Expected: all pass. The `unnest(..., recursive := true)` produces a column literally named `100g`; if DuckDB names it differently in your version, print `DESCRIBE` of that subquery and adjust the quoted name.

**Step 5:** Run the full build locally once. This downloads several GB and takes a while.

```bash
python build.py
ls -la out/
```
Expected: six `.zip` files and `manifest.json`. Record the US zip size. If above 100 MB, add `AND (SELECT count(*) FROM unnest(nutriments)) >= 3` to the `off_raw` view and rebuild.

**Step 6:** Commit: `git commit -am "feat: load Open Food Facts from Parquet with country split"`

### Task 1.7: Curator layer and PR validation

**Repo:** `food-data`
**Files:** Create `community.py`, `tests/test_community.py`, `community/products/3017620422003.json` (worked example), `.github/workflows/pr.yml`. Modify `build.py`.

**Step 1:** Write failing tests.

```python
# tests/test_community.py
import json, pathlib, pytest
import community, build

GOOD = {"barcode": "3017620422003", "name": "Nutella", "brand": "Ferrero", "serving_size": 15, "serving_unit": "g",
        "nutrients": {"1008": 539, "1003": 6.3, "1005": 57.5, "1004": 30.9}}

def test_validate_good(tmp_path):
    p = tmp_path / "3017620422003.json"; p.write_text(json.dumps(GOOD))
    assert community.validate_file(p) == []

def test_filename_must_match_barcode(tmp_path):
    p = tmp_path / "1234567890128.json"; p.write_text(json.dumps(GOOD))
    assert any("filename" in e for e in community.validate_file(p))

def test_bad_checksum(tmp_path):
    bad = dict(GOOD, barcode="3017620422004")
    p = tmp_path / "3017620422004.json"; p.write_text(json.dumps(bad))
    assert any("checksum" in e for e in community.validate_file(p))

def test_implausible(tmp_path):
    bad = dict(GOOD, nutrients={"1008": 100, "1003": 30, "1005": 30, "1004": 30})
    p = tmp_path / "3017620422003.json"; p.write_text(json.dumps(bad))
    assert any("plausib" in e for e in community.validate_file(p))

def test_community_overrides_everything(tmp_path):
    d = tmp_path / "products"; d.mkdir()
    (d / "3017620422003.json").write_text(json.dumps(GOOD))
    con = build.connect(tmp_path)
    con.execute("INSERT INTO staged (barcode, name, source, source_id, countries, n1008, n1003, n1005, n1004) VALUES ('3017620422003', 'Wrong name', 'off', 'x', ['US'], 539, 6.3, 57.5, 30.9)")
    build.load_community(con, d)
    build.merge(con)
    assert con.execute("SELECT name, source FROM merged").fetchall() == [("Nutella", "community")]
```

**Step 2:** Run: `pytest tests/test_community.py -q`. Expected: `ModuleNotFoundError`.

**Step 3:** Implement `community.py`.

```python
# community.py
"""Validate community product files. Used by the PR workflow and the build."""
import json, pathlib, sys
import duckdb, jsonschema
from gtin import valid
from rules import PLAUSIBLE

ROOT = pathlib.Path(__file__).parent
SCHEMA = json.loads((ROOT / "community" / "schema.json").read_text())

def validate_file(path: pathlib.Path) -> list[str]:
    errors = []
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        return [f"{path.name}: not valid JSON ({e})"]
    for e in jsonschema.Draft202012Validator(SCHEMA).iter_errors(data):
        errors.append(f"{path.name}: {e.json_path}: {e.message}")
    if errors:
        return errors
    if path.stem != data["barcode"]:
        errors.append(f"{path.name}: filename must equal barcode {data['barcode']}")
    if not valid(data["barcode"]):
        errors.append(f"{path.name}: barcode fails GTIN checksum")
    n = data["nutrients"]
    row = tuple(n.get(k) for k in ("1008", "1003", "1005", "1004", "1079", "1018"))
    con = duckdb.connect()
    con.execute("CREATE TABLE t(n1008 DOUBLE, n1003 DOUBLE, n1005 DOUBLE, n1004 DOUBLE, n1079 DOUBLE, n1018 DOUBLE)")
    con.execute("INSERT INTO t VALUES (?, ?, ?, ?, ?, ?)", row)
    if con.execute(f"SELECT count(*) FROM t WHERE {PLAUSIBLE}").fetchone()[0] == 0:
        errors.append(f"{path.name}: nutrients fail plausibility (energy per 100 g must match protein, carbs, fat, fiber and alcohol within 30%)")
    return errors

def main(paths: list[str]) -> int:
    files = [pathlib.Path(p) for p in paths] or sorted((ROOT / "community" / "products").glob("*.json"))
    errors = [e for f in files for e in validate_file(f)]
    print("\n".join(errors) or f"{len(files)} files OK")
    return 1 if errors else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
```

Add to `build.py`:

```python
def load_community(con, folder: pathlib.Path) -> None:
    for path in sorted(folder.glob("*.json")):
        d = json.loads(path.read_text())
        n = d["nutrients"]
        con.execute(f"INSERT INTO staged VALUES ({', '.join('?' * len(STAGED_COLS))})", [
            d["barcode"], d["name"], d.get("brand"), "community", path.stem, d.get("serving_size"),
            d.get("serving_unit"), d.get("serving_desc"), d.get("countries") or list(COUNTRIES), None,
            *[n.get(str(i)) for i in PANEL_IDS]])
```

In `main`: `load_community(con, ROOT / "community" / "products")` before `merge`.

**Step 4:** Add the worked example `community/products/3017620422003.json` with the `GOOD` content above plus `"note": "Example entry. Values from the label of the 400 g jar."`. Then run `pytest -q` and `python community.py`. Expected: all pass, `1 files OK`.

**Step 5:** Write `.github/workflows/pr.yml`.

```yaml
name: pr
on:
  pull_request:
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r requirements.txt
      - run: pytest -q
      - run: python community.py
```

**Step 6:** Commit: `git add -A && git commit -m "feat: community layer with schema and plausibility validation on PRs"`

### Task 1.8: Scheduled build, CDN publish and release mirror

**Repo:** `food-data`
**Files:** Create `.github/workflows/build.yml`, `tests/test_smoke.py`.

**Step 1:** Write the smoke test. It runs only when `out/foods-US.db` exists, so it is skipped in the PR workflow and runs after the build.

```python
# tests/test_smoke.py
import pathlib, sqlite3, pytest
DB = pathlib.Path(__file__).parent.parent / "out" / "foods-US.db"
pytestmark = pytest.mark.skipif(not DB.exists(), reason="no build output")

def test_us_file_is_populated():
    db = sqlite3.connect(DB)
    assert db.execute("SELECT count(*) FROM foods WHERE barcode IS NOT NULL").fetchone()[0] > 200_000
    assert db.execute("SELECT count(*) FROM foods WHERE barcode IS NULL").fetchone()[0] > 5_000
    assert db.execute("SELECT count(*) FROM foods_fts WHERE foods_fts MATCH 'chicken breast'").fetchone()[0] > 10
    assert db.execute("SELECT count(*) FROM portions").fetchone()[0] > 5_000
    assert db.execute("SELECT value FROM meta WHERE key='schemaVersion'").fetchone() == ("1",)
    assert db.execute("SELECT name FROM foods WHERE barcode = '3017620422003'").fetchone()[0].lower().startswith("nutella")
    # the plausibility rule must not drop alcohol
    assert db.execute("SELECT count(*) FROM foods WHERE name LIKE 'Alcoholic beverage, beer%'").fetchone()[0] >= 1

def test_starter_fits_in_the_app():
    assert (DB.parent / "foods-starter.zip").stat().st_size < 10 * 1024 * 1024

def test_file_size_budget():
    assert DB.with_suffix(".zip").stat().st_size < 120 * 1024 * 1024
```

**Step 2:** Create the empty public repo `codejetnet/food-data` on GitHub and push. Then the CDN, once, by hand: in the Cloudflare dashboard create an R2 bucket `food-data`, enable public access through a custom domain on a zone you already own (for example `food.codejet.net`; `r2.dev` is rate-limited and not for production), and create an R2 API token with object read and write on that bucket. Add repo secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and a repo variable `CDN_URL` set to `https://food.codejet.net`. The free tier is 10 GB stored and free egress, which is the whole point.

**Step 3:** Write `.github/workflows/build.yml`.

```yaml
name: build
on:
  schedule:
    - cron: "0 6 * * 1"        # Mondays 06:00 UTC
  push:
    branches: [main]
  workflow_dispatch:
concurrency: build
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 300
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r requirements.txt
      - uses: actions/cache@v4
        with:
          path: cache
          key: usda-${{ hashFiles('sources.json') }}
      - run: echo "RELEASE_TAG=data-$(date -u +%Y%m%d)-${{ github.run_number }}" >> "$GITHUB_ENV"
      - run: pytest -q --ignore=tests/test_smoke.py
      - run: python build.py            # manifest URLs point at builds/$RELEASE_TAG on the CDN, mirrors at the release
        env:
          CDN_URL: ${{ vars.CDN_URL }}
      - run: pytest -q tests/test_smoke.py
      # Order matters: zips to the CDN, then the mirror, then the manifest last, so the manifest never names a missing file.
      - name: Upload zips to R2
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
          R2: https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com
        run: |
          aws s3 cp out/ "s3://food-data/builds/$RELEASE_TAG/" --recursive --exclude manifest.json \
            --endpoint-url "$R2" --cache-control "public, max-age=31536000, immutable"
      - name: Mirror to a GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh release create "$RELEASE_TAG" out/*.zip out/manifest.json --latest \
            --title "Food database $RELEASE_TAG" \
            --notes "Mirror of the CDN build. Built from Open Food Facts (ODbL) and USDA FoodData Central (public domain). See manifest.json."
      - name: Publish the manifest
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
          R2: https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com
        run: aws s3 cp out/manifest.json s3://food-data/manifest.json --endpoint-url "$R2" --cache-control "public, max-age=3600"
      - name: Keep only the newest two builds on the CDN and in Releases
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
          R2: https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com
          GH_TOKEN: ${{ github.token }}
        run: |
          aws s3 ls s3://food-data/builds/ --endpoint-url "$R2" | awk '{print $2}' | sed 's#/$##' | sort -r | tail -n +3 \
            | xargs -r -I{} aws s3 rm "s3://food-data/builds/{}/" --recursive --endpoint-url "$R2"
          gh release list --limit 100 --json tagName --jq '.[].tagName' | grep '^data-' | tail -n +3 \
            | xargs -r -n1 gh release delete --yes --cleanup-tag
```

**Step 4:** Push, trigger `workflow_dispatch` from the Actions tab, watch it. Expected: a release tagged `data-...` with seven zips (six countries and the starter) and a manifest, and `https://food.codejet.net/manifest.json` returns JSON whose `url` fields point at `builds/<that tag>/` on the CDN and whose `mirror` fields point at the release. Fetch one zip `url` with `curl -r 0-999 -o /dev/null -w '%{http_code}'` and expect `206`: the resumable download needs range requests. If the runner runs out of disk, add `SET memory_limit = '10GB'` in `connect` and remove the `tmp` directory after `merge`. If it exceeds time, add the `>= 3 nutrients` filter from Task 1.6.

**Step 5:** Commit and push: `git add -A && git commit -m "ci: weekly build and GitHub Release publish" && git push`

### Task 1.9: License and attribution files

**Repo:** `food-data`
**Files:** Create `LICENSE` (ODbL 1.0 text for the database, from opendatacommons.org), `LICENSE-CODE` (MIT for the scripts). Add a "License" section to the README stating both and the attribution line used in `meta`.

Commit: `git add -A && git commit -m "docs: ODbL for data, MIT for code"`

---

## Milestone 2: App core

All tasks in this milestone are in the `calorie-tracker` repo unless stated.

### Task 2.1: Expo project, Jest, dev client

**Files:** Create the Expo project in place, `jest` config in `package.json`, `app.json` plugins, `.gitignore` additions, `src/smoke.test.ts`

**Step 1:** Create the project into this directory (the directory already holds `docs/` and `.git`).

```bash
cd ~/projects/codejet
npx create-expo-app@latest ct-tmp --template blank-typescript
rsync -a --exclude .git ct-tmp/ calorie-tracker/ && rm -rf ct-tmp
cd calorie-tracker
npx expo install expo-router expo-sqlite expo-camera expo-file-system expo-document-picker expo-sharing expo-crypto expo-linking expo-constants react-native-safe-area-context react-native-screens react-native-zip-archive react-native-health-connect expo-build-properties @react-native-documents/picker
npx expo install jest-expo jest @types/jest -- --save-dev
```

**Step 2:** Edit `package.json`: set `"main": "expo-router/entry"`, add scripts `"test": "jest"`, `"typecheck": "tsc --noEmit"`, and

```json
"jest": { "preset": "jest-expo", "testMatch": ["**/*.test.ts"] }
```

**Step 3:** Edit `app.json` `expo` section: `"scheme": "calorietracker"`, `"android": { "package": "com.codejetnet.calorietracker" }`, and plugins:

```json
"plugins": [
  "expo-router",
  "expo-sqlite",
  ["expo-camera", { "cameraPermission": "Scan food barcodes. Nothing leaves your phone." }],
  "react-native-health-connect",
  ["expo-build-properties", { "android": { "minSdkVersion": 26 } }]
]
```

`minSdkVersion` 26 is what react-native-health-connect needs. Compile and target SDK are deliberately not pinned: the Expo SDK default tracks Play's floor, which is API 36 as of August 2026, and a pin would fall behind it.

**Step 4:** Append to `.gitignore`: `/android`, `/ios`, `*.keystore`, `*.jks`, `fixtures/raw/`. Add `"resolveJsonModule": true` under `compilerOptions` in `tsconfig.json` if not already present.

**Step 5:** Prove `node:sqlite` works under Jest. Write `src/smoke.test.ts`:

```ts
import { DatabaseSync } from 'node:sqlite';
test('node:sqlite is available in tests', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE t(x)');
  db.prepare('INSERT INTO t VALUES (?)').run(1);
  expect(db.prepare('SELECT count(*) AS n FROM t').get()).toEqual({ n: 1 });
});
```

Run: `npm test`. Expected: `1 passed`. If Jest complains about the environment, add `/** @jest-environment node */` as the first line of the test file. If Node says sqlite is experimental and refuses, run with `NODE_OPTIONS=--experimental-sqlite npm test` and put that in the `test` script.

**Step 6:** Build the dev client once on a connected Android device (Android Studio and an SDK must be installed).

```bash
npx expo prebuild --platform android
npx expo run:android
```
Expected: the blank app launches on the device. Later tasks use `npx expo start --dev-client` for fast reloads.

**Step 7:** Commit: `git add -A && git commit -m "chore: Expo project with router, sqlite, camera, health connect, jest"`

### Task 2.2: Create-document spike on Google Drive

This is the go/no-go for the coach-sharing design. Do it before anything else in the app. Google Drive does not support folder grants through the Storage Access Framework, so the design never asks for a folder: the user creates each backup file once through the system create-document dialog and the app overwrites it by URI from then on.

**Files:** Temporarily modify `app/index.tsx`

**Step 1:** Replace `app/index.tsx` with a spike screen. Check the option names of `saveDocuments` against the package README first; they are the one thing here that is easy to get wrong.

```tsx
import { useEffect, useState } from 'react';
import { Button, Text, View } from 'react-native';
import * as FS from 'expo-file-system/legacy';
import { saveDocuments } from '@react-native-documents/picker';

const SAVED = `${FS.documentDirectory}spike-uri.txt`;   // survives a restart, unlike React state

export default function Spike() {
  const [log, setLog] = useState<string[]>([]);
  const [uri, setUri] = useState<string | null>(null);
  const add = (s: string) => setLog(l => [...l, s]);
  useEffect(() => { FS.readAsStringAsync(SAVED).then(u => { setUri(u); add('loaded saved uri'); }).catch(() => {}); }, []);
  const write = async (text: string) => {
    try { await FS.StorageAccessFramework.writeAsStringAsync(uri!, text); add(`wrote ${text.length} bytes`); }
    catch (e) { add('write failed: ' + String(e)); }
  };
  return (
    <View style={{ padding: 24, gap: 12 }}>
      <Button title="1. Create spike.txt (5000 bytes)" onPress={async () => {
        const seed = `${FS.cacheDirectory}spike.txt`;
        await FS.writeAsStringAsync(seed, 'x'.repeat(5000));
        const [r] = await saveDocuments({ sourceUris: [seed], fileName: 'spike.txt', mimeType: 'text/plain' });
        if (!r?.uri) return add('cancelled');
        await FS.writeAsStringAsync(SAVED, r.uri);
        setUri(r.uri); add('created ' + r.uri);
      }} />
      <Button title="2. Overwrite with 20 bytes" disabled={!uri} onPress={() => write('short ' + Date.now())} />
      <Button title="3. Overwrite with 5000 bytes" disabled={!uri} onPress={() => write('y'.repeat(5000))} />
      {log.map((l, i) => <Text key={i} selectable>{l}</Text>)}
    </View>
  );
}
```

**Step 2:** Run on the device. Press 1, choose Google Drive in the dialog, pick a folder, keep the name. Press 2, then check the file in Drive on the web: it must be about 20 bytes with no trailing `x` characters, which proves the provider truncates on overwrite. Press 3 and check it is 5000 bytes again. Force-stop the app, reopen, press 2: the log must say "loaded saved uri" and the write must succeed, which proves the permission persisted. Open the file's version history in Drive and confirm the earlier versions are listed; that is what replaces snapshots.

**Step 3:** Repeat with OneDrive if installed.

**Step 4:** Record the result in `docs/plans/export-headers.md` under "Create-document spike". Outcomes:
- Go: all of Step 2 passes on Drive.
- The write after restart fails with a permission error: the library did not take a persistable permission. Replace it with a local Expo module (`modules/create-document`, about forty lines of Kotlin) that launches `ACTION_CREATE_DOCUMENT`, calls `takePersistableUriPermission` on the result, and returns the URI. Keep the rest of the design.
- The shrink test leaves trailing bytes, or Drive is missing from the dialog: OneDrive only, or manual export through the share sheet. Decide, write it down, and adjust Tasks 3.3 and 3.4.

**Step 5:** `git checkout app/index.tsx` to discard the spike. No commit.

### Task 2.3: Nutrient list and math

**Files:** Create `src/nutrients.json` (copy of `food-data/nutrients.json`), `src/nutrients.ts`, `src/nutrients.test.ts`, `scripts/check-nutrients.sh`

**Step 1:** Write the failing test.

```ts
// src/nutrients.test.ts
import { DEFAULT_TARGETS, PANEL, scale, sum } from './nutrients';

test('scale per-100 values to grams consumed', () => {
  expect(scale({ '1008': 539, '1003': 6.3 }, 15)).toEqual({ '1008': 80.85, '1003': 0.945 });
});

test('sum adds sparse nutrient records', () => {
  expect(sum([{ '1008': 100, '1003': 5 }, { '1008': 50 }])).toEqual({ '1008': 150, '1003': 5 });
});

test('panel includes energy and macros first', () => {
  expect(PANEL.slice(0, 4).map(n => n.id)).toEqual(['1008', '1003', '1005', '1004']);
});

test('default targets come from the list', () => {
  expect(DEFAULT_TARGETS['1093']).toBe(2300);
  expect('1057' in DEFAULT_TARGETS).toBe(false);   // caffeine has no target
});
```

**Step 2:** Run: `npm test -- nutrients`. Expected: cannot find module.

**Step 3:** Copy the JSON and implement.

```bash
cp ../food-data/nutrients.json src/nutrients.json
```

```ts
// src/nutrients.ts
import list from './nutrients.json';

export type Nutrients = Record<string, number>;   // key: FDC nutrient id as string
export type NutrientDef = { id: string; key: string; name: string; unit: string; panel: boolean; off: string | null; off_factor: number; target: number | null };

export const NUTRIENTS: NutrientDef[] = list as NutrientDef[];
export const PANEL = NUTRIENTS.filter(n => n.panel);
export const BY_ID: Record<string, NutrientDef> = Object.fromEntries(NUTRIENTS.map(n => [n.id, n]));
/** Daily targets for one adult, from nutrients.json. The `goals` setting overrides per nutrient. */
export const DEFAULT_TARGETS: Nutrients = Object.fromEntries(NUTRIENTS.filter(n => n.target != null).map(n => [n.id, n.target as number]));

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function scale(per100: Nutrients, grams: number): Nutrients {
  const out: Nutrients = {};
  for (const [k, v] of Object.entries(per100)) out[k] = r3((v * grams) / 100);
  return out;
}

export function sum(items: Nutrients[]): Nutrients {
  const out: Nutrients = {};
  for (const n of items) for (const [k, v] of Object.entries(n)) out[k] = r3((out[k] ?? 0) + v);
  return out;
}
```

```sh
# scripts/check-nutrients.sh  (run in CI, Task 7.3)
#!/usr/bin/env sh
set -e
curl -sf https://raw.githubusercontent.com/codejetnet/food-data/main/nutrients.json | diff -q - src/nutrients.json \
  || { echo "src/nutrients.json drifted from food-data; copy it over"; exit 1; }
```

**Step 4:** Run: `npm test -- nutrients`. Expected: `4 passed`.

**Step 5:** Commit: `git add -A && git commit -m "feat: nutrient list and scale/sum math"`

### Task 2.4: GTIN normalization in TypeScript

**Files:** Create `src/gtin.ts`, `src/gtin.test.ts`

**Step 1:** Test, same vectors as the Python version.

```ts
import { expandUpcE, normalize, valid } from './gtin';
test.each([
  ['3017620422003', undefined, '3017620422003'],
  ['012345678905', 'upc_a', '0012345678905'],
  ['96385074', 'ean8', '0000096385074'],
  ['03017620422003', undefined, '3017620422003'],
  ['04252614', 'upc_e', '0042100005264'],
  ['3017620422004', undefined, null],
  ['abc', undefined, null],
])('normalize(%s, %s) -> %s', (code, sym, expected) => {
  expect(normalize(code, sym)).toBe(expected);
});
test('expandUpcE', () => expect(expandUpcE('04252614')).toBe('042100005264'));
test('valid', () => { expect(valid('3017620422003')).toBe(true); expect(valid('3017620422000')).toBe(false); });
```

**Step 2:** Run: `npm test -- gtin`. Expected: cannot find module.

**Step 3:** Implement.

```ts
// src/gtin.ts
export function valid(d: string): boolean {
  if (!/^\d{13}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(d[i]) * (i % 2 ? 3 : 1);
  return (10 - (s % 10)) % 10 === Number(d[12]);
}

export function expandUpcE(d: string): string {
  const n = d[0], c = d[7];
  const [a, b, cc, dd, e, f] = d.slice(1, 7);
  const body =
    '012'.includes(f) ? `${a}${b}${f}0000${cc}${dd}${e}` :
    f === '3' ? `${a}${b}${cc}00000${dd}${e}` :
    f === '4' ? `${a}${b}${cc}${dd}00000${e}` :
    `${a}${b}${cc}${dd}${e}0000${f}`;
  return n + body + c;
}

/** Any scanned or typed barcode to GTIN-13, or null if it is not a valid GTIN. */
export function normalize(code: string, symbology?: string): string | null {
  let d = code.replace(/\D/g, '');
  if (symbology === 'upc_e' && d.length === 8) d = expandUpcE(d);
  if (d.length === 14 && d[0] === '0') d = d.slice(1);
  if (d.length === 8 || d.length === 12) d = d.padStart(13, '0');
  return valid(d) ? d : null;
}
```

**Step 4:** Run: `npm test -- gtin`. Expected: `9 passed`.

**Step 5:** Commit: `git add src/gtin.ts src/gtin.test.ts && git commit -m "feat: GTIN-13 normalization"`

### Task 2.5: Database adapter and diary migrations

**Files:** Create `src/db/types.ts`, `src/db/expo.ts`, `src/db/diary.ts`, `test/nodeDb.ts`, `src/db/diary.test.ts`

The adapter exists so the same repository code runs on expo-sqlite in the app and on `node:sqlite` in tests. Two implementations, one interface, both real.

**Step 1:** Test.

```ts
// src/db/diary.test.ts
import { nodeDb } from '../../test/nodeDb';
import { DIARY_SCHEMA_VERSION, migrate } from './diary';

test('migrate creates the schema and is idempotent', async () => {
  const db = nodeDb();
  await migrate(db);
  await migrate(db);
  const tables = (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).map(t => t.name);
  expect(tables).toEqual(['custom_foods', 'entries', 'recipes', 'settings', 'weights']);
  expect(await db.all('PRAGMA user_version')).toEqual([{ user_version: DIARY_SCHEMA_VERSION }]);
});
```

**Step 2:** Run: `npm test -- diary`. Expected: cannot find module.

**Step 3:** Implement.

```ts
// src/db/types.ts
export type Row = Record<string, unknown>;
export interface Db {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  all<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: () => Promise<T>): Promise<T>;
}
```

```ts
// src/db/expo.ts
import * as SQLite from 'expo-sqlite';
import type { Db } from './types';

export function wrap(db: SQLite.SQLiteDatabase): Db {
  return {
    exec: sql => db.execAsync(sql),
    run: async (sql, params = []) => ({ changes: (await db.runAsync(sql, params as SQLite.SQLiteBindValue[])).changes }),
    all: (sql, params = []) => db.getAllAsync(sql, params as SQLite.SQLiteBindValue[]),
    tx: async fn => {
      let result!: Awaited<ReturnType<typeof fn>>;
      await db.withTransactionAsync(async () => { result = await fn(); });
      return result;
    },
  };
}
```

```ts
// test/nodeDb.ts
import { DatabaseSync } from 'node:sqlite';
import type { Db } from '../src/db/types';

export function nodeDb(path = ':memory:'): Db {
  const db = new DatabaseSync(path);
  const bind = (p: unknown[]) => p.map(v => (v === undefined ? null : v)) as never[];
  return {
    exec: async sql => db.exec(sql),
    run: async (sql, params = []) => ({ changes: Number(db.prepare(sql).run(...bind(params)).changes) }),
    all: async (sql, params = []) => db.prepare(sql).all(...bind(params)) as never,
    tx: async fn => {
      db.exec('BEGIN');
      try { const r = await fn(); db.exec('COMMIT'); return r; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
```

```ts
// src/db/diary.ts
import type { Db } from './types';

const MIGRATIONS: string[] = [
`CREATE TABLE entries (
  id TEXT PRIMARY KEY, day TEXT NOT NULL, meal TEXT NOT NULL, name TEXT NOT NULL,
  amount REAL, amount_desc TEXT, nutrients TEXT NOT NULL, food_ref TEXT,
  source TEXT NOT NULL DEFAULT 'app', health_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX entries_day ON entries(day);
CREATE TABLE custom_foods (
  id TEXT PRIMARY KEY, barcode TEXT, name TEXT NOT NULL, brand TEXT,
  serving_size REAL, serving_unit TEXT, serving_desc TEXT, nutrients TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX custom_foods_barcode ON custom_foods(barcode);
CREATE TABLE recipes (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, servings REAL NOT NULL,
  ingredients TEXT NOT NULL, nutrients TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE weights (day TEXT PRIMARY KEY, kg REAL NOT NULL);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
];

export const DIARY_SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: Db): Promise<void> {
  const [{ user_version }] = await db.all<{ user_version: number }>('PRAGMA user_version');
  for (let v = user_version; v < MIGRATIONS.length; v++) {
    await db.exec(MIGRATIONS[v]);
    await db.exec(`PRAGMA user_version = ${v + 1}`);
  }
}
```

**Step 4:** Run: `npm test -- diary`. Expected: `1 passed`.

**Step 5:** Commit: `git add -A && git commit -m "feat: db adapter for expo-sqlite and node:sqlite, diary schema v1"`

### Task 2.6: Diary repository

**Files:** Create `src/diary/changed.ts`, `src/diary/entries.ts`, `src/diary/customFoods.ts`, `src/diary/recipes.ts`, `src/diary/weights.ts`, `src/diary/settings.ts`, `src/dates.ts`, tests `src/diary/entries.test.ts`, `src/diary/recipes.test.ts`, `src/dates.test.ts`

**Step 1:** Tests.

```ts
// src/diary/entries.test.ts
import { nodeDb } from '../../test/nodeDb';
import { migrate } from '../db/diary';
import { addEntry, deleteEntry, entriesForDay, insertEntries, updateEntry, type Entry } from './entries';

const e = (id: string, day = '2026-09-15', over: Partial<Entry> = {}): Entry => ({
  id, day, meal: 'Lunch', name: 'Nutella', amount: 15, amount_desc: '1 tbsp',
  nutrients: { '1008': 80.85, '1003': 0.945 }, food_ref: 'foods:off:3017620422003', source: 'app', health_id: null, ...over,
});

test('add, list, delete round trip', async () => {
  const db = nodeDb(); await migrate(db);
  await addEntry(db, e('a'));
  await addEntry(db, e('b', '2026-09-16'));
  expect((await entriesForDay(db, '2026-09-15')).map(x => x.id)).toEqual(['a']);
  expect((await deleteEntry(db, 'a'))?.nutrients).toEqual({ '1008': 80.85, '1003': 0.945 });
  expect(await entriesForDay(db, '2026-09-15')).toEqual([]);
});

test('updateEntry changes amount, meal and day in place', async () => {
  const db = nodeDb(); await migrate(db);
  await addEntry(db, e('a'));
  await updateEntry(db, { ...e('a'), amount: 30, nutrients: { '1008': 161.7 }, meal: 'Dinner', day: '2026-09-16' });
  expect(await entriesForDay(db, '2026-09-15')).toEqual([]);
  expect((await entriesForDay(db, '2026-09-16')).map(x => [x.meal, x.amount])).toEqual([['Dinner', 30]]);
});

test('insertEntries ignores duplicate ids and reports the count', async () => {
  const db = nodeDb(); await migrate(db);
  expect(await insertEntries(db, [e('a'), e('b')])).toBe(2);
  expect(await insertEntries(db, [e('a'), e('c')])).toBe(1);
});
```

```ts
// src/diary/recipes.test.ts
import { recipeNutrients } from './recipes';
test('per-serving nutrients from ingredients', () => {
  const ingredients = [
    { name: 'Oats', amount: 100, nutrients: { '1008': 389, '1003': 16.9 }, food_ref: 'foods:usda_sr:173904' },
    { name: 'Milk', amount: 200, nutrients: { '1008': 122, '1003': 6.6 }, food_ref: 'foods:usda_sr:171265' },
  ];
  expect(recipeNutrients(ingredients, 2)).toEqual({ '1008': 255.5, '1003': 11.75 });
});
```

```ts
// src/dates.test.ts
import { addDays, toDay } from './dates';
test('toDay uses local date parts', () => expect(toDay(new Date(2026, 8, 15, 23, 30))).toBe('2026-09-15'));
test('addDays crosses months', () => expect(addDays('2026-09-30', 1)).toBe('2026-10-01'));
```

**Step 2:** Run: `npm test`. Expected: three new suites fail on missing modules.

**Step 3:** Implement.

```ts
// src/diary/changed.ts
let listener: (() => void) | null = null;
export function onDiaryChanged(fn: () => void) { listener = fn; }
export function diaryChanged() { listener?.(); }
```

```ts
// src/dates.ts
const pad = (n: number) => String(n).padStart(2, '0');
export function toDay(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function today(): string { return toDay(new Date()); }
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return toDay(new Date(y, m - 1, d + n));
}
```

```ts
// src/diary/entries.ts
import type { Db } from '../db/types';
import type { Nutrients } from '../nutrients';
import { diaryChanged } from './changed';

export type Entry = {
  id: string; day: string; meal: string; name: string;
  amount: number | null; amount_desc: string | null; nutrients: Nutrients;
  food_ref: string | null; source: 'app' | 'cronometer' | 'mfp'; health_id: string | null;
};
type Row = Omit<Entry, 'nutrients'> & { nutrients: string };
const COLS = 'id, day, meal, name, amount, amount_desc, nutrients, food_ref, source, health_id';
const fromRow = (r: Row): Entry => ({ ...r, nutrients: JSON.parse(r.nutrients) });
const params = (e: Entry) => [e.id, e.day, e.meal, e.name, e.amount, e.amount_desc, JSON.stringify(e.nutrients), e.food_ref, e.source, e.health_id];

export async function addEntry(db: Db, e: Entry): Promise<void> {
  await db.run(`INSERT INTO entries (${COLS}) VALUES (?,?,?,?,?,?,?,?,?,?)`, params(e));
  diaryChanged();
}

export async function updateEntry(db: Db, e: Entry): Promise<void> {
  await db.run(`UPDATE entries SET day = ?, meal = ?, name = ?, amount = ?, amount_desc = ?, nutrients = ?, food_ref = ?, health_id = ?, updated_at = datetime('now') WHERE id = ?`,
    [e.day, e.meal, e.name, e.amount, e.amount_desc, JSON.stringify(e.nutrients), e.food_ref, e.health_id, e.id]);
  diaryChanged();
}

/** Bulk insert for imports. Duplicate ids are skipped. Returns inserted count. */
export async function insertEntries(db: Db, list: Entry[]): Promise<number> {
  let n = 0;
  await db.tx(async () => {
    for (const e of list) n += (await db.run(`INSERT OR IGNORE INTO entries (${COLS}) VALUES (?,?,?,?,?,?,?,?,?,?)`, params(e))).changes;
  });
  if (n) diaryChanged();
  return n;
}

export async function deleteEntry(db: Db, id: string): Promise<Entry | null> {
  const [row] = await db.all<Row>(`SELECT ${COLS} FROM entries WHERE id = ?`, [id]);
  if (!row) return null;
  await db.run('DELETE FROM entries WHERE id = ?', [id]);
  diaryChanged();
  return fromRow(row);
}

export async function setHealthId(db: Db, id: string, healthId: string | null): Promise<void> {
  await db.run('UPDATE entries SET health_id = ? WHERE id = ?', [healthId, id]);
}

export async function entriesForDay(db: Db, day: string): Promise<Entry[]> {
  return (await db.all<Row>(`SELECT ${COLS} FROM entries WHERE day = ? ORDER BY created_at`, [day])).map(fromRow);
}

export async function entriesBetween(db: Db, from: string, to: string): Promise<Entry[]> {
  return (await db.all<Row>(`SELECT ${COLS} FROM entries WHERE day BETWEEN ? AND ? ORDER BY day, created_at`, [from, to])).map(fromRow);
}

/** Most recently logged distinct names, for the Search screen's "recents". */
export async function recentEntries(db: Db, limit = 50): Promise<Entry[]> {
  return (await db.all<Row>(`SELECT ${COLS}, max(created_at) AS last FROM entries GROUP BY name ORDER BY last DESC LIMIT ?`, [limit])).map(fromRow);
}
```

```ts
// src/diary/customFoods.ts
import type { Db } from '../db/types';
import type { Nutrients } from '../nutrients';
import { diaryChanged } from './changed';

export type CustomFood = {
  id: string; barcode: string | null; name: string; brand: string | null;
  serving_size: number | null; serving_unit: 'g' | 'ml' | null; serving_desc: string | null;
  nutrients: Nutrients;   // per 100 g or ml
};
type Row = Omit<CustomFood, 'nutrients'> & { nutrients: string };
const COLS = 'id, barcode, name, brand, serving_size, serving_unit, serving_desc, nutrients';
const fromRow = (r: Row): CustomFood => ({ ...r, nutrients: JSON.parse(r.nutrients) });

export async function upsertCustomFood(db: Db, f: CustomFood): Promise<void> {
  await db.run(`INSERT INTO custom_foods (${COLS}) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET barcode = excluded.barcode, name = excluded.name, brand = excluded.brand,
    serving_size = excluded.serving_size, serving_unit = excluded.serving_unit, serving_desc = excluded.serving_desc,
    nutrients = excluded.nutrients, updated_at = datetime('now')`,
    [f.id, f.barcode, f.name, f.brand, f.serving_size, f.serving_unit, f.serving_desc, JSON.stringify(f.nutrients)]);
  diaryChanged();
}
export async function deleteCustomFood(db: Db, id: string) { await db.run('DELETE FROM custom_foods WHERE id = ?', [id]); diaryChanged(); }
export async function customFood(db: Db, id: string) { const [r] = await db.all<Row>(`SELECT ${COLS} FROM custom_foods WHERE id = ?`, [id]); return r ? fromRow(r) : null; }
export async function customFoodByBarcode(db: Db, gtin13: string) { const [r] = await db.all<Row>(`SELECT ${COLS} FROM custom_foods WHERE barcode = ?`, [gtin13]); return r ? fromRow(r) : null; }
export async function searchCustomFoods(db: Db, q: string) { return (await db.all<Row>(`SELECT ${COLS} FROM custom_foods WHERE name LIKE ? ORDER BY updated_at DESC LIMIT 30`, [`%${q}%`])).map(fromRow); }
export async function allCustomFoods(db: Db) { return (await db.all<Row>(`SELECT ${COLS} FROM custom_foods ORDER BY name`)).map(fromRow); }
```

```ts
// src/diary/recipes.ts
import type { Db } from '../db/types';
import { sum, type Nutrients } from '../nutrients';
import { diaryChanged } from './changed';

export type Ingredient = { name: string; amount: number; nutrients: Nutrients; food_ref: string | null };  // nutrients for `amount`
export type Recipe = { id: string; name: string; servings: number; ingredients: Ingredient[]; nutrients: Nutrients };  // nutrients per serving

export function recipeNutrients(ingredients: Ingredient[], servings: number): Nutrients {
  const total = sum(ingredients.map(i => i.nutrients));
  const out: Nutrients = {};
  for (const [k, v] of Object.entries(total)) out[k] = Math.round((v / servings) * 1000) / 1000;
  return out;
}

type Row = { id: string; name: string; servings: number; ingredients: string; nutrients: string };
const fromRow = (r: Row): Recipe => ({ ...r, ingredients: JSON.parse(r.ingredients), nutrients: JSON.parse(r.nutrients) });

export async function upsertRecipe(db: Db, r: Recipe): Promise<void> {
  await db.run(`INSERT INTO recipes (id, name, servings, ingredients, nutrients) VALUES (?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, servings = excluded.servings, ingredients = excluded.ingredients,
    nutrients = excluded.nutrients, updated_at = datetime('now')`,
    [r.id, r.name, r.servings, JSON.stringify(r.ingredients), JSON.stringify(r.nutrients)]);
  diaryChanged();
}
export async function deleteRecipe(db: Db, id: string) { await db.run('DELETE FROM recipes WHERE id = ?', [id]); diaryChanged(); }
export async function recipe(db: Db, id: string) { const [r] = await db.all<Row>('SELECT id, name, servings, ingredients, nutrients FROM recipes WHERE id = ?', [id]); return r ? fromRow(r) : null; }
export async function allRecipes(db: Db) { return (await db.all<Row>('SELECT id, name, servings, ingredients, nutrients FROM recipes ORDER BY name')).map(fromRow); }
```

```ts
// src/diary/weights.ts
import type { Db } from '../db/types';
import { diaryChanged } from './changed';
export type Weight = { day: string; kg: number };
export async function setWeight(db: Db, w: Weight) { await db.run('INSERT INTO weights (day, kg) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET kg = excluded.kg', [w.day, w.kg]); diaryChanged(); }
export async function deleteWeight(db: Db, day: string) { await db.run('DELETE FROM weights WHERE day = ?', [day]); diaryChanged(); }
export async function allWeights(db: Db) { return db.all<Weight>('SELECT day, kg FROM weights ORDER BY day DESC'); }
```

```ts
// src/diary/settings.ts
import type { Db } from '../db/types';
import { DEFAULT_TARGETS, type Nutrients } from '../nutrients';
import { diaryChanged } from './changed';

export const DEFAULT_MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

export async function getSetting(db: Db, key: string): Promise<string | null> {
  const [r] = await db.all<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return r?.value ?? null;
}
export async function setSetting(db: Db, key: string, value: string, notify = true): Promise<void> {
  await db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  if (notify) diaryChanged();
}
export async function getJson<T>(db: Db, key: string, fallback: T): Promise<T> {
  const v = await getSetting(db, key);
  return v ? (JSON.parse(v) as T) : fallback;
}
export async function allSettings(db: Db): Promise<Record<string, string>> {
  return Object.fromEntries((await db.all<{ key: string; value: string }>('SELECT key, value FROM settings')).map(r => [r.key, r.value]));
}
/** Per-nutrient daily goals: nutrients.json defaults with the user's overrides on top. */
export async function goals(db: Db): Promise<Nutrients> {
  return { ...DEFAULT_TARGETS, ...(await getJson<Nutrients>(db, 'goals', {})) };
}
```

Settings keys used across the app: `goals` (JSON Nutrients, overrides only), `meals` (JSON string[]), `country` (e.g. `US`), `foods_md5`, `foods_built_at`, `foods_checked_at`, `backup_uri_diary`, `backup_uri_report`, `backup_pending`, `backup_dirty`, `backup_last_ok`, `off_lookup` (`1`/`0`), `health_enabled`, `weight_unit` (`kg`/`lb`), `app_uuid` (random id sent with Open Food Facts contributions, Task 6.1). Device-local keys (`foods_*`, `backup_*`, `app_uuid`) are written with `notify = false` so they do not trigger a backup and are excluded from the export in Task 3.1.

**Step 4:** Run: `npm test`. Expected: all pass.

**Step 5:** Commit: `git add -A && git commit -m "feat: diary repository for entries, custom foods, recipes, weights, settings"`

### Task 2.7: Foods database queries

**Files:** Create `src/foods/db.ts`, `src/foods/db.test.ts`, `test/foodsFixture.ts`, `test/foods.v1.sql` (copy of `food-data/schema/v1.sql`)

**Step 1:** Test helper and test.

```ts
// test/foodsFixture.ts
import { readFileSync } from 'node:fs';
import { PANEL } from '../src/nutrients';
import type { Db } from '../src/db/types';
import { nodeDb } from './nodeDb';

export async function foodsFixture(): Promise<Db> {
  const db = nodeDb();
  const ddl = readFileSync(`${__dirname}/foods.v1.sql`, 'utf8')
    .replace('  -- PANEL_COLUMNS', ',' + PANEL.map(n => `  n${n.id} REAL`).join(',\n').slice(1));
  await db.exec(ddl);
  await db.run(`INSERT INTO foods (id, barcode, name, brand, source, source_id, serving_size, serving_unit, serving_desc, n1008, n1003, n1005, n1004)
                VALUES (1, '3017620422003', 'Nutella', 'Ferrero', 'off', '3017620422003', 15, 'g', '1 tbsp (15 g)', 539, 6.3, 57.5, 30.9)`);
  await db.run(`INSERT INTO foods (id, barcode, name, source, source_id, serving_size, serving_unit, serving_desc, n1008, n1003, n1005, n1004)
                VALUES (2, NULL, 'Chicken, broilers or fryers, breast, meat only, raw', 'usda_sr', '171077', 100, 'g', '100 g', 120, 22.5, 0, 2.6)`);
  await db.run(`INSERT INTO food_nutrients_extra VALUES (2, 1210, 1.2)`);
  await db.run(`INSERT INTO portions VALUES (2, 'breast, bone and skin removed', 118)`);
  await db.exec(`INSERT INTO foods_fts(foods_fts) VALUES ('rebuild')`);
  return db;
}
```

```ts
// src/foods/db.test.ts
import { foodsFixture } from '../../test/foodsFixture';
import { byBarcode, bySource, foodRef, ftsQuery, portions, search } from './db';

test('byBarcode maps panel columns to per100', async () => {
  const db = await foodsFixture();
  const f = await byBarcode(db, '3017620422003');
  expect(f?.name).toBe('Nutella');
  expect(f?.per100).toEqual({ '1008': 539, '1003': 6.3, '1005': 57.5, '1004': 30.9 });
  expect(await byBarcode(db, '0000000000000')).toBeNull();
});

test('bySource merges the long-tail nutrients and is the food_ref lookup', async () => {
  const db = await foodsFixture();
  const f = await bySource(db, 'usda_sr', '171077');
  expect(f?.per100['1210']).toBe(1.2);
  expect(f && foodRef(f)).toBe('foods:usda_sr:171077');
  expect(await portions(db, 2)).toEqual([{ description: 'breast, bone and skin removed', grams: 118 }]);
});

test('ftsQuery makes prefix terms', () => expect(ftsQuery(' chick brea ')).toBe('"chick"* "brea"*'));

test('search uses full text, needs two characters, and puts generic foods first', async () => {
  const db = await foodsFixture();
  expect((await search(db, 'chicken breast')).map(f => f.id)).toEqual([2]);
  expect((await search(db, 'nut')).map(f => f.id)).toEqual([1]);
  expect(await search(db, 'n')).toEqual([]);
  await db.run(`INSERT INTO foods (id, barcode, name, source, source_id, n1008) VALUES (3, '0012345678905', 'CHICKEN BREAST STRIPS', 'usda_branded', '10', 110)`);
  await db.exec(`INSERT INTO foods_fts(foods_fts) VALUES ('rebuild')`);
  expect((await search(db, 'chicken')).map(f => f.id)).toEqual([2, 3]);
});
```

**Step 2:** Run: `npm test -- foods`. Expected: cannot find module. If the fixture itself fails on `CREATE VIRTUAL TABLE ... fts5`, Node's SQLite lacks FTS5: keep the `search` test but mark it `test.skip` with a comment, and verify search on the device in Task 2.11.

**Step 3:** Implement.

```ts
// src/foods/db.ts
import type { Db, Row } from '../db/types';
import { PANEL, type Nutrients } from '../nutrients';

export type Food = {
  id: number; barcode: string | null; name: string; brand: string | null; source: string; source_id: string;
  serving_size: number | null; serving_unit: string | null; serving_desc: string | null;
  per100: Nutrients;
};
export type Portion = { description: string; grams: number };

/** Stable reference for entries and recipes. Never the rowid: it changes every build. */
export const foodRef = (f: Food) => `foods:${f.source}:${f.source_id}`;

const BASE = ['id', 'barcode', 'name', 'brand', 'source', 'source_id', 'serving_size', 'serving_unit', 'serving_desc'];
const SELECT = `SELECT ${[...BASE, ...PANEL.map(n => `n${n.id}`)].map(c => `foods.${c}`).join(', ')} FROM foods`;

function toFood(r: Row): Food {
  const per100: Nutrients = {};
  for (const n of PANEL) { const v = r[`n${n.id}`]; if (typeof v === 'number') per100[n.id] = v; }
  return {
    id: r.id as number, barcode: r.barcode as string | null, name: r.name as string, brand: r.brand as string | null,
    source: r.source as string, source_id: r.source_id as string, serving_size: r.serving_size as number | null, serving_unit: r.serving_unit as string | null,
    serving_desc: r.serving_desc as string | null, per100,
  };
}

export async function byBarcode(db: Db, gtin13: string): Promise<Food | null> {
  const [r] = await db.all(`${SELECT} WHERE barcode = ? LIMIT 1`, [gtin13]);
  return r ? toFood(r) : null;
}

/** Full record including the long-tail nutrients, keyed the same way as food_ref. */
export async function bySource(db: Db, source: string, sourceId: string): Promise<Food | null> {
  const [r] = await db.all(`${SELECT} WHERE source = ? AND source_id = ?`, [source, sourceId]);
  if (!r) return null;
  const f = toFood(r);
  for (const x of await db.all<{ nutrient: number; per100: number }>('SELECT nutrient, per100 FROM food_nutrients_extra WHERE food_id = ?', [f.id])) {
    f.per100[String(x.nutrient)] = x.per100;
  }
  return f;
}

export function ftsQuery(q: string): string {
  return q.trim().split(/\s+/).filter(Boolean).map(t => `"${t.replace(/"/g, '')}"*`).join(' ');
}

/** Generic foods first, so "egg" finds "Egg, whole, raw" before branded egg noodles. Under two characters nothing runs. */
export async function search(db: Db, q: string, limit = 30): Promise<Food[]> {
  const m = ftsQuery(q);
  if (!m || q.trim().length < 2) return [];
  const sql = `${SELECT.replace('FROM foods', 'FROM foods_fts JOIN foods ON foods.id = foods_fts.rowid')} WHERE foods_fts MATCH ? ORDER BY (foods.barcode IS NULL) DESC, rank LIMIT ?`;
  return (await db.all(sql, [m, limit])).map(toFood);
}

export async function portions(db: Db, foodId: number): Promise<Portion[]> {
  return db.all<Portion>('SELECT description, grams FROM portions WHERE food_id = ? ORDER BY grams', [foodId]);
}
```

**Step 4:** Run: `npm test -- foods`. Expected: `4 passed`.

**Step 5:** Commit: `git add -A && git commit -m "feat: foods database lookups and full-text search"`

### Task 2.8: Foods database download and swap

**Files:** Create `src/foods/update.ts`, `src/foods/update.test.ts`

**Step 1:** Test the pure part.

```ts
// src/foods/update.test.ts
import { checkDue, pickFile, type Manifest } from './update';
const m: Manifest = { schemaVersion: 1, builtAt: '2026-09-15T06:00:00Z', files: [
  { name: 'foods-US.zip', country: 'US', bytes: 80_000_000, md5: 'aaa', url: 'https://cdn/b/foods-US.zip', mirror: 'https://gh/b/foods-US.zip' },
  { name: 'foods-CA.zip', country: 'CA', bytes: 30_000_000, md5: 'bbb', url: 'https://cdn/b/foods-CA.zip', mirror: 'https://gh/b/foods-CA.zip' },
] };
test('picks the country file', () => expect(pickFile(m, 'CA', 1)?.md5).toBe('bbb'));
test('unknown country yields null', () => expect(pickFile(m, 'FR', 1)).toBeNull());
test('newer schema yields null', () => expect(pickFile({ ...m, schemaVersion: 2 }, 'US', 1)).toBeNull());

const H = 3_600_000;
test('check is due after 20 to 28 hours, jittered', () => {
  expect(checkDue(null, 0, 0.5)).toBe(true);
  expect(checkDue(0, 19 * H, 0)).toBe(false);
  expect(checkDue(0, 20 * H, 0)).toBe(true);
  expect(checkDue(0, 27 * H, 1)).toBe(false);
  expect(checkDue(0, 28 * H, 1)).toBe(true);
});
```

**Step 2:** Run: `npm test -- update`. Expected: cannot find module.

**Step 3:** Implement.

```ts
// src/foods/update.ts
import * as FS from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { unzip } from 'react-native-zip-archive';

/** `country` is a code, or "starter" for the small generic-only file the app embeds. */
export type ManifestFile = { name: string; country: string; bytes: number; md5: string; url: string; mirror: string };
export type Manifest = { schemaVersion: number; builtAt: string; files: ManifestFile[] };

/** The CDN has free egress; the GitHub Release is a mirror for when it is down. */
export const MANIFEST_URLS = ['https://food.codejet.net/manifest.json', 'https://github.com/codejetnet/food-data/releases/latest/download/manifest.json'];
export const SUPPORTED_SCHEMA = 1;
export const FOODS_DIR = `${FS.documentDirectory}SQLite/`;
export const FOODS_FILE = 'foods.db';

export function pickFile(m: Manifest, country: string, supported: number): ManifestFile | null {
  if (m.schemaVersion > supported) return null;
  return m.files.find(f => f.country === country) ?? null;
}

/** Once a day with jitter: 20 hours plus up to 8 more, so a weekly build's downloads spread over a day instead of one spike. */
export function checkDue(lastMs: number | null, nowMs: number, rand: number): boolean {
  return lastMs === null || nowMs - lastMs >= (20 + 8 * rand) * 3_600_000;
}

async function firstOk<T>(urls: string[], get: (url: string) => Promise<T>): Promise<T> {
  let err: unknown;
  for (const u of urls) { try { return await get(u); } catch (e) { err = e; } }
  throw err;
}

export function fetchManifest(): Promise<Manifest> {
  return firstOk(MANIFEST_URLS, async url => {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    return res.json();
  });
}

/**
 * Download, verify, and install the country file. The caller must close the foods
 * connection before calling and reopen after. Throws on network or checksum failure.
 */
export async function installFoods(f: ManifestFile, onProgress?: (fraction: number) => void): Promise<void> {
  const zip = `${FS.cacheDirectory}foods.zip`;
  const dir = `${FS.cacheDirectory}foods-unzip/`;
  await FS.deleteAsync(dir, { idempotent: true });
  await firstOk([f.url, f.mirror], url => download(url, zip, f.bytes, onProgress));
  await unzip(zip, dir);
  const inner = `${dir}${f.name.replace(/\.zip$/, '.db')}`;
  const info = await FS.getInfoAsync(inner, { md5: true });
  if (!info.exists || info.md5 !== f.md5) throw new Error('checksum mismatch');
  await FS.makeDirectoryAsync(FOODS_DIR, { intermediates: true });
  await FS.deleteAsync(FOODS_DIR + FOODS_FILE, { idempotent: true });
  await FS.moveAsync({ from: inner, to: FOODS_DIR + FOODS_FILE });
  await FS.deleteAsync(zip, { idempotent: true });
  await FS.deleteAsync(dir, { idempotent: true });
}

/** Resumes across interruptions and app restarts: the resume state is saved every 5 MB and reused when the URL matches. */
const RESUME = `${FS.cacheDirectory}foods.resume.json`;
async function download(url: string, to: string, bytes: number, onProgress?: (fraction: number) => void): Promise<void> {
  let resumeData: string | undefined;
  try { const s = JSON.parse(await FS.readAsStringAsync(RESUME)); if (s.url === url) resumeData = s.resumeData; } catch { /* nothing to resume */ }
  let saved = 0;
  const dl = FS.createDownloadResumable(url, to, {}, p => {
    onProgress?.(p.totalBytesWritten / bytes);
    if (p.totalBytesWritten - saved > 5_000_000) { saved = p.totalBytesWritten; void FS.writeAsStringAsync(RESUME, JSON.stringify({ url, ...dl.savable() })); }
  }, resumeData);
  const r = resumeData ? await dl.resumeAsync() : await dl.downloadAsync();
  if (!r || (r.status !== 200 && r.status !== 206)) throw new Error(`download ${r?.status}`);
  await FS.deleteAsync(RESUME, { idempotent: true });
}

/** First launch: copy the bundled generic-foods file into place so search and logging work before any download. */
export async function installStarter(): Promise<void> {
  const asset = Asset.fromModule(require('../../assets/foods-starter.db'));
  await asset.downloadAsync();
  await FS.makeDirectoryAsync(FOODS_DIR, { intermediates: true });
  await FS.copyAsync({ from: asset.localUri!, to: FOODS_DIR + FOODS_FILE });
}
```

**Step 4:** Run: `npm test -- update`. Expected: `4 passed`.

**Step 5:** Keep the foods file out of Android Auto Backup. Auto Backup gives up entirely above 25 MB, so without this rule Android would never back up the diary either. Create `plugins/withBackupRules.js` and add `"./plugins/withBackupRules"` to the `plugins` array in `app.json`.

```js
// plugins/withBackupRules.js
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const EXCLUDE = '<exclude domain="file" path="SQLite/foods.db"/>';
const FILES = {
  'backup_rules.xml': `<?xml version="1.0" encoding="utf-8"?><full-backup-content>${EXCLUDE}</full-backup-content>`,
  'data_extraction_rules.xml': `<?xml version="1.0" encoding="utf-8"?><data-extraction-rules><cloud-backup>${EXCLUDE}</cloud-backup><device-transfer>${EXCLUDE}</device-transfer></data-extraction-rules>`,
};

module.exports = function withBackupRules(config) {
  config = withDangerousMod(config, ['android', c => {
    const dir = path.join(c.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, xml] of Object.entries(FILES)) fs.writeFileSync(path.join(dir, name), xml);
    return c;
  }]);
  return withAndroidManifest(config, c => {
    const app = c.modResults.manifest.application[0].$;
    app['android:allowBackup'] = 'true';
    app['android:fullBackupContent'] = '@xml/backup_rules';
    app['android:dataExtractionRules'] = '@xml/data_extraction_rules';
    return c;
  });
};
```

Verify: `npx expo prebuild --platform android --clean && grep -c backup_rules android/app/src/main/AndroidManifest.xml` prints `1`, and `android/app/src/main/res/xml/backup_rules.xml` exists.

**Step 6:** Commit: `git add -A && git commit -m "feat: manifest selection, foods file install, and Auto Backup exclusion"`

### Task 2.9: App shell and database provider

**Files:** Create `metro.config.js`, `scripts/fetch-starter.sh`, `src/db/provider.tsx`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, placeholder screens `app/(tabs)/index.tsx`, `app/(tabs)/search.tsx`, `app/(tabs)/scan.tsx`, `app/(tabs)/settings.tsx`. Delete the template's `App.tsx` if present.

**Step 1:** Provider.

```tsx
// src/db/provider.tsx
import * as SQLite from 'expo-sqlite';
import * as FS from 'expo-file-system/legacy';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { wrap } from './expo';
import type { Db } from './types';
import { migrate } from './diary';
import { FOODS_DIR, FOODS_FILE, installStarter } from '../foods/update';

type Ctx = { diary: Db; foods: Db | null; closeFoods(): Promise<void>; reopenFoods(): Promise<void> };
const DbContext = createContext<Ctx | null>(null);

export function DbProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  useEffect(() => {
    (async () => {
      const diaryRaw = await SQLite.openDatabaseAsync('diary.db');
      await diaryRaw.execAsync('PRAGMA journal_mode = WAL');
      const diary = wrap(diaryRaw);
      await migrate(diary);
      let foodsRaw: SQLite.SQLiteDatabase | null = null;
      const openFoods = async () => {
        if (!(await FS.getInfoAsync(FOODS_DIR + FOODS_FILE)).exists) await installStarter();   // first launch
        foodsRaw = await SQLite.openDatabaseAsync(FOODS_FILE);
        return wrap(foodsRaw);
      };
      const foods = await openFoods();
      const make = (foods: Db | null): Ctx => ({
        diary, foods,
        closeFoods: async () => { await foodsRaw?.closeAsync(); foodsRaw = null; setCtx(make(null)); },
        reopenFoods: async () => { setCtx(make(await openFoods())); },
      });
      setCtx(make(foods));
    })();
  }, []);
  if (!ctx) return null;
  return <DbContext.Provider value={ctx}>{children}</DbContext.Provider>;
}

export function useDb(): Ctx {
  const c = useContext(DbContext);
  if (!c) throw new Error('useDb outside DbProvider');
  return c;
}
```

**Step 2:** Root layout and tabs.

```tsx
// app/_layout.tsx
import { Stack } from 'expo-router';
import { DbProvider } from '../src/db/provider';
export default function Root() {
  return (
    <DbProvider>
      <Stack screenOptions={{ headerShown: true }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </DbProvider>
  );
}
```

```tsx
// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
```

Each placeholder screen: a `View` with a `Text` of its name.

**Step 3:** The starter file. Metro must treat `.db` as an asset, and the file itself is fetched from the CDN rather than committed: it is a build product of `food-data`, about 5 MB, and changes weekly.

```js
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('db');
module.exports = config;
```

```sh
#!/usr/bin/env sh
# scripts/fetch-starter.sh: the generic-foods file the app ships with. Run before any build; CI runs it too.
set -e
url=$(curl -sf https://food.codejet.net/manifest.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).files.find(f=>f.country==="starter").url))')
curl -sfL "$url" -o /tmp/foods-starter.zip
mkdir -p assets && unzip -oq /tmp/foods-starter.zip -d assets && ls -la assets/foods-starter.db
```

Append `assets/foods-starter.db` to `.gitignore`, run `sh scripts/fetch-starter.sh`, then `npx expo install expo-asset`.

**Step 4:** Run on device: `npx expo start --dev-client`. Expected: four tabs render, and a fresh install has `foods.db` in place with the generic foods. Then check FTS5 in expo-sqlite by temporarily running on the Today screen:

```ts
useDb().diary.all("SELECT sqlite_compileoption_used('ENABLE_FTS5') AS fts").then(console.log)
```
Expected: `[{ fts: 1 }]`. If `0`, replace expo-sqlite with `@op-engineering/op-sqlite` (it ships FTS5) and rewrite `src/db/expo.ts` for its API. Record the result in `docs/plans/export-headers.md`. Remove the temporary line.

**Step 5:** Commit: `git add -A && git commit -m "feat: app shell, database provider, and the bundled starter foods file"`

### Task 2.10: Today screen

**Files:** Create `app/(tabs)/index.tsx`, `src/ui/NutrientBar.tsx`

**Behavior:**
- Header row: previous day, the date (today shows "Today"), next day. State is a `day` string from `src/dates.ts`.
- Loads `entriesForDay`, `goals(db)` and `meals` on focus (`useFocusEffect` from expo-router) so returning from Food detail refreshes.
- Top card: `sum(entries.map(e => e.nutrients))` against goals for energy, protein, carbs, fat. `NutrientBar` renders label, value / goal, and a filled bar. A "More" expander lists every other `PANEL` nutrient as total, target and percent, which is the Cronometer view people switch for. Below it a "Burned" line reading `null` until Milestone 5 (hidden when null).
- One section per meal group in order. Each row: name, amount_desc or `${amount} g`, energy. Tap a row: `/food/${e.food_ref ?? 'entry'}?entry=${e.id}` to edit it. Long-press a row: delete (`deleteEntry`, reload) and show a five-second "Deleted. Undo" bar; Undo calls `addEntry` with the same entry. Each section has an "Add" button that navigates to `/search?day=${day}&meal=${meal}`.
- Entries whose meal is not in the current groups render under a trailing "Other" section.

**Manual check:** add two entries by temporarily calling `addEntry` from a button, see totals change, expand "More" and see sodium against 2300 mg, long-press deletes and Undo brings the entry back, day navigation shows empty days.

Commit: `git add -A && git commit -m "feat: Today screen with totals and meal sections"`

### Task 2.11: Search and Food detail

**Files:** Create `src/foods/servings.ts`, `src/foods/servings.test.ts`, `app/(tabs)/search.tsx`, `app/food/[ref].tsx`, `src/foods/resolve.ts`

**Step 1:** Test the serving helper.

```ts
// src/foods/servings.test.ts
import { servingOptions } from './servings';
test('options: label serving, 100 g, then portions', () => {
  expect(servingOptions({ serving_size: 15, serving_unit: 'g', serving_desc: '1 tbsp (15 g)' }, [{ description: 'jar', grams: 400 }]))
    .toEqual([{ label: '1 tbsp (15 g)', grams: 15 }, { label: '100 g', grams: 100 }, { label: 'jar', grams: 400 }]);
});
test('no serving info yields just 100 g', () => {
  expect(servingOptions({ serving_size: null, serving_unit: null, serving_desc: null }, [])).toEqual([{ label: '100 g', grams: 100 }]);
});
```

**Step 2:** Run: `npm test -- servings`. Expected: cannot find module.

**Step 3:** Implement.

```ts
// src/foods/servings.ts
import type { Portion } from './db';
export type ServingOption = { label: string; grams: number };
type HasServing = { serving_size: number | null; serving_unit: string | null; serving_desc: string | null };

export function servingOptions(f: HasServing, portions: Portion[]): ServingOption[] {
  const out: ServingOption[] = [];
  if (f.serving_size && f.serving_size > 0) {
    out.push({ label: f.serving_desc ?? `1 serving (${f.serving_size} ${f.serving_unit ?? 'g'})`, grams: f.serving_size });
  }
  out.push({ label: `100 ${f.serving_unit ?? 'g'}`, grams: 100 });
  for (const p of portions) if (!out.some(o => o.grams === p.grams)) out.push({ label: p.description, grams: p.grams });
  return out;
}
```

```ts
// src/foods/resolve.ts
// A food_ref is "foods:<source>:<source_id>" | "custom:<id>" | "recipe:<id>". Resolve one to what Food detail needs.
import type { Db } from '../db/types';
import type { Nutrients } from '../nutrients';
import { bySource, portions } from './db';
import { customFood } from '../diary/customFoods';
import { recipe } from '../diary/recipes';
import { servingOptions, type ServingOption } from './servings';

export type Resolved = { ref: string; name: string; brand: string | null; per100: Nutrients; options: ServingOption[]; barcode: string | null };

export async function resolve(ref: string, foods: Db | null, diary: Db): Promise<Resolved | null> {
  const [kind, id, sourceId] = ref.split(':');
  if (kind === 'foods' && foods) {
    const f = await bySource(foods, id, sourceId);
    return f && { ref, name: f.name, brand: f.brand, per100: f.per100, barcode: f.barcode, options: servingOptions(f, await portions(foods, f.id)) };
  }
  if (kind === 'custom') {
    const f = await customFood(diary, id);
    return f && { ref, name: f.name, brand: f.brand, per100: f.nutrients, barcode: f.barcode, options: servingOptions(f, []) };
  }
  if (kind === 'recipe') {
    const r = await recipe(diary, id);
    // Recipes are per serving, so treat one serving as 100 "grams" of a per-100 record.
    return r && { ref, name: r.name, brand: null, per100: r.nutrients, barcode: null, options: [{ label: '1 serving', grams: 100 }] };
  }
  return null;
}
```

**Step 4:** Screens.

`app/(tabs)/search.tsx`: text input with 250 ms debounce. Results in three groups while the query is shorter than two characters: recents (`recentEntries`), custom foods, recipes. With a query: `searchCustomFoods`, `allRecipes` filtered by name, then `search(foods, q)`. Each row navigates to `/food/${ref}?day=&meal=` carrying the incoming `day` and `meal` params, where `ref` is `foodRef(f)` for database foods. Recents navigate with `?relog=<entryId>` instead, and Food detail preloads that entry's amount. A "New custom food" row at the bottom navigates to `/custom/new`. While `foods_md5` is unset, meaning only the starter file is installed, show a one-line banner "Generic foods only. Packaged foods arrive with the full database, in Settings."

`app/food/[ref].tsx`: calls `resolve`. Shows name and brand, a serving picker (segmented list of `options`), a quantity input defaulting to 1, and the computed nutrients `scale(per100, option.grams * qty)`. The panel shows energy, protein, carbs, fat, fiber, sugars, sodium; a "More" toggle reveals the rest of `PANEL` and any extra keys present. "Add to {meal}" calls `addEntry` with `id: Crypto.randomUUID()`, `amount: grams`, `amount_desc: qty === 1 ? option.label : `${qty} × ${option.label}``, `food_ref: ref`, `source: 'app'`, then `router.dismissTo('/')`. Custom foods show an "Edit" header button to `/custom/${id}`; foods with a barcode show a contribute button (Milestone 6).

Edit mode: with an `entry=<id>` param the screen loads that entry, preselects the option whose grams equal `amount` (or adds a "<amount> g" option), shows meal and day pickers, and the button reads "Save" and calls `updateEntry`, keeping `id`, `source` and `health_id`. When `ref` is `entry`, or `resolve` returns null because the food left the database, per100 is `scale(entry.nutrients, 10000 / (entry.amount ?? 100))` with the single option "as logged", so imported rows can still be moved between meals and days or rescaled.

**Step 5:** Manual check on device with a downloaded database (Task 2.16 first if none): search "peanut butter", open one, pick a serving, add, see it on Today. Tap it on Today, change the serving, Save, see the total change. Verify FTS search returns within a second on a 1M-row file.

**Step 6:** Commit: `git add -A && git commit -m "feat: search and food detail with serving picker"`

### Task 2.12: Barcode scanning

**Files:** Create `app/(tabs)/scan.tsx`, `src/foods/offLookup.ts`, `src/foods/offLookup.test.ts`

**Step 1:** Test the pure mapper for the optional Open Food Facts lookup.

```ts
// src/foods/offLookup.test.ts
import { fromOffProduct } from './offLookup';
test('maps OFF API product to a custom food per 100 g', () => {
  const f = fromOffProduct('3017620422003', { product_name: 'Nutella', brands: 'Ferrero', serving_quantity: 15, serving_size: '15 g',
    nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, sodium_100g: 0.043 } });
  expect(f).toMatchObject({ barcode: '3017620422003', name: 'Nutella', brand: 'Ferrero', serving_size: 15, serving_unit: 'g',
    nutrients: { '1008': 539, '1003': 6.3, '1005': 57.5, '1004': 30.9, '1093': 43 } });
});
test('product without energy yields null', () => expect(fromOffProduct('x', { nutriments: {} })).toBeNull());
test('kilojoules-only product gets kcal', () => expect(fromOffProduct('x', { product_name: 'Snack', nutriments: { 'energy-kj_100g': 1674 } })?.nutrients['1008']).toBe(400.1));
```

**Step 2:** Run: `npm test -- offLookup`. Expected: cannot find module.

**Step 3:** Implement.

```ts
// src/foods/offLookup.ts
import list from '../nutrients.json';
import type { CustomFood } from '../diary/customFoods';
import type { Nutrients } from '../nutrients';

type Def = { id: string; off: string | null; off_factor: number };
const DEFS = (list as Def[]).filter(d => d.off);

export type OffProduct = { product_name?: string; brands?: string; serving_quantity?: number | string; serving_size?: string; nutriments?: Record<string, number | string> };

export function fromOffProduct(gtin13: string, p: OffProduct): Omit<CustomFood, 'id'> | null {
  const nutrients: Nutrients = {};
  for (const d of DEFS) {
    const v = Number(p.nutriments?.[`${d.off}_100g`]);
    if (Number.isFinite(v)) nutrients[d.id] = Math.round(v * d.off_factor * 1000) / 1000;
  }
  if (nutrients['1008'] === undefined) {   // kilojoules-only products, common outside the US
    const kj = Number(p.nutriments?.['energy-kj_100g'] ?? p.nutriments?.['energy_100g']);
    if (Number.isFinite(kj)) nutrients['1008'] = Math.round((kj / 4.184) * 10) / 10;
  }
  if (nutrients['1008'] === undefined || !p.product_name) return null;
  const serving = Number(p.serving_quantity);
  return {
    barcode: gtin13, name: p.product_name, brand: p.brands || null,
    serving_size: Number.isFinite(serving) && serving > 0 ? serving : null,
    serving_unit: Number.isFinite(serving) && serving > 0 ? 'g' : null,
    serving_desc: p.serving_size || null, nutrients,
  };
}

export async function lookupOff(gtin13: string): Promise<Omit<CustomFood, 'id'> | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${gtin13}.json?fields=product_name,brands,serving_quantity,serving_size,nutriments`,
    { headers: { 'User-Agent': 'CalorieTracker/1.0 (github.com/codejetnet/calorie-tracker)' } });
  if (!res.ok) return null;
  const json = await res.json();
  return json.status === 1 ? fromOffProduct(gtin13, json.product) : null;
}
```

**Step 4:** Scan screen. Uses `CameraView` from expo-camera with `barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}`. Request permission on mount with `useCameraPermissions`; if denied show a text and a button to open settings. `onBarcodeScanned`: ignore if the same raw value was seen in the last two seconds; `normalize(data, type)`; if null show "Not a product barcode" for two seconds. Otherwise look up `customFoodByBarcode` then `byBarcode`. Hit: `router.push(`/food/${ref}?day=&meal=`)` where `ref` is `custom:<id>` or `foodRef(f)`. Miss: if the `off_lookup` setting is `1`, call `lookupOff` at once; otherwise show a bottom card "Not on this phone" with "Look up on Open Food Facts (sends only the barcode)" and "Create custom food". A successful lookup saves the product with `upsertCustomFood` and opens `/food/custom:<id>` directly, so the scan behaves like a database hit from the first launch and the food is cached in SQLite for next time. A miss there shows "Not in Open Food Facts either" with "Create custom food", which navigates to `/custom/new?barcode=<gtin>`, plus, while `foods_md5` is unset, "It may be in the full database. Download it in Settings." Pass `day` and `meal` through from the Today screen's Add button by giving Scan the same params (Today's Add button offers both Search and Scan).

**Step 5:** Manual check: scan a common US product, land on Food detail. Scan a gift card, see "Not a product barcode". Scan something obscure, see the miss card.

**Step 6:** Commit: `git add -A && git commit -m "feat: barcode scanning with optional Open Food Facts lookup"`

### Task 2.13: Custom food editor

**Files:** Create `src/foods/per100.ts`, `src/foods/per100.test.ts`, `app/custom/[id].tsx`

**Step 1:** Test.

```ts
import { toPer100 } from './per100';
test('label values per serving become per 100 g', () => {
  expect(toPer100({ '1008': 190, '1003': 7 }, 32)).toEqual({ '1008': 593.75, '1003': 21.875 });
});
```

**Step 2:** Run: `npm test -- per100`. Expected: cannot find module.

**Step 3:** Implement: `export const toPer100 = (v: Nutrients, basisGrams: number) => scale(v, 10000 / basisGrams);` in `src/foods/per100.ts` (scale multiplies by grams/100, so 10000/basis gives ×100/basis). Run the test. Expected: pass.

**Step 4:** Screen `app/custom/[id].tsx`. `id === 'new'` creates; otherwise loads `customFood`. Accepts `barcode` and `prefill` params. Fields: name, brand, barcode (with a "Scan" shortcut later; typing is fine now), serving size number, unit (g/ml), serving description. A "Values are per" toggle: "serving" or "100 g". Nutrient inputs: energy, protein, carbs, fat, fiber, sugars, sodium visible; "More" reveals the rest of `PANEL`. On save: build `nutrients` from filled inputs, convert with `toPer100` when the toggle is "serving", `upsertCustomFood`, then `router.replace('/food/custom:<id>')`. Delete button on existing foods with a two-tap confirm (first tap turns the button red and says "Tap again to delete").

**Step 5:** Manual check: create a food from a label, add it to Today, edit it, see Food detail update.

**Step 6:** Commit: `git add -A && git commit -m "feat: custom food editor"`

### Task 2.14: Recipes

**Files:** Create `app/recipe/[id].tsx`. Modify `app/(tabs)/search.tsx` (picker mode).

`app/recipe/[id].tsx`: name, servings, ingredient list with amount in grams and computed energy, "Add ingredient" navigates to `/search?pick=recipe` and Food detail in pick mode returns via `router.navigate({ pathname: '/recipe/[id]', params: { id, picked: JSON.stringify(ingredient) } })` with `{ name, amount: grams, nutrients: scale(per100, grams), food_ref }`. Per-serving totals from `recipeNutrients`. Save calls `upsertRecipe`. Recipes appear in Search and resolve through `resolve` as `recipe:<id>` with one option, "1 serving".

Manual check: build a two-ingredient recipe, log one serving, totals match by hand.

Commit: `git add -A && git commit -m "feat: recipes"`

### Task 2.15: Weight log

**Files:** Create `app/weight.tsx`. Add a "Weight" link on Today's header.

Number input in kg or lb according to the `weight_unit` setting (lb converts with 0.45359237 on save). List of past entries newest first, each deletable by long press. No chart in v1; the HTML report in Task 3.2 carries the chart.

Commit: `git add -A && git commit -m "feat: weight log"`

### Task 2.16: Settings, goals, meals, food database download

**Files:** Create `app/(tabs)/settings.tsx`, `src/foods/useFoodsUpdate.ts`

**Settings sections in order:** Goals, Meals, Food database, Backup (Task 3.4), Import and export (Tasks 3.6 and 4.4), Health (Task 5.1), Privacy, About (Task 6.2).

- **Goals:** four numeric inputs for energy, protein, carbs, fat, prefilled from `goals(db)`, and a "More" expander with one input per remaining `PANEL` nutrient showing its default target. On blur, store only values that differ from `DEFAULT_TARGETS` in `goals`, so a later change to the defaults still reaches users who never touched that nutrient.
- **Meals:** one text input, comma separated, saved to `meals`. Empty falls back to `DEFAULT_MEALS`.
- **Food database:** country picker populated from the manifest's countries (fallback list `US, CA, GB, AU, FR, DE` when offline). Shows installed `foods_built_at`, or "Starter database: generic foods only" while `foods_md5` is unset. Button "Check for update" fetches the manifest and, if the md5 differs, shows "Full database available, N MB" with a "Download" button, a progress bar, and the line "Keep the app open. If interrupted, the download resumes where it left off." Download calls `closeFoods`, `installFoods`, `reopenFoods`, then stores `foods_md5` and `foods_built_at` with `notify = false`. On error, show the message inline and keep the old database. On app foreground, the Today screen runs the manifest check when `checkDue(foods_checked_at, Date.now(), Math.random())` says so, stores `foods_checked_at`, and shows a one-line banner, "Download the full food database" while on the starter or "New food database available" afterwards, that links to Settings. Nothing downloads without a tap.
- **Privacy:** toggle "Look up missing barcodes on Open Food Facts automatically" bound to `off_lookup`, default off, with one sentence saying it sends only the barcode and that when off the Scan screen asks each time.

Manual check: fresh install, download US, search works, Check for update says current.

Commit: `git add -A && git commit -m "feat: settings with goals, meals, and food database download"`

---

## Milestone 3: Backup, report, coach sharing

### Task 3.1: Diary export and import as JSON

**Files:** Create `src/backup/serialize.ts`, `src/backup/serialize.test.ts`. Modify `src/diary/entries.ts` (export `INSERT_ENTRY`, `entryParams`, add `allEntries`).

**Step 1:** Test.

```ts
// src/backup/serialize.test.ts
import { nodeDb } from '../../test/nodeDb';
import { migrate, DIARY_SCHEMA_VERSION } from '../db/diary';
import { addEntry } from '../diary/entries';
import { upsertCustomFood } from '../diary/customFoods';
import { setWeight } from '../diary/weights';
import { setSetting } from '../diary/settings';
import { exportDiary, importDiary, validateDiaryFile } from './serialize';

async function seeded() {
  const db = nodeDb(); await migrate(db);
  await addEntry(db, { id: 'e1', day: '2026-09-15', meal: 'Lunch', name: 'Nutella', amount: 15, amount_desc: '1 tbsp', nutrients: { '1008': 80.85 }, food_ref: 'foods:off:3017620422003', source: 'app', health_id: null });
  await upsertCustomFood(db, { id: 'c1', barcode: null, name: 'Mom soup', brand: null, serving_size: 250, serving_unit: 'ml', serving_desc: '1 bowl', nutrients: { '1008': 40 } });
  await setWeight(db, { day: '2026-09-15', kg: 80.2 });
  await setSetting(db, 'goals', '{"1008":2100}');
  await setSetting(db, 'foods_md5', 'device-only', false);
  return db;
}

test('export excludes device-local settings', async () => {
  const file = await exportDiary(await seeded());
  expect(file.schemaVersion).toBe(DIARY_SCHEMA_VERSION);
  expect(file.settings).toEqual({ goals: '{"1008":2100}' });
  expect(file.entries).toHaveLength(1);
});

test('import into an empty diary reproduces the export', async () => {
  const file = await exportDiary(await seeded());
  const db2 = nodeDb(); await migrate(db2);
  await importDiary(db2, file);
  const again = await exportDiary(db2);
  expect({ ...again, exportedAt: 0 }).toEqual({ ...file, exportedAt: 0 });
});

test('newer schema is refused', () => {
  expect(() => validateDiaryFile({ app: 'calorie-tracker', schemaVersion: DIARY_SCHEMA_VERSION + 1, entries: [], custom_foods: [], recipes: [], weights: [], settings: {} }))
    .toThrow(/newer version/);
  expect(() => validateDiaryFile({ hello: 1 })).toThrow(/not a calorie-tracker backup/);
});
```

**Step 2:** Run: `npm test -- serialize`. Expected: cannot find module.

**Step 3:** In `src/diary/entries.ts` export the insert pieces and add `allEntries`:

```ts
export const INSERT_ENTRY = `INSERT INTO entries (${COLS}) VALUES (?,?,?,?,?,?,?,?,?,?)`;
export const entryParams = params;   // rename the module-level `params` const to be exported like this
export async function allEntries(db: Db): Promise<Entry[]> {
  return (await db.all<Row>(`SELECT ${COLS} FROM entries ORDER BY day, created_at`)).map(fromRow);
}
```

Then implement:

```ts
// src/backup/serialize.ts
import type { Db } from '../db/types';
import { DIARY_SCHEMA_VERSION } from '../db/diary';
import { allEntries, entryParams, INSERT_ENTRY, type Entry } from '../diary/entries';
import { allCustomFoods, upsertCustomFood, type CustomFood } from '../diary/customFoods';
import { allRecipes, upsertRecipe, type Recipe } from '../diary/recipes';
import { allWeights, setWeight, type Weight } from '../diary/weights';
import { allSettings, setSetting } from '../diary/settings';
import { diaryChanged } from '../diary/changed';

export type DiaryFile = {
  app: 'calorie-tracker'; schemaVersion: number; exportedAt: string;
  entries: Entry[]; custom_foods: CustomFood[]; recipes: Recipe[]; weights: Weight[]; settings: Record<string, string>;
};

const DEVICE_KEYS = /^(foods_|backup_|app_uuid$)/;   // device-local; never leaves in a backup

export async function exportDiary(db: Db): Promise<DiaryFile> {
  const settings = Object.fromEntries(Object.entries(await allSettings(db)).filter(([k]) => !DEVICE_KEYS.test(k)));
  return {
    app: 'calorie-tracker', schemaVersion: DIARY_SCHEMA_VERSION, exportedAt: new Date().toISOString(),
    entries: await allEntries(db), custom_foods: await allCustomFoods(db), recipes: await allRecipes(db),
    weights: await allWeights(db), settings,
  };
}

export function validateDiaryFile(x: unknown): DiaryFile {
  const f = x as Partial<DiaryFile> | null;
  if (!f || f.app !== 'calorie-tracker' || typeof f.schemaVersion !== 'number') throw new Error('This file is not a calorie-tracker backup.');
  if (f.schemaVersion > DIARY_SCHEMA_VERSION) throw new Error('This backup was made by a newer version of the app. Update the app first.');
  for (const k of ['entries', 'custom_foods', 'recipes', 'weights'] as const) if (!Array.isArray(f[k])) throw new Error(`Backup is missing ${k}.`);
  return { ...f, settings: f.settings ?? {} } as DiaryFile;
}

/** Replace the whole diary with the file's content, atomically. Device-local settings are kept. */
export async function importDiary(db: Db, file: DiaryFile): Promise<void> {
  await db.tx(async () => {
    await db.run('DELETE FROM entries'); await db.run('DELETE FROM custom_foods');
    await db.run('DELETE FROM recipes'); await db.run('DELETE FROM weights');
    await db.run(`DELETE FROM settings WHERE key NOT GLOB 'foods_*' AND key NOT GLOB 'backup_*' AND key != 'app_uuid'`);
    for (const e of file.entries) await db.run(INSERT_ENTRY, entryParams(e));
    for (const c of file.custom_foods) await upsertCustomFood(db, c);
    for (const r of file.recipes) await upsertRecipe(db, r);
    for (const w of file.weights) await setWeight(db, w);
    for (const [k, v] of Object.entries(file.settings)) if (!DEVICE_KEYS.test(k)) await setSetting(db, k, v, false);
  });
  diaryChanged();
}
```

**Step 4:** Run: `npm test`. Expected: all pass.

**Step 5:** Commit: `git add -A && git commit -m "feat: diary export and import as versioned JSON"`

### Task 3.2: HTML report

**Files:** Create `src/backup/report.ts`, `src/backup/report.test.ts`

**Step 1:** Test.

```ts
// src/backup/report.test.ts
import { renderReport } from './report';
import type { DiaryFile } from './serialize';

const file: DiaryFile = {
  app: 'calorie-tracker', schemaVersion: 1, exportedAt: '2026-09-15T20:00:00Z',
  entries: [
    { id: 'a', day: '2026-09-14', meal: 'Lunch', name: 'Rice <white>', amount: 200, amount_desc: '1 cup', nutrients: { '1008': 260, '1003': 5.4 }, food_ref: null, source: 'app', health_id: null },
    { id: 'b', day: '2026-09-15', meal: 'Dinner', name: 'Salmon', amount: 150, amount_desc: null, nutrients: { '1008': 312, '1003': 30 }, food_ref: null, source: 'app', health_id: null },
  ],
  custom_foods: [], recipes: [], weights: [{ day: '2026-09-15', kg: 80.2 }, { day: '2026-09-14', kg: 80.6 }], settings: { goals: '{"1008":2000}' },
};

test('report is self-contained and carries totals, detail, weight', () => {
  const html = renderReport(file, '2026-09-14', '2026-09-15');
  expect(html).not.toMatch(/https?:\/\//);
  expect(html).toContain('<td>2026-09-14</td><td>260</td>');
  expect(html).toContain('Rice &lt;white&gt;');
  expect(html).toContain('80.2');
  expect(html).toContain('<rect');
  expect(html).toContain('<polyline');   // weight chart
});
```

**Step 2:** Run: `npm test -- report`. Expected: cannot find module.

**Step 3:** Implement.

```ts
// src/backup/report.ts
import { BY_ID, DEFAULT_TARGETS, sum, type Nutrients } from '../nutrients';
import { addDays } from '../dates';
import type { DiaryFile } from './serialize';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmt = (v: number | undefined) => (v === undefined ? '' : String(Math.round(v * 10) / 10));
const COLS = ['1008', '1003', '1005', '1004', '1079'];

export function renderReport(file: DiaryFile, from: string, to: string): string {
  const goals: Nutrients = { ...DEFAULT_TARGETS, ...(file.settings.goals ? JSON.parse(file.settings.goals) : {}) };
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const byDay = days.map(d => file.entries.filter(e => e.day === d));
  const totals = byDay.map(es => sum(es.map(e => e.nutrients)));

  const kcalMax = Math.max(goals['1008'] ?? 0, ...totals.map(t => t['1008'] ?? 0), 1);
  const w = 600 / days.length;
  const bars = totals.map((t, i) => {
    const h = ((t['1008'] ?? 0) / kcalMax) * 100;
    return `<rect x="${(i * w).toFixed(1)}" y="${(100 - h).toFixed(1)}" width="${Math.max(w - 2, 1).toFixed(1)}" height="${h.toFixed(1)}" fill="#3a7d5c"/>`;
  }).join('');
  const goalY = goals['1008'] ? (100 - (goals['1008'] / kcalMax) * 100).toFixed(1) : null;
  const goalLine = goalY ? `<line x1="0" x2="600" y1="${goalY}" y2="${goalY}" stroke="#b33" stroke-dasharray="4 3"/>` : '';

  const header = COLS.map(id => `<th>${esc(BY_ID[id].name)} (${BY_ID[id].unit})</th>`).join('');
  const rows = days.map((d, i) => `<tr><td>${d}</td>${COLS.map(id => `<td>${fmt(totals[i][id])}</td>`).join('')}</tr>`).join('');

  const detail = days.map((d, i) => byDay[i].length === 0 ? '' :
    `<details><summary>${d} · ${fmt(totals[i]['1008'])} kcal</summary><table><tr><th>Meal</th><th>Food</th><th>Amount</th><th>kcal</th><th>Protein</th></tr>` +
    byDay[i].map(e => `<tr><td>${esc(e.meal)}</td><td>${esc(e.name)}</td><td>${esc(e.amount_desc ?? (e.amount ? `${e.amount} g` : ''))}</td><td>${fmt(e.nutrients['1008'])}</td><td>${fmt(e.nutrients['1003'])}</td></tr>`).join('') +
    `</table></details>`).join('');

  const ws = file.weights.filter(x => x.day >= from && x.day <= to).sort((a, b) => a.day.localeCompare(b.day));
  const weights = ws.map(x => `<tr><td>${x.day}</td><td>${x.kg}</td></tr>`).join('');
  const lo = Math.min(...ws.map(x => x.kg)), span = Math.max(...ws.map(x => x.kg)) - lo || 1;
  const weightChart = ws.length < 2 ? '' :
    `<svg viewBox="0 0 600 100" width="100%" height="120" role="img" aria-label="Weight"><polyline fill="none" stroke="#3a7d5c" stroke-width="2" points="${
      ws.map((x, i) => `${((i * 600) / (ws.length - 1)).toFixed(1)},${(95 - ((x.kg - lo) / span) * 90).toFixed(1)}`).join(' ')}"/></svg>`;

  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Food diary ${from} to ${to}</title>
<style>body{font:14px system-ui,sans-serif;margin:24px;max-width:900px}table{border-collapse:collapse;margin:8px 0}td,th{padding:4px 8px;border-bottom:1px solid #ddd;text-align:right}td:first-child,th:first-child{text-align:left}summary{cursor:pointer;margin:6px 0}</style>
<h1>Food diary</h1><p>${from} to ${to}. Generated ${esc(file.exportedAt)}.${goals['1008'] ? ` Goal ${goals['1008']} kcal (dashed line).` : ''}</p>
<svg viewBox="0 0 600 100" width="100%" height="120" role="img" aria-label="Daily energy">${bars}${goalLine}</svg>
<h2>Daily totals</h2><table><tr><th>Day</th>${header}</tr>${rows}</table>
<h2>Detail</h2>${detail || '<p>No entries.</p>'}
${weights ? `<h2>Weight</h2>${weightChart}<table><tr><th>Day</th><th>kg</th></tr>${weights}</table>` : ''}`;
}
```

**Step 4:** Run: `npm test -- report`. Expected: pass.

**Step 5:** Commit: `git add -A && git commit -m "feat: self-contained HTML diary report"`

### Task 3.3: Backup documents

**Files:** Create `src/backup/documents.ts`

Adjust this task if the spike in Task 2.2 ended with the local-module fallback: `createDocument` then calls that module instead of `saveDocuments`.

```ts
// src/backup/documents.ts
import * as FS from 'expo-file-system/legacy';
import { saveDocuments } from '@react-native-documents/picker';

/**
 * Ask the user to create `name` in their cloud storage through the system dialog, seeded with
 * `content`. Returns the document URI to remember, or null if they cancelled. Google Drive
 * supports this but not folder grants, which is why a backup is two picked files, not a folder.
 */
export async function createDocument(name: string, mime: string, content: string): Promise<string | null> {
  const seed = `${FS.cacheDirectory}${name}`;
  await FS.writeAsStringAsync(seed, content);
  const [r] = await saveDocuments({ sourceUris: [seed], fileName: name, mimeType: mime });
  return r?.uri ?? null;
}

/** Overwrite a document from createDocument in place. Throws if the URI no longer works. */
export function overwrite(uri: string, content: string): Promise<void> {
  return FS.StorageAccessFramework.writeAsStringAsync(uri, content);
}
```

No unit test: this is a thin wrapper over a native API and is exercised by the manual check in Task 3.4.

Commit: `git add -A && git commit -m "feat: create-document and overwrite helpers for the backup files"`

### Task 3.4: Backup scheduler and wiring

**Files:** Create `src/backup/scheduler.ts`, `src/backup/BackupWiring.tsx`. Modify `app/_layout.tsx`, `app/(tabs)/index.tsx` (pending banner), `app/(tabs)/settings.tsx` (Backup section).

**Step 1:** Scheduler. The report is small and is rewritten five seconds after any change. The diary can be tens of megabytes after an import, so it is rewritten only when the app goes to the background, which on a phone is every screen lock, or on the next launch if that was missed. Drive and OneDrive keep prior versions of each file for 30 days, so there are no snapshots.

```ts
// src/backup/scheduler.ts
import type { Db } from '../db/types';
import { getSetting, setSetting } from '../diary/settings';
import { addDays, today } from '../dates';
import { exportDiary } from './serialize';
import { renderReport } from './report';
import { overwrite } from './documents';

let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;

export function scheduleBackup(db: Db, withDiary = false, delayMs = 5000): void {
  clearTimeout(timer);
  timer = setTimeout(() => { void runBackup(db, withDiary); }, delayMs);
}

/** Overwrite report.html; also diary.json when asked to, or when a previous attempt failed. */
export async function runBackup(db: Db, withDiary: boolean): Promise<'skipped' | 'ok' | 'failed'> {
  if (running) { scheduleBackup(db, withDiary); return 'skipped'; }
  const reportUri = await getSetting(db, 'backup_uri_report');
  const diaryUri = await getSetting(db, 'backup_uri_diary');
  if (!reportUri || !diaryUri) return 'skipped';
  running = true;
  try {
    const file = await exportDiary(db);
    const t = today();
    await overwrite(reportUri, renderReport(file, addDays(t, -29), t));
    if (withDiary || (await getSetting(db, 'backup_pending')) === '1') {
      await overwrite(diaryUri, JSON.stringify(file));
      await setSetting(db, 'backup_dirty', '0', false);
    }
    await setSetting(db, 'backup_pending', '0', false);
    await setSetting(db, 'backup_last_ok', new Date().toISOString(), false);
    return 'ok';
  } catch {
    await setSetting(db, 'backup_pending', '1', false);
    return 'failed';
  } finally {
    running = false;
  }
}
```

**Step 2:** Wiring component, rendered inside `DbProvider` in `app/_layout.tsx`.

```tsx
// src/backup/BackupWiring.tsx
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useDb } from '../db/provider';
import { onDiaryChanged } from '../diary/changed';
import { getSetting, setSetting } from '../diary/settings';
import { runBackup, scheduleBackup } from './scheduler';

export function BackupWiring() {
  const { diary } = useDb();
  useEffect(() => {
    onDiaryChanged(() => { void setSetting(diary, 'backup_dirty', '1', false); scheduleBackup(diary); });
    // Write the diary when it is dirty and the app leaves the foreground, or when a previous attempt failed.
    const flush = async () => {
      const dirty = (await getSetting(diary, 'backup_dirty')) === '1';
      const pending = (await getSetting(diary, 'backup_pending')) === '1';
      if (dirty || pending) void runBackup(diary, true);
    };
    void flush();   // the last session may have died before its background write
    const sub = AppState.addEventListener('change', s => { if (s === 'background' || s === 'active') void flush(); });
    return () => sub.remove();
  }, [diary]);
  return null;
}
```

**Step 3:** Settings Backup section. "Set up backup" calls `createDocument('report.html', 'text/html', renderReport(...))` and then `createDocument('diary.json', 'application/json', JSON.stringify(await exportDiary(db)))`; if either returns null, store nothing and show "Backup not set up". Otherwise store `backup_uri_report` and `backup_uri_diary` with `notify = false`, set `backup_dirty` to `0` and `backup_last_ok` to now. Status line shows `backup_last_ok` as "Last backup: <time>" or "Backup failed" with a Retry button that calls `runBackup(db, true)` when `backup_pending` is `1`. Under it, static text: "To share with a coach, share the folder that holds report.html from your cloud app. They can open it in any browser; it refreshes every time you log." Today shows a one-line banner when `backup_pending` is `1`.

**Step 4:** Manual check: set up backup into a Drive folder, add an entry, wait five seconds, confirm `report.html` updated in Drive and opens correctly on a laptop. Lock the phone, unlock, confirm `diary.json` updated. Add another entry, confirm the same two files updated rather than duplicated. Turn on airplane mode, add an entry, see the failure banner; turn it off, background and foreground the app, see the banner clear.

**Step 5:** Commit: `git add -A && git commit -m "feat: report on every change and diary on background, written to the two backup files"`

### Task 3.5: Restore

**Files:** Modify `app/(tabs)/settings.tsx`

"Restore from backup" in the Backup section: `DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true })`, `readAsStringAsync`, `validateDiaryFile(JSON.parse(text))`. Show a summary "N entries, M custom foods, K recipes, exported <date>. This replaces everything in this app." with a two-tap Replace button. On confirm `importDiary`, then show the counts. Errors from `validateDiaryFile` render inline.

Manual check: restore the `diary.json` from Drive onto a second device or after clearing app data. A second device then runs "Set up backup" for its own pair of files; two phones never share one `diary.json`.

Commit: `git add -A && git commit -m "feat: restore diary from a backup file"`

### Task 3.6: Export via share sheet

**Files:** Create `src/backup/csv.ts`, `src/backup/csv.test.ts`. Modify `app/(tabs)/settings.tsx`.

**Step 1:** Test.

```ts
import { entriesToCsv } from './csv';
test('csv has panel columns and escapes quotes', () => {
  const csv = entriesToCsv([{ id: 'a', day: '2026-09-15', meal: 'Lunch', name: 'Rice, "white"', amount: 200, amount_desc: '1 cup', nutrients: { '1008': 260 }, food_ref: null, source: 'app', health_id: null }]);
  const [header, row] = csv.split('\r\n');
  expect(header.startsWith('day,meal,name,amount_g,amount_desc,energy_kcal,protein_g')).toBe(true);
  expect(row.startsWith('2026-09-15,Lunch,"Rice, ""white""",200,1 cup,260,')).toBe(true);
});
```

**Step 2:** Run: `npm test -- csv`. Expected: cannot find module.

**Step 3:** Implement.

```ts
// src/backup/csv.ts
import { PANEL } from '../nutrients';
import type { Entry } from '../diary/entries';
const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function entriesToCsv(entries: Entry[]): string {
  const header = ['day', 'meal', 'name', 'amount_g', 'amount_desc', ...PANEL.map(n => `${n.key}_${n.unit.replace('µ', 'u')}`)];
  const lines = entries.map(e => [e.day, e.meal, e.name, e.amount, e.amount_desc, ...PANEL.map(n => e.nutrients[n.id])].map(cell).join(','));
  return [header.join(','), ...lines].join('\r\n');
}
```

**Step 4:** Settings "Import and export" section: two date inputs (from, to; default last 30 days), "Share CSV" and "Share report". Each writes to `${FS.cacheDirectory}export.csv` or `export.html` and calls `Sharing.shareAsync(uri, { mimeType, dialogTitle: 'Share diary' })`. CSV uses `entriesBetween`; the report uses `renderReport(await exportDiary(db), from, to)`.

**Step 5:** Run tests, manual check by sharing to Gmail, commit: `git add -A && git commit -m "feat: export CSV and HTML report through the share sheet"`

---

## Milestone 4: Import from Cronometer and MyFitnessPal

### Task 4.1: CSV parser

**Files:** Create `src/import/csv.ts`, `src/import/csv.test.ts`

**Step 1:** Test.

```ts
import { parseCsv } from './csv';
test('quoted fields, escaped quotes, CRLF, BOM', () => {
  expect(parseCsv('﻿a,b\r\n1,"x, ""y"""\r\n2,\r\n')).toEqual([['a', 'b'], ['1', 'x, "y"'], ['2', '']]);
});
test('newline inside quotes', () => {
  expect(parseCsv('a\n"line1\nline2"')).toEqual([['a'], ['line1\nline2']]);
});
```

**Step 2:** Run: `npm test -- import/csv`. Expected: cannot find module.

**Step 3:** Implement.

```ts
// src/import/csv.ts
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
```

**Step 4:** Run tests. Expected: pass. Commit: `git add -A && git commit -m "feat: minimal RFC 4180 CSV parser"`

### Task 4.2: Cronometer importer

**Files:** Create `src/import/hash.ts`, `src/import/cronometer.ts`, `src/import/cronometer.test.ts`, `fixtures/cronometer-servings.csv`, `fixtures/cronometer-biometrics.csv`

**Step 1:** Fixtures. Copy only the header row from the real exports in Task 0.1, then write about ten made-up data rows by hand in the same shapes. Keep at least one row whose Amount is in grams, one in cups, two identical rows on the same day, and one weight row in each unit the real file uses. Nothing from the real exports goes into the repo, which is public; they stay in `fixtures/raw/`, which is gitignored.

**Step 2:** Test. Adjust the expected values to your fixture rows.

```ts
// src/import/cronometer.test.ts
import { readFileSync } from 'node:fs';
import { isCronometerBiometrics, isCronometerServings, parseBiometrics, parseServings } from './cronometer';
import { parseCsv } from './csv';

const servings = readFileSync(`${__dirname}/../../fixtures/cronometer-servings.csv`, 'utf8');
const biometrics = readFileSync(`${__dirname}/../../fixtures/cronometer-biometrics.csv`, 'utf8');

test('detects file kinds by header', () => {
  expect(isCronometerServings(parseCsv(servings)[0])).toBe(true);
  expect(isCronometerBiometrics(parseCsv(biometrics)[0])).toBe(true);
  expect(isCronometerServings(['Date', 'Meal', 'Calories'])).toBe(false);
});

test('servings become entries with nutrients keyed by FDC id', () => {
  const entries = parseServings(servings);
  expect(entries).toHaveLength(10);                          // rows in your fixture
  const e = entries[0];
  expect(e.source).toBe('cronometer');
  expect(e.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(e.nutrients['1008']).toBeGreaterThan(0);
  expect(e.nutrients['1003']).toBeDefined();
});

test('ids are deterministic and unique even for identical rows', () => {
  const a = parseServings(servings), b = parseServings(servings);
  expect(a.map(e => e.id)).toEqual(b.map(e => e.id));
  expect(new Set(a.map(e => e.id)).size).toBe(a.length);
});

test('gram amounts are parsed, other units keep only the description', () => {
  const entries = parseServings(servings);
  expect(entries.some(e => e.amount !== null && /g$/i.test(e.amount_desc ?? ''))).toBe(true);
  expect(entries.some(e => e.amount === null && e.amount_desc)).toBe(true);
});

test('biometrics yield weights in kg', () => {
  const w = parseBiometrics(biometrics);
  expect(w.length).toBeGreaterThan(0);
  expect(w.every(x => x.kg > 20 && x.kg < 300)).toBe(true);
});
```

**Step 3:** Run: `npm test -- cronometer`. Expected: cannot find module.

**Step 4:** Implement. Check every key in `COLUMN_MAP` against the fixture's header row and fix spellings; Cronometer's exact labels are the source of truth.

```ts
// src/import/hash.ts
/** 64-bit-ish FNV-1a as hex, for stable import ids. Not for security. */
export function stableId(s: string): string {
  const h = (seed: number) => { let x = seed; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; } return x.toString(16).padStart(8, '0'); };
  return h(0x811c9dc5) + h(0x01234567);
}
```

```ts
// src/import/cronometer.ts
import { parseCsv } from './csv';
import { stableId } from './hash';
import type { Entry } from '../diary/entries';
import type { Weight } from '../diary/weights';
import type { Nutrients } from '../nutrients';

/** Cronometer column label -> [FDC nutrient id, factor to our unit]. Vitamin D IU -> µg is 0.025. */
export const COLUMN_MAP: Record<string, [string, number]> = {
  'Energy (kcal)': ['1008', 1], 'Protein (g)': ['1003', 1], 'Carbs (g)': ['1005', 1], 'Fat (g)': ['1004', 1],
  'Fiber (g)': ['1079', 1], 'Sugars (g)': ['2000', 1], 'Added Sugars (g)': ['1235', 1],
  'Saturated (g)': ['1258', 1], 'Trans-Fats (g)': ['1257', 1], 'Monounsaturated (g)': ['1292', 1], 'Polyunsaturated (g)': ['1293', 1],
  'Cholesterol (mg)': ['1253', 1], 'Sodium (mg)': ['1093', 1], 'Potassium (mg)': ['1092', 1], 'Calcium (mg)': ['1087', 1],
  'Iron (mg)': ['1089', 1], 'Magnesium (mg)': ['1090', 1], 'Phosphorus (mg)': ['1091', 1], 'Zinc (mg)': ['1095', 1],
  'Vitamin A (µg)': ['1106', 1], 'Vitamin C (mg)': ['1162', 1], 'Vitamin D (IU)': ['1114', 0.025], 'Vitamin E (mg)': ['1109', 1],
  'Vitamin K (µg)': ['1185', 1], 'B1 (Thiamine) (mg)': ['1165', 1], 'B2 (Riboflavin) (mg)': ['1166', 1], 'B3 (Niacin) (mg)': ['1167', 1],
  'B6 (Pyridoxine) (mg)': ['1175', 1], 'Folate (µg)': ['1177', 1], 'B12 (Cobalamin) (µg)': ['1178', 1],
  'Caffeine (mg)': ['1057', 1], 'Alcohol (g)': ['1018', 1], 'Water (g)': ['1051', 1],
};

export const isCronometerServings = (h: string[]) => h.includes('Day') && h.includes('Food Name');
export const isCronometerBiometrics = (h: string[]) => h.includes('Day') && h.includes('Metric') && h.includes('Amount');

export function parseServings(text: string): Entry[] {
  const [header, ...rows] = parseCsv(text);
  const col = (name: string) => header.indexOf(name);
  const iDay = col('Day'), iGroup = col('Group'), iName = col('Food Name'), iAmount = col('Amount');
  const nutCols = header.flatMap((h, i) => (COLUMN_MAP[h] ? [[i, COLUMN_MAP[h]] as const] : []));
  const seen = new Map<string, number>();
  const out: Entry[] = [];
  for (const r of rows) {
    if (!r[iDay] || !r[iName]) continue;
    const nutrients: Nutrients = {};
    for (const [i, [id, factor]] of nutCols) {
      const v = parseFloat(r[i]);
      if (Number.isFinite(v)) nutrients[id] = Math.round(v * factor * 1000) / 1000;
    }
    const day = r[iDay].slice(0, 10);
    const meal = r[iGroup] || 'Uncategorized';
    const amountDesc = r[iAmount]?.trim() || null;
    const grams = amountDesc && /^([\d.]+)\s*g$/i.exec(amountDesc);
    const key = [day, meal, r[iName], amountDesc ?? '', nutrients['1008'] ?? ''].join('|');
    const n = (seen.get(key) ?? 0) + 1; seen.set(key, n);
    out.push({
      id: 'cro-' + stableId(`${key}#${n}`), day, meal, name: r[iName],
      amount: grams ? parseFloat(grams[1]) : null, amount_desc: amountDesc, nutrients,
      food_ref: null, source: 'cronometer', health_id: null,
    });
  }
  return out;
}

export function parseBiometrics(text: string): Weight[] {
  const [header, ...rows] = parseCsv(text);
  const iDay = header.indexOf('Day'), iMetric = header.indexOf('Metric'), iUnit = header.indexOf('Unit'), iAmount = header.indexOf('Amount');
  const byDay = new Map<string, number>();
  for (const r of rows) {
    if (r[iMetric] !== 'Weight') continue;
    const v = parseFloat(r[iAmount]);
    if (!Number.isFinite(v)) continue;
    const kg = /lb/i.test(r[iUnit] ?? '') ? v * 0.45359237 : v;
    byDay.set(r[iDay].slice(0, 10), Math.round(kg * 100) / 100);
  }
  return [...byDay].map(([day, kg]) => ({ day, kg }));
}
```

**Step 5:** Run: `npm test -- cronometer`. Expected: pass once the map matches the fixture header. Commit: `git add -A && git commit -m "feat: Cronometer servings and biometrics import"`

### Task 4.3: MyFitnessPal importer

**Files:** Create `src/import/mfp.ts`, `src/import/mfp.test.ts`, `fixtures/mfp-*.csv`

**Step 1:** Open the privacy export from Task 0.1. Identify which CSV holds per-food diary rows and which holds weights, and record the headers in `docs/plans/export-headers.md`. Write ten-row synthetic fixtures the same way as Task 4.2. If you also have a premium Nutrition Summary export, fixture that too.

**Step 2:** Write tests in the same shape as Task 4.2: header detection for each MFP file kind, entry count, one entry's `day`, `meal`, `name`, `nutrients['1008']`, deterministic unique ids.

**Step 3:** Implement `src/import/mfp.ts` following `cronometer.ts` exactly: a `COLUMN_MAP` from the real header, `isMfpDiary(header)`, `parseMfpDiary(text)`, plus `isMfpSummary(header)` (contains `Date`, `Meal`, `Calories`) and `parseMfpSummary(text)` which emits one entry per row named `MyFitnessPal ${meal}` with `amount: null`. Skip MyFitnessPal's Vitamin A, Vitamin C, Calcium, and Iron columns, which are percentages of daily value, not amounts. Dates: write `parseMfpDate(s)` that accepts ISO `YYYY-MM-DD` and `Month D, YYYY`, returning `YYYY-MM-DD`; test both.

**Step 4:** Run tests, commit: `git add -A && git commit -m "feat: MyFitnessPal diary and summary import"`

### Task 4.4: Import runner and UI

**Files:** Create `src/import/index.ts`, `src/import/index.test.ts`. Modify `app/(tabs)/settings.tsx`.

**Step 1:** Test.

```ts
import { readFileSync } from 'node:fs';
import { nodeDb } from '../../test/nodeDb';
import { migrate } from '../db/diary';
import { detect, importText } from './index';

test('detects and imports, and re-import skips duplicates', async () => {
  const text = readFileSync(`${__dirname}/../../fixtures/cronometer-servings.csv`, 'utf8');
  expect(detect(text)).toBe('cronometer-servings');
  const db = nodeDb(); await migrate(db);
  const first = await importText(db, text);
  expect(first.entries).toBeGreaterThan(0);
  const second = await importText(db, text);
  expect(second.entries).toBe(0);
  expect(second.skipped).toBe(first.entries);
});

test('unknown files are rejected', () => expect(detect('foo,bar\n1,2')).toBeNull());
```

**Step 2:** Run: `npm test -- import/index`. Expected: cannot find module.

**Step 3:** Implement.

```ts
// src/import/index.ts
import type { Db } from '../db/types';
import { insertEntries } from '../diary/entries';
import { setWeight } from '../diary/weights';
import { parseCsv } from './csv';
import { isCronometerBiometrics, isCronometerServings, parseBiometrics, parseServings } from './cronometer';
import { isMfpDiary, isMfpSummary, parseMfpDiary, parseMfpSummary } from './mfp';

export type Kind = 'cronometer-servings' | 'cronometer-biometrics' | 'mfp-diary' | 'mfp-summary';
export type ImportResult = { kind: Kind; entries: number; weights: number; skipped: number };

export function detect(text: string): Kind | null {
  const header = parseCsv(text.slice(0, 4000))[0] ?? [];
  if (isCronometerServings(header)) return 'cronometer-servings';
  if (isCronometerBiometrics(header)) return 'cronometer-biometrics';
  if (isMfpDiary(header)) return 'mfp-diary';
  if (isMfpSummary(header)) return 'mfp-summary';
  return null;
}

export async function importText(db: Db, text: string): Promise<ImportResult> {
  const kind = detect(text);
  if (!kind) throw new Error('Not a Cronometer or MyFitnessPal export. Expected a CSV with a recognizable header row.');
  if (kind === 'cronometer-biometrics') {
    const w = parseBiometrics(text);
    await db.tx(async () => { for (const x of w) await setWeight(db, x); });
    return { kind, entries: 0, weights: w.length, skipped: 0 };
  }
  const entries = kind === 'cronometer-servings' ? parseServings(text) : kind === 'mfp-diary' ? parseMfpDiary(text) : parseMfpSummary(text);
  const inserted = await insertEntries(db, entries);
  return { kind, entries: inserted, weights: 0, skipped: entries.length - inserted };
}
```

**Step 4:** Settings UI under "Import and export": "Import Cronometer or MyFitnessPal file". `DocumentPicker.getDocumentAsync({ type: ['text/*', 'application/zip', 'application/octet-stream'], copyToCacheDirectory: true })`. If the name ends in `.zip`, `unzip` to a cache folder and run `importText` on every `.csv` inside, collecting results; otherwise read the one file. Show a result list "servings: 1,204 entries added, 0 skipped" per file, and show the thrown message for files that were not recognized. Because Health Connect writes happen only for entries logged in the app, imports do not write to Health Connect.

**Step 5:** Run tests, manual check with the real full exports on device (this is the real acceptance test for Milestone 4: your wife's full Cronometer history appears on the right days), commit: `git add -A && git commit -m "feat: import runner with file detection and zip support"`

---

## Milestone 5: Health Connect

### Task 5.1: Health module, permissions, read and write

**Files:** Create `src/health/index.ts` (default no-op used by tests; iOS gets `index.ios.ts` in Task 8.1), `src/health/index.android.ts`. Modify `app/food/[ref].tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/settings.tsx`.

**Step 1:** Default module. React Native's resolver picks `index.android.ts` on Android and this file elsewhere, so the iOS version later is one more file with the same exports.

```ts
// src/health/index.ts
import type { Entry } from '../diary/entries';
export const available = false;
export async function requestPermissions(): Promise<boolean> { return false; }
export async function readActiveCalories(_day: string): Promise<number | null> { return null; }
export async function writeNutrition(_e: Entry): Promise<string | null> { return null; }
export async function deleteNutrition(_id: string): Promise<void> {}
```

**Step 2:** Android module. Open `node_modules/react-native-health-connect/lib/typescript/types/records.types.d.ts` (path may differ by version) and check the `NutritionRecord` field names and unit strings before trusting the ones below.

```ts
// src/health/index.android.ts
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
  try { await deleteRecordsByUuids('Nutrition', [id]); } catch { /* record already gone */ }
}
```

**Step 3:** Wiring.
- Settings, Health section (Android only, `available === true`): a switch bound to `health_enabled`. Turning it on calls `requestPermissions`; if false, the switch snaps back and a line says "Permission not granted. Health Connect may need to be installed or updated."
- Create `src/diary/log.ts` with three functions: `logEntry(db, e)` is `addEntry` then, if `health_enabled === '1'`, `writeNutrition` and `setHealthId`; `unlogEntry(db, id)` is `deleteEntry` then `deleteNutrition(entry.health_id)` when set; `relogEntry(db, e)` is `deleteNutrition` of the old record, `updateEntry`, then `writeNutrition` and `setHealthId`. Switch Food detail Add and Save, Today delete and Today Undo to these, so every path that touches an entry keeps Health Connect in step.
- Today header: when enabled, `readActiveCalories(day)` and show "Burned: N kcal" and "Remaining: goal - eaten + burned".

**Step 4:** Manual check with a watch app that writes to Health Connect: burned calories match what Health Connect shows; a logged entry appears in the Health Connect app under Nutrition; editing it changes the record; deleting it removes it; Undo brings it back.

**Step 5:** Commit: `git add -A && git commit -m "feat: Health Connect read of active calories and write of nutrition"`

---

## Milestone 6: Public contribution and attribution

### Task 6.1: Contribute to Open Food Facts

The public contribution path. Non-developers do not open pull requests, so the app posts straight to the Open Food Facts write API. Contributions are attributed to the app's global account plus a random per-device `app_uuid`; nobody needs an account with us. The curator layer in `food-data/community/` stays for maintainers.

**Files:** Create `src/contribute.ts`, `src/contribute.test.ts`. Modify `app/food/[ref].tsx`, and `app.config.ts` if Task 7.2 is done, else add `extra.offPassword` to `app.json` as an empty string.

**Step 1:** Test the pure form builder.

```ts
import { offFields } from './contribute';
test('builds the Open Food Facts product form in our units', () => {
  const f = offFields({ barcode: '3017620422003', name: 'Nutella', brand: 'Ferrero', serving_size: 15, serving_unit: 'g', serving_desc: '1 tbsp (15 g)',
    nutrients: { '1008': 539, '1003': 6.3, '1093': 43, '1106': 12 } });
  expect(f).toMatchObject({
    code: '3017620422003', product_name: 'Nutella', brands: 'Ferrero', serving_size: '1 tbsp (15 g)', nutrition_data_per: '100g',
    'nutriment_energy-kcal': '539', 'nutriment_energy-kcal_unit': 'kcal', nutriment_proteins: '6.3', nutriment_proteins_unit: 'g',
    nutriment_sodium: '43', nutriment_sodium_unit: 'mg', 'nutriment_vitamin-a': '12', 'nutriment_vitamin-a_unit': 'µg',
  });
  expect(Object.keys(f).some(k => k.includes('1008'))).toBe(false);   // FDC ids never leave the app
});
```

**Step 2:** Run: `npm test -- contribute`. Expected: cannot find module.

**Step 3:** Implement. Use the field names recorded in Task 0.3; `product_jqm2.pl` and `product_image_upload.pl` are the v2 endpoints as of this writing.

```ts
// src/contribute.ts
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { NUTRIENTS } from './nutrients';
import type { CustomFood } from './diary/customFoods';
import type { Db } from './db/types';
import { getSetting, setSetting } from './diary/settings';

const UA = 'CalorieTracker/1.0 (github.com/codejetnet/calorie-tracker)';
// Release builds carry the app's global OFF account password in extra (Task 7.2). Without it, talk to staging with its public test login.
const extra = (Constants.expoConfig?.extra ?? {}) as { offPassword?: string };
const PROD = !!extra.offPassword;
const BASE = PROD ? 'https://world.openfoodfacts.org' : 'https://world.openfoodfacts.net';
const AUTH = PROD ? { user_id: 'codejet-calorie-tracker', password: extra.offPassword! } : { user_id: 'off', password: 'off' };
const STAGING_HEADER = PROD ? {} : { Authorization: 'Basic ' + btoa('off:off') };

/** Per-100 g values in our units; OFF converts from the `_unit` field. */
export function offFields(f: Omit<CustomFood, 'id'> & { barcode: string }): Record<string, string> {
  const out: Record<string, string> = { code: f.barcode, product_name: f.name, nutrition_data_per: '100g' };
  if (f.brand) out.brands = f.brand;
  if (f.serving_desc) out.serving_size = f.serving_desc;
  else if (f.serving_size) out.serving_size = `${f.serving_size} ${f.serving_unit ?? 'g'}`;
  for (const n of NUTRIENTS) {
    const v = f.nutrients[n.id];
    if (n.off && v !== undefined) { out[`nutriment_${n.off}`] = String(v); out[`nutriment_${n.off}_unit`] = n.unit; }
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
```


**Step 4:** Food detail: for `custom:` foods with a barcode, a button "Contribute to Open Food Facts"; for `foods:` entries with a barcode, "Suggest a correction", which opens the custom food editor prefilled with the current values and the same button. Tapping it shows one sentence: "This sends the name, brand, serving and nutrition values for this barcode to Open Food Facts, the public food database. Nothing else about you is sent." with "Add a photo of the nutrition label" (expo-camera still capture, optional) and "Send". On success show "Thanks. It will be in this app's database after the next weekly build." On failure show the returned message and keep the button.

**Step 5:** Run tests, then a manual check against staging from a local build: contribute a custom food, open `https://world.openfoodfacts.net/product/<barcode>` in a browser and see the values and the photo. Commit: `git add -A && git commit -m "feat: contribute foods to Open Food Facts from the app"`

### Task 6.2: About and attribution

**Files:** Create `app/about.tsx`. Modify `app/(tabs)/settings.tsx` (link).

Content: app name and version (`Constants.expoConfig?.version`), one paragraph on privacy (no accounts, no analytics, data stays on the device and in the folder you choose), attribution "Food data from Open Food Facts, licensed ODbL" with a link, "and USDA FoodData Central, public domain" with a link, installed database `builtAt`, links to both GitHub repos and the privacy policy page from Task 7.1, and the MIT license.

Commit: `git add -A && git commit -m "feat: about screen with attribution"`

---

## Milestone 7: Release

### Task 7.1: Privacy policy page

**Files:** Create `docs/privacy.md`, `docs/_config.yml` (`theme: jekyll-theme-minimal`)

Content: what the app stores (diary on device), what it sends (nothing, except the food database download from the project's CDN or GitHub, the optional Open Food Facts barcode lookup which sends only the barcode, and, only when you tap Contribute, that food's values and a random per-device id to Open Food Facts), what it never collects (no accounts, no analytics, no advertising identifiers), that backups go only to a folder the user picks, Health Connect usage (reads active calories, writes nutrition, only when enabled), and a contact email. Enable GitHub Pages in the repo settings: Source "Deploy from a branch", branch `main`, folder `/docs`. The page URL is `https://codejetnet.github.io/calorie-tracker/privacy`.

Commit: `git add -A && git commit -m "docs: privacy policy for Play listing"`

### Task 7.2: Release signing config plugin and dynamic app config

**Files:** Create `plugins/withReleaseSigning.js`, `app.config.ts`. Delete `app.json` after moving its content.

**Step 1:** Config plugin. It only changes the generated Gradle file when the CI env var is present, so local `expo run:android` keeps debug signing.

```js
// plugins/withReleaseSigning.js
const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, c => {
    if (!process.env.ANDROID_KEYSTORE_FILE) return c;
    let g = c.modResults.contents;
    g = g.replace(/signingConfigs\s*\{/, `signingConfigs {
        release {
            storeFile file(System.getenv("ANDROID_KEYSTORE_FILE"))
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }`);
    g = g.replace(/(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/, '$1signingConfig signingConfigs.release');
    if (!g.includes('signingConfigs.release')) throw new Error('withReleaseSigning: could not patch build.gradle');
    c.modResults.contents = g;
    return c;
  });
};
```

**Step 2:** `app.config.ts`, moving everything from `app.json` and adding version from the tag and versionCode from the run number.

```ts
import type { ExpoConfig } from 'expo/config';

const tag = process.env.GITHUB_REF_NAME ?? '';
const config: ExpoConfig = {
  name: 'Calorie Tracker', slug: 'calorie-tracker', scheme: 'calorietracker',
  version: /^v\d/.test(tag) ? tag.slice(1) : '0.0.0',
  orientation: 'portrait', userInterfaceStyle: 'automatic',
  android: {
    package: 'com.codejetnet.calorietracker',
    versionCode: Number(process.env.GITHUB_RUN_NUMBER ?? 0) + 100,   // 100 is the manual first upload; CI runs start at 101
    permissions: [],
  },
  extra: { offPassword: process.env.OFF_APP_PASSWORD ?? '' },   // release builds only; empty means the Open Food Facts staging server
  plugins: [
    'expo-router', 'expo-sqlite',
    ['expo-camera', { cameraPermission: 'Scan food barcodes. Nothing leaves your phone.' }],
    'react-native-health-connect',
    ['expo-build-properties', { android: { minSdkVersion: 26 } }],   // target SDK follows the Expo default, which tracks Play's floor
    './plugins/withBackupRules',
    './plugins/withReleaseSigning',
  ],
};
export default config;
```

**Step 3:** Verify locally: `npx expo prebuild --platform android --clean && grep -c signingConfigs android/app/build.gradle` shows the debug config only. Then `ANDROID_KEYSTORE_FILE=/tmp/x npx expo prebuild --platform android --clean && grep 'signingConfigs.release' android/app/build.gradle` shows the patched line.

**Step 4:** Commit: `git add -A && git commit -m "ci: release signing config plugin and dynamic app config"`

### Task 7.3: Pull request workflow

**Files:** Create `.github/workflows/pr.yml`

```yaml
name: pr
on:
  pull_request:
  push:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test -- --ci
      - run: sh scripts/check-nutrients.sh
```

This workflow uses no secrets, so it is safe for pull requests from forks.

Commit: `git add -A && git commit -m "ci: typecheck, tests, nutrient drift check on pull requests"`

### Task 7.4: Release workflow

**Files:** Create `.github/workflows/release.yml`

```yaml
name: release
on:
  push:
    tags: ['v*']
jobs:
  android:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 17 }
      - uses: android-actions/setup-android@v3
      - run: npm ci
      - run: sh scripts/fetch-starter.sh        # the generic-foods file the app ships with
      - name: Decode upload keystore
        run: echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > "$RUNNER_TEMP/upload.keystore"
      - name: Prebuild with release signing
        env:
          ANDROID_KEYSTORE_FILE: ${{ runner.temp }}/upload.keystore
        run: npx expo prebuild --platform android --no-install
      - name: Build AAB and APK
        working-directory: android
        env:
          ANDROID_KEYSTORE_FILE: ${{ runner.temp }}/upload.keystore
          ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
          OFF_APP_PASSWORD: ${{ secrets.OFF_APP_PASSWORD }}     # read by app.config.ts when the JS bundle is built
        run: ./gradlew bundleRelease assembleRelease --no-daemon
      - name: Upload to Play internal track
        uses: r0adkll/upload-google-play@v1
        with:
          serviceAccountJsonPlainText: ${{ secrets.PLAY_SERVICE_ACCOUNT_JSON }}
          packageName: com.codejetnet.calorietracker
          releaseFiles: android/app/build/outputs/bundle/release/app-release.aab
          track: internal
          status: completed
      - name: Attach APK to GitHub release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          cp android/app/build/outputs/apk/release/app-release.apk "calorie-tracker-${GITHUB_REF_NAME}.apk"
          gh release create "$GITHUB_REF_NAME" "calorie-tracker-${GITHUB_REF_NAME}.apk" --generate-notes
```

Why this is safe in a public repo: secrets are only readable by workflows triggered by pushes from people with write access; tag pushes from maintainers qualify, pull requests from forks do not. The keystore is written to the runner's temp directory, never to the checkout, and the runner is destroyed after the job.

Commit: `git add -A && git commit -m "ci: build, sign, and upload to Play internal track on version tags"`

### Task 7.5: One-time human setup

This is a checklist, not code. Each item is something only the account owner can do. Do them in order.

1. **Upload keystore.** On your machine:
   ```bash
   keytool -genkeypair -v -keystore upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000
   base64 -i upload.keystore | pbcopy
   ```
   Store the keystore file and both passwords in your password manager. Never commit it; `.gitignore` already excludes `*.keystore`.
2. **GitHub secrets** on the `calorie-tracker` repo, Settings, Secrets and variables, Actions: `ANDROID_KEYSTORE_BASE64` (clipboard from above), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`upload`), `ANDROID_KEY_PASSWORD`. Also create an Open Food Facts account named `codejet-calorie-tracker` for the app's contributions and store its password as `OFF_APP_PASSWORD`. That password ships inside release builds, which Open Food Facts expects for app accounts, so the account must hold nothing else.
3. **Google Play Console.** Pay the one-time fee, create the app with package `com.codejetnet.calorietracker`. Play App Signing is on by default for new apps: Google holds the app signing key and your keystore is only the upload key, which can be reset if it ever leaks.
4. **First upload is manual.** The Play API refuses to create the first release. Build once locally with the release keystore:
   ```bash
   sh scripts/fetch-starter.sh
   ANDROID_KEYSTORE_FILE=$PWD/upload.keystore ANDROID_KEYSTORE_PASSWORD=... ANDROID_KEY_ALIAS=upload ANDROID_KEY_PASSWORD=... npx expo prebuild --platform android --clean
   cd android && ANDROID_KEYSTORE_FILE=$OLDPWD/upload.keystore ANDROID_KEYSTORE_PASSWORD=... ANDROID_KEY_ALIAS=upload ANDROID_KEY_PASSWORD=... ./gradlew bundleRelease
   ```
   Upload `android/app/build/outputs/bundle/release/app-release.aab` to the internal testing track in the console. This build carries versionCode 100; every CI build is higher.
5. **Service account.** Google Cloud Console: create a project, create a service account, create a JSON key. Play Console, Users and permissions, invite that service account's email with "Release to testing tracks" and "View app information" permissions. Paste the JSON into the `PLAY_SERVICE_ACCOUNT_JSON` secret.
6. **Store listing.** Privacy policy URL from Task 7.1. Data safety form: "No data collected, no data shared". Health Connect: in App content, declare the read of Active calories burned and write of Nutrition with the reasons "show calories burned next to calories eaten" and "make logged meals available to other health apps the user chooses".
7. **First tagged release.** `git tag v0.1.0 && git push --tags`. Watch the workflow. Expected: green, an internal-track release in the console, an APK on the GitHub release page.
8. **Closed test for production access.** A personal developer account cannot publish to production until a closed test has had 12 opted-in testers for 14 continuous days. Create a closed testing track, promote the internal build to it, invite testers by email list or a Google Group, and only then apply for production access in the console. Start this the day the first internal build exists; the clock resets if testers drop below 12. Sideloaders use the APK on the GitHub Release meanwhile.
9. **Promote** to production by hand in the console once access is granted.

### Task 7.6: Documentation catch-up

**Files:** Create `README.md` (what it is, why it is free, how to install from Play or the APK, how to contribute food data, how to build locally, license). Create `LICENSE` with the MIT text: the app is MIT, the data is ODbL. Re-read `docs/plans/2026-09-15-calorie-tracker-design.md` against what shipped and fix any drift in the same commit.

Commit: `git add -A && git commit -m "docs: README and license"`

---

## Milestone 8: iOS

Android is first because it is cheaper to iterate on. Everything in `src/` is shared; iOS adds one health file, one backup spike, config, and a release lane. Needs a Mac with Xcode for local builds and the Apple Developer Program, $99 a year, paid by the maintainer so the app stays free.

### Task 8.1: HealthKit module

**Files:** Create `src/health/index.ios.ts`. Modify `app.config.ts` plugins.

**Step 1:** `npx expo install @kingstinct/react-native-healthkit` and add its config plugin to `plugins`; it adds the HealthKit entitlement and the usage strings. Set `NSHealthShareUsageDescription` to "Show calories burned next to calories eaten." and `NSHealthUpdateUsageDescription` to "Make logged meals available to other health apps you choose." through the plugin options.

**Step 2:** Implement with the same exports as the Android file. Check the function names against the installed version's type definitions first; the library renames between majors.

```ts
// src/health/index.ios.ts
import { deleteSamples, queryStatisticsForQuantity, requestAuthorization, saveCorrelationSample } from '@kingstinct/react-native-healthkit';
import type { Entry } from '../diary/entries';

export const available = true;

// HealthKit stores nutrition as one sample per nutrient; a food correlation groups them into one meal item.
const MAP: [string, string, string][] = [   // [our id, HealthKit identifier, HealthKit unit]
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

export async function requestPermissions(): Promise<boolean> {
  try { return await requestAuthorization([ACTIVE], MAP.map(m => m[1])); } catch { return false; }
}

/** Each entry gets its own one-second window inside the noon hour, so it can be deleted by time range without touching neighbours. */
function windowFor(e: Entry) {
  let h = 0; for (const c of e.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const start = new Date(`${e.day}T12:00:00`); start.setSeconds(h % 3600);
  return { start, end: new Date(start.getTime() + 1000) };
}

export async function readActiveCalories(day: string): Promise<number | null> {
  try {
    const from = new Date(`${day}T00:00:00`), to = new Date(from); to.setDate(to.getDate() + 1);
    const r = await queryStatisticsForQuantity(ACTIVE, ['cumulativeSum'], from, to, 'kcal');
    return r.sumQuantity ? Math.round(r.sumQuantity.quantity) : 0;
  } catch { return null; }
}

export async function writeNutrition(e: Entry): Promise<string | null> {
  try {
    const { start, end } = windowFor(e);
    const samples = MAP.filter(([id]) => e.nutrients[id] !== undefined)
      .map(([id, hk, unit]) => ({ quantityType: hk, unit, quantity: e.nutrients[id], startDate: start, endDate: end }));
    if (!samples.length) return null;
    await saveCorrelationSample('HKCorrelationTypeIdentifierFood', samples, start, end, { HKFoodType: e.name, entryId: e.id });
    return `${start.toISOString()}|${end.toISOString()}`;   // health_id holds the window, which is what deletion needs
  } catch { return null; }
}

export async function deleteNutrition(id: string): Promise<void> {
  const [start, end] = id.split('|').map(s => new Date(s));
  try { await Promise.all(MAP.map(([, hk]) => deleteSamples({ identifier: hk, startDate: start, endDate: end }))); } catch { /* already gone */ }
}
```

`health_id` on iOS holds the time window rather than a record id; `src/diary/log.ts` does not care which. Two entries collide only if their ids hash to the same second of the noon hour, and then a delete removes both from Health and touches nothing in the diary.

**Step 3:** Wiring already exists from Task 5.1 through `src/diary/log.ts`; the Settings Health section appears on iOS because `available` is true.

**Step 4:** Manual check on an iPhone: enable in Settings, log an entry, see it in the Health app under Nutrition as one meal item; edit it and see it change; delete it and see it go; the Burned line matches Health's active energy.

**Step 5:** Commit: `git add -A && git commit -m "feat: HealthKit read of active energy and write of nutrition on iOS"`

### Task 8.2: Backup files on iOS

The Android mechanism is two documents created through the system dialog because Google Drive offers no folder grant there. iOS file providers, including iCloud Drive, Google Drive and OneDrive inside the Files app, do support folder grants with a security-scoped bookmark, so the iOS spike tries the folder first.

**Files:** Temporarily modify `app/index.tsx`; then modify `src/backup/documents.ts` and `app/(tabs)/settings.tsx`.

**Step 1:** Spike, same shape as Task 2.2: `pickDirectory({ requestLongTermAccess: true })` from `@react-native-documents/picker`, write `spike.txt` inside the returned folder with expo-file-system, overwrite it shorter, force-quit, reopen, overwrite again. Check the file in iCloud Drive on a Mac or the web. Record the result under "iOS backup spike" in `docs/plans/export-headers.md`. If the folder grant does not survive the restart, use the Android shape on iOS too: `saveDocuments` twice and keep the two URLs, which is what `documents.ts` already does.

**Step 2:** In `src/backup/documents.ts`, branch on `Platform.OS`: on iOS `createDocument(name, ...)` writes `name` into the granted folder and returns that file URL, and `overwrite` is a plain `FS.writeAsStringAsync`. Settings shows "Choose backup folder" on iOS and "Set up backup" on Android; both end in the same two settings keys, so the scheduler and wiring do not change.

**Step 3:** Manual check as in Task 3.4, with iCloud Drive. Commit: `git add -A && git commit -m "feat: backup folder on iOS through the Files app"`

### Task 8.3: iOS app config and local build

**Files:** Modify `app.config.ts`. The Android-only plugins from Tasks 2.8 and 7.2 need no change.

**Step 1:** Add to `app.config.ts`:

```ts
  ios: {
    bundleIdentifier: 'com.codejetnet.calorietracker',
    buildNumber: String(Number(process.env.GITHUB_RUN_NUMBER ?? 0) + 100),
    infoPlist: { NSCameraUsageDescription: 'Scan food barcodes. Nothing leaves your phone.', ITSAppUsesNonExemptEncryption: false },
  },
```

`ITSAppUsesNonExemptEncryption: false` skips the export-compliance question on every TestFlight upload; the app only uses HTTPS.

**Step 2:** On a Mac: `sh scripts/fetch-starter.sh && npx expo prebuild --platform ios && npx expo run:ios --device`. Expected: the app launches on a connected iPhone with the dev client, and every Milestone 2 to 6 manual check passes, in particular barcode scanning, the foods download, and search on a real device.

**Step 3:** Commit: `git add -A && git commit -m "chore: iOS bundle id, build number and usage strings"`

### Task 8.4: iOS release lane

**Files:** Create `plugins/ExportOptions.plist`. Modify `.github/workflows/release.yml`.

**Step 1:** `plugins/ExportOptions.plist`. The `ios/` directory is generated, so the file lives next to the config plugins.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>signingStyle</key><string>manual</string>
  <key>provisioningProfiles</key><dict><key>com.codejetnet.calorietracker</key><string>Calorie Tracker App Store</string></dict>
</dict></plist>
```

**Step 2:** Add a second job to `release.yml`. macOS runners are free for public repositories.

```yaml
  ios:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: sh scripts/fetch-starter.sh
      - name: Install signing certificate and profile into a throwaway keychain
        env:
          CERT_B64: ${{ secrets.IOS_CERT_P12_BASE64 }}
          CERT_PW: ${{ secrets.IOS_CERT_PASSWORD }}
          PROFILE_B64: ${{ secrets.IOS_PROFILE_BASE64 }}
        run: |
          KC="$RUNNER_TEMP/build.keychain-db"
          echo "$CERT_B64" | base64 -d > "$RUNNER_TEMP/cert.p12"
          security create-keychain -p ci "$KC" && security set-keychain-settings -lut 21600 "$KC" && security unlock-keychain -p ci "$KC"
          security import "$RUNNER_TEMP/cert.p12" -P "$CERT_PW" -A -t cert -f pkcs12 -k "$KC"
          security set-key-partition-list -S apple-tool:,apple: -k ci "$KC"
          security list-keychain -d user -s "$KC"
          mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
          echo "$PROFILE_B64" | base64 -d > ~/Library/MobileDevice/Provisioning\ Profiles/appstore.mobileprovision
      - run: npx expo prebuild --platform ios --no-install
        env:
          OFF_APP_PASSWORD: ${{ secrets.OFF_APP_PASSWORD }}
      - run: cd ios && pod install
      - name: Archive and export
        env:
          OFF_APP_PASSWORD: ${{ secrets.OFF_APP_PASSWORD }}
        run: |
          cd ios
          xcodebuild -workspace CalorieTracker.xcworkspace -scheme CalorieTracker -configuration Release \
            -archivePath "$RUNNER_TEMP/app.xcarchive" archive CODE_SIGN_STYLE=Manual \
            DEVELOPMENT_TEAM=${{ secrets.APPLE_TEAM_ID }} PROVISIONING_PROFILE_SPECIFIER="Calorie Tracker App Store"
          xcodebuild -exportArchive -archivePath "$RUNNER_TEMP/app.xcarchive" -exportOptionsPlist ../plugins/ExportOptions.plist -exportPath "$RUNNER_TEMP/export"
      - name: Upload to TestFlight
        env:
          ASC_KEY_P8_BASE64: ${{ secrets.ASC_KEY_P8_BASE64 }}
        run: |
          mkdir -p ~/.appstoreconnect/private_keys
          echo "$ASC_KEY_P8_BASE64" | base64 -d > ~/.appstoreconnect/private_keys/AuthKey_${{ secrets.ASC_KEY_ID }}.p8
          xcrun altool --upload-app -f "$RUNNER_TEMP"/export/*.ipa -t ios --apiKey ${{ secrets.ASC_KEY_ID }} --apiIssuer ${{ secrets.ASC_ISSUER_ID }}
```

The workspace and scheme names come from `expo prebuild`: the app name without spaces. Check `ios/*.xcworkspace` on the first local prebuild and fix both occurrences if they differ.

**Step 3:** Push a tag, watch both jobs. Expected: the build appears in TestFlight within the hour, processing included.

**Step 4:** Commit: `git add -A && git commit -m "ci: build, sign and upload the iOS app to TestFlight on version tags"`

### Task 8.5: One-time human setup for iOS

1. **Apple Developer Program.** Enrol as an individual, $99 a year. Approval can take a couple of days.
2. **Identifiers.** In the developer portal register the App ID `com.codejetnet.calorietracker` with the HealthKit capability.
3. **Certificate and profile.** Create an Apple Distribution certificate on a Mac through Xcode or the portal, export it as a `.p12` with a password, and create an App Store provisioning profile named exactly `Calorie Tracker App Store` for that App ID. Base64 both: `base64 -i file | pbcopy`.
4. **App Store Connect API key.** Users and Access, Integrations, App Store Connect API: create a key with the App Manager role, download the `.p8` once, note the Key ID and Issuer ID.
5. **GitHub secrets:** `IOS_CERT_P12_BASE64`, `IOS_CERT_PASSWORD`, `IOS_PROFILE_BASE64`, `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64`.
6. **App Store Connect.** Create the app with the same bundle id. App Privacy: "Data Not Collected". App Review notes: no account needed, HealthKit reads active energy and writes nutrition only when the user enables it in Settings, and the privacy policy link from Task 7.1.
7. **TestFlight.** After the first upload, add the two of you as internal testers; external testing needs a short review.
8. **Submit** for App Store review from the TestFlight build. Unlike Play there is no tester-count gate, but review takes a day or two and may bounce once on HealthKit wording.

---

## Order of work and gates

1. Tasks 0.1, 0.2, 2.1, 2.2 first. Task 2.2 is the gate for the coach-sharing design; Task 0.2 is the gate for the pipeline fitting in GitHub Actions.
2. Milestone 1 through Task 1.8 so a real database exists to test the app against.
3. Milestone 2, then 3, then 4. The app is usable for you after Milestone 2 and for your wife after Milestones 3 and 4.
4. Milestone 5 and 6 are small and independent of each other.
5. Milestone 7 whenever you want testers. Task 7.5 has waits (Play review, then the 14-day closed test) so start it early in parallel.
6. Milestone 8 once the Android app is on the internal track and the two of you are living on it. Task 8.5 has its own waits (program enrolment, App Review), so start it alongside Task 7.5.

Milestones 1 and 2 have no dependency on each other beyond the manifest URL, so they can be worked by two people or two agents at once.

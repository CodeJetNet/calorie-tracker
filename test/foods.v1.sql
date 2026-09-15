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

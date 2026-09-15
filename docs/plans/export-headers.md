# Export headers and spike results

## OFF Parquet shape

Task 0.2, run 2026-09-15 with DuckDB 1.5.5 on Python 3.13.7, reading
`hf://datasets/openfoodfacts/product-database/food.parquet` over httpfs.

DESCRIBE (Parquet metadata only, 7.6 s):

| column | type |
|---|---|
| `code` | `VARCHAR` |
| `product_name` | `STRUCT(lang VARCHAR, "text" VARCHAR)[]` |
| `brands` | `VARCHAR` |
| `countries_tags` | `VARCHAR[]` |
| `serving_size` | `VARCHAR` |
| `serving_quantity` | `VARCHAR` |
| `nutriments` | `STRUCT("name" VARCHAR, "value" FLOAT, "100g" FLOAT, serving FLOAT, unit VARCHAR, prepared_value FLOAT, prepared_100g FLOAT, prepared_serving FLOAT, prepared_unit VARCHAR)[]` |

Matches what the plan assumes (`nutriments` is a list of structs with `name`,
`100g`, `unit`; `product_name` is a list of `{lang, text}`; `countries_tags` is a
list of strings) with one difference: `serving_quantity` is `VARCHAR`, not a
number, so the build must `TRY_CAST(serving_quantity AS DOUBLE)`. `serving_size`
is free text such as `30 g`.

Row counts: not obtained. Both count queries (US rows with nutriments, US rows
with only `energy-kj`) failed after about 70 s with `HTTP 429 Too Many Requests`
from huggingface.co, on two attempts 90 s apart; afterwards even a single HEAD
request was 429. A remote count issues one range request per row group per
column, and anonymous Hugging Face access is rate-limited well below that.
Consequence for the build (Milestone 1): download `food.parquet` once with a
single GET into `cache/` (the design already caches it by ETag) and query the
local file; do not read `hf://` remotely in CI. A Hugging Face token raises the
limit if remote reads are ever needed:
`CREATE SECRET hf (TYPE huggingface, TOKEN '...')`.

## OFF write API

Task 0.3, run 2026-09-15 against `https://world.openfoodfacts.net`.

The plan's POST to `/cgi/product_jqm2.pl` with `user_id=off&password=off`
returned an HTML error page, "Incorrect user name or password", not
`{"status":1}`. `off` / `off` is only the HTTP basic auth on the staging proxy.
Staging has its own account database (the API docs say production accounts do
not work there and a separate one must be created), and it is mid-migration to
Keycloak: the registration form at `/cgi/user.pl?type=add` now carries only a
`userid` field, so no account could be created from curl. Reads work with or
without basic auth (`GET /api/v2/product/3017620422003.json` returned 200 both
ways). The design doc's line that local builds use staging "with its public test
login" holds for reads only; writes need a staging account created in a browser
at `https://world.openfoodfacts.net`. Step 1 must be rerun with that account,
and Step 2 (photo upload) was not run.

The plan's throwaway barcode `0000000000017` is unusable: the server strips
leading zeros and rejects the remainder,
`{"code":"00000017","status":0,"status_verbose":"no code or invalid code"}`.
Use a checksum-valid GTIN-13 in the restricted-circulation range, for example
`2000000000015`.

Field names, confirmed from the server's OpenAPI reference
(`docs/api/ref/requestBodies/add_or_edit_a_product.yaml` and
`add_photo_to_existing_product.yaml`), the same names the plan uses:

- Product write, `POST /cgi/product_jqm2.pl`, form-encoded: `code`, `user_id`
  (the username, never the email), `password`, `nutrition_data_per` (`100g` or
  `serving`; applies to every nutriment field, existing or new),
  `nutriment_<id>` and `nutriment_<id>_unit` with `<id>` from the nutrients
  taxonomy (`energy-kcal`, `energy-kj`, `fat`, `saturated-fat`, `sodium`, ...),
  `product_name`, `brands`, `serving_size`, `app_name`, `app_version`,
  `app_uuid`, `comment`.
- Photo, `POST /cgi/product_image_upload.pl`, multipart: `code`, `imagefield`
  matching `^(front|ingredients|nutrition|packaging)_[a-z]{2}$` or `other`, and
  `imgupload_<imagefield>` holding the file (gif, jpeg, jpg, png, heic). So
  `imagefield=nutrition_en` with `imgupload_nutrition_en=@label.jpg`.

`µg`: not tested against the server. In the units taxonomy
(`taxonomies/units.txt`) microgram is `xx: mcg, mcgs` with `symbol:en: µg` and
`conversion_factor:en: 0.000001` to grams, and `Units.pm` indexes both the
symbol and the synonyms case-insensitively, so `µg` and `mcg` should both
convert. An unrecognized unit is only logged and the value stored unconverted,
so send `mcg`, which is the canonical ASCII spelling and cannot be mangled by
form encoding.

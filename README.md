# Calorie Tracker

A free calorie and nutrient tracker for Android, iOS to follow. Log meals by search or barcode, see ~30 nutrients against your goals, keep a weight log, and share a diary report with a coach. Everything stays on your phone.

## Why it is free

No ads, no accounts, no servers, no subscription. The maintainer pays the store fees. The food database is built weekly from [Open Food Facts](https://world.openfoodfacts.org) and [USDA FoodData Central](https://fdc.nal.usda.gov) in the [food-data](https://github.com/codejetnet/food-data) repo and served from a free CDN, so there is nothing to charge for. Your diary never leaves the device except to backup files you create through the system file dialog, on your device or in a cloud drive, or to Health Connect if you turn it on. See the [privacy policy](https://codejetnet.github.io/calorie-tracker/privacy).

## Install

- **Google Play:** <https://play.google.com/store/apps/details?id=com.codejetnet.calorietracker>
- **APK for sideloading:** every version tag has a signed `calorie-tracker-vX.Y.Z.apk` on the [Releases](https://github.com/codejetnet/calorie-tracker/releases) page.

## Contribute food data

Foods come from Open Food Facts. Add or fix a product from inside the app with "Contribute to Open Food Facts" on a custom food with a barcode, or "Suggest a correction" on a database food, or edit it at <https://world.openfoodfacts.org>. The next weekly build picks it up; your custom food covers the gap until then. There is no account with us.

## Build locally

Needs Node 22+, Java 17 or 21, and Android Studio's SDK.

```sh
npm ci
sh scripts/fetch-starter.sh   # the generic-foods file the app ships with, gitignored
npx expo run:android
```

CI runs `npm run typecheck`, `npm test` and `sh scripts/check-nutrients.sh` (which checks `src/nutrients.json` against food-data) on every pull request; run them locally the same way.

The Contribute button is hidden unless the build has an Open Food Facts password. To test contributions without touching the real database, create an account on the staging server at <https://world.openfoodfacts.net> once and build with:

```sh
OFF_APP_STAGING=1 OFF_APP_USER=<staging account> OFF_APP_PASSWORD=<its password> npx expo run:android
```

Release builds are made by the `release` workflow on `v*` tags: prebuild, sign with the upload keystore from repository secrets, upload the AAB to the Play internal track, and attach the APK to the GitHub release.

## License

App code is [MIT](LICENSE). The food database is [ODbL](https://opendatacommons.org/licenses/odbl/); Open Food Facts data is ODbL and USDA data is public domain.

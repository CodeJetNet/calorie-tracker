# Calorie Tracker privacy policy

Last updated: 2026-09-29

Calorie Tracker has no accounts, no advertising and no servers of its own, and collects no analytics of its own. Your data stays on your phone.

## What the app stores

Your diary, custom foods, recipes, weight log and settings live in a database on your device. Nothing about you is stored anywhere else by this app.

## What the app sends

Nothing, except:

- **Food database download.** The app fetches its food database from the project's public GitHub Releases (`github.com/codejetnet/food-data`). This is an ordinary file download; it carries nothing about you.
- **Barcode lookup, optional.** When you scan a barcode the app cannot find in its own database, it asks Open Food Facts for that barcode, and USDA FoodData Central if Open Food Facts does not have it. This happens automatically unless you turn it off in Settings, in which case it happens only when you tap Look up. Only the barcode is sent.
- **Contribute, only when you tap it.** When you tap "Contribute to Open Food Facts" or "Suggest a correction", the app sends that food's name, brand, serving and nutrition values, the optional photo of the nutrition label you chose to attach, and a random per-device id to Open Food Facts, the public food database. Nothing else about you is sent. What you send becomes part of Open Food Facts under its [Open Database License](https://opendatacommons.org/licenses/odbl/).
- **Text recognition metrics, Android only.** Reading a nutrition label from a photo uses Google's ML Kit, which runs on your phone: the photo and the text read from it stay on the device. ML Kit itself sends Google diagnostic and usage data: device information (manufacturer, model, OS version and build), the app's package name and version, a per-installation identifier that is not intended to identify you or your device, performance metrics, API configuration such as image format and resolution, input and output sizes, feature version, event types and error codes. Google encrypts it in transit and does not share it with third parties. See [ML Kit's data disclosure](https://developers.google.com/ml-kit/android-data-disclosure). On iOS the app uses Apple's Vision framework, which sends nothing.

## Camera

The camera is used only to scan barcodes and to photograph nutrition labels. Both are processed on your phone. Label photos go to the app's temporary cache, which the system clears, never to your photo gallery, and leave the phone only if you send one with a Contribute.

## What the app never collects

No accounts, no analytics or crash reporting of its own, no advertising identifiers, no location, no contacts.

## Backups and sharing

Backups and exports are two files you create through the system file dialog (on iOS, a folder you choose in the Files app), on your device or in a cloud drive you have set up yourself. The app never uploads them anywhere on its own.

## Health Connect and Apple Health

Only if you enable it in Settings, the app reads your active calories burned from Health Connect on Android or Apple Health on iOS to show them next to calories eaten, and writes the meals you log as nutrition records so other health apps you choose can see them. You can revoke this at any time in Health Connect, in the Health app, or in the app's Settings.

## Changes

Changes to this policy are made in this file, and its history is public in the repository.

## Contact

Questions about this policy: <josh@findsomehelp.com>.

Source code: <https://github.com/codejetnet/calorie-tracker>.

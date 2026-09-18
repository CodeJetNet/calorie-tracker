import type { ExpoConfig } from 'expo/config';

const tag = process.env.GITHUB_REF_NAME ?? '';
const config: ExpoConfig = {
  name: 'Calorie Tracker', slug: 'calorie-tracker', scheme: 'calorietracker',
  version: /^v\d/.test(tag) ? tag.slice(1) : '0.0.0',
  orientation: 'portrait', userInterfaceStyle: 'light',
  backgroundColor: '#F3F7F6',   // Soft Mist behind everything, so nothing flashes white; icons come from scripts/make-icons.py
  icon: './assets/icon.png',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.codejetnet.calorietracker',
    buildNumber: String(Number(process.env.GITHUB_RUN_NUMBER ?? 0) + 100),
    infoPlist: { NSCameraUsageDescription: 'Scan food barcodes. Nothing leaves your phone.', ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: 'com.codejetnet.calorietracker',
    versionCode: Number(process.env.GITHUB_RUN_NUMBER ?? 0) + 100,   // 100 is the manual first upload; CI runs start at 101
    adaptiveIcon: {
      backgroundColor: '#F3F7F6',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // The Health Connect plugin does not declare the data permissions; without these requestPermission grants nothing.
    permissions: ['android.permission.health.READ_ACTIVE_CALORIES_BURNED', 'android.permission.health.WRITE_NUTRITION'],
  },
  web: { favicon: './assets/favicon.png' },
  extra: {   // Open Food Facts contribution account: release builds get the password from a secret; local builds may point at staging
    offUser: process.env.OFF_APP_USER ?? 'codejet-calorie-tracker',
    // Extractable from the APK, so the Open Food Facts account must hold nothing but this app's contributions.
    offPassword: process.env.OFF_APP_PASSWORD ?? '',
    offStaging: process.env.OFF_APP_STAGING === '1',
  },
  plugins: [
    'expo-router', 'expo-sqlite',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 200, backgroundColor: '#F3F7F6' }],
    ['expo-camera', { cameraPermission: 'Scan food barcodes. Nothing leaves your phone.', recordAudioAndroid: false }],
    'react-native-health-connect',
    ['@kingstinct/react-native-healthkit', { NSHealthShareUsageDescription: 'Show calories burned next to calories eaten.', NSHealthUpdateUsageDescription: 'Make logged meals available to other health apps you choose.' }],
    ['expo-build-properties', { android: { minSdkVersion: 26 } }],   // target SDK follows the Expo default, which tracks Play's floor
    './plugins/withBackupRules',
    './plugins/withReleaseSigning',
  ],
};
export default config;

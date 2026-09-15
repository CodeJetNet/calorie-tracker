import type { ExpoConfig } from 'expo/config';

const tag = process.env.GITHUB_REF_NAME ?? '';
const config: ExpoConfig = {
  name: 'Calorie Tracker', slug: 'calorie-tracker', scheme: 'calorietracker',
  version: /^v\d/.test(tag) ? tag.slice(1) : '0.0.0',
  orientation: 'portrait', userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  ios: { supportsTablet: true },
  android: {
    package: 'com.codejetnet.calorietracker',
    versionCode: Number(process.env.GITHUB_RUN_NUMBER ?? 0) + 100,   // 100 is the manual first upload; CI runs start at 101
    permissions: [],
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: { favicon: './assets/favicon.png' },
  extra: {   // Open Food Facts contribution account: release builds get the password from a secret; local builds may point at staging
    offUser: process.env.OFF_APP_USER ?? 'codejet-calorie-tracker',
    offPassword: process.env.OFF_APP_PASSWORD ?? '',
    offStaging: process.env.OFF_APP_STAGING === '1',
  },
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

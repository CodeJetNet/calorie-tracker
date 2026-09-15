// plugins/withReleaseSigning.js
const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, c => {
    if (!process.env.ANDROID_KEYSTORE_FILE) return c;
    let g = c.modResults.contents;
    if (g.includes('signingConfigs.release')) return c;
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

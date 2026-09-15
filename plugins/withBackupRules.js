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

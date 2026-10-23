const db = require('../config/database');
const { decrypt, encrypt, KEY_DECRYPTION_ERROR } = require('./crypto.service');

const LEGACY_DEVELOPMENT_SECRET = 'ecosistema_multi_ia_default_master_secret_2026_dev_key';

function migrateLegacyApiKeys() {
  const rows = db.prepare(`
    SELECT id, encrypted_key, iv, auth_tag
    FROM api_keys
    ORDER BY id ASC
  `).all();
  const updateKey = db.prepare(`
    UPDATE api_keys
    SET encrypted_key = ?, iv = ?, auth_tag = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const migrateRows = db.transaction(() => {
    let migratedCount = 0;

    for (const row of rows) {
      try {
        decrypt({
          encryptedData: row.encrypted_key,
          iv: row.iv,
          authTag: row.auth_tag
        });
        continue;
      } catch (error) {
        if (error.message !== KEY_DECRYPTION_ERROR) throw error;
      }

      const previousSecret = process.env.APP_ENCRYPTION_SECRET;
      let plaintext;
      try {
        process.env.APP_ENCRYPTION_SECRET = LEGACY_DEVELOPMENT_SECRET;
        plaintext = decrypt({
          encryptedData: row.encrypted_key,
          iv: row.iv,
          authTag: row.auth_tag
        });
      } catch (error) {
        if (error.message !== KEY_DECRYPTION_ERROR) throw error;
        continue;
      } finally {
        if (previousSecret === undefined) delete process.env.APP_ENCRYPTION_SECRET;
        else process.env.APP_ENCRYPTION_SECRET = previousSecret;
      }

      const replacement = encrypt(plaintext);
      updateKey.run(replacement.encryptedData, replacement.iv, replacement.authTag, row.id);
      migratedCount++;
    }

    return migratedCount;
  });

  return migrateRows();
}

module.exports = { migrateLegacyApiKeys };

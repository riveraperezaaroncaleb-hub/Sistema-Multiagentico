const db = require('../config/database');
const { encrypt } = require('../services/crypto.service');
const { detectProviderFromKey } = require('../services/keyDetector.service');

/**
 * Guarda o actualiza una API Key cifrándola con AES-256-GCM.
 * Si no se indica proveedor o se indica 'auto', se auto-detecta directamente de la clave.
 */
function saveKey(req, res) {
  try {
    const {
      userId = 'default_user',
      role = 'general',
      provider,
      model,
      isFallback = 0,
      apiKey
    } = req.body;

    if (!apiKey || !apiKey.trim()) {
      return res.status(400).json({
        error: 'La API Key es obligatoria.'
      });
    }

    const cleanKey = apiKey.trim();
    const detected = detectProviderFromKey(cleanKey);

    // Si el usuario no mandó proveedor o eligió 'auto', o si detectamos con alta certeza:
    const assignedProvider = (provider && provider !== 'auto') ? provider : detected.provider;
    const assignedModel = model || detected.defaultModel || (assignedProvider === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini');
    const fallbackFlag = isFallback ? 1 : 0;

    // Cifrar la clave con AES-256-GCM
    const { encryptedData, iv, authTag, last4 } = encrypt(apiKey.trim());

    // Insertar o reemplazar según usuario, rol y si es fallback
    const stmt = db.prepare(`
      INSERT INTO api_keys (
        user_id, role, provider, model, is_fallback,
        encrypted_key, iv, auth_tag, last4, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, role, is_fallback) DO UPDATE SET
        provider = excluded.provider,
        model = excluded.model,
        encrypted_key = excluded.encrypted_key,
        iv = excluded.iv,
        auth_tag = excluded.auth_tag,
        last4 = excluded.last4,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(userId, role, provider, assignedModel, fallbackFlag, encryptedData, iv, authTag, last4);

    return res.json({
      success: true,
      message: 'Llave cifrada y guardada de forma segura.',
      key: {
        role,
        provider,
        model: assignedModel,
        isFallback: Boolean(fallbackFlag),
        last4: `••••••••${last4}`
      }
    });
  } catch (error) {
    console.error('Error al guardar la llave:', error);
    return res.status(500).json({ error: 'Error interno al procesar el cifrado de la llave.' });
  }
}

/**
 * Lista las llaves configuradas del usuario.
 * NUNCA devuelve la llave real, ni el IV ni el texto cifrado.
 */
function getKeys(req, res) {
  try {
    const userId = req.query.userId || 'default_user';

    const keys = db.prepare(`
      SELECT id, role, provider, model, is_fallback, last4, updated_at
      FROM api_keys
      WHERE user_id = ?
      ORDER BY role ASC, is_fallback ASC
    `).all(userId);

    const safeKeys = keys.map(k => ({
      id: k.id,
      role: k.role,
      provider: k.provider,
      model: k.model,
      isFallback: Boolean(k.is_fallback),
      maskedKey: `••••••••${k.last4}`,
      updatedAt: k.updated_at
    }));

    return res.json({
      success: true,
      keys: safeKeys
    });
  } catch (error) {
    console.error('Error al obtener llaves:', error);
    return res.status(500).json({ error: 'Error al consultar las llaves.' });
  }
}

/**
 * Elimina una llave configurada
 */
function deleteKey(req, res) {
  try {
    const { id } = req.params;
    const userId = req.query.userId || 'default_user';

    const result = db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').run(id, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Llave no encontrada.' });
    }

    return res.json({ success: true, message: 'Llave eliminada exitosamente.' });
  } catch (error) {
    return res.status(500).json({ error: 'Error al eliminar la llave.' });
  }
}

/**
 * Detecta el proveedor y modelo sugerido a partir de la API Key ingresada
 */
function detectKey(req, res) {
  try {
    const { apiKey } = req.body;
    const detected = detectProviderFromKey(apiKey || '');
    return res.json({ success: true, ...detected });
  } catch (error) {
    return res.status(500).json({ error: 'Error al detectar la clave.' });
  }
}

module.exports = {
  saveKey,
  getKeys,
  deleteKey,
  detectKey
};

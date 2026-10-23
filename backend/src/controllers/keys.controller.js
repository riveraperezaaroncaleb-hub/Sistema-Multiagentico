const db = require('../config/database');
const { encrypt, decrypt, KEY_DECRYPTION_ERROR } = require('../services/crypto.service');
const { detectProviderFromKey, providers } = require('../services/keyDetector.service');
const { callLLM } = require('../services/llm.service');

/**
 * Guarda la API Key cifrada y detecta su proveedor a partir del formato.
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

    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      return res.status(400).json({
        error: 'La API Key es obligatoria.'
      });
    }

    const cleanKey = apiKey.trim();
    const detected = detectProviderFromKey(cleanKey, provider);
    if (detected.provider === 'unknown') {
      if (detected.confidence === 'ambiguous') {
        return res.status(400).json({
          error: 'Esta clave usa un prefijo compartido por varios proveedores. Selecciona el proveedor correcto antes de guardarla.',
          candidates: detected.candidates
        });
      }
      return res.status(400).json({
        error: `No reconocemos esta API Key. Elige manualmente uno de estos proveedores: ${providers.map(item => item.name).join(', ')}.`
      });
    }

    if (provider && provider !== 'auto' && detected.confidence !== 'selected') {
      return res.status(400).json({ error: 'El proveedor seleccionado no está soportado.' });
    }

    const assignedProvider = detected.provider;
    const assignedModel = model || detected.defaultModel;
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

    stmt.run(userId, role, assignedProvider, assignedModel, fallbackFlag, encryptedData, iv, authTag, last4);

    return res.json({
      success: true,
      message: 'Llave cifrada y guardada de forma segura.',
      providerName: detected.name,
      key: {
        role,
        provider: assignedProvider,
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
      SELECT id, role, provider, model, is_fallback, last4, updated_at,
        encrypted_key, iv, auth_tag
      FROM api_keys
      WHERE user_id = ?
      ORDER BY role ASC, is_fallback ASC
    `).all(userId);

    const safeKeys = keys.map(k => {
      let isDecryptable = true;
      try {
        decrypt({
          encryptedData: k.encrypted_key,
          iv: k.iv,
          authTag: k.auth_tag
        });
      } catch {
        isDecryptable = false;
      }

      return {
        id: k.id,
        role: k.role,
        provider: k.provider,
        model: k.model,
        isFallback: Boolean(k.is_fallback),
        maskedKey: `••••••••${k.last4}`,
        isDecryptable,
        updatedAt: k.updated_at
      };
    });

    return res.json({
      success: true,
      keys: safeKeys
    });
  } catch (error) {
    console.error('Error al obtener llaves:', error);
    return res.status(500).json({ error: 'Error al consultar las llaves.' });
  }
}

async function testKey(req, res) {
  try {
    const userId = req.body.userId || 'default_user';
    const key = db.prepare(`
      SELECT provider, model, encrypted_key, iv, auth_tag
      FROM api_keys
      WHERE id = ? AND user_id = ?
    `).get(req.params.id, userId);

    if (!key) {
      return res.status(404).json({ error: 'No se encontró la llave seleccionada.' });
    }

    let apiKey;
    try {
      apiKey = decrypt({
        encryptedData: key.encrypted_key,
        iv: key.iv,
        authTag: key.auth_tag
      });
    } catch (error) {
      if (error.message === KEY_DECRYPTION_ERROR) {
        return res.status(409).json({ error: error.message });
      }
      throw error;
    }
    const result = await callLLM({
      provider: key.provider,
      model: key.model,
      apiKey,
      messages: [{ role: 'user', content: 'Responde únicamente: conexión correcta.' }],
      maxTokens: 12,
      specialistName: 'Prueba de conexión'
    });

    return res.json({
      success: true,
      provider: result.providerUsed,
      model: result.modelUsed,
      message: 'Conexión real confirmada con el proveedor.'
    });
  } catch (error) {
    console.error('Error al probar la conexión del proveedor:', error.message);
    return res.status(502).json({
      error: `No se pudo validar la conexión real: ${error.message}`
    });
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
    const { apiKey, provider } = req.body;
    const detected = detectProviderFromKey(apiKey || '', provider);
    return res.json({ success: true, ...detected });
  } catch (error) {
    return res.status(500).json({ error: 'Error al detectar la clave.' });
  }
}

module.exports = {
  saveKey,
  getKeys,
  testKey,
  deleteKey,
  detectKey
};

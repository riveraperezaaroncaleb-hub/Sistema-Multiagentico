const db = require('../config/database');
const { decrypt } = require('../services/crypto.service');
const { callLLM } = require('../services/llm.service');

const MAX_HISTORY_MESSAGES = 6; // Límite de contexto para no inflar costos

/**
 * PASO 2 OBLIGATORIO: La IA Trabaja
 * Ejecuta la especialista elegida, con límite de contexto y sistema de fallback automático.
 */
async function executeWorker({ userId, sessionId, role = 'general', specialistName = 'Especialista MVP', prompt }) {
  // 1. Obtener historial recortado para evitar gasto excesivo de tokens
  const historyRows = db.prepare(`
    SELECT sender, content FROM chat_messages
    WHERE user_id = ? AND session_id = ?
    ORDER BY created_at DESC LIMIT ?
  `).all(userId, sessionId, MAX_HISTORY_MESSAGES).reverse();

  const formattedMessages = historyRows.map(row => ({
    role: row.sender === 'user' ? 'user' : 'assistant',
    content: row.content
  }));

  // Agregar el mensaje actual del usuario
  formattedMessages.push({ role: 'user', content: prompt });

  // 2. Buscar llaves configuradas (Principal y Reserva)
  const primaryKeyRecord = db.prepare(`
    SELECT * FROM api_keys 
    WHERE user_id = ? AND role = ? AND is_fallback = 0
  `).get(userId, role);

  const fallbackKeyRecord = db.prepare(`
    SELECT * FROM api_keys 
    WHERE user_id = ? AND role = ? AND is_fallback = 1
  `).get(userId, role);

  let primaryDecrypted = null;
  if (primaryKeyRecord) {
    try {
      primaryDecrypted = decrypt({
        encryptedData: primaryKeyRecord.encrypted_key,
        iv: primaryKeyRecord.iv,
        authTag: primaryKeyRecord.auth_tag
      });
    } catch (err) {
      console.error('Error al descifrar la llave primaria:', err.message);
    }
  }

  let result = null;
  let isFallbackUsed = false;
  let fallbackAlert = null;

  // 3. Intentar llamada con la IA Principal
  try {
    const provider = primaryKeyRecord ? primaryKeyRecord.provider : 'mock';
    const model = primaryKeyRecord ? primaryKeyRecord.model : 'mock-model';

    result = await callLLM({
      provider,
      model,
      apiKey: primaryDecrypted,
      messages: formattedMessages,
      maxTokens: 1200,
      specialistName
    });
  } catch (primaryError) {
    console.warn(`⚠️ Error en la IA principal (${primaryError.message}). Evaluando IA de reserva...`);

    // 4. Intentar con IA de reserva si está configurada
    if (fallbackKeyRecord) {
      try {
        const fallbackDecrypted = decrypt({
          encryptedData: fallbackKeyRecord.encrypted_key,
          iv: fallbackKeyRecord.iv,
          authTag: fallbackKeyRecord.auth_tag
        });

        result = await callLLM({
          provider: fallbackKeyRecord.provider,
          model: fallbackKeyRecord.model,
          apiKey: fallbackDecrypted,
          messages: formattedMessages,
          maxTokens: 1200,
          specialistName
        });

        isFallbackUsed = true;
        fallbackAlert = `⚠️ Aviso de contingencia: La IA principal falló (${primaryError.message.slice(0, 40)}...). Se utilizó la IA de reserva (${fallbackKeyRecord.provider} - ${fallbackKeyRecord.model}).`;
      } catch (fallbackError) {
        console.error('Error en la IA de reserva:', fallbackError.message);
      }
    }

    // Si aún no tenemos resultado, recurrimos al simulador seguro
    if (!result) {
      result = await callLLM({
        provider: 'mock',
        model: 'mock-seguro',
        apiKey: null,
        messages: formattedMessages,
        maxTokens: 800,
        specialistName
      });
      isFallbackUsed = true;
      fallbackAlert = `⚠️ Aviso: Tu proveedor de IA no respondió. Se activó el simulador de contingencia seguro para que no pierdas la sesión.`;
    }
  }

  return {
    ...result,
    isFallbackUsed,
    fallbackAlert
  };
}

module.exports = {
  executeWorker
};

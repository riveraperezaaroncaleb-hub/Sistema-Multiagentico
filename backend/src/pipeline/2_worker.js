const db = require('../config/database');
const { decrypt, KEY_DECRYPTION_ERROR } = require('../services/crypto.service');
const { callLLM } = require('../services/llm.service');
const { getSpecialist } = require('../services/specialists.service');
const { getSkillsPrompt } = require('../services/skills.service');

const MAX_HISTORY_MESSAGES = 6; // Límite de contexto para no inflar costos

/**
 * PASO 2 OBLIGATORIO: La IA Trabaja
 * Ejecuta la especialista elegida con límite de contexto y proveedores reales.
 */
async function executeWorker({
  userId,
  sessionId,
  role = 'general',
  specialistName = 'Especialista MVP',
  prompt,
  llmCaller = callLLM
}) {
  // 1. Obtener historial recortado para evitar gasto excesivo de tokens
  const historyRows = db.prepare(`
    SELECT sender, content FROM chat_messages
    WHERE user_id = ? AND session_id = ?
    ORDER BY created_at DESC, rowid DESC LIMIT ?
  `).all(userId, sessionId, MAX_HISTORY_MESSAGES).reverse();

  const formattedMessages = historyRows.map(row => ({
    role: row.sender === 'user' ? 'user' : 'assistant',
    content: row.content
  }));

  const specialist = getSpecialist(role);
  const skillInstructions = getSkillsPrompt(userId, role);
  formattedMessages.unshift({ role: 'system', content: `${specialist.instructions}${skillInstructions}` });

  const currentPromptInHistory = historyRows.at(-1)?.sender === 'user'
    && historyRows.at(-1).content === prompt;
  if (!currentPromptInHistory) {
    formattedMessages.push({ role: 'user', content: prompt });
  }

  // 2. Buscar llaves configuradas (Principal y Reserva)
  const getKeyRecord = (keyRole, isFallback) => db.prepare(`
    SELECT * FROM api_keys 
    WHERE user_id = ? AND role = ? AND is_fallback = ?
  `).get(userId, keyRole, isFallback ? 1 : 0);

  const roleOrder = role === 'general' ? ['general'] : [role, 'general'];
  const findKeyRecord = (isFallback) => roleOrder
    .map(keyRole => getKeyRecord(keyRole, isFallback))
    .find(Boolean);

  const primaryKeyRecord = findKeyRecord(false);
  const fallbackKeyRecord = findKeyRecord(true);
  if (!primaryKeyRecord) {
    throw new Error(`No hay una API Key real configurada para ${specialistName} ni para General. Abre “Configurar Llaves” y conecta un proveedor.`);
  }

  const primaryKeyRole = primaryKeyRecord.role;
  const decryptKey = (record, keyRole) => {
    try {
      return decrypt({
        encryptedData: record.encrypted_key,
        iv: record.iv,
        authTag: record.auth_tag
      });
    } catch (error) {
      if (error.message === KEY_DECRYPTION_ERROR) {
        throw new Error(`No se puede usar la API Key configurada para “${keyRole}”. ${KEY_DECRYPTION_ERROR}`);
      }
      throw error;
    }
  };
  const primaryDecrypted = decryptKey(primaryKeyRecord, primaryKeyRole);

  let result;
  let isFallbackUsed = false;
  let fallbackAlert = null;
  let apiKeyUsed = primaryDecrypted;

  // 3. Intentar llamada con el proveedor principal
  try {
    result = await llmCaller({
      provider: primaryKeyRecord.provider,
      model: primaryKeyRecord.model,
      apiKey: primaryDecrypted,
      messages: formattedMessages,
      maxTokens: 1200,
      specialistName
    });
  } catch (primaryError) {
    console.warn(`Error en el proveedor principal (${primaryError.message}). Evaluando proveedor de reserva...`);

    // 4. Intentar con proveedor de reserva si está configurado
    if (fallbackKeyRecord) {
      try {
        const fallbackDecrypted = decryptKey(fallbackKeyRecord, `${fallbackKeyRecord.role} (reserva)`);

        result = await llmCaller({
          provider: fallbackKeyRecord.provider,
          model: fallbackKeyRecord.model,
          apiKey: fallbackDecrypted,
          messages: formattedMessages,
          maxTokens: 1200,
          specialistName
        });

        isFallbackUsed = true;
        apiKeyUsed = fallbackDecrypted;
        fallbackAlert = `⚠️ Aviso de contingencia: La IA principal falló (${primaryError.message.slice(0, 40)}...). Se utilizó la IA de reserva (${fallbackKeyRecord.provider} - ${fallbackKeyRecord.model}).`;
      } catch (fallbackError) {
        console.error('Error en el proveedor de reserva:', fallbackError.message);
        throw new Error(`Falló el proveedor principal ${primaryKeyRecord.provider} (${primaryError.message}) y también el proveedor de reserva ${fallbackKeyRecord.provider} (${fallbackError.message}).`);
      }
    } else {
      throw new Error(`No se pudo conectar con ${primaryKeyRecord.provider} (${primaryKeyRecord.model}): ${primaryError.message}`);
    }
  }

  return {
    ...result,
    isFallbackUsed,
    fallbackAlert,
    apiKeyUsed
  };
}

module.exports = {
  executeWorker
};

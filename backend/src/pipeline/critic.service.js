const { callLLM } = require('../services/llm.service');
const { decrypt, KEY_DECRYPTION_ERROR } = require('../services/crypto.service');
const { getSpecialist } = require('../services/specialists.service');
const { getSkillsPrompt } = require('../services/skills.service');
const { calculateCost } = require('./1_costs');
const db = require('../config/database');

const CRITIC_SYSTEM_PROMPT = `Eres el CRÍTICO independiente del ecosistema. Revisa cada respuesta antes de entregarla.

Comprueba si cumple la petición, si contiene errores o afirmaciones sin sustento, si falta algo importante y si es segura.

Responde SIEMPRE con:
- Veredicto: APROBADO o REHACER
- Problemas: máximo 5, ordenados por gravedad
- Qué corregir: cambios concretos y breves

Aprueba respuestas correctas. No inventes problemas ni pidas cambios de gusto. Si un dato no se puede comprobar, indícalo.`;

const MAX_REVIEW_ROUNDS = 2;

function shouldTriggerCritique(prompt, output) {
  return Boolean(prompt?.trim() && output?.trim());
}

function decryptKeyRecord(record, role = 'critico') {
  if (!record) return null;
  let apiKey;
  try {
    apiKey = decrypt({
      encryptedData: record.encrypted_key,
      iv: record.iv,
      authTag: record.auth_tag
    });
  } catch (error) {
    if (error.message === KEY_DECRYPTION_ERROR) {
      throw new Error(`No se puede usar la API Key configurada para “${role}”. ${KEY_DECRYPTION_ERROR}`);
    }
    throw error;
  }
  return {
    provider: record.provider,
    model: record.model,
    apiKey
  };
}

function getCriticCredentials(userId, workerProvider, workerModel, workerApiKey) {
  const getCriticKey = isFallback => db.prepare(`
    SELECT provider, model, encrypted_key, iv, auth_tag
    FROM api_keys
    WHERE user_id = ? AND role = 'critico' AND is_fallback = ?
  `).get(userId, isFallback ? 1 : 0);

  return {
    primary: decryptKeyRecord(getCriticKey(false), 'critico')
      || { provider: workerProvider, model: workerModel, apiKey: workerApiKey },
    fallback: decryptKeyRecord(getCriticKey(true), 'critico (reserva)')
  };
}

function recordUsage({ userId, sessionId, specialist, result, isFallbackUsed = false }) {
  const costUsd = calculateCost(result.modelUsed, result.promptTokens, result.completionTokens);
  db.prepare(`
    INSERT INTO usage_logs (
      user_id, session_id, specialist, provider, model,
      prompt_tokens, completion_tokens, total_tokens, cost_usd, is_fallback_used
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    sessionId,
    specialist,
    result.providerUsed,
    result.modelUsed,
    result.promptTokens,
    result.completionTokens,
    result.totalTokens,
    costUsd,
    isFallbackUsed ? 1 : 0
  );

  return {
    costUsd,
    totalTokens: result.totalTokens || 0,
    promptTokens: result.promptTokens || 0,
    completionTokens: result.completionTokens || 0
  };
}

async function executeCriticReviewLoop({
  userId,
  sessionId,
  prompt,
  initialContent,
  specialistName,
  workerRole = 'general',
  provider = 'mock',
  model = 'mock-model',
  apiKey = null,
  llmCaller = callLLM
}) {
  if (!shouldTriggerCritique(prompt, initialContent)) {
    return {
      reviewedByCritic: false,
      finalContent: initialContent,
      verdict: 'ERROR',
      roundsCount: 0,
      criticFeedback: null,
      error: 'No fue posible revisar una respuesta vacía.'
    };
  }

  let criticCredentials;
  try {
    criticCredentials = getCriticCredentials(userId, provider, model, apiKey);
  } catch (error) {
    return {
      reviewedByCritic: false,
      finalContent: initialContent,
      verdict: 'ERROR',
      roundsCount: 0,
      criticFeedback: null,
      error: `No se pudo descifrar la API Key del Crítico: ${error.message}`
    };
  }

  let currentContent = initialContent;
  let lastVerdict = 'APROBADO';
  let lastCriticFeedback = '';
  let round = 0;
  let totalCostUsd = 0;
  let totalTokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  const specialistInstructions = `${getSpecialist(workerRole).instructions}${getSkillsPrompt(userId, workerRole)}`;
  const criticSystemPrompt = `${CRITIC_SYSTEM_PROMPT}${getSkillsPrompt(userId, 'critico')}`;

  while (round < MAX_REVIEW_ROUNDS) {
    round++;

    try {
      let criticCall;
      let criticFallbackUsed = false;
      try {
        criticCall = await llmCaller({
          ...criticCredentials.primary,
          messages: [
            { role: 'system', content: criticSystemPrompt },
            {
              role: 'user',
              content: `Tarea del usuario:\n"""\n${prompt}\n"""\n\nRespuesta de ${specialistName}:\n"""\n${currentContent}\n"""`
            }
          ],
          maxTokens: 700,
          specialistName: 'Crítico'
        });
      } catch (primaryError) {
        if (!criticCredentials.fallback) throw primaryError;
        criticCall = await llmCaller({
          ...criticCredentials.fallback,
          messages: [
            { role: 'system', content: criticSystemPrompt },
            {
              role: 'user',
              content: `Tarea del usuario:\n"""\n${prompt}\n"""\n\nRespuesta de ${specialistName}:\n"""\n${currentContent}\n"""`
            }
          ],
          maxTokens: 700,
          specialistName: 'Crítico'
        });
        criticFallbackUsed = true;
      }
      const usage = recordUsage({
        userId,
        sessionId,
        specialist: 'Crítico (Revisión)',
        result: criticCall,
        isFallbackUsed: criticFallbackUsed
      });
      totalCostUsd += usage.costUsd;
      totalTokens += usage.totalTokens;
      promptTokens += usage.promptTokens;
      completionTokens += usage.completionTokens;
      lastCriticFeedback = criticCall.content;

      const verdict = criticCall.content.match(/veredicto\s*:\s*(APROBADO|REHACER)/i)?.[1]?.toUpperCase();
      if (!verdict) {
        return {
          reviewedByCritic: false,
          finalContent: currentContent,
          verdict: 'ERROR',
          roundsCount: round,
          criticFeedback: lastCriticFeedback,
          error: 'La IA Crítica no devolvió un veredicto válido; se conserva la respuesta sin marcarla como aprobada.',
          costUsd: totalCostUsd,
          totalTokens,
          promptTokens,
          completionTokens
        };
      }

      lastVerdict = verdict;
      if (verdict === 'APROBADO' || round === MAX_REVIEW_ROUNDS) break;

      const rewriteCall = await llmCaller({
        provider,
        model,
        apiKey,
        messages: [
          { role: 'system', content: `${specialistInstructions}\n\nTu respuesta fue revisada y debe corregirse siguiendo estas observaciones.` },
          { role: 'user', content: prompt },
          { role: 'assistant', content: currentContent },
          { role: 'user', content: `Observaciones del Crítico:\n${lastCriticFeedback}\n\nCorrige los problemas concretos.` }
        ],
        maxTokens: 1200,
        specialistName
      });
      const rewriteUsage = recordUsage({
        userId,
        sessionId,
        specialist: `${specialistName} (Corrección ${round})`,
        result: rewriteCall
      });
      totalCostUsd += rewriteUsage.costUsd;
      totalTokens += rewriteUsage.totalTokens;
      promptTokens += rewriteUsage.promptTokens;
      completionTokens += rewriteUsage.completionTokens;
      currentContent = rewriteCall.content;
    } catch (error) {
      return {
        reviewedByCritic: false,
        finalContent: currentContent,
        verdict: 'ERROR',
        roundsCount: round,
        criticFeedback: lastCriticFeedback || null,
        error: `Falló la revisión o corrección; se conserva la última respuesta disponible: ${error.message}`,
        costUsd: totalCostUsd,
        totalTokens,
        promptTokens,
        completionTokens
      };
    }
  }

  return {
    reviewedByCritic: true,
    finalContent: currentContent,
    verdict: lastVerdict,
    roundsCount: round,
    criticFeedback: lastCriticFeedback,
    requiresHumanDecision: lastVerdict === 'REHACER',
    costUsd: totalCostUsd,
    totalTokens,
    promptTokens,
    completionTokens
  };
}

module.exports = {
  executeCriticReviewLoop,
  shouldTriggerCritique,
  CRITIC_SYSTEM_PROMPT
};

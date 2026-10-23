const crypto = require('crypto');
const db = require('../config/database');
const { getSpecialist } = require('./specialists.service');
const { executeWorker } = require('../pipeline/2_worker');
const { calculateCost, checkCostsAndBudget } = require('../pipeline/1_costs');
const { scanContent } = require('../pipeline/3_security');
const { generateAndStoreReceipt } = require('../pipeline/4_receipt');

const MAX_AUTOMATIC_INTERVENTIONS = 2;

function getEnabledRoles(userId) {
  return db.prepare(`
    SELECT role FROM automatic_agents
    WHERE user_id = ?
    ORDER BY position ASC, role ASC
  `).all(userId).map(row => row.role);
}

function parseIntervention(content) {
  const response = content.trim();
  if (/^NO_INTERVENTION\s*$/i.test(response)) return null;
  const match = response.match(/^INTERVENE\s*:\s*([\s\S]+)$/i)
    || response.match(/^INTERVENE\s*\r?\n([\s\S]+)$/i);
  return match?.[1].trim() || null;
}

async function runAutomaticInterventions({
  userId = 'default_user',
  sessionId = 'default_session',
  selectedRole = 'general',
  selectedSpecialistName = 'Asistente',
  llmCaller
}) {
  const enabledRoles = getEnabledRoles(userId).filter(role => role !== selectedRole);
  const responses = [];
  const errors = [];
  const evaluatedRoles = [];
  let responsesCount = 0;

  for (const role of enabledRoles) {
    if (responsesCount >= MAX_AUTOMATIC_INTERVENTIONS) break;

    const specialist = getSpecialist(role);
    const prompt = `Revisa la conversación compartida y la respuesta más reciente de ${selectedSpecialistName}. Decide si puedes aportar algo claramente útil y diferente desde tu especialidad.

Si no tienes una aportación necesaria, responde exactamente: NO_INTERVENTION
Si tienes una aportación concreta, responde con este formato:
INTERVENE
<tu respuesta breve, directamente útil y sin repetir lo ya dicho>

No hagas preguntas solo para iniciar conversación. No afirmes acciones externas.`;

    try {
      const costCheck = checkCostsAndBudget(userId, sessionId, prompt);
      if (!costCheck.allowed) {
        errors.push({
          role,
          specialistName: specialist.name,
          error: `Se detuvieron las intervenciones automáticas: ${costCheck.reason}`
        });
        break;
      }

      const result = await executeWorker({
        userId,
        sessionId,
        role,
        specialistName: specialist.name,
        prompt,
        ...(llmCaller ? { llmCaller } : {})
      });
      evaluatedRoles.push(role);
      const costUsd = calculateCost(result.modelUsed, result.promptTokens, result.completionTokens);
      db.prepare(`
        INSERT INTO usage_logs (
          user_id, session_id, specialist, provider, model, prompt_tokens,
          completion_tokens, total_tokens, cost_usd, is_fallback_used
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        sessionId,
        `${specialist.name} (Evaluación automática)`,
        result.providerUsed,
        result.modelUsed,
        result.promptTokens || 0,
        result.completionTokens || 0,
        result.totalTokens || 0,
        costUsd,
        result.isFallbackUsed ? 1 : 0
      );

      const intervention = parseIntervention(result.content);
      if (!intervention) {
        if (!/^NO_INTERVENTION\s*$/i.test(result.content.trim())
          && !/^INTERVENE(?:\s*:|\s*\r?\n)/i.test(result.content.trim())) {
          errors.push({
            role,
            specialistName: specialist.name,
            error: 'La IA no siguió el formato para decidir si debía intervenir; se omitió su mensaje.'
          });
        }
        continue;
      }

      const securityResult = scanContent(intervention);
      const receipt = generateAndStoreReceipt({
        userId,
        specialist: specialist.name,
        model: result.modelUsed,
        prompt,
        completion: securityResult.content,
        promptTokens: result.promptTokens || 0,
        completionTokens: result.completionTokens || 0,
        totalTokens: result.totalTokens || 0,
        costUsd
      });
      const messageId = `msg_auto_${crypto.randomUUID()}`;
      db.prepare(`
        INSERT INTO chat_messages (
          id, user_id, session_id, sender, specialist, specialist_badge,
          content, receipt_id, code_reviewed, is_fallback_used
        ) VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, ?, ?)
      `).run(
        messageId,
        userId,
        sessionId,
        specialist.name,
        role.toUpperCase(),
        securityResult.content,
        receipt.id,
        securityResult.codeReviewed ? 1 : 0,
        result.isFallbackUsed ? 1 : 0
      );

      responses.push({
        id: messageId,
        specialist: specialist.name,
        role,
        content: securityResult.content,
        receiptId: receipt.id,
        receiptSummary: {
          model: receipt.model,
          tokens: receipt.totalTokens,
          costUsd: receipt.costUsd
        },
        codeReviewed: securityResult.codeReviewed,
        isFallbackUsed: result.isFallbackUsed,
        createdAt: receipt.timestamp
      });
      responsesCount++;
    } catch (error) {
      console.error(`Error en intervención automática de ${specialist.name}:`, error.message);
      errors.push({
        role,
        specialistName: specialist.name,
        error: error.message
      });
    }
  }

  return { responses, errors, enabledCount: enabledRoles.length, evaluatedRoles };
}

module.exports = {
  runAutomaticInterventions,
  parseIntervention,
  MAX_AUTOMATIC_INTERVENTIONS
};

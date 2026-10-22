const crypto = require('crypto');
const db = require('../config/database');
const { checkCostsAndBudget, calculateCost } = require('./1_costs');
const { executeWorker } = require('./2_worker');
const { scanContent } = require('./3_security');
const { generateAndStoreReceipt } = require('./4_receipt');

/**
 * PUERTA DE ENTRADA Y SALIDA (Obligatoria, nada se la salta)
 * Ejecuta en riguroso orden secuencial:
 * 1. Costos y Límites (Budget, loops, router)
 * 2. La IA Trabaja (Worker con context limit y fallback)
 * 3. Seguridad (VibeScan: código, secretos y fallos)
 * 4. Recibo Firmado (Comprobante criptográfico inmutable)
 */
async function processPipeline({
  userId = 'default_user',
  sessionId = 'default_session',
  prompt,
  role = 'general',
  specialistName = 'IA Base'
}) {
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('El mensaje no puede estar vacío.');
  }

  const cleanPrompt = prompt.trim();

  // -------------------------------------------------------------
  // PASO 1: COSTOS Y LÍMITES
  // -------------------------------------------------------------
  const costCheck = checkCostsAndBudget(userId, sessionId, cleanPrompt);

  if (!costCheck.allowed) {
    return {
      success: false,
      blockedByPipeline: true,
      stepFailed: 1,
      reason: costCheck.reason,
      status: costCheck.status
    };
  }

  // Guardar mensaje de usuario en base de datos para historial y control de bucles
  const userMsgId = `msg_user_${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO chat_messages (id, user_id, session_id, sender, content)
    VALUES (?, ?, ?, 'user', ?)
  `).run(userMsgId, userId, sessionId, cleanPrompt);

  // -------------------------------------------------------------
  // PASO 2: LA IA TRABAJA
  // -------------------------------------------------------------
  const workerResult = await executeWorker({
    userId,
    sessionId,
    role,
    specialistName,
    prompt: cleanPrompt
  });

  const costUsd = calculateCost(
    workerResult.modelUsed,
    workerResult.promptTokens,
    workerResult.completionTokens
  );

  // Registrar uso en usage_logs
  db.prepare(`
    INSERT INTO usage_logs (
      user_id, session_id, specialist, provider, model,
      prompt_tokens, completion_tokens, total_tokens, cost_usd, is_fallback_used
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    sessionId,
    specialistName,
    workerResult.providerUsed,
    workerResult.modelUsed,
    workerResult.promptTokens,
    workerResult.completionTokens,
    workerResult.totalTokens,
    costUsd,
    workerResult.isFallbackUsed ? 1 : 0
  );

  // -------------------------------------------------------------
  // REVISIÓN CRÍTICA (Skill: revision-critica)
  // El crítico revisa la solución: si dice REHACER, la IA especialista corrige (máx 2 vueltas)
  // -------------------------------------------------------------
  const { executeCriticReviewLoop } = require('./critic.service');
  const criticReview = await executeCriticReviewLoop({
    userId,
    sessionId,
    prompt: cleanPrompt,
    initialContent: workerResult.content,
    specialistName,
    provider: workerResult.providerUsed,
    model: workerResult.modelUsed
  });

  const contentToDeliver = criticReview.finalContent || workerResult.content;

  // -------------------------------------------------------------
  // PASO 3: SEGURIDAD (VibeScan)
  // -------------------------------------------------------------
  const securityResult = scanContent(contentToDeliver);

  // -------------------------------------------------------------
  // PASO 4: RECIBO FIRMADO
  // -------------------------------------------------------------
  const receipt = generateAndStoreReceipt({
    userId,
    specialist: specialistName,
    model: workerResult.modelUsed,
    prompt: cleanPrompt,
    completion: securityResult.content,
    promptTokens: workerResult.promptTokens,
    completionTokens: workerResult.completionTokens,
    totalTokens: workerResult.totalTokens,
    costUsd
  });

  // Guardar respuesta del asistente en chat_messages
  const assistantMsgId = `msg_asst_${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO chat_messages (
      id, user_id, session_id, sender, specialist, specialist_badge,
      content, receipt_id, code_reviewed, is_fallback_used
    ) VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, ?, ?)
  `).run(
    assistantMsgId,
    userId,
    sessionId,
    specialistName,
    role.toUpperCase(),
    securityResult.content,
    receipt.id,
    securityResult.codeReviewed ? 1 : 0,
    workerResult.isFallbackUsed ? 1 : 0
  );

  // Obtener estado actualizado del presupuesto tras la llamada
  const updatedBudget = checkCostsAndBudget(userId, sessionId, 'dummy').budget;

  return {
    success: true,
    messageId: assistantMsgId,
    specialistName,
    role,
    content: securityResult.content,
    isFallbackUsed: workerResult.isFallbackUsed,
    fallbackAlert: workerResult.fallbackAlert,
    budgetAlert: costCheck.alert,
    routing: costCheck.routing,
    criticReview: {
      reviewed: criticReview.reviewedByCritic,
      verdict: criticReview.verdict,
      roundsCount: criticReview.roundsCount,
      criticFeedback: criticReview.criticFeedback,
      requiresHumanDecision: criticReview.requiresHumanDecision
    },
    security: {
      hasCode: securityResult.hasCode,
      codeReviewed: securityResult.codeReviewed,
      badge: securityResult.badge,
      findings: securityResult.findings,
      summary: securityResult.summary
    },
    receipt: {
      id: receipt.id,
      timestamp: receipt.timestamp,
      model: receipt.model,
      signature: receipt.signature,
      totalTokens: receipt.totalTokens,
      costUsd: receipt.costUsd
    },
    budget: updatedBudget
  };
}

module.exports = {
  processPipeline
};

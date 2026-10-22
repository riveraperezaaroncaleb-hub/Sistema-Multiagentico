const { callLLM } = require('../services/llm.service');
const { calculateCost } = require('./1_costs');
const db = require('../config/database');

const CRITIC_SYSTEM_PROMPT = `Eres el CRÍTICO del ecosistema. No escribes la solución, la revisas.

Recibes: la tarea original y el resultado de otra IA.

Revisa solo esto:
1. ¿Cumple lo que pidió el usuario?
2. ¿Hay errores o cosas inventadas?
3. ¿Falta algo importante?
4. ¿Es seguro? (claves, permisos, datos del usuario)

Responde SIEMPRE en este formato:
- Veredicto: APROBADO o REHACER
- Problemas (máximo 5, ordenados por gravedad)
- Qué corregir, concreto y corto

Reglas:
- No elogies por cortesía. Si está bien, di APROBADO y ya.
- No pidas cambios de gusto personal, solo problemas reales.
- Si dudas de un dato, dilo: "no verificable".`;

/**
 * Determina si una tarea amerita la intervención del Crítico.
 * "No se activa en: preguntas simples y respuestas cortas."
 */
function shouldTriggerCritique(prompt, output) {
  if (!prompt || !output) return false;
  
  const textPrompt = prompt.trim();
  const textOutput = output.trim();

  // Preguntas muy cortas o saludos no activan al crítico
  if (textPrompt.length < 30 && !/código|codigo|función|script|plan|correo/i.test(textPrompt)) {
    return false;
  }

  // Se activa si hay código, si es una redacción o plan importante, o si el output es sustancial
  const hasCode = /```[\s\S]*?```/.test(textOutput);
  const isSubstantial = textOutput.split(/\s+/).length >= 50;
  const isImportantTask = /código|codigo|programa|refactor|correo|plan|arquitectura|seguridad|sql|contrato/i.test(textPrompt);

  return hasCode || isSubstantial || isImportantTask;
}

/**
 * Ejecuta el ciclo de revisión crítica con máximo 2 vueltas.
 */
async function executeCriticReviewLoop({
  userId,
  sessionId,
  prompt,
  initialContent,
  specialistName,
  provider = 'mock',
  model = 'mock-model',
  apiKey = null
}) {
  if (!shouldTriggerCritique(prompt, initialContent)) {
    return {
      reviewedByCritic: false,
      finalContent: initialContent,
      verdict: 'OMITIDO_SIMPLE',
      roundsCount: 0,
      criticFeedback: null
    };
  }

  let currentContent = initialContent;
  let lastVerdict = 'APROBADO';
  let lastCriticFeedback = '';
  let round = 0;
  const maxRounds = 2; // Máximo 2 vueltas según especificación

  while (round < maxRounds) {
    round++;

    // 1. Llamar al Crítico para revisar el trabajo de la especialista
    const criticMessages = [
      { role: 'system', content: CRITIC_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Tarea original del usuario:\n"""\n${prompt}\n"""\n\nResultado entregado por la especialista (${specialistName}):\n"""\n${currentContent}\n"""`
      }
    ];

    let criticCall;
    try {
      criticCall = await callLLM({
        provider,
        model,
        apiKey,
        messages: criticMessages,
        maxTokens: 500,
        specialistName: 'Crítico'
      });
    } catch (err) {
      console.warn('Error al llamar al Crítico, omitiendo ciclo:', err.message);
      break;
    }

    // Registrar costo y tokens de la revisión del crítico
    const criticCost = calculateCost(criticCall.modelUsed, criticCall.promptTokens, criticCall.completionTokens);
    db.prepare(`
      INSERT INTO usage_logs (
        user_id, session_id, specialist, provider, model,
        prompt_tokens, completion_tokens, total_tokens, cost_usd, is_fallback_used
      ) VALUES (?, ?, 'Crítico (Revisión)', ?, ?, ?, ?, ?, ?, 0)
    `).run(
      userId,
      sessionId,
      criticCall.providerUsed,
      criticCall.modelUsed,
      criticCall.promptTokens,
      criticCall.completionTokens,
      criticCall.totalTokens,
      criticCost
    );

    lastCriticFeedback = criticCall.content;
    const isRehacer = /Veredicto:\s*REHACER/i.test(criticCall.content);

    if (!isRehacer) {
      lastVerdict = 'APROBADO';
      break;
    }

    lastVerdict = 'REHACER';

    // Si pide REHACER y aún no hemos agotado las 2 vueltas, la especialista corrige
    if (round < maxRounds) {
      const rewriteMessages = [
        { role: 'system', content: `Eres la IA especialista ${specialistName}. Tu entrega previa fue evaluada por el Crítico con observaciones.` },
        { role: 'user', content: prompt },
        { role: 'assistant', content: currentContent },
        {
          role: 'user',
          content: `El Crítico ha señalado los siguientes problemas:\n${lastCriticFeedback}\n\nPor favor, corrige tu respuesta resolviendo puntualmente lo indicado.`
        }
      ];

      try {
        const rewriteCall = await callLLM({
          provider,
          model,
          apiKey,
          messages: rewriteMessages,
          maxTokens: 1200,
          specialistName
        });

        const rewriteCost = calculateCost(rewriteCall.modelUsed, rewriteCall.promptTokens, rewriteCall.completionTokens);
        db.prepare(`
          INSERT INTO usage_logs (
            user_id, session_id, specialist, provider, model,
            prompt_tokens, completion_tokens, total_tokens, cost_usd, is_fallback_used
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run(
          userId,
          sessionId,
          `${specialistName} (Corrección Vuelta ${round})`,
          rewriteCall.providerUsed,
          rewriteCall.modelUsed,
          rewriteCall.promptTokens,
          rewriteCall.completionTokens,
          rewriteCall.totalTokens,
          rewriteCost
        );

        currentContent = rewriteCall.content;
      } catch (err) {
        console.warn('Error en la corrección de la especialista:', err.message);
        break;
      }
    }
  }

  return {
    reviewedByCritic: true,
    finalContent: currentContent,
    verdict: lastVerdict,
    roundsCount: round,
    criticFeedback: lastCriticFeedback,
    requiresHumanDecision: lastVerdict === 'REHACER' && round >= maxRounds
  };
}

module.exports = {
  executeCriticReviewLoop,
  shouldTriggerCritique,
  CRITIC_SYSTEM_PROMPT
};

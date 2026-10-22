const db = require('../config/database');

// Tabla de tarifas aproximadas por millón de tokens (USD)
const MODEL_PRICING = {
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.60 },
  'gpt-4o': { inputPer1M: 2.50, outputPer1M: 10.00 },
  'gemini-1.5-flash': { inputPer1M: 0.075, outputPer1M: 0.30 },
  'gemini-2.0-flash': { inputPer1M: 0.10, outputPer1M: 0.40 },
  'gemini-1.5-pro': { inputPer1M: 1.25, outputPer1M: 5.00 },
  'claude-3-5-sonnet': { inputPer1M: 3.00, outputPer1M: 15.00 },
  'claude-3-5-haiku': { inputPer1M: 0.80, outputPer1M: 4.00 },
  'mock-model': { inputPer1M: 0.0, outputPer1M: 0.0 }
};

/**
 * Calcula el costo estimado de una llamada en base a tokens reales.
 */
function calculateCost(modelName, promptTokens, completionTokens) {
  const pricing = MODEL_PRICING[modelName] || MODEL_PRICING['gpt-4o-mini'];
  const inputCost = (promptTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (completionTokens / 1_000_000) * pricing.outputPer1M;
  return Number((inputCost + outputCost).toFixed(6));
}

/**
 * Enrutador inteligente: Clasifica la dificultad del pedido.
 * Las tareas simples van a un modelo rápido y barato; las complejas a uno potente.
 */
function routeModelComplexity(prompt) {
  const text = prompt.toLowerCase();
  const wordCount = prompt.trim().split(/\s+/).length;

  // Indicadores de alta complejidad
  const complexKeywords = [
    'código', 'codigo', 'programa', 'refactor', 'arquitectura',
    'algoritmo', 'analiza detalladamente', 'paso a paso', 'investiga',
    'compara exhaustivamente', 'base de datos', 'sql'
  ];

  const hasComplexKeyword = complexKeywords.some(kw => text.includes(kw));

  if (hasComplexKeyword || wordCount > 100) {
    return {
      tier: 'potente',
      recommendedModel: 'gpt-4o',
      reason: 'Solicitud con requerimientos técnicos o extensión alta. Se recomienda modelo de alta capacidad.'
    };
  }

  return {
    tier: 'economico',
    recommendedModel: 'gemini-1.5-flash',
    reason: 'Consulta concisa o tarea estándar. Se canaliza a modelo de alta velocidad y bajo costo.'
  };
}

/**
 * Detecta bucles repetitivos de llamadas idénticas para evitar fugas de dinero por scripts trabados.
 */
function detectLoop(userId, sessionId, newPrompt) {
  const stmt = db.prepare(`
    SELECT content FROM chat_messages 
    WHERE user_id = ? AND session_id = ? AND sender = 'user'
    ORDER BY rowid DESC LIMIT 2
  `);
  const recentMessages = stmt.all(userId, sessionId);

  if (recentMessages.length >= 2) {
    const trimmedNew = newPrompt.trim().toLowerCase();
    const allMatch = recentMessages.every(m => m.content.trim().toLowerCase() === trimmedNew);
    if (allMatch) {
      return {
        isLoop: true,
        reason: 'Se detectaron 3 consultas idénticas consecutivas. Se detuvo la llamada para evitar consumo innecesario.'
      };
    }
  }
  return { isLoop: false };
}

/**
 * PASO 1 OBLIGATORIO: Verificación de Costos y Presupuesto
 */
function checkCostsAndBudget(userId, sessionId, prompt) {
  // 1. Obtener o crear configuración de presupuesto
  let settings = db.prepare('SELECT * FROM budget_settings WHERE user_id = ?').get(userId);
  if (!settings) {
    db.prepare(`
      INSERT INTO budget_settings (user_id, daily_limit_usd, monthly_limit_usd, alert_threshold_pct)
      VALUES (?, 1.00, 25.00, 80)
    `).run(userId);
    settings = db.prepare('SELECT * FROM budget_settings WHERE user_id = ?').get(userId);
  }

  // 2. Comprobar bucles
  const loopCheck = detectLoop(userId, sessionId, prompt);
  if (loopCheck.isLoop) {
    return {
      allowed: false,
      reason: loopCheck.reason,
      status: 'LOOP_DETECTED'
    };
  }

  // 3. Calcular gasto diario y mensual acumulado
  const today = new Date().toISOString().slice(0, 10);
  const monthPrefix = new Date().toISOString().slice(0, 7);

  const dailyStats = db.prepare(`
    SELECT COALESCE(SUM(cost_usd), 0.0) as totalCost, COALESCE(SUM(total_tokens), 0) as totalTokens
    FROM usage_logs
    WHERE user_id = ? AND DATE(timestamp) = DATE('now')
  `).get(userId);

  const monthlyStats = db.prepare(`
    SELECT COALESCE(SUM(cost_usd), 0.0) as totalCost, COALESCE(SUM(total_tokens), 0) as totalTokens
    FROM usage_logs
    WHERE user_id = ? AND strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now')
  `).get(userId);

  const dailySpent = dailyStats.totalCost;
  const monthlySpent = monthlyStats.totalCost;

  // 4. Verificar superación de topes (dinero y tokens)
  if (dailySpent >= settings.daily_limit_usd) {
    return {
      allowed: false,
      reason: `Tope diario de gasto alcanzado: has consumido $${dailySpent.toFixed(4)} de tu límite de $${settings.daily_limit_usd.toFixed(2)}.`,
      status: 'DAILY_LIMIT_EXCEEDED'
    };
  }

  if (dailyStats.totalTokens >= settings.daily_tokens_limit) {
    return {
      allowed: false,
      reason: `Tope diario de tokens alcanzado: has consumido ${dailyStats.totalTokens.toLocaleString()} de tu límite de ${settings.daily_tokens_limit.toLocaleString()} tokens.`,
      status: 'DAILY_TOKENS_EXCEEDED'
    };
  }

  if (monthlySpent >= settings.monthly_limit_usd) {
    return {
      allowed: false,
      reason: `Tope mensual de gasto alcanzado: has consumido $${monthlySpent.toFixed(4)} de tu límite de $${settings.monthly_limit_usd.toFixed(2)}.`,
      status: 'MONTHLY_LIMIT_EXCEEDED'
    };
  }

  if (monthlyStats.totalTokens >= settings.monthly_tokens_limit) {
    return {
      allowed: false,
      reason: `Tope mensual de tokens alcanzado: has consumido ${monthlyStats.totalTokens.toLocaleString()} de tu límite de ${settings.monthly_tokens_limit.toLocaleString()} tokens.`,
      status: 'MONTHLY_TOKENS_EXCEEDED'
    };
  }

  // 5. Alerta de umbral (80%)
  const dailyPercent = Math.max(
    (dailySpent / settings.daily_limit_usd) * 100,
    (dailyStats.totalTokens / settings.daily_tokens_limit) * 100
  );
  let alert = null;
  if (dailyPercent >= settings.alert_threshold_pct) {
    alert = `⚠️ Alerta de presupuesto: has alcanzado el ${dailyPercent.toFixed(1)}% de tu tope diario.`;
  }

  // 6. Enrutamiento de complejidad
  const routing = routeModelComplexity(prompt);

  return {
    allowed: true,
    alert,
    routing,
    budget: {
      dailySpent,
      dailyLimit: settings.daily_limit_usd,
      dailyPercent: Math.min(100, Number(dailyPercent.toFixed(1))),
      monthlySpent,
      monthlyLimit: settings.monthly_limit_usd,
      dailyTokens: dailyStats.totalTokens,
      monthlyTokens: monthlyStats.totalTokens
    }
  };
}

module.exports = {
  checkCostsAndBudget,
  calculateCost,
  routeModelComplexity,
  MODEL_PRICING
};

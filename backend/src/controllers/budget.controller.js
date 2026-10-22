const db = require('../config/database');

/**
 * Consulta el estado actual del presupuesto y gastos del usuario
 */
function getBudget(req, res) {
  try {
    const userId = req.query.userId || 'default_user';

    let settings = db.prepare('SELECT * FROM budget_settings WHERE user_id = ?').get(userId);
    if (!settings) {
      db.prepare(`
        INSERT INTO budget_settings (user_id, daily_limit_usd, monthly_limit_usd, alert_threshold_pct)
        VALUES (?, 1.00, 25.00, 80)
      `).run(userId);
      settings = db.prepare('SELECT * FROM budget_settings WHERE user_id = ?').get(userId);
    }

    const dailyStats = db.prepare(`
      SELECT 
        COALESCE(SUM(cost_usd), 0.0) as totalCost,
        COALESCE(SUM(total_tokens), 0) as totalTokens,
        COALESCE(SUM(prompt_tokens), 0) as promptTokens,
        COALESCE(SUM(completion_tokens), 0) as completionTokens,
        COUNT(id) as totalCalls
      FROM usage_logs
      WHERE user_id = ? AND DATE(timestamp) = DATE('now')
    `).get(userId);

    const monthlyStats = db.prepare(`
      SELECT 
        COALESCE(SUM(cost_usd), 0.0) as totalCost,
        COALESCE(SUM(total_tokens), 0) as totalTokens,
        COUNT(id) as totalCalls
      FROM usage_logs
      WHERE user_id = ? AND strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now')
    `).get(userId);

    const dailySpent = dailyStats.totalCost;
    const dailyLimit = settings.daily_limit_usd;
    const dailyPercent = Math.min(100, (dailySpent / dailyLimit) * 100);

    return res.json({
      success: true,
      budget: {
        dailySpent: Number(dailySpent.toFixed(6)),
        dailyLimit,
        dailyPercent: Number(dailyPercent.toFixed(1)),
        monthlySpent: Number(monthlyStats.totalCost.toFixed(6)),
        monthlyLimit: settings.monthly_limit_usd,
        alertThresholdPct: settings.alert_threshold_pct,
        dailyTokens: dailyStats.totalTokens,
        monthlyTokens: monthlyStats.totalTokens,
        totalCallsToday: dailyStats.totalCalls,
        isWarning: dailyPercent >= settings.alert_threshold_pct,
        isExceeded: dailySpent >= dailyLimit
      }
    });
  } catch (error) {
    console.error('Error al consultar presupuesto:', error);
    return res.status(500).json({ error: 'Error al consultar el presupuesto.' });
  }
}

/**
 * Actualiza los límites de presupuesto del usuario
 */
function updateBudget(req, res) {
  try {
    const {
      userId = 'default_user',
      dailyLimitUsd,
      monthlyLimitUsd,
      alertThresholdPct
    } = req.body;

    const newDaily = dailyLimitUsd !== undefined ? Math.max(0.01, Number(dailyLimitUsd)) : 1.00;
    const newMonthly = monthlyLimitUsd !== undefined ? Math.max(0.01, Number(monthlyLimitUsd)) : 25.00;
    const newAlert = alertThresholdPct !== undefined ? Math.min(100, Math.max(10, Number(alertThresholdPct))) : 80;

    db.prepare(`
      INSERT INTO budget_settings (user_id, daily_limit_usd, monthly_limit_usd, alert_threshold_pct, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        daily_limit_usd = excluded.daily_limit_usd,
        monthly_limit_usd = excluded.monthly_limit_usd,
        alert_threshold_pct = excluded.alert_threshold_pct,
        updated_at = CURRENT_TIMESTAMP
    `).run(userId, newDaily, newMonthly, newAlert);

    return res.json({
      success: true,
      message: 'Presupuesto actualizado correctamente.',
      settings: {
        dailyLimitUsd: newDaily,
        monthlyLimitUsd: newMonthly,
        alertThresholdPct: newAlert
      }
    });
  } catch (error) {
    console.error('Error al actualizar presupuesto:', error);
    return res.status(500).json({ error: 'Error al actualizar el presupuesto.' });
  }
}

module.exports = {
  getBudget,
  updateBudget
};

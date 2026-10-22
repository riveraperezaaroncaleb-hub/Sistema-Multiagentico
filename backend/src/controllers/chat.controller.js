const db = require('../config/database');
const { processPipeline } = require('../pipeline');
const { getReceiptById } = require('../pipeline/4_receipt');

/**
 * Procesa un nuevo mensaje de chat a través de la tubería de 4 pasos
 */
async function sendMessage(req, res) {
  try {
    const {
      userId = 'default_user',
      sessionId = 'default_session',
      prompt,
      role = 'general',
      specialistName = 'IA Base'
    } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
    }

    const result = await processPipeline({
      userId,
      sessionId,
      prompt: prompt.trim(),
      role,
      specialistName
    });

    if (!result.success && result.blockedByPipeline) {
      return res.status(429).json({
        blocked: true,
        stepFailed: result.stepFailed,
        reason: result.reason,
        status: result.status
      });
    }

    return res.json(result);
  } catch (error) {
    console.error('Error al procesar mensaje de chat:', error);
    return res.status(500).json({ error: error.message || 'Error interno en el chat.' });
  }
}

/**
 * Obtiene el historial de mensajes para la sesión actual
 */
function getHistory(req, res) {
  try {
    const userId = req.query.userId || 'default_user';
    const sessionId = req.query.sessionId || 'default_session';

    const messages = db.prepare(`
      SELECT 
        m.id, m.sender, m.specialist, m.specialist_badge, m.content,
        m.receipt_id, m.code_reviewed, m.is_fallback_used, m.created_at,
        r.model as receipt_model, r.cost_usd, r.tokens_used
      FROM chat_messages m
      LEFT JOIN receipts r ON m.receipt_id = r.id
      WHERE m.user_id = ? AND m.session_id = ?
      ORDER BY m.created_at ASC
    `).all(userId, sessionId);

    return res.json({
      success: true,
      messages: messages.map(m => ({
        id: m.id,
        sender: m.sender,
        specialist: m.specialist,
        specialistBadge: m.specialist_badge,
        content: m.content,
        receiptId: m.receipt_id,
        codeReviewed: Boolean(m.code_reviewed),
        isFallbackUsed: Boolean(m.is_fallback_used),
        createdAt: m.created_at,
        receiptSummary: m.receipt_id ? {
          model: m.receipt_model,
          costUsd: m.cost_usd,
          tokens: m.tokens_used
        } : null
      }))
    });
  } catch (error) {
    console.error('Error al obtener historial:', error);
    return res.status(500).json({ error: 'Error al consultar historial.' });
  }
}

/**
 * Consulta un comprobante criptográfico por su ID
 */
function getReceipt(req, res) {
  try {
    const { receiptId } = req.params;
    const receipt = getReceiptById(receiptId);

    if (!receipt) {
      return res.status(404).json({ error: 'Comprobante no encontrado.' });
    }

    return res.json({
      success: true,
      receipt
    });
  } catch (error) {
    console.error('Error al consultar recibo:', error);
    return res.status(500).json({ error: 'Error al consultar el comprobante.' });
  }
}

/**
 * Limpia el historial de la sesión actual
 */
function clearSession(req, res) {
  try {
    const { userId = 'default_user', sessionId = 'default_session' } = req.body;
    db.prepare('DELETE FROM chat_messages WHERE user_id = ? AND session_id = ?').run(userId, sessionId);
    return res.json({ success: true, message: 'Sesión reiniciada.' });
  } catch (error) {
    return res.status(500).json({ error: 'Error al limpiar sesión.' });
  }
}

module.exports = {
  sendMessage,
  getHistory,
  getReceipt,
  clearSession
};

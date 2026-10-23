const db = require('../config/database');
const { processPipeline } = require('../pipeline');
const { getReceiptById } = require('../pipeline/4_receipt');
const { KEY_DECRYPTION_ERROR } = require('../services/crypto.service');
const { extractDocxText, MAX_EXTRACTED_CHARACTERS } = require('../services/document.service');

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
      specialistName = 'IA Base',
      document
    } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
    }

    if (document !== undefined && (
      !document
      || typeof document.fileName !== 'string'
      || typeof document.text !== 'string'
      || !document.text.trim()
      || document.text.length > MAX_EXTRACTED_CHARACTERS
    )) {
      return res.status(400).json({ error: 'El texto del documento adjunto no es válido o supera el límite permitido.' });
    }

    const messagePrompt = document
      ? `Analiza el documento adjunto "${document.fileName.replace(/[\r\n]/g, '').slice(0, 180)}".\n\nContenido del documento:\n---\n${document.text}\n---\n\nInstrucción del usuario: ${prompt.trim()}`
      : prompt.trim();

    const result = await processPipeline({
      userId,
      sessionId,
      prompt: messagePrompt,
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
    const keyNeedsReplacement = error.message?.includes(KEY_DECRYPTION_ERROR);
    return res.status(keyNeedsReplacement ? 409 : 500).json({
      error: error.message || 'Error interno en el chat.'
    });
  }
}

async function extractDocument(req, res) {
  try {
    const document = await extractDocxText(req.file);
    return res.json({ success: true, document });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error al extraer texto del documento DOCX:', error);
    return res.status(500).json({ error: 'Error interno al extraer el texto del documento.' });
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
      ORDER BY m.created_at ASC, m.rowid ASC
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
    if (typeof userId !== 'string' || !userId.trim()
      || typeof sessionId !== 'string' || !sessionId.trim()) {
      return res.status(400).json({ error: 'Se requiere un usuario y una sesión válidos para borrar el historial.' });
    }

    const result = db.prepare(`
      DELETE FROM chat_messages WHERE user_id = ? AND session_id = ?
    `).run(userId, sessionId);
    return res.json({
      success: true,
      deletedMessages: result.changes,
      message: 'Se borró el historial del chat de esta sesión. Las llaves, skills, presupuestos, configuración, recibos y registros de uso se conservaron.'
    });
  } catch (error) {
    console.error('Error al borrar el historial del chat:', error);
    return res.status(500).json({ error: 'Error al borrar el historial del chat.' });
  }
}

module.exports = {
  sendMessage,
  extractDocument,
  getHistory,
  getReceipt,
  clearSession
};

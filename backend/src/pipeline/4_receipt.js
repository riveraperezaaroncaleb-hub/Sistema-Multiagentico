const crypto = require('crypto');
const db = require('../config/database');
require('dotenv').config();

const RECEIPT_SECRET = process.env.RECEIPT_SIGNING_SECRET || 'secret_receipt_signature_key_2026_ecosistema_multi_ia';

/**
 * Genera el hash criptográfico SHA-256 de cualquier texto.
 */
function sha256(text) {
  return crypto.createHash('sha256').update(text || '', 'utf8').digest('hex');
}

/**
 * Adaptador de Firma Criptográfica Propia (HMAC-SHA256).
 * Diseñado como adaptador intercambiable para enchufar LedgerProof u otro servicio externo en el futuro.
 */
class LocalHmacReceiptSigner {
  sign(payload) {
    const canonicalString = [
      payload.id,
      payload.timestamp,
      payload.userId,
      payload.specialist,
      payload.model,
      payload.inputHash,
      payload.outputHash,
      payload.totalTokens,
      payload.costUsd
    ].join('|');

    const signature = crypto
      .createHmac('sha256', RECEIPT_SECRET)
      .update(canonicalString)
      .digest('hex');

    return {
      provider: 'InternalCryptographicLedger',
      signature,
      canonicalString
    };
  }

  verify(receipt) {
    const canonicalString = [
      receipt.id,
      receipt.timestamp,
      receipt.userId,
      receipt.specialist,
      receipt.model,
      receipt.inputHash,
      receipt.outputHash,
      receipt.totalTokens,
      receipt.costUsd
    ].join('|');

    const expectedSig = crypto
      .createHmac('sha256', RECEIPT_SECRET)
      .update(canonicalString)
      .digest('hex');

    return expectedSig === receipt.signature;
  }
}

// Instancia activa del firmador (puede reemplazarse por LedgerProofAdapter cuando esté disponible)
const currentSigner = new LocalHmacReceiptSigner();

/**
 * PASO 4 OBLIGATORIO: Generar Recibo Firmado
 */
function generateAndStoreReceipt({
  userId,
  specialist,
  model,
  prompt,
  completion,
  promptTokens = 0,
  completionTokens = 0,
  totalTokens = 0,
  costUsd = 0.0
}) {
  const receiptId = `rec_${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();

  const inputHash = sha256(prompt);
  const outputHash = sha256(completion);

  const payloadToSign = {
    id: receiptId,
    timestamp,
    userId,
    specialist,
    model,
    inputHash,
    outputHash,
    totalTokens,
    costUsd: Number(costUsd.toFixed(6))
  };

  const { signature, provider } = currentSigner.sign(payloadToSign);

  const receiptData = {
    ...payloadToSign,
    promptTokens,
    completionTokens,
    signerProvider: provider,
    signature,
    verified: true
  };

  // Guardar en la base de datos de auditoría
  db.prepare(`
    INSERT INTO receipts (
      id, user_id, specialist, model, input_hash, output_hash,
      tokens_used, cost_usd, signature, raw_receipt_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    receiptId,
    userId,
    specialist,
    model,
    inputHash,
    outputHash,
    totalTokens,
    costUsd,
    signature,
    JSON.stringify(receiptData)
  );

  return receiptData;
}

/**
 * Consulta y valida un recibo existente.
 */
function getReceiptById(receiptId) {
  const row = db.prepare('SELECT * FROM receipts WHERE id = ?').get(receiptId);
  if (!row) return null;

  const raw = JSON.parse(row.raw_receipt_json);
  const isValid = currentSigner.verify(raw);

  return {
    ...raw,
    isValid
  };
}

module.exports = {
  generateAndStoreReceipt,
  getReceiptById,
  sha256
};

const crypto = require('crypto');
require('dotenv').config();

// Algoritmo estándar de la industria: Cifrado Simétrico Autenticado
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits para el IV de GCM
const AUTH_TAG_LENGTH = 16; // 128 bits de tag de autenticación
const KEY_DECRYPTION_ERROR = 'La API Key guardada no se puede descifrar con la clave maestra actual. Vuelve a introducirla en “Llaves (BYOK)” y guárdala para reemplazar esta configuración. Revisa que APP_ENCRYPTION_SECRET permanezca estable entre reinicios.';

/**
 * Obtiene la clave maestra de 256 bits (32 bytes) desde las variables de entorno.
 * Si no viene en 32 bytes exactos, la normaliza con SHA-256.
 */
function getMasterKey() {
  const secret = process.env.APP_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error('APP_ENCRYPTION_SECRET no está configurada. Define una clave estable en backend/.env antes de guardar o usar API Keys.');
  }
  if (secret.length === 64 && /^[0-9a-fA-F]+$/.test(secret)) {
    return Buffer.from(secret, 'hex');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Cifra un texto sensible (como una API Key de OpenAI o Gemini) usando AES-256-GCM.
 * @param {string} plainText - La clave en texto plano.
 * @returns {object} { encryptedData: string, iv: string, authTag: string, last4: string }
 */
function encrypt(plainText) {
  if (!plainText || typeof plainText !== 'string') {
    throw new Error('El texto a cifrar debe ser una cadena no vacía.');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getMasterKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Guardamos solo los últimos 4 caracteres para que el usuario identifique cuál llave pegó
  const trimmed = plainText.trim();
  const last4 = trimmed.length > 4 ? trimmed.slice(-4) : trimmed;

  return {
    encryptedData: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    last4
  };
}

/**
 * Descifra una API Key utilizando su IV y Auth Tag.
 * Si el dato cifrado o el auth tag fue manipulado, lanzará un error de autenticación.
 * @param {object} param0 - { encryptedData, iv, authTag }
 * @returns {string} Texto plano original
 */
function decrypt({ encryptedData, iv, authTag }) {
  if (!encryptedData || !iv || !authTag) {
    throw new Error('Faltan parámetros requeridos para descifrar (encryptedData, iv o authTag).');
  }

  const key = getMasterKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  try {
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    throw new Error(KEY_DECRYPTION_ERROR);
  }
}

/**
 * Enmascara una llave para mostrarla de forma segura en UI o logs sin exponer el secreto.
 * Ej: "sk-proj-1234567890abcdef" -> "••••••••cdef"
 */
function maskKey(key) {
  if (!key || typeof key !== 'string') return '••••••••';
  const clean = key.trim();
  if (clean.length <= 4) return '••••';
  return '••••••••' + clean.slice(-4);
}

module.exports = {
  encrypt,
  decrypt,
  maskKey,
  KEY_DECRYPTION_ERROR
};

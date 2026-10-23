const mammoth = require('mammoth');

const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_EXTRACTED_CHARACTERS = 20000;
const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function createDocumentUploadMiddleware() {
  const multer = require('multer');
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES, files: 1 },
    fileFilter: (req, file, callback) => {
      const extensionIsDocx = /\.docx$/i.test(file.originalname);
      const mimeIsDocx = file.mimetype === DOCX_MIME_TYPE || file.mimetype === 'application/octet-stream';
      if (!extensionIsDocx || !mimeIsDocx) {
        callback(new Error('Solo se aceptan archivos DOCX de Microsoft Word.'));
        return;
      }
      callback(null, true);
    }
  }).single('document');

  return (req, res, next) => {
    upload(req, res, error => {
      if (!error) {
        next();
        return;
      }
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'El documento supera el límite de 10 MB.' });
      }
      if (error instanceof multer.MulterError) {
        return res.status(400).json({ error: 'Adjunta un solo archivo DOCX.' });
      }
      return res.status(415).json({ error: error.message });
    });
  };
}

async function extractDocxText(file) {
  if (!file?.buffer?.length) {
    const error = new Error('Selecciona un documento DOCX para analizar.');
    error.statusCode = 400;
    throw error;
  }
  if (!file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    const error = new Error('El archivo no tiene un formato DOCX válido.');
    error.statusCode = 400;
    throw error;
  }

  let extracted;
  try {
    extracted = await mammoth.extractRawText({ buffer: file.buffer });
  } catch (cause) {
    const error = new Error('No se pudo leer el documento DOCX. Verifica que no esté dañado o protegido.');
    error.statusCode = 422;
    error.cause = cause;
    throw error;
  }

  const text = extracted.value.trim();
  if (!text) {
    const error = new Error('El documento DOCX no contiene texto para analizar.');
    error.statusCode = 422;
    throw error;
  }

  return {
    fileName: file.originalname.replace(/[\r\n]/g, '').slice(0, 180),
    text: text.slice(0, MAX_EXTRACTED_CHARACTERS),
    truncated: text.length > MAX_EXTRACTED_CHARACTERS,
    extractedCharacters: Math.min(text.length, MAX_EXTRACTED_CHARACTERS)
  };
}

module.exports = {
  createDocumentUploadMiddleware,
  extractDocxText,
  MAX_DOCUMENT_SIZE_BYTES,
  MAX_EXTRACTED_CHARACTERS
};

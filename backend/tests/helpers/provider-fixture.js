const { encrypt } = require('../../src/services/crypto.service');
const db = require('../../src/config/database');

function saveTestProviderKey(userId, role = 'general') {
  const key = encrypt('sk-proj-test-provider-key-1234567890abcdef');
  db.prepare(`
    INSERT INTO api_keys (
      user_id, role, provider, model, is_fallback,
      encrypted_key, iv, auth_tag, last4
    ) VALUES (?, ?, 'openai', 'gpt-4o-mini', 0, ?, ?, ?, ?)
    ON CONFLICT(user_id, role, is_fallback) DO UPDATE SET
      provider = excluded.provider,
      model = excluded.model,
      encrypted_key = excluded.encrypted_key,
      iv = excluded.iv,
      auth_tag = excluded.auth_tag,
      last4 = excluded.last4
  `).run(userId, role, key.encryptedData, key.iv, key.authTag, key.last4);
}

function mockOpenAIResponses(onRequest) {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (typeof url !== 'string' || !url.startsWith('https://api.openai.com/')) {
      return originalFetch(url, options);
    }

    const request = JSON.parse(options.body);
    onRequest?.(request);
    const systemMessage = request.messages.find(message => message.role === 'system')?.content || '';
    const latestUserMessage = request.messages.filter(message => message.role === 'user').at(-1)?.content || '';
    const content = latestUserMessage.includes('Revisa la conversación')
      ? (systemMessage.includes('Eres tutora paciente')
        ? 'INTERVENE\nEste es un aporte automático útil de la tutora.'
        : 'NO_INTERVENTION')
      : systemMessage.includes('CRÍTICO independiente')
      ? 'Veredicto: APROBADO\nProblemas: ninguno.\nQué corregir: no aplica.'
      : 'Respuesta del proveedor de prueba.\n```javascript\nconst connected = true;\n```';

    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 12, completion_tokens: 18, total_tokens: 30 },
        model: request.model
      })
    };
  };

  return () => {
    global.fetch = originalFetch;
  };
}

module.exports = {
  saveTestProviderKey,
  mockOpenAIResponses
};

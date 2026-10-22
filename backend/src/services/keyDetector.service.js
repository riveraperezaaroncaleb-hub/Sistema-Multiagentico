/**
 * Detector automático de proveedor y modelo según el formato de la API Key.
 * El usuario solo pega su clave y el sistema infiere automáticamente el proveedor.
 */

function detectProviderFromKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') {
    return {
      provider: 'unknown',
      name: 'No identificada',
      defaultModel: 'mock-model',
      confidence: 'none'
    };
  }

  const key = rawKey.trim();

  // Anthropic Claude: Claves empiezan con "sk-ant-"
  if (key.startsWith('sk-ant-')) {
    return {
      provider: 'anthropic',
      name: 'Anthropic Claude',
      defaultModel: 'claude-3-5-sonnet-20241022',
      confidence: 'high'
    };
  }

  // Google Gemini: Claves de Google Cloud / AI Studio suelen empezar con "AIzaSy"
  if (key.startsWith('AIzaSy') || key.startsWith('AIza')) {
    return {
      provider: 'gemini',
      name: 'Google Gemini',
      defaultModel: 'gemini-1.5-flash',
      confidence: 'high'
    };
  }

  // Groq: Claves empiezan con "gsk_"
  if (key.startsWith('gsk_')) {
    return {
      provider: 'groq',
      name: 'Groq',
      defaultModel: 'llama-3.3-70b-versatile',
      confidence: 'high'
    };
  }

  // OpenAI: Claves de proyectos nuevos "sk-proj-" o claves clásicas "sk-" con longitud adecuada
  if (key.startsWith('sk-proj-') || (key.startsWith('sk-') && key.length >= 35 && !key.includes('ant'))) {
    return {
      provider: 'openai',
      name: 'OpenAI',
      defaultModel: 'gpt-4o-mini',
      confidence: 'high'
    };
  }

  // Si no coincide con prefijos conocidos
  return {
    provider: 'unknown',
    name: 'Proveedor no reconocido',
    defaultModel: 'gpt-4o-mini',
    confidence: 'low'
  };
}

module.exports = {
  detectProviderFromKey
};

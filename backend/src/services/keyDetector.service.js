/**
 * Detecta proveedores solo cuando el prefijo es inequívoco.
 * Algunas claves, como sk- de OpenAI y DeepSeek, no se pueden distinguir por formato.
 */
const providers = require('../../../shared/provider-catalog.json');
const providersById = new Map(providers.map(provider => [provider.id, provider]));

function getProviderConfig(providerId) {
  return providersById.get(providerId) || null;
}

function detectProviderFromKey(rawKey, selectedProvider) {
  if (selectedProvider && selectedProvider !== 'auto') {
    const provider = getProviderConfig(selectedProvider);
    if (provider) {
      return {
        provider: provider.id,
        name: provider.name,
        defaultModel: provider.model,
        confidence: 'selected'
      };
    }

    return {
      provider: 'unknown',
      name: 'Proveedor no compatible',
      defaultModel: '',
      confidence: 'none'
    };
  }

  if (!rawKey || typeof rawKey !== 'string') {
    return {
      provider: 'unknown',
      name: 'No identificada',
      defaultModel: '',
      confidence: 'none'
    };
  }

  const key = rawKey.trim();
  const fromPrefix = (providerId) => {
    const provider = getProviderConfig(providerId);
    return {
      provider: provider.id,
      name: provider.name,
      defaultModel: provider.model,
      confidence: 'high'
    };
  };

  if (key.startsWith('sk-ant-')) {
    return fromPrefix('anthropic');
  }

  if (key.startsWith('AIzaSy') || key.startsWith('AIza')) {
    return fromPrefix('gemini');
  }

  if (key.startsWith('gsk_')) {
    return fromPrefix('groq');
  }

  if (key.startsWith('sk-or-v1-')) {
    return fromPrefix('openrouter');
  }

  if (key.startsWith('sk-proj-')) {
    return fromPrefix('openai');
  }

  if (key.startsWith('sk-')) {
    return {
      provider: 'unknown',
      name: 'Clave ambigua',
      defaultModel: '',
      confidence: 'ambiguous',
      candidates: ['openai', 'deepseek', 'mistral', 'xai']
    };
  }

  return {
    provider: 'unknown',
    name: 'Proveedor no reconocido',
    defaultModel: '',
    confidence: 'low'
  };
}

module.exports = {
  detectProviderFromKey,
  getProviderConfig,
  providers
};

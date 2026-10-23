/**
 * Servicio unificado para interactuar con proveedores LLM (OpenAI, Gemini, Anthropic, Groq)
 */

function providerErrorMessage(provider, status) {
  const name = provider;
  if (status === 401 || status === 403) {
    return `${name} rechazó la clave o sus permisos (HTTP ${status}). Verifica que la clave sea válida y pertenezca a este proveedor.`;
  }
  if (status === 404) {
    return `${name} no encontró el modelo solicitado (HTTP ${status}). Revisa el nombre del modelo y el acceso de la cuenta.`;
  }
  if (status === 429) {
    return `${name} alcanzó un límite de solicitudes o cuota (HTTP ${status}). Revisa el uso y la facturación de la cuenta.`;
  }
  return `${name} respondió con un error HTTP ${status}. Verifica la configuración y el estado del proveedor.`;
}

async function callOpenAI(apiKey, model, messages, maxTokens = 1500) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages,
      max_tokens: maxTokens,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    throw new Error(providerErrorMessage('OpenAI', response.status));
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error('OpenAI no devolvió contenido para esta solicitud.');
  }
  const usage = data.usage || {};

  return {
    content: choice.message.content,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    modelUsed: data.model || model,
    providerUsed: 'openai'
  };
}

async function callGroq(apiKey, model, messages, maxTokens = 1500) {
  const groqModel = model || 'llama-3.3-70b-versatile';
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: groqModel,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    throw new Error(providerErrorMessage('Groq', response.status));
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error('Groq no devolvió contenido para esta solicitud.');
  }
  const usage = data.usage || {};

  return {
    content: choice.message.content,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    modelUsed: data.model || groqModel,
    providerUsed: 'groq'
  };
}

async function callGemini(apiKey, model, messages, maxTokens = 1500) {
  const geminiModel = model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
  const systemInstruction = messages.find(message => message.role === 'system')?.content;

  // Convertir mensajes al formato de Google Gemini
  const contents = messages.filter(message => message.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.7
      }
    })
  });

  if (!response.ok) {
    throw new Error(providerErrorMessage('Google Gemini', response.status));
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Google Gemini no devolvió contenido para esta solicitud.');
  }
  const usage = data.usageMetadata || {};

  return {
    content: text,
    promptTokens: usage.promptTokenCount || 0,
    completionTokens: usage.candidatesTokenCount || 0,
    totalTokens: usage.totalTokenCount || 0,
    modelUsed: geminiModel,
    providerUsed: 'gemini'
  };
}

async function callAnthropic(apiKey, model, messages, maxTokens = 1500) {
  const anthropicModel = model || 'claude-3-5-sonnet-20241022';
  const systemInstruction = messages.find(message => message.role === 'system')?.content;
  const formattedMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: m.content }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: anthropicModel,
      ...(systemInstruction ? { system: systemInstruction } : {}),
      messages: formattedMessages,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    throw new Error(providerErrorMessage('Anthropic', response.status));
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) {
    throw new Error('Anthropic no devolvió contenido para esta solicitud.');
  }
  const usage = data.usage || {};

  return {
    content: text,
    promptTokens: usage.input_tokens || 0,
    completionTokens: usage.output_tokens || 0,
    totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
    modelUsed: data.model || anthropicModel,
    providerUsed: 'anthropic'
  };
}

async function callOpenRouter(apiKey, model, messages, maxTokens = 1500) {
  const openRouterModel = model || 'openai/gpt-4o-mini';
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: openRouterModel,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    throw new Error(providerErrorMessage('OpenRouter', response.status));
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error('OpenRouter no devolvió contenido para esta solicitud.');
  }
  const usage = data.usage || {};

  return {
    content: choice.message.content,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    modelUsed: data.model || openRouterModel,
    providerUsed: 'openrouter'
  };
}

async function callOpenAICompatible(provider, providerId, endpoint, apiKey, model, messages, maxTokens = 1500) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    throw new Error(providerErrorMessage(provider, response.status));
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error(`${provider} no devolvió contenido para esta solicitud.`);
  }
  const usage = data.usage || {};

  return {
    content: choice.message.content,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    modelUsed: data.model || model,
    providerUsed: providerId
  };
}

/**
 * Despachador principal según proveedor
 */
async function callLLM({ provider, model, apiKey, messages, maxTokens, specialistName }) {
  const cleanProvider = (provider || '').toLowerCase();
  if (!apiKey) {
    throw new Error(`No hay una API Key configurada para el proveedor ${cleanProvider || 'seleccionado'}.`);
  }

  switch (cleanProvider) {
    case 'openai':
      return callOpenAI(apiKey, model, messages, maxTokens);
    case 'groq':
      return callGroq(apiKey, model, messages, maxTokens);
    case 'openrouter':
      return callOpenRouter(apiKey, model, messages, maxTokens);
    case 'deepseek':
      return callOpenAICompatible('DeepSeek', 'deepseek', 'https://api.deepseek.com/chat/completions', apiKey, model || 'deepseek-chat', messages, maxTokens);
    case 'mistral':
      return callOpenAICompatible('Mistral', 'mistral', 'https://api.mistral.ai/v1/chat/completions', apiKey, model || 'mistral-small-latest', messages, maxTokens);
    case 'xai':
      return callOpenAICompatible('xAI', 'xai', 'https://api.x.ai/v1/chat/completions', apiKey, model || 'grok-3-mini', messages, maxTokens);
    case 'together':
      return callOpenAICompatible('Together AI', 'together', 'https://api.together.xyz/v1/chat/completions', apiKey, model || 'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo', messages, maxTokens);
    case 'cerebras':
      return callOpenAICompatible('Cerebras', 'cerebras', 'https://api.cerebras.ai/v1/chat/completions', apiKey, model || 'llama-3.3-70b', messages, maxTokens);
    case 'gemini':
      return callGemini(apiKey, model, messages, maxTokens);
    case 'anthropic':
      return callAnthropic(apiKey, model, messages, maxTokens);
    default:
      throw new Error(`Proveedor de IA no compatible: ${provider || '(vacío)'}.`);
  }
}

module.exports = {
  callLLM
};

/**
 * Servicio unificado para interactuar con proveedores LLM (OpenAI, Gemini, Anthropic, Groq, Mock)
 */

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
    const errorData = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorData}`);
  }

  const data = await response.json();
  const choice = data.choices[0];
  const usage = data.usage || { prompt_tokens: 100, completion_tokens: 150, total_tokens: 250 };

  return {
    content: choice.message.content,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    modelUsed: data.model || model,
    providerUsed: 'openai'
  };
}

async function callGemini(apiKey, model, messages, maxTokens = 1500) {
  const geminiModel = model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

  // Convertir mensajes al formato de Google Gemini
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.7
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Google Gemini API error (${response.status}): ${errorData}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text || 'Sin respuesta';
  const usage = data.usageMetadata || { promptTokenCount: 120, candidatesTokenCount: 160, totalTokenCount: 280 };

  return {
    content: text,
    promptTokens: usage.promptTokenCount || 100,
    completionTokens: usage.candidatesTokenCount || 150,
    totalTokens: usage.totalTokenCount || 250,
    modelUsed: geminiModel,
    providerUsed: 'gemini'
  };
}

async function callAnthropic(apiKey, model, messages, maxTokens = 1500) {
  const anthropicModel = model || 'claude-3-5-sonnet-20241022';
  
  // Anthropic requiere separar el system message si existiera
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
      messages: formattedMessages,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorData}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const usage = data.usage || { input_tokens: 150, output_tokens: 200 };

  return {
    content: text,
    promptTokens: usage.input_tokens,
    completionTokens: usage.output_tokens,
    totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
    modelUsed: data.model || anthropicModel,
    providerUsed: 'anthropic'
  };
}

/**
 * Proveedor Simulado (Demostración y pruebas seguras sin gastar dinero real)
 */
async function callMockProvider(model, messages, specialistName = 'Especialista MVP') {
  const lastUserMessage = messages[messages.length - 1]?.content || 'Hola';
  
  // Breve delay para simular pensamiento
  await new Promise(r => setTimeout(r, 400));

  let responseContent = '';
  const isCodeRequest = /código|codigo|función|funcion|javascript|python|script|html/i.test(lastUserMessage);

  if (isCodeRequest) {
    responseContent = `Hola, soy tu IA Especialista (${specialistName}). He procesado tu solicitud sobre programación.\n\nAquí tienes la solución solicitada con buenas prácticas:\n\n\`\`\`javascript\n// Función optimizada para el ecosistema\nfunction procesarDatosEcosistema(items) {\n  if (!Array.isArray(items)) return [];\n  return items.map(item => ({\n    id: item.id,\n    activo: Boolean(item.activo),\n    timestamp: new Date().toISOString()\n  }));\n}\n\nmodule.exports = { procesarDatosEcosistema };\n\`\`\`\n\n*Recuerda que este código pasará por el escáner de seguridad antes de ser entregado.*`;
  } else {
    responseContent = `¡Hola! Soy tu IA en el Ecosistema Multi-IA. He recibido tu mensaje: "${lastUserMessage.slice(0, 60)}${lastUserMessage.length > 60 ? '...' : ''}".\n\nEstoy lista para ayudarte a coordinar tareas, analizar información y generar contenido. Para conectar un proveedor real con tus propias llaves (OpenAI, Gemini o Anthropic), haz clic en el botón de **"Configurar Llaves (BYOK)"** en la barra superior.`;
  }

  const estimatedPromptTokens = Math.max(25, Math.round(lastUserMessage.length / 4));
  const estimatedCompletionTokens = Math.max(50, Math.round(responseContent.length / 4));

  return {
    content: responseContent,
    promptTokens: estimatedPromptTokens,
    completionTokens: estimatedCompletionTokens,
    totalTokens: estimatedPromptTokens + estimatedCompletionTokens,
    modelUsed: model || 'mock-simulador',
    providerUsed: 'mock'
  };
}

/**
 * Despachador principal según proveedor
 */
async function callLLM({ provider, model, apiKey, messages, maxTokens, specialistName }) {
  if (!apiKey || provider === 'mock') {
    return callMockProvider(model, messages, specialistName);
  }

  const cleanProvider = (provider || '').toLowerCase();

  switch (cleanProvider) {
    case 'openai':
      return callOpenAI(apiKey, model, messages, maxTokens);
    case 'gemini':
      return callGemini(apiKey, model, messages, maxTokens);
    case 'anthropic':
      return callAnthropic(apiKey, model, messages, maxTokens);
    default:
      // Si no reconoce el proveedor o no hay clave válida, recurre al simulador
      return callMockProvider(model, messages, specialistName);
  }
}

module.exports = {
  callLLM,
  callMockProvider
};

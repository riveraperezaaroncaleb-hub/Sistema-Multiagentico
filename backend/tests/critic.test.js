const assert = require('assert');
const { detectProviderFromKey } = require('../src/services/keyDetector.service');
const { callLLM } = require('../src/services/llm.service');
const { encrypt } = require('../src/services/crypto.service');
const { getSpecialist } = require('../src/services/specialists.service');
const { executeWorker } = require('../src/pipeline/2_worker');
const { shouldTriggerCritique, executeCriticReviewLoop } = require('../src/pipeline/critic.service');
const db = require('../src/config/database');
const { saveTestProviderKey } = require('./helpers/provider-fixture');

async function testCriticAndKeyDetection() {
  console.log('🧪 Iniciando pruebas de Auto-detección de Llaves y del Crítico...');

  // Prueba 1: Auto-detección de Proveedor desde la API Key (Sin elegir predeterminada)
  console.log('1. Probando auto-detección instantánea de API Keys...');
  
  const anthropic = detectProviderFromKey('sk-ant-api03-abcdef1234567890abcdef1234567890');
  assert.strictEqual(anthropic.provider, 'anthropic');
  assert.strictEqual(anthropic.defaultModel, 'claude-3-5-sonnet-20241022');

  const gemini = detectProviderFromKey('AIzaSyAbCdEf1234567890abcdefghijklmnopqrstuv');
  assert.strictEqual(gemini.provider, 'gemini');
  assert.strictEqual(gemini.defaultModel, 'gemini-1.5-flash');

  const openai = detectProviderFromKey('sk-proj-1234567890abcdefghijklmnopqrstuvwxyz1234567890');
  assert.strictEqual(openai.provider, 'openai');
  assert.strictEqual(openai.defaultModel, 'gpt-4o-mini');

  const groq = detectProviderFromKey('gsk_1234567890abcdefghijklmnopqrstuvwxyz1234567890');
  assert.strictEqual(groq.provider, 'groq');
  assert.strictEqual(groq.defaultModel, 'llama-3.3-70b-versatile');

  const openRouter = detectProviderFromKey('sk-or-v1-1234567890abcdefghijklmnopqrstuvwxyz');
  assert.strictEqual(openRouter.provider, 'openrouter');
  assert.strictEqual(openRouter.defaultModel, 'openai/gpt-4o-mini');

  const ambiguous = detectProviderFromKey('sk-1234567890abcdefghijklmnopqrstuvwxyz');
  assert.strictEqual(ambiguous.provider, 'unknown');
  assert.strictEqual(ambiguous.confidence, 'ambiguous');
  assert(ambiguous.candidates.includes('deepseek'));
  assert.strictEqual(detectProviderFromKey('sk-1234567890abcdefghijklmnopqrstuvwxyz', 'deepseek').provider, 'deepseek');

  console.log('✓ Prefijos inequívocos se detectan y claves sk- ambiguas permiten elegir proveedor');

  console.log('2. Probando conexión con Groq sin llamadas externas...');
  const originalFetch = global.fetch;
  let groqRequest;
  global.fetch = async (url, options) => {
    groqRequest = { url, options };
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Respuesta de prueba' } }],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
        model: 'llama-3.3-70b-versatile'
      })
    };
  };

  try {
    const groqResponse = await callLLM({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      apiKey: 'gsk_test_api_key',
      messages: [{ role: 'user', content: 'Prueba' }],
      maxTokens: 100,
      specialistName: 'Prueba'
    });
    assert.strictEqual(groqRequest.url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.strictEqual(groqRequest.options.headers.Authorization, 'Bearer gsk_test_api_key');
    assert.strictEqual(groqResponse.providerUsed, 'groq');
    assert.strictEqual(groqResponse.content, 'Respuesta de prueba');
  } finally {
    global.fetch = originalFetch;
  }
  console.log('✓ Conexión de Groq usa su endpoint y conserva el proveedor detectado');

  let openRouterRequest;
  global.fetch = async (url, options) => {
    openRouterRequest = { url, options };
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Respuesta de OpenRouter' } }],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
        model: 'openai/gpt-4o-mini'
      })
    };
  };
  try {
    const response = await callLLM({
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
      apiKey: 'sk-or-v1_test_api_key',
      messages: [{ role: 'user', content: 'Prueba' }],
      maxTokens: 20
    });
    assert.strictEqual(openRouterRequest.url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.strictEqual(openRouterRequest.options.headers.Authorization, 'Bearer sk-or-v1_test_api_key');
    assert.strictEqual(response.providerUsed, 'openrouter');
  } finally {
    global.fetch = originalFetch;
  }
  console.log('✓ OpenRouter usa su endpoint y envía la clave al proveedor correcto');

  let deepSeekRequest;
  global.fetch = async (url, options) => {
    deepSeekRequest = { url, options };
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Respuesta de DeepSeek' } }],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
        model: 'deepseek-chat'
      })
    };
  };
  try {
    const response = await callLLM({
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKey: 'sk-test-deepseek-key',
      messages: [{ role: 'user', content: 'Prueba' }],
      maxTokens: 20
    });
    assert.strictEqual(deepSeekRequest.url, 'https://api.deepseek.com/chat/completions');
    assert.strictEqual(response.providerUsed, 'deepseek');
    assert.strictEqual(response.modelUsed, 'deepseek-chat');
  } finally {
    global.fetch = originalFetch;
  }
  console.log('✓ DeepSeek usa su propio endpoint y modelo seleccionado');

  console.log('3. Probando instrucciones del sistema en Gemini y Anthropic...');
  let providerRequest;
  global.fetch = async (url, options) => {
    providerRequest = { url, options };
    return {
      ok: true,
      json: async () => url.includes('generativelanguage.googleapis.com')
        ? { candidates: [{ content: { parts: [{ text: 'Respuesta Gemini' }] } }] }
        : { content: [{ text: 'Respuesta Anthropic' }] }
    };
  };
  try {
    const messages = [
      { role: 'system', content: 'Sigue las instrucciones de la especialista.' },
      { role: 'user', content: 'Resuelve esta tarea.' }
    ];
    await callLLM({
      provider: 'gemini',
      model: 'gemini-test-model',
      apiKey: 'AIza-test-key',
      messages,
      maxTokens: 20
    });
    const geminiBody = JSON.parse(providerRequest.options.body);
    assert.strictEqual(geminiBody.systemInstruction.parts[0].text, messages[0].content);
    assert.strictEqual(geminiBody.contents[0].role, 'user');
    await callLLM({
      provider: 'anthropic',
      model: 'claude-test-model',
      apiKey: 'sk-ant-test-key',
      messages,
      maxTokens: 20
    });
    assert.strictEqual(JSON.parse(providerRequest.options.body).system, messages[0].content);
  } finally {
    global.fetch = originalFetch;
  }
  console.log('✓ Las instrucciones especializadas llegan a ambos proveedores');

  console.log('4. Probando que cada rol agregue instrucciones especializadas...');
  let workerMessages;
  const specialistUserId = `test_specialist_${Date.now()}`;
  saveTestProviderKey(specialistUserId);
  db.prepare(`
    INSERT INTO specialist_skills (user_id, role, name, instructions)
    VALUES (?, 'traductora', 'Traducción regional', 'Conserva el español costarricense y evita modismos ajenos.')
  `).run(specialistUserId);
  await executeWorker({
    userId: specialistUserId,
    sessionId: 'specialist_session',
    role: 'traductora',
    specialistName: 'Traductora',
    prompt: 'Translate this',
    llmCaller: async ({ messages }) => {
      workerMessages = messages;
      return {
        content: 'Translated',
        promptTokens: 2,
        completionTokens: 2,
        totalTokens: 4,
        providerUsed: 'mock',
        modelUsed: 'mock-model'
      };
    }
  });
  assert(workerMessages[0].content.includes('traductora profesional'));
  assert(workerMessages[0].content.includes('Traducción regional'));
  assert(workerMessages[0].content.includes('español costarricense'));
  assert(getSpecialist('directora').instructions.includes('No hagas preguntas de seguimiento'));
  assert(getSpecialist('directora').instructions.includes('Análisis finalizado. Envía un nuevo texto para continuar.'));
  console.log('✓ El puesto seleccionado cambia las instrucciones reales enviadas al modelo');

  await assert.rejects(
    executeWorker({
      userId: `test_without_key_${Date.now()}`,
      sessionId: 'no_key_session',
      role: 'directora',
      specialistName: 'Directora',
      prompt: 'Prueba sin proveedor configurado',
      llmCaller: async () => {
        throw new Error('No debe llamar al simulador');
      }
    }),
    /No hay una API Key real configurada/
  );
  await assert.rejects(
    callLLM({ provider: 'openai', model: 'gpt-4o-mini', messages: [] }),
    /No hay una API Key configurada/
  );
  await assert.rejects(
    callLLM({ provider: 'unsupported', apiKey: 'test', messages: [] }),
    /Proveedor de IA no compatible/
  );
  console.log('✓ Sin llave o con proveedor inválido, no se usa el simulador silenciosamente');

  // Todas las respuestas se revisan; ya no se omiten saludos o respuestas breves.
  console.log('5. Probando revisión automática para respuestas cortas y complejas...');
  
  assert.strictEqual(shouldTriggerCritique('Hola', '¡Hola! ¿Cómo estás?'), true, 'Debe revisar también saludos');
  assert.strictEqual(shouldTriggerCritique('¿Qué día es hoy?', 'Hoy es 22 de octubre.'), true, 'Debe revisar respuestas breves');

  const codePrompt = 'Escribe una función en TypeScript para verificar si un string es palíndromo';
  const codeOutput = 'Aquí está la función:\n```typescript\nfunction isPalindrome(s: string): boolean { return false; }\n```';
  assert.strictEqual(shouldTriggerCritique(codePrompt, codeOutput), true, 'Debe activarse obligatoriamente con código');

  const planPrompt = 'Diseña el plan de arquitectura para la migración de base de datos a PostgreSQL';
  const planOutput = 'Plan de migración paso a paso:\n1. Análisis de esquemas...\n' + 'texto extenso '.repeat(30);
  assert.strictEqual(shouldTriggerCritique(planPrompt, planOutput), true, 'Debe activarse en planes importantes');
  console.log('✓ El crítico se activa para todas las respuestas no vacías');

  console.log('6. Probando que el Crítico solicite una iteración y luego apruebe...');
  let criticCalls = 0;
  const iteration = await executeCriticReviewLoop({
    userId: `test_critic_iteration_${Date.now()}`,
    sessionId: 'critic_iteration_session',
    prompt: 'Escribe una función segura para procesar una lista',
    initialContent: 'Respuesta inicial',
    specialistName: 'Programadora',
    provider: 'mock',
    model: 'mock-model',
    llmCaller: async ({ specialistName }) => {
      criticCalls++;
      if (specialistName === 'Crítico' && criticCalls === 1) {
        return {
          content: 'Veredicto: REHACER\nProblemas: falta manejo de entrada vacía.\nQué corregir: validar la lista.',
          providerUsed: 'mock',
          modelUsed: 'mock-model',
          promptTokens: 3,
          completionTokens: 4,
          totalTokens: 7
        };
      }
      if (specialistName === 'Programadora') {
        return {
          content: 'Respuesta corregida',
          providerUsed: 'mock',
          modelUsed: 'mock-model',
          promptTokens: 2,
          completionTokens: 3,
          totalTokens: 5
        };
      }
      return {
        content: 'Veredicto: APROBADO\nProblemas: ninguno.\nQué corregir: no aplica.',
        providerUsed: 'mock',
        modelUsed: 'mock-model',
        promptTokens: 3,
        completionTokens: 2,
        totalTokens: 5
      };
    }
  });
  assert.strictEqual(iteration.reviewedByCritic, true);
  assert.strictEqual(iteration.finalContent, 'Respuesta corregida');
  assert.strictEqual(iteration.verdict, 'APROBADO');
  assert.strictEqual(iteration.roundsCount, 2);
  assert.strictEqual(criticCalls, 3);
  console.log('✓ El Crítico evalúa, pide corrección y aprueba tras la segunda revisión');

  console.log('7. Probando que el Crítico use su propia API Key...');
  const criticUserId = `test_critic_key_${Date.now()}`;
  const encryptedCriticKey = encrypt('gsk_critic_test_key');
  db.prepare(`
    INSERT INTO api_keys (
      user_id, role, provider, model, is_fallback,
      encrypted_key, iv, auth_tag, last4
    ) VALUES (?, 'critico', 'groq', 'llama-3.3-70b-versatile', 0, ?, ?, ?, ?)
  `).run(
    criticUserId,
    encryptedCriticKey.encryptedData,
    encryptedCriticKey.iv,
    encryptedCriticKey.authTag,
    encryptedCriticKey.last4
  );
  let criticRequest;
  const dedicatedCriticResult = await executeCriticReviewLoop({
    userId: criticUserId,
    sessionId: 'dedicated_critic_session',
    prompt: 'Hola',
    initialContent: 'Hola, ¿en qué puedo ayudarte?',
    specialistName: 'Directora',
    provider: 'mock',
    model: 'mock-model',
    llmCaller: async (request) => {
      criticRequest = request;
      return {
        content: 'Veredicto: APROBADO\nProblemas: ninguno.\nQué corregir: no aplica.',
        providerUsed: request.provider,
        modelUsed: request.model,
        promptTokens: 3,
        completionTokens: 3,
        totalTokens: 6
      };
    }
  });
  db.prepare('DELETE FROM api_keys WHERE user_id = ? AND role = ?').run(criticUserId, 'critico');
  assert.strictEqual(criticRequest.provider, 'groq');
  assert.strictEqual(criticRequest.apiKey, 'gsk_critic_test_key');
  assert.strictEqual(dedicatedCriticResult.reviewedByCritic, true);
  console.log('✓ El rol Crítico utiliza su proveedor y clave cifrada independientes');

  console.log('8. Probando el failover de la API del Crítico...');
  const fallbackUserId = `test_critic_fallback_${Date.now()}`;
  const encryptedFallbackKey = encrypt('gsk_critic_fallback_key');
  db.prepare(`
    INSERT INTO api_keys (
      user_id, role, provider, model, is_fallback,
      encrypted_key, iv, auth_tag, last4
    ) VALUES (?, 'critico', 'groq', 'llama-3.3-70b-versatile', 1, ?, ?, ?, ?)
  `).run(
    fallbackUserId,
    encryptedFallbackKey.encryptedData,
    encryptedFallbackKey.iv,
    encryptedFallbackKey.authTag,
    encryptedFallbackKey.last4
  );
  let fallbackCalls = 0;
  const fallbackReview = await executeCriticReviewLoop({
    userId: fallbackUserId,
    sessionId: 'critic_fallback_session',
    prompt: 'Hola',
    initialContent: 'Hola.',
    specialistName: 'Directora',
    provider: 'mock',
    model: 'mock-model',
    llmCaller: async (request) => {
      fallbackCalls++;
      if (request.provider === 'mock') throw new Error('Proveedor principal no disponible');
      return {
        content: 'Veredicto: APROBADO\nProblemas: ninguno.\nQué corregir: no aplica.',
        providerUsed: request.provider,
        modelUsed: request.model,
        promptTokens: 3,
        completionTokens: 3,
        totalTokens: 6
      };
    }
  });
  db.prepare('DELETE FROM api_keys WHERE user_id = ? AND role = ?').run(fallbackUserId, 'critico');
  assert.strictEqual(fallbackReview.reviewedByCritic, true);
  assert.strictEqual(fallbackCalls, 2);
  assert.strictEqual(db.prepare(`
    SELECT is_fallback_used FROM usage_logs
    WHERE user_id = ? AND specialist = 'Crítico (Revisión)'
  `).get(fallbackUserId).is_fallback_used, 1);
  console.log('✓ El Crítico utiliza y registra su proveedor de reserva');

  console.log('9. Probando ejecución del ciclo de revisión del Crítico...');
  db.prepare(`
    INSERT INTO specialist_skills (user_id, role, name, instructions)
    VALUES ('test_user_critic', 'critico', 'Criterios de precisión', 'Separa hechos comprobables de inferencias.')
  `).run();
  const reviewResult = await executeCriticReviewLoop({
    userId: 'test_user_critic',
    sessionId: 'session_critic_1',
    prompt: codePrompt,
    initialContent: codeOutput,
    specialistName: 'Programadora',
    provider: 'mock',
    model: 'mock-model',
    llmCaller: async ({ messages }) => {
      assert(messages[0].content.includes('Criterios de precisión'));
      assert(messages[0].content.includes('hechos comprobables'));
      return {
      content: 'Veredicto: APROBADO\nProblemas: ninguno.\nQué corregir: no aplica.',
      providerUsed: 'mock',
      modelUsed: 'mock-model',
      promptTokens: 3,
      completionTokens: 3,
      totalTokens: 6
      };
    }
  });
  db.prepare(`DELETE FROM specialist_skills WHERE user_id = 'test_user_critic'`).run();

  assert(reviewResult.reviewedByCritic, 'Debe haber sido procesado por el crítico');
  assert(reviewResult.roundsCount >= 1 && reviewResult.roundsCount <= 2, 'Debe cumplir con máximo 2 vueltas');
  console.log(`✓ Prueba 3 superada: Ciclo del crítico ejecutado con veredicto (${reviewResult.verdict}) en ${reviewResult.roundsCount} vuelta(s)`);

  console.log('🎉 ¡TODAS LAS PRUEBAS DEL CRÍTICO Y AUTO-DETECCIÓN PASARON EXITOSAMENTE!');
}

testCriticAndKeyDetection().catch(err => {
  console.error('❌ Error en pruebas del crítico:', err);
  process.exit(1);
});

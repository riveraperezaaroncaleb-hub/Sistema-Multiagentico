const assert = require('assert');
const { detectProviderFromKey } = require('../src/services/keyDetector.service');
const { shouldTriggerCritique, executeCriticReviewLoop } = require('../src/pipeline/critic.service');

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

  console.log('✓ Prueba 1 superada: Auto-detección de llaves reconoce Anthropic, Gemini, OpenAI y Groq');

  // Prueba 2: Activación selectiva del Crítico (No se activa en simples ni cortas)
  console.log('2. Probando activación selectiva de la skill revision-critica...');
  
  assert.strictEqual(shouldTriggerCritique('Hola', '¡Hola! ¿Cómo estás?'), false, 'No debe activarse en saludos');
  assert.strictEqual(shouldTriggerCritique('¿Qué día es hoy?', 'Hoy es 22 de octubre.'), false, 'No debe activarse en consultas triviales');

  const codePrompt = 'Escribe una función en TypeScript para verificar si un string es palíndromo';
  const codeOutput = 'Aquí está la función:\n```typescript\nfunction isPalindrome(s: string): boolean { return false; }\n```';
  assert.strictEqual(shouldTriggerCritique(codePrompt, codeOutput), true, 'Debe activarse obligatoriamente con código');

  const planPrompt = 'Diseña el plan de arquitectura para la migración de base de datos a PostgreSQL';
  const planOutput = 'Plan de migración paso a paso:\n1. Análisis de esquemas...\n' + 'texto extenso '.repeat(30);
  assert.strictEqual(shouldTriggerCritique(planPrompt, planOutput), true, 'Debe activarse en planes importantes');
  console.log('✓ Prueba 2 superada: Activación selectiva funciona según reglas de revision-critica');

  // Prueba 3: Ejecución del ciclo de revisión crítica
  console.log('3. Probando ejecución del ciclo de revisión del Crítico...');
  const reviewResult = await executeCriticReviewLoop({
    userId: 'test_user_critic',
    sessionId: 'session_critic_1',
    prompt: codePrompt,
    initialContent: codeOutput,
    specialistName: 'Programadora',
    provider: 'mock',
    model: 'mock-model'
  });

  assert(reviewResult.reviewedByCritic, 'Debe haber sido procesado por el crítico');
  assert(reviewResult.roundsCount >= 1 && reviewResult.roundsCount <= 2, 'Debe cumplir con máximo 2 vueltas');
  console.log(`✓ Prueba 3 superada: Ciclo del crítico ejecutado con veredicto (${reviewResult.verdict}) en ${reviewResult.roundsCount} vuelta(s)`);

  console.log('🎉 ¡TODAS LAS PRUEBAS DEL CRÍTICO Y AUTO-DETECCIÓN PASARON EXITOSAMENTE!');
}

testCriticAndKeyDetection().catch(err => {
  console.error('❌ Error en pruebas del crítico:', err);
  process.exit(1);
});

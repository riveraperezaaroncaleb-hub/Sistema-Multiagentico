const assert = require('assert');
const { processPipeline } = require('../src/pipeline');
const { getReceiptById } = require('../src/pipeline/4_receipt');
const { scanContent } = require('../src/pipeline/3_security');
const { checkCostsAndBudget } = require('../src/pipeline/1_costs');
const db = require('../src/config/database');
const { saveTestProviderKey, mockOpenAIResponses } = require('./helpers/provider-fixture');
const { runAutomaticInterventions } = require('../src/services/automaticInterventions.service');

async function runTests() {
  console.log('🧪 Iniciando pruebas del Pipeline de 4 Pasos...');
  const testUserId = `test_user_${Date.now()}`;
  const testSessionId = `test_sess_${Date.now()}`;
  saveTestProviderKey(testUserId);
  const restoreFetch = mockOpenAIResponses();

  // Prueba 1: Ejecución normal del pipeline completo
  console.log('1. Probando ejecución completa del pipeline (Pasos 1 -> 2 -> 3 -> 4)...');
  const res1 = await processPipeline({
    userId: testUserId,
    sessionId: testSessionId,
    prompt: 'Hola, ¿cómo estás?',
    role: 'general',
    specialistName: 'IA de Prueba'
  });

  assert(res1.success, 'El pipeline debe completar exitosamente');
  assert(res1.receipt && res1.receipt.id, 'Debe generar un ID de recibo');
  assert(res1.receipt.signature, 'El recibo debe estar firmado');
  console.log('✓ Prueba 1 superada: Pipeline completo ejecutado con éxito');

  // Prueba 2: Verificación de autenticidad del recibo firmado
  console.log('2. Probando verificación criptográfica del recibo...');
  const receiptFromDb = getReceiptById(res1.receipt.id);
  assert(receiptFromDb, 'El recibo debe existir en la base de datos');
  assert.strictEqual(receiptFromDb.isValid, true, 'La firma criptográfica del recibo debe ser válida');
  console.log('✓ Prueba 2 superada: Recibo criptográfico verificado');

  // Prueba 3: VibeScan de Seguridad (Paso 3)
  console.log('3. Probando escaneo de seguridad VibeScan contra código con secretos y patrones inseguros...');
  const dirtyCode = 'Aquí tienes el código:\n```javascript\nconst key = "sk-123456789012345678901234567890";\neval("maliciousCode()");\n```';
  const scanResult = scanContent(dirtyCode);

  assert.strictEqual(scanResult.hasCode, true, 'Debe detectar que hay código');
  assert.strictEqual(scanResult.codeReviewed, true, 'Debe marcar como revisado');
  assert(scanResult.content.includes('[SECRET_OBLITERATED_BY_VIBESCAN]'), 'Debe neutralizar la clave secreta expuesta');
  assert(scanResult.findings.some(f => f.rule === 'Uso peligroso de eval()'), 'Debe detectar el uso de eval()');
  console.log('✓ Prueba 3 superada: VibeScan neutralizó secretos y detectó patrones inseguros');

  // Prueba 4: Detección de bucles (Paso 1)
  console.log('4. Probando detector de bucles repetitivos...');
  const loopPrompt = 'Pregunta repetida idéntica';
  await processPipeline({ userId: testUserId, sessionId: testSessionId, prompt: loopPrompt, specialistName: 'IA' });
  await processPipeline({ userId: testUserId, sessionId: testSessionId, prompt: loopPrompt, specialistName: 'IA' });
  
  // La tercera llamada con el mismo prompt debe ser bloqueada por bucle
  const loopRes = await processPipeline({ userId: testUserId, sessionId: testSessionId, prompt: loopPrompt, specialistName: 'IA' });
  assert.strictEqual(loopRes.success, false, 'Debe bloquear la tercera llamada idéntica');
  assert.strictEqual(loopRes.status, 'LOOP_DETECTED', 'El estado debe ser LOOP_DETECTED');
  console.log('✓ Prueba 4 superada: Detección de bucles bloqueó llamadas duplicadas');

  // Prueba 5: Bloqueo por presupuesto superado (Paso 1)
  console.log('5. Probando corte de llamada por presupuesto excedido...');
  // Insertamos un registro de gasto que supere el límite diario
  db.prepare(`
    INSERT INTO usage_logs (user_id, session_id, specialist, provider, model, total_tokens, cost_usd)
    VALUES (?, ?, 'IA', 'openai', 'gpt-4o', 10000, 2.50)
  `).run(testUserId, testSessionId);

  const budgetBlockedRes = await processPipeline({
    userId: testUserId,
    sessionId: testSessionId,
    prompt: 'Esta llamada debe frenarse por exceder presupuesto',
    specialistName: 'IA'
  });

  assert.strictEqual(budgetBlockedRes.success, false, 'Debe bloquear por límite de presupuesto');
  assert.strictEqual(budgetBlockedRes.status, 'DAILY_LIMIT_EXCEEDED');
  console.log('✓ Prueba 5 superada: El tope de presupuesto detuvo la llamada');

  console.log('6. Probando evaluación automática, límite de respuestas y persistencia...');
  const autoUserId = `auto_user_${Date.now()}`;
  const autoSessionId = `auto_session_${Date.now()}`;
  saveTestProviderKey(autoUserId);
  db.prepare(`
    INSERT INTO automatic_agents (user_id, role, position)
    VALUES (?, 'tutora', 0), (?, 'revisora', 1), (?, 'traductora', 2), (?, 'seguridad', 3)
  `).run(autoUserId, autoUserId, autoUserId, autoUserId);
  db.prepare(`
    INSERT INTO chat_messages (id, user_id, session_id, sender, content)
    VALUES (?, ?, ?, 'user', 'Explícame este punto'),
      (?, ?, ?, 'assistant', 'La explicación inicial.')
  `).run(`${autoUserId}_user_message`, autoUserId, autoSessionId, `${autoUserId}_main_answer`, autoUserId, autoSessionId);
  const evaluatedAgents = [];
  const automaticResult = await runAutomaticInterventions({
    userId: autoUserId,
    sessionId: autoSessionId,
    selectedRole: 'directora',
    selectedSpecialistName: 'Directora',
    llmCaller: async ({ specialistName }) => {
      evaluatedAgents.push(specialistName);
      return {
        content: specialistName === 'Tutora'
          ? 'NO_INTERVENTION'
          : 'INTERVENE\nAporto una observación concreta desde mi especialidad.',
        modelUsed: 'gpt-4o-mini',
        providerUsed: 'openai',
        promptTokens: 10,
        completionTokens: 8,
        totalTokens: 18,
        isFallbackUsed: false
      };
    }
  });
  assert.deepStrictEqual(evaluatedAgents, ['Tutora', 'Revisora', 'Traductora']);
  assert.strictEqual(automaticResult.responses.length, 2, 'No debe superar dos respuestas por turno');
  assert(
    !evaluatedAgents.includes('Programadora'),
    'No debe evaluar especialistas que no fueron activados'
  );
  assert.strictEqual(
    db.prepare(`
      SELECT COUNT(*) AS count FROM chat_messages
      WHERE user_id = ? AND session_id = ? AND sender = 'assistant'
    `).get(autoUserId, autoSessionId).count,
    3,
    'Las dos intervenciones automáticas deben persistirse con la respuesta principal'
  );
  console.log('✓ Prueba 6 superada: solo evalúan agentes activos y se guardan como máximo dos intervenciones');

  console.log('🎉 ¡TODAS LAS PRUEBAS DEL PIPELINE PASARON EXITOSAMENTE!');
  restoreFetch();
}

runTests().catch(err => {
  console.error('❌ Error en pruebas:', err);
  process.exit(1);
});

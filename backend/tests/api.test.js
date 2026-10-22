const assert = require('assert');
const { app } = require('../src/server');

async function testApi() {
  console.log('🧪 Iniciando pruebas de endpoints HTTP de la API...');
  
  // Iniciar en puerto dinámico para no colisionar con el servidor en ejecución
  const testServer = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = testServer.address().port;
  const baseUrl = `http://localhost:${port}/api`;

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, 'online');
    console.log('✓ Health check responde 200 OK');

    // 2. Guardar Llave Cifrada (BYOK)
    const saveKeyRes = await fetch(`${baseUrl}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'test_http_user',
        role: 'general',
        provider: 'openai',
        model: 'gpt-4o-mini',
        isFallback: 0,
        apiKey: 'sk-proj-testHttp1234567890abcdef1234'
      })
    });
    const saveKeyData = await saveKeyRes.json();
    assert.strictEqual(saveKeyData.success, true);
    assert.strictEqual(saveKeyData.key.last4, '••••••••1234');
    console.log('✓ POST /api/keys: Llave cifrada y guardada con éxito');

    // 3. Consultar llaves configuradas (Verificar que NUNCA expone el secreto)
    const getKeysRes = await fetch(`${baseUrl}/keys?userId=test_http_user`);
    const getKeysData = await getKeysRes.json();
    assert(Array.isArray(getKeysData.keys));
    assert.strictEqual(getKeysData.keys[0].maskedKey, '••••••••1234');
    assert.strictEqual(getKeysData.keys[0].encrypted_key, undefined, 'Jamás debe exponer encrypted_key');
    assert.strictEqual(getKeysData.keys[0].iv, undefined, 'Jamás debe exponer IV');
    console.log('✓ GET /api/keys: Llaves listadas de forma aislada y segura');

    // 4. Consultar y actualizar presupuesto
    const budgetRes = await fetch(`${baseUrl}/budget?userId=test_http_user`);
    const budgetData = await budgetRes.json();
    assert(budgetData.budget.dailyLimit > 0);
    console.log('✓ GET /api/budget: Presupuesto consultado');

    // 5. Enviar mensaje por el chat (Pipeline completo vía HTTP)
    const chatRes = await fetch(`${baseUrl}/chat/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'test_http_user',
        sessionId: 'http_session_1',
        prompt: '¿Podrías darme un ejemplo de código en JavaScript?',
        role: 'general',
        specialistName: 'IA Programadora MVP'
      })
    });
    const chatData = await chatRes.json();
    assert.strictEqual(chatData.success, true);
    assert(chatData.receipt && chatData.receipt.id, 'Debe incluir recibo');
    assert.strictEqual(chatData.security.codeReviewed, true, 'Debe incluir revisión de código');
    console.log('✓ POST /api/chat/send: Mensaje procesado por los 4 pasos vía API');

    // 6. Consultar recibo firmado
    const receiptRes = await fetch(`${baseUrl}/chat/receipt/${chatData.receipt.id}`);
    const receiptData = await receiptRes.json();
    assert.strictEqual(receiptData.receipt.isValid, true);
    console.log('✓ GET /api/chat/receipt/:id: Comprobante consultado y validado criptográficamente');

    console.log('🎉 ¡TODOS LOS ENDPOINTS DE LA API FUNCIONAN CORRECTAMENTE!');
  } finally {
    testServer.close();
  }
}

testApi().catch(err => {
  console.error('❌ Error en pruebas de API:', err);
  process.exit(1);
});

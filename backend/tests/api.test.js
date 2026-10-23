const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app } = require('../src/server');
const { mockOpenAIResponses } = require('./helpers/provider-fixture');
const db = require('../src/config/database');
const { encrypt } = require('../src/services/crypto.service');
const { migrateLegacyApiKeys } = require('../src/services/legacyKeyMigration.service');

function encryptWithSecret(apiKey, secret) {
  const currentSecret = process.env.APP_ENCRYPTION_SECRET;
  try {
    process.env.APP_ENCRYPTION_SECRET = secret;
    return encrypt(apiKey);
  } finally {
    if (currentSecret === undefined) delete process.env.APP_ENCRYPTION_SECRET;
    else process.env.APP_ENCRYPTION_SECRET = currentSecret;
  }
}

async function testApi() {
  console.log('🧪 Iniciando pruebas de endpoints HTTP de la API...');
  const userId = `test_http_user_${crypto.randomUUID()}`;
  const sessionId = `http_session_${crypto.randomUUID()}`;
  
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

    const docxFixture = path.join(path.dirname(require.resolve('mammoth')), '..', 'test', 'test-data', 'single-paragraph.docx');
    const docxForm = new FormData();
    docxForm.append(
      'document',
      new Blob([fs.readFileSync(docxFixture)], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }),
      'prueba.docx'
    );
    const documentRes = await fetch(`${baseUrl}/chat/document/extract`, { method: 'POST', body: docxForm });
    const documentData = await documentRes.json();
    assert.strictEqual(documentRes.status, 200);
    assert.strictEqual(documentData.success, true);
    assert.strictEqual(documentData.document.fileName, 'prueba.docx');
    assert(documentData.document.text.length > 0, 'Debe extraer texto real del DOCX');
    console.log('✓ POST /api/chat/document/extract: recibe y extrae texto de un DOCX');

    const invalidDocumentForm = new FormData();
    invalidDocumentForm.append('document', new Blob(['no es docx'], { type: 'text/plain' }), 'nota.txt');
    const invalidDocumentRes = await fetch(`${baseUrl}/chat/document/extract`, {
      method: 'POST',
      body: invalidDocumentForm
    });
    assert.strictEqual(invalidDocumentRes.status, 415);
    console.log('✓ POST /api/chat/document/extract: rechaza tipos de archivo no permitidos');

    const unknownRouteRes = await fetch(`${baseUrl}/missing-route`);
    assert.strictEqual(unknownRouteRes.status, 404);
    assert(unknownRouteRes.headers.get('content-type').includes('application/json'));
    console.log('✓ Las rutas inexistentes de API devuelven JSON y no la página HTML');

    // 2. Guardar Llave Cifrada (BYOK)
    const saveKeyRes = await fetch(`${baseUrl}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        role: 'keys_test',
        provider: 'auto',
        model: 'gpt-4o-mini',
        isFallback: 0,
        apiKey: 'sk-proj-testHttp1234567890abcdef1234'
      })
    });
    const saveKeyData = await saveKeyRes.json();
    assert.strictEqual(saveKeyData.success, true);
    assert.strictEqual(saveKeyData.providerName, 'OpenAI');
    assert.strictEqual(saveKeyData.key.provider, 'openai');
    assert.strictEqual(saveKeyData.key.last4, '••••••••1234');
    console.log('✓ POST /api/keys: Llave cifrada y guardada con éxito');

    const ambiguousKeyRes = await fetch(`${baseUrl}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        role: 'deepseek_test',
        apiKey: 'sk-test-deepseek-key-with-ambiguous-prefix'
      })
    });
    assert.strictEqual(ambiguousKeyRes.status, 400);
    assert.match((await ambiguousKeyRes.json()).error, /Selecciona el proveedor correcto/);

    const deepseekKeyRes = await fetch(`${baseUrl}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        role: 'deepseek_test',
        provider: 'deepseek',
        apiKey: 'sk-test-deepseek-key-with-ambiguous-prefix'
      })
    });
    const deepseekKeyData = await deepseekKeyRes.json();
    assert.strictEqual(deepseekKeyData.success, true);
    assert.strictEqual(deepseekKeyData.providerName, 'DeepSeek');
    assert.strictEqual(deepseekKeyData.key.model, 'deepseek-chat');
    console.log('✓ POST /api/keys: las claves ambiguas se guardan solo con proveedor seleccionado');

    const invalidKeyRes = await fetch(`${baseUrl}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role: 'unknown_test', apiKey: 'not-a-provider-key' })
    });
    assert.strictEqual(invalidKeyRes.status, 400);
    console.log('✓ POST /api/keys: Rechaza claves de proveedor desconocido');

    // 3. Consultar llaves configuradas (Verificar que NUNCA expone el secreto)
    const getKeysRes = await fetch(`${baseUrl}/keys?userId=${encodeURIComponent(userId)}`);
    const getKeysData = await getKeysRes.json();
    assert(Array.isArray(getKeysData.keys));
    const openAiKey = getKeysData.keys.find(key => key.role === 'keys_test');
    assert.strictEqual(openAiKey.maskedKey, '••••••••1234');
    assert.strictEqual(openAiKey.provider, 'openai');
    assert.strictEqual(openAiKey.encrypted_key, undefined, 'Jamás debe exponer encrypted_key');
    assert.strictEqual(openAiKey.iv, undefined, 'Jamás debe exponer IV');
    assert.strictEqual(openAiKey.isDecryptable, true);

    const legacyCiphertext = encryptWithSecret(
      'sk-proj-old-encryption-test-1234',
      'ecosistema_multi_ia_default_master_secret_2026_dev_key'
    );
    db.prepare(`
      UPDATE api_keys SET encrypted_key = ?, iv = ?, auth_tag = ?
      WHERE user_id = ? AND role = 'keys_test' AND is_fallback = 0
    `).run(legacyCiphertext.encryptedData, legacyCiphertext.iv, legacyCiphertext.authTag, userId);
    assert.strictEqual(migrateLegacyApiKeys(), 1);
    const legacyKeysData = await (await fetch(`${baseUrl}/keys?userId=${encodeURIComponent(userId)}`)).json();
    const legacyKey = legacyKeysData.keys.find(key => key.role === 'keys_test');
    assert.strictEqual(legacyKey.isDecryptable, true);
    assert.strictEqual(legacyKey.encrypted_key, undefined);

    const unrecoverableCiphertext = encryptWithSecret(
      'sk-proj-unrecoverable-test-1234',
      'unrecoverable-test-secret'
    );
    db.prepare(`
      UPDATE api_keys SET encrypted_key = ?, iv = ?, auth_tag = ?
      WHERE user_id = ? AND role = 'keys_test' AND is_fallback = 0
    `).run(unrecoverableCiphertext.encryptedData, unrecoverableCiphertext.iv, unrecoverableCiphertext.authTag, userId);
    const unrecoverableKeysData = await (await fetch(`${baseUrl}/keys?userId=${encodeURIComponent(userId)}`)).json();
    const unrecoverableKey = unrecoverableKeysData.keys.find(key => key.role === 'keys_test');
    assert.strictEqual(unrecoverableKey.isDecryptable, false);
    const legacyTestRes = await fetch(`${baseUrl}/keys/${legacyKey.id}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    assert.strictEqual(legacyTestRes.status, 409);
    assert.match((await legacyTestRes.json()).error, /Vuelve a introducirla/);

    const repairedKeyRes = await fetch(`${baseUrl}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        role: 'keys_test',
        provider: 'openai',
        apiKey: 'sk-proj-testHttp1234567890abcdef1234'
      })
    });
    assert.strictEqual((await repairedKeyRes.json()).success, true);
    const repairedKeysData = await (await fetch(`${baseUrl}/keys?userId=${encodeURIComponent(userId)}`)).json();
    assert.strictEqual(repairedKeysData.keys.find(key => key.role === 'keys_test').isDecryptable, true);
    console.log('✓ GET /api/keys: Llaves listadas de forma aislada y segura');

    const invalidSkillRes = await fetch(`${baseUrl}/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        role: 'unknown_agent',
        name: 'Skill inválida',
        instructions: 'No debe guardarse.'
      })
    });
    assert.strictEqual(invalidSkillRes.status, 400);

    const saveSkillRes = await fetch(`${baseUrl}/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        role: 'directora',
        name: 'Análisis ejecutivo',
        instructions: 'Resume primero la conclusión y después ofrece tres razones.'
      })
    });
    const saveSkillData = await saveSkillRes.json();
    assert.strictEqual(saveSkillRes.status, 201);
    assert.strictEqual(saveSkillData.skill.role, 'directora');

    const skillsData = await (await fetch(`${baseUrl}/skills?userId=${encodeURIComponent(userId)}`)).json();
    assert.strictEqual(skillsData.skills.length, 1);
    assert.strictEqual(skillsData.skills[0].instructions, 'Resume primero la conclusión y después ofrece tres razones.');

    const duplicateSkillRes = await fetch(`${baseUrl}/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        role: 'directora',
        name: 'Análisis ejecutivo',
        instructions: 'Otra instrucción.'
      })
    });
    assert.strictEqual(duplicateSkillRes.status, 409);

    const deleteSkillRes = await fetch(`${baseUrl}/skills/${saveSkillData.skill.id}?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE'
    });
    assert.strictEqual(deleteSkillRes.status, 200);
    console.log('✓ API de skills valida, guarda, lista y elimina skills asignadas por IA');

    const automaticAgentsData = await (await fetch(`${baseUrl}/agents/automatic?userId=${encodeURIComponent(userId)}`)).json();
    assert.deepStrictEqual(automaticAgentsData.enabledRoles, []);
    const saveAutomaticAgentsRes = await fetch(`${baseUrl}/agents/automatic`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, enabledRoles: ['tutora', 'revisora', 'tutora'] })
    });
    const saveAutomaticAgentsData = await saveAutomaticAgentsRes.json();
    assert.strictEqual(saveAutomaticAgentsRes.status, 200);
    assert.deepStrictEqual(saveAutomaticAgentsData.enabledRoles, ['tutora', 'revisora']);
    assert.strictEqual(saveAutomaticAgentsData.maxResponsesPerTurn, 2);
    const invalidAutomaticAgentRes = await fetch(`${baseUrl}/agents/automatic`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, enabledRoles: ['not-a-specialist'] })
    });
    assert.strictEqual(invalidAutomaticAgentRes.status, 400);
    const automaticAgentsAfterSave = await (await fetch(`${baseUrl}/agents/automatic?userId=${encodeURIComponent(userId)}`)).json();
    assert.deepStrictEqual(automaticAgentsAfterSave.enabledRoles, ['tutora', 'revisora']);
    console.log('✓ API de intervenciones automáticas valida, persiste y ordena los puestos activos');

    const saveChatKeyRes = await fetch(`${baseUrl}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        role: 'general',
        apiKey: 'sk-proj-chatTest1234567890abcdef1234'
      })
    });
    const saveChatKeyData = await saveChatKeyRes.json();
    assert.strictEqual(saveChatKeyData.success, true);
    const chatKeysData = await (await fetch(`${baseUrl}/keys?userId=${encodeURIComponent(userId)}`)).json();
    const chatKey = chatKeysData.keys.find(key => key.role === 'general');

    const legacyChatCiphertext = encryptWithSecret(
      'sk-proj-legacy-chat-key-1234',
      'unrecoverable-test-secret'
    );
    db.prepare(`
      UPDATE api_keys SET encrypted_key = ?, iv = ?, auth_tag = ?
      WHERE user_id = ? AND role = 'general' AND is_fallback = 0
    `).run(legacyChatCiphertext.encryptedData, legacyChatCiphertext.iv, legacyChatCiphertext.authTag, userId);
    const legacyChatRes = await fetch(`${baseUrl}/chat/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        sessionId,
        prompt: 'Revisa el estado de cifrado de mi clave',
        role: 'general',
        specialistName: 'Asistente'
      })
    });
    assert.strictEqual(legacyChatRes.status, 409);
    assert.match((await legacyChatRes.json()).error, /No se puede usar la API Key configurada/);
    const restoreChatKeyRes = await fetch(`${baseUrl}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        role: 'general',
        apiKey: 'sk-proj-chatTest1234567890abcdef1234'
      })
    });
    assert.strictEqual((await restoreChatKeyRes.json()).success, true);

    const restoreFetch = mockOpenAIResponses();
    try {
      const keyTestRes = await fetch(`${baseUrl}/keys/${chatKey.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const keyTestData = await keyTestRes.json();
      assert.strictEqual(keyTestData.success, true);
      assert.strictEqual(keyTestData.provider, 'openai');
      console.log('✓ POST /api/keys/:id/test: valida una conexión directa al proveedor');
    } finally {
      restoreFetch();
    }

    // 4. Consultar y actualizar presupuesto
    const budgetRes = await fetch(`${baseUrl}/budget?userId=${encodeURIComponent(userId)}`);
    const budgetData = await budgetRes.json();
    assert(budgetData.budget.dailyLimit > 0);
    console.log('✓ GET /api/budget: Presupuesto consultado');

    // 5. Enviar mensaje por el chat (Pipeline completo vía HTTP)
    const noKeyRes = await fetch(`${baseUrl}/chat/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: `no_key_${crypto.randomUUID()}`,
        sessionId,
        prompt: 'No debe contestar con el simulador',
        role: 'general',
        specialistName: 'Directora'
      })
    });
    const noKeyData = await noKeyRes.json();
    assert.strictEqual(noKeyRes.status, 500);
    assert.match(noKeyData.error, /No hay una API Key real configurada/);

    const restoreChatFetch = mockOpenAIResponses();
    let chatRes;
    let chatData;
    try {
      chatRes = await fetch(`${baseUrl}/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sessionId,
          prompt: '¿Podrías darme un ejemplo de código en JavaScript?',
          role: 'general',
          specialistName: 'IA Programadora MVP'
        })
      });
      chatData = await chatRes.json();
    } finally {
      restoreChatFetch();
    }
    assert.strictEqual(chatData.success, true);
    assert.deepStrictEqual(chatData.automaticStatus, {
      enabledCount: 2,
      evaluatedCount: 2,
      responseCount: 1
    });
    assert.strictEqual(chatData.isFallbackUsed, false);
    assert(chatData.receipt && chatData.receipt.id, 'Debe incluir recibo');
    assert.strictEqual(chatData.security.codeReviewed, true, 'Debe incluir revisión de código');
    assert.strictEqual(chatData.criticReview.reviewed, true, 'El crítico debe revisar todas las respuestas');
    assert(chatData.criticReview.roundsCount <= 2, 'El crítico debe respetar el límite de iteraciones');
    assert.strictEqual(chatData.automaticResponses.length, 1);
    assert.strictEqual(chatData.automaticResponses[0].role, 'tutora');

    const chatHistoryData = await (await fetch(
      `${baseUrl}/chat/history?userId=${encodeURIComponent(userId)}&sessionId=${encodeURIComponent(sessionId)}`
    )).json();
    assert(
      chatHistoryData.messages.some(message => message.id === chatData.automaticResponses[0].id),
      'La intervención automática debe aparecer al volver a consultar el historial'
    );
    console.log('✓ POST /api/chat/send: llamada al proveedor y pipeline procesados vía API');

    const documentRequests = [];
    const restoreDocumentFetch = mockOpenAIResponses(request => documentRequests.push(request));
    try {
      const documentChatRes = await fetch(`${baseUrl}/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sessionId,
          prompt: 'Resume el documento',
          document: documentData.document,
          role: 'general',
          specialistName: 'Directora'
        })
      });
      const documentChatData = await documentChatRes.json();
      assert.strictEqual(documentChatData.success, true);
      assert(
        documentRequests.some(request => request.messages.some(message => (
          message.role === 'user' && message.content.includes(documentData.document.text)
        ))),
        'El texto extraído del documento debe llegar al proveedor configurado'
      );
    } finally {
      restoreDocumentFetch();
    }
    console.log('✓ POST /api/chat/send: incluye el texto del documento en la solicitud al modelo');

    // 6. Consultar recibo firmado
    const receiptRes = await fetch(`${baseUrl}/chat/receipt/${chatData.receipt.id}`);
    const receiptData = await receiptRes.json();
    assert.strictEqual(receiptData.receipt.isValid, true);
    console.log('✓ GET /api/chat/receipt/:id: Comprobante consultado y validado criptográficamente');

    const clearHistoryRes = await fetch(`${baseUrl}/chat/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, sessionId })
    });
    const clearHistoryData = await clearHistoryRes.json();
    assert.strictEqual(clearHistoryRes.status, 200);
    assert.strictEqual(clearHistoryData.success, true);
    assert(clearHistoryData.deletedMessages >= 4, 'Debe borrar los mensajes de usuario, asistente y agentes automáticos de la sesión');
    const clearedHistoryData = await (await fetch(
      `${baseUrl}/chat/history?userId=${encodeURIComponent(userId)}&sessionId=${encodeURIComponent(sessionId)}`
    )).json();
    assert.deepStrictEqual(clearedHistoryData.messages, []);
    const preservedReceiptRes = await fetch(`${baseUrl}/chat/receipt/${chatData.receipt.id}`);
    assert.strictEqual(preservedReceiptRes.status, 200, 'El borrado del chat debe conservar recibos inmutables');
    const preservedKeysRes = await fetch(`${baseUrl}/keys?userId=${encodeURIComponent(userId)}`);
    const preservedKeysData = await preservedKeysRes.json();
    assert(preservedKeysData.keys.some(key => key.role === 'general'), 'El borrado del chat no debe borrar API Keys');
    console.log('✓ POST /api/chat/clear: borra solo mensajes de la sesión y conserva configuración y recibos');

    console.log('🎉 ¡TODOS LOS ENDPOINTS DE LA API FUNCIONAN CORRECTAMENTE!');
  } finally {
    await new Promise((resolve, reject) => {
      testServer.close(error => error ? reject(error) : resolve());
    });
  }
}

testApi().catch(err => {
  console.error('❌ Error en pruebas de API:', err);
  process.exit(1);
});

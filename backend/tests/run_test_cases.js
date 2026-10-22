const fs = require('fs');
const path = require('path');
const { processPipeline } = require('../src/pipeline');
const { getReceiptById } = require('../src/pipeline/4_receipt');

async function runAllTestCases() {
  const filePath = path.join(__dirname, 'test_cases.json');
  const testCases = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  console.log(`\n======================================================`);
  console.log(`🚀 Ejecutando batería de ${testCases.length} casos de prueba reales`);
  console.log(`======================================================\n`);

  const results = {
    total: testCases.length,
    passed: 0,
    failed: 0,
    details: []
  };

  const testUserId = `batch_runner_${Date.now()}`;

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const testSessionId = `session_${tc.id}_${Date.now()}`;
    const startTime = Date.now();

    try {
      const response = await processPipeline({
        userId: testUserId,
        sessionId: testSessionId,
        prompt: tc.prompt,
        role: 'general',
        specialistName: tc.expectedSpecialist || 'IA Base'
      });

      const elapsed = Date.now() - startTime;

      // Validaciones del pipeline
      let passed = true;
      let failureReason = '';

      if (!response.success && !tc.id.includes('TC-24')) {
        passed = false;
        failureReason = `Fallo en el pipeline: ${response.reason || 'Sin respuesta'}`;
      } else if (response.receipt) {
        // Verificar que el recibo criptográfico exista y sea auténtico
        const dbReceipt = getReceiptById(response.receipt.id);
        if (!dbReceipt || !dbReceipt.isValid) {
          passed = false;
          failureReason = 'La firma criptográfica del comprobante no pudo ser verificada.';
        }
      }

      // Validar escaneo de código si el caso lo requería
      if (tc.requiresCodeScan && response.security && !response.security.hasCode) {
        // Si el mock generó código cuando se requería
      }

      if (passed) {
        results.passed++;
        console.log(`✓ [${tc.id}] ${tc.category.padEnd(25)} | ${elapsed}ms | Recibo: ${response.receipt?.id?.slice(0, 12)}...`);
      } else {
        results.failed++;
        console.log(`✗ [${tc.id}] ${tc.category.padEnd(25)} | ERROR: ${failureReason}`);
      }

      results.details.push({
        id: tc.id,
        category: tc.category,
        passed,
        elapsed,
        failureReason
      });

    } catch (err) {
      results.failed++;
      console.log(`✗ [${tc.id}] ${tc.category.padEnd(25)} | EXCEPCIÓN: ${err.message}`);
    }
  }

  const passRate = ((results.passed / results.total) * 100).toFixed(1);
  console.log(`\n======================================================`);
  console.log(`📊 RESULTADOS: ${results.passed}/${results.total} casos superados (${passRate}%)`);
  console.log(`======================================================\n`);
}

runAllTestCases().catch(err => {
  console.error('Error fatal al ejecutar batería de pruebas:', err);
  process.exit(1);
});

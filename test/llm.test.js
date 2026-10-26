const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { callLLM, loadConfig, createBudget, LlmError } = require('../src/llm');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'multiagent-llm-'));
}

function configFor(dir, overrides = {}) {
  return loadConfig({
    mock: true,
    apiKey: '',
    baseUrl: '',
    cacheDir: dir,
    priceIn: null,
    priceOut: null,
    tokensPorCaso: 50000,
    maxCallsRun: 20,
    maxSecondsRun: 60,
    maxRetries: 1,
    retryDelayMs: 1,
    mockScenario: 'ok',
    ...overrides
  });
}

const criticRubric = {
  criteria: [
    { id: 'C1', descripcion: 'Devuelve JSON', verificable_en_codigo: true },
    { id: 'C2', descripcion: 'Claridad', verificable_en_codigo: false }
  ]
};

test('MOCK es determinista y consume tokens lógicos', async () => {
  const dir = tempDir();
  const config = configFor(dir);
  const budget = createBudget(config);
  const args = {
    agent: 'generador',
    messages: [{ role: 'user', content: 'Genera código' }],
    runId: 'determinista',
    config,
    budget,
    useCache: false
  };
  const first = await callLLM(args);
  const second = await callLLM({ ...args, budget: createBudget(config) });
  assert.equal(first.content, second.content);
  assert.ok(first.usage.total > 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('el presupuesto se valida antes de llamar', async () => {
  const dir = tempDir();
  const config = configFor(dir);
  const budget = createBudget(config, { tokensLimit: 5 });
  await assert.rejects(
    () => callLLM({
      agent: 'generador',
      messages: [{ role: 'user', content: 'x'.repeat(400) }],
      maxTokens: 100,
      runId: 'presupuesto',
      config,
      budget
    }),
    error => error instanceof LlmError && error.code === 'BUDGET'
  );
  assert.equal(budget.calls, 0);
  assert.equal(budget.tokensUsed, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('la caché escribe, lee y no cuenta una llamada al leer', async () => {
  const dir = tempDir();
  const config = configFor(dir);
  const budget = createBudget(config);
  const args = {
    agent: 'generador',
    messages: [{ role: 'user', content: 'cache' }],
    runId: 'cache-run',
    config,
    budget,
    useCache: true
  };
  const first = await callLLM(args);
  assert.equal(first.cached, false);
  const second = await callLLM(args);
  assert.equal(second.cached, true);
  assert.equal(budget.calls, 1);
  assert.equal(budget.logicalTokens, first.usage.total * 2);
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 1);
  const third = await callLLM({ ...args, useCache: false });
  assert.equal(third.cached, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('los reintentos y fallos se cuentan en el presupuesto', async () => {
  const dir = tempDir();
  const config = configFor(dir, {
    mock: false,
    apiKey: 'test-key',
    baseUrl: 'https://example.test/v1',
    maxRetries: 1
  });
  const budget = createBudget(config);
  const events = [];
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    if (calls === 1) return { ok: false, status: 500, json: async () => ({}) };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: 'fake',
        choices: [{ message: { content: 'respuesta final' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      })
    };
  };
  try {
    const result = await callLLM({
      agent: 'generador',
      messages: [{ role: 'user', content: 'reintenta' }],
      runId: 'retry-run',
      config,
      budget,
      useCache: false,
      onEvent: event => events.push(event)
    });
    assert.equal(result.content, 'respuesta final');
    assert.equal(budget.calls, 2);
    assert.equal(budget.retries, 1);
    assert.equal(budget.failures, 1);
    assert.equal(events.length, 2);
    assert.equal(events[0].outcome, 'error');
    assert.equal(events[1].outcome, 'ok');
    assert.ok(budget.logicalTokens > 15);
    assert.equal(budget.billedTokens, budget.logicalTokens);
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('MOCK timeout falla y cuenta la llamada fallida', async () => {
  const dir = tempDir();
  const config = configFor(dir, { mockScenario: 'timeout' });
  const budget = createBudget(config);
  await assert.rejects(
    () => callLLM({
      agent: 'generador',
      messages: [{ role: 'user', content: 'timeout' }],
      runId: 'timeout-run',
      config,
      budget,
      useCache: false
    }),
    error => error instanceof LlmError && error.code === 'TIMEOUT'
  );
  assert.equal(budget.calls, 1);
  assert.equal(budget.failures, 1);
  assert.ok(budget.tokensUsed > 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('MOCK json_basura devuelve una salida no parseable', async () => {
  const dir = tempDir();
  const config = configFor(dir, { mockScenario: 'json_basura' });
  const result = await callLLM({
    agent: 'critico',
    messages: [{ role: 'user', content: 'critica' }],
    meta: { rubric: criticRubric },
    runId: 'basura-run',
    config,
    budget: createBudget(config),
    useCache: false
  });
  assert.throws(() => JSON.parse(result.content));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('MAX_CALLS_RUN y MAX_SECONDS_RUN se respetan', async () => {
  const dir = tempDir();
  const config = configFor(dir);
  const budget = createBudget(config, { maxCalls: 1 });
  const args = {
    agent: 'generador',
    messages: [{ role: 'user', content: 'una' }],
    runId: 'max-calls',
    config,
    useCache: false
  };
  await callLLM({ ...args, budget });
  await assert.rejects(
    () => callLLM({ ...args, budget }),
    error => error instanceof LlmError && error.code === 'MAX_CALLS'
  );
  const expired = createBudget(config, { maxSeconds: 1, startedAt: Date.now() - 5000 });
  await assert.rejects(
    () => callLLM({ ...args, budget: expired }),
    error => error instanceof LlmError && error.code === 'MAX_SECONDS'
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('un fallo posterior no puede superar el presupuesto restante', async () => {
  const dir = tempDir();
  const config = configFor(dir);
  const budget = createBudget(config);
  const args = {
    agent: 'generador',
    messages: [{ role: 'user', content: 'primera' }],
    runId: 'sin-saldo',
    config,
    budget,
    useCache: false
  };
  await callLLM(args);
  budget.tokensLimit = budget.tokensUsed + 1;
  await assert.rejects(
    () => callLLM({ ...args, messages: [{ role: 'user', content: 'segunda' }] }),
    error => error instanceof LlmError && error.code === 'BUDGET'
  );
  assert.equal(budget.calls, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('sin precios el costo es desconocido y no se inventa', async () => {
  const dir = tempDir();
  const config = configFor(dir, { priceIn: null, priceOut: null });
  const budget = createBudget(config);
  await callLLM({
    agent: 'generador',
    messages: [{ role: 'user', content: 'costo' }],
    runId: 'costo-run',
    config,
    budget,
    useCache: false
  });
  assert.equal(budget.logicalCostUsd, null);
  assert.equal(budget.billedCostUsd, null);
  fs.rmSync(dir, { recursive: true, force: true });
});

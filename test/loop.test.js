const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadConfig } = require('../src/llm');
const { runPipeline } = require('../src/pipeline');

const tests = [
  "const test = require('node:test');",
  "const assert = require('node:assert');",
  "const { add } = require('./solution.js');",
  "test('suma', () => assert.equal(add(2, 3), 5));"
].join('\n');

const badCode = 'module.exports = { add: () => 0 };';
const goodCode = 'module.exports = { add: (a, b) => a + b };';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'multiagent-loop-'));
}

function configFor(dir, overrides = {}) {
  return loadConfig({
    mock: true,
    apiKey: '',
    baseUrl: '',
    cacheDir: path.join(dir, 'cache'),
    tokensPorCaso: 50000,
    maxCallsRun: 20,
    maxSecondsRun: 60,
    maxRounds: 3,
    maxRetries: 1,
    retryDelayMs: 1,
    mockScenario: 'ok',
    priceIn: 1,
    priceOut: 2,
    ...overrides
  });
}

function criticJson(c2 = true, c3 = true) {
  return JSON.stringify({
    aprobado: c2 && c3,
    criterios: [
      { id: 'C1', cumple: true, evidencia: 'ok' },
      { id: 'C2', cumple: c2, evidencia: c2 ? 'ok' : 'falla' },
      { id: 'C3', cumple: c3, evidencia: c3 ? 'ok' : 'falla' }
    ],
    motivo: 'critica simulada'
  });
}

function correction(content, rechazados = []) {
  return JSON.stringify({ salida: content, rechazados });
}

test('el corrector puede llevar la salida a aprobada en la ronda 2', async () => {
  const dir = tempDir();
  const result = await runPipeline({
    task: 'suma',
    tipo: 'codigo',
    tests,
    config: configFor(dir),
    traceDir: path.join(dir, 'traces'),
    runId: 'loop-ok',
    mockOutputs: {
      generador: badCode,
      corrector: correction(goodCode),
      critico: [criticJson(true, true), criticJson(true, true)]
    }
  });
  assert.equal(result.status, 'aprobado');
  assert.equal(result.rondas, 2);
  assert.equal(result.mejor, goodCode);
  assert.equal(result.puntaje, 1);
  assert.equal(result.tokens.llamadas, 4);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('la guardia de regresión conserva el mejor intento anterior', async () => {
  const dir = tempDir();
  const result = await runPipeline({
    task: 'suma',
    tipo: 'codigo',
    tests,
    config: configFor(dir),
    traceDir: path.join(dir, 'traces'),
    runId: 'loop-regresion',
    mockOutputs: {
      generador: badCode,
      corrector: correction('module.exports = {'),
      critico: [criticJson(true, true), criticJson(true, true)]
    }
  });
  assert.equal(result.status, 'sin_mejora');
  assert.equal(result.rondas, 2);
  assert.equal(result.mejor, badCode);
  assert.equal(result.puntaje, Number((2 / 3).toFixed(4)));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('una salida idéntica detiene el bucle por repetición', async () => {
  const dir = tempDir();
  const result = await runPipeline({
    task: 'suma',
    tipo: 'codigo',
    tests,
    config: configFor(dir),
    traceDir: path.join(dir, 'traces'),
    runId: 'loop-repeticion',
    mockOutputs: {
      generador: badCode,
      corrector: correction(badCode),
      critico: criticJson(true, true)
    }
  });
  assert.equal(result.status, 'repeticion');
  assert.equal(result.rondas, 2);
  assert.equal(result.mejor, badCode);
  assert.equal(result.tokens.llamadas, 3);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('el rechazo se limita a 1 criterio no verificable, no se repite y sigue contando', async () => {
  const dir = tempDir();
  const result = await runPipeline({
    task: 'devuelve un objeto',
    tipo: 'texto',
    config: configFor(dir),
    traceDir: path.join(dir, 'traces'),
    runId: 'loop-rechazo',
    mockOutputs: {
      generador: '{"v":1}',
      corrector: [correction('{"v":2}', ['C1', 'C2', 'C3']), correction('{"v":3}', ['C2'])],
      critico: [criticJson(false, false), criticJson(true, true), criticJson(true, true)]
    }
  });
  assert.deepEqual(result.rechazados, ['C2']);
  assert.equal(result.criterios.find(item => item.id === 'C2').cumple, false);
  assert.equal(result.status, 'sin_mejora');
  assert.equal(result.rondas, 3);
  assert.equal(result.mejor, '{"v":2}');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('no se puede rechazar un criterio verificado por código', async () => {
  const dir = tempDir();
  const result = await runPipeline({
    task: 'suma',
    tipo: 'codigo',
    tests,
    config: configFor(dir),
    traceDir: path.join(dir, 'traces'),
    runId: 'loop-rechazo-codigo',
    mockOutputs: {
      generador: badCode,
      corrector: correction(goodCode, ['C1']),
      critico: [criticJson(true, true), criticJson(true, true)]
    }
  });
  assert.deepEqual(result.rechazados, []);
  assert.equal(result.status, 'aprobado');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('MAX_ROUNDS se respeta y devuelve el mejor intento', async () => {
  const dir = tempDir();
  const result = await runPipeline({
    task: 'devuelve un objeto',
    tipo: 'texto',
    config: configFor(dir, { maxRounds: 2 }),
    traceDir: path.join(dir, 'traces'),
    runId: 'loop-max',
    mockOutputs: {
      generador: '{"v":1}',
      corrector: correction('{"v":2}'),
      critico: [criticJson(false, false), criticJson(false, true)]
    }
  });
  assert.equal(result.status, 'rondas');
  assert.equal(result.rondas, 2);
  assert.equal(result.mejor, '{"v":2}');
  assert.equal(result.puntaje, 0.5);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('si se agota el presupuesto se conserva el mejor intento', async () => {
  const dir = tempDir();
  const result = await runPipeline({
    task: 'suma',
    tipo: 'codigo',
    tests,
    config: configFor(dir, { maxCallsRun: 3 }),
    traceDir: path.join(dir, 'traces'),
    runId: 'loop-presupuesto',
    mockOutputs: {
      generador: badCode,
      corrector: correction(goodCode),
      critico: [criticJson(true, true), criticJson(true, true)]
    }
  });
  assert.equal(result.status, 'presupuesto');
  assert.equal(result.mejor, badCode);
  assert.equal(result.puntaje, Number((2 / 3).toFixed(4)));
  fs.rmSync(dir, { recursive: true, force: true });
});

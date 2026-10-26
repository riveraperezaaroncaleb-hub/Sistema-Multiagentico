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

const goodCode = 'module.exports = { add: (a, b) => a + b };';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'multiagent-pipe-'));
}

function configFor(dir) {
  return loadConfig({
    mock: true,
    apiKey: '',
    baseUrl: '',
    cacheDir: path.join(dir, 'cache'),
    tokensPorCaso: 50000,
    maxCallsRun: 20,
    maxSecondsRun: 60,
    maxRounds: 1,
    maxRetries: 1,
    retryDelayMs: 1,
    mockScenario: 'ok',
    priceIn: 1,
    priceOut: 2
  });
}

function criticJson() {
  return JSON.stringify({
    aprobado: true,
    criterios: [
      { id: 'C1', cumple: true, evidencia: 'ok' },
      { id: 'C2', cumple: true, evidencia: 'ok' },
      { id: 'C3', cumple: true, evidencia: 'ok' }
    ],
    motivo: 'todo bien'
  });
}

test('un código correcto se aprueba por verificadores', async () => {
  const dir = tempDir();
  const config = configFor(dir);
  const traceDir = path.join(dir, 'traces');
  const result = await runPipeline({
    task: 'suma',
    tipo: 'codigo',
    tests,
    config,
    traceDir,
    runId: 'pipe-ok',
    mockOutputs: { generador: goodCode, critico: criticJson() }
  });
  assert.equal(result.status, 'aprobado');
  assert.equal(result.puntaje, 1);
  assert.equal(result.rondas, 1);
  assert.equal(result.criterios.find(item => item.id === 'C1').fuente, 'codigo');
  assert.ok(result.tokens.logicos > 0);
  assert.ok(fs.existsSync(result.trace));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('el código manda aunque el crítico apruebe una sintaxis rota', async () => {
  const dir = tempDir();
  const result = await runPipeline({
    task: 'suma',
    tipo: 'codigo',
    tests,
    config: configFor(dir),
    traceDir: path.join(dir, 'traces'),
    runId: 'pipe-manda-codigo',
    mockOutputs: { generador: 'module.exports = {', critico: criticJson() }
  });
  assert.equal(result.status, 'rondas');
  assert.ok(result.puntaje < 1);
  assert.equal(result.criterios.find(item => item.id === 'C1').cumple, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('el JSON basura del crítico se reintenta una vez y se registra', async () => {
  const dir = tempDir();
  const traceDir = path.join(dir, 'traces');
  const result = await runPipeline({
    task: 'suma',
    tipo: 'codigo',
    tests,
    config: configFor(dir),
    traceDir,
    runId: 'pipe-parse',
    mockOutputs: { generador: goodCode, critico: ['no json', criticJson()] }
  });
  assert.equal(result.status, 'aprobado');
  assert.equal(result.tokens.llamadas, 3);
  const trace = fs.readFileSync(path.join(traceDir, 'pipe-parse.jsonl'), 'utf8');
  assert.match(trace, /parse_error/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('la salida JSON se valida con schema antes del crítico', async () => {
  const dir = tempDir();
  const result = await runPipeline({
    task: 'devuelve nombre',
    tipo: 'texto',
    schema: { type: 'object', required: ['nombre'], properties: { nombre: { type: 'string' } } },
    config: configFor(dir),
    traceDir: path.join(dir, 'traces'),
    runId: 'pipe-schema',
    mockOutputs: {
      generador: '{"nombre":"Ada"}',
      critico: JSON.stringify({
        aprobado: true,
        criterios: [
          { id: 'C1', cumple: true, evidencia: 'ok' },
          { id: 'C2', cumple: true, evidencia: 'ok' },
          { id: 'C3', cumple: true, evidencia: 'ok' }
        ],
        motivo: 'ok'
      })
    }
  });
  assert.equal(result.status, 'aprobado');
  assert.equal(result.criterios.find(item => item.id === 'C1').fuente, 'codigo');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('--replay reproduce sin API y sin volver a llamar al modelo', async () => {
  const dir = tempDir();
  const config = configFor(dir);
  const first = await runPipeline({
    task: 'suma',
    tipo: 'codigo',
    tests,
    config,
    traceDir: path.join(dir, 'traces'),
    runId: 'pipe-replay',
    mockOutputs: { generador: goodCode, critico: criticJson() }
  });
  const replayConfig = loadConfig({ mock: false, apiKey: '', baseUrl: '', cacheDir: path.join(dir, 'cache2') });
  const second = await runPipeline({
    replay: first.trace,
    config: replayConfig,
    traceDir: path.join(dir, 'traces2'),
    runId: 'pipe-replay-2'
  });
  assert.equal(second.status, first.status);
  assert.equal(second.mejor, first.mejor);
  assert.equal(second.tokens.llamadas, first.tokens.llamadas);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('el presupuesto detiene el pipeline antes de llamar', async () => {
  const dir = tempDir();
  const config = configFor(dir);
  config.tokensPorCaso = 20;
  const result = await runPipeline({
    task: 'suma',
    tipo: 'codigo',
    tests,
    config,
    traceDir: path.join(dir, 'traces'),
    runId: 'pipe-budget',
    mockOutputs: { generador: goodCode, critico: criticJson() }
  });
  assert.equal(result.status, 'presupuesto');
  assert.equal(result.mejor, null);
  assert.equal(result.tokens.llamadas, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('la traza nunca contiene la API key', async () => {
  const dir = tempDir();
  const config = configFor(dir);
  config.apiKey = 'SUPER-SECRET-123';
  const traceDir = path.join(dir, 'traces');
  await runPipeline({
    task: 'usa SUPER-SECRET-123 en la tarea',
    tipo: 'texto',
    config,
    traceDir,
    runId: 'pipe-redact',
    mockOutputs: { generador: '{"ok":true}', critico: '{"aprobado":true,"criterios":[],"motivo":"ok"}' }
  });
  const trace = fs.readFileSync(path.join(traceDir, 'pipe-redact.jsonl'), 'utf8');
  assert.doesNotMatch(trace, /SUPER-SECRET-123/);
  assert.match(trace, /REDACTED/);
  fs.rmSync(dir, { recursive: true, force: true });
});

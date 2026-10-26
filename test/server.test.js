const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadConfig } = require('../src/llm');
const { createServer } = require('../src/server');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'multiagent-server-'));
}

function listen(server) {
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

test('el servidor responde health y ejecuta una tarea MOCK', async () => {
  const dir = tempDir();
  const config = loadConfig({
    mock: true,
    apiKey: '',
    baseUrl: '',
    cacheDir: path.join(dir, 'cache'),
    tokensPorCaso: 50000,
    maxCallsRun: 20,
    maxSecondsRun: 60,
    maxRounds: 1,
    mockScenario: 'ok'
  });
  const server = createServer({ config });
  const base = await listen(server);
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });

    const response = await fetch(`${base}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'devuelve un nombre',
        tipo: 'texto',
        schema: { type: 'object', required: ['nombre'], properties: { nombre: { type: 'string' } } }
      })
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.status, 'rondas');
    assert.ok(result.tokens.llamadas > 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('el servidor rechaza JSON inválido, falta de task y cuerpos grandes', async () => {
  const dir = tempDir();
  const config = loadConfig({
    mock: true,
    apiKey: '',
    baseUrl: '',
    cacheDir: path.join(dir, 'cache'),
    maxRounds: 1
  });
  const server = createServer({ config });
  const base = await listen(server);
  try {
    const invalid = await fetch(`${base}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{'
    });
    assert.equal(invalid.status, 400);

    const missing = await fetch(`${base}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    assert.equal(missing.status, 400);

    const large = await fetch(`${base}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'x'.repeat(1024 * 1024 + 1)
    });
    assert.equal(large.status, 413);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

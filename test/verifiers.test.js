const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSchema } = require('../src/verifiers/schema');
const { verifyCode } = require('../src/verifiers/code');

test('el schema mínimo valida tipos, requeridos, propiedades, items y enum', () => {
  const schema = {
    type: 'object',
    required: ['nombre', 'tags'],
    properties: {
      nombre: { type: 'string' },
      edad: { type: 'integer' },
      rol: { enum: ['admin', 'user'] },
      tags: { type: 'array', items: { type: 'string' } }
    }
  };
  const ok = validateSchema(schema, { nombre: 'Ada', edad: 3, rol: 'admin', tags: ['a'] });
  assert.equal(ok.ok, true);
  const bad = validateSchema(schema, { edad: 3.5, rol: 'otro', tags: [1] });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some(error => error.includes('nombre')));
  assert.ok(bad.errors.some(error => error.includes('edad')));
  assert.ok(bad.errors.some(error => error.includes('tags[0]')));
});

test('verifyCode aprueba sintaxis y tests visibles', async () => {
  const result = await verifyCode({
    code: 'module.exports = { add: (a, b) => a + b };',
    tests: [
      "const test = require('node:test');",
      "const assert = require('node:assert');",
      "const { add } = require('./solution.js');",
      "test('suma', () => assert.equal(add(2, 3), 5));"
    ].join('\n'),
    timeoutMs: 10000
  });
  assert.equal(result.facts.find(fact => fact.id === 'C1').ok, true);
  assert.equal(result.facts.find(fact => fact.id === 'C2').ok, true);
});

test('verifyCode detecta sintaxis inválida y tests fallidos', async () => {
  const invalid = await verifyCode({ code: 'module.exports = {', tests: "require('node:test');", timeoutMs: 10000 });
  assert.equal(invalid.facts.find(fact => fact.id === 'C1').ok, false);
  const failing = await verifyCode({
    code: 'module.exports = { add: () => 0 };',
    tests: [
      "const test = require('node:test');",
      "const assert = require('node:assert');",
      "const { add } = require('./solution.js');",
      "test('suma', () => assert.equal(add(2, 3), 5));"
    ].join('\n'),
    timeoutMs: 10000
  });
  assert.equal(failing.facts.find(fact => fact.id === 'C2').ok, false);
});

test('verifyCode marca no_aplica cuando no hay tests', async () => {
  const result = await verifyCode({ code: 'module.exports = 1;', timeoutMs: 10000 });
  assert.equal(result.facts.find(fact => fact.id === 'C2').status, 'no_aplica');
});

test('la lista negra evita ejecutar child_process y red', async () => {
  const child = await verifyCode({ code: "require('node:child_process').execSync('whoami');", timeoutMs: 10000 });
  assert.equal(child.facts.find(fact => fact.id === 'C1').ok, false);
  const network = await verifyCode({ code: "fetch('https://example.com');", timeoutMs: 10000 });
  assert.equal(network.facts.find(fact => fact.id === 'C1').ok, false);
});

test('verifyCode mata el proceso y respeta el timeout', async () => {
  const result = await verifyCode({
    code: 'module.exports = () => { while (true) {} };',
    tests: [
      "const test = require('node:test');",
      "const fn = require('./solution.js');",
      "test('cuelga', () => fn());"
    ].join('\n'),
    timeoutMs: 300
  });
  assert.equal(result.facts.find(fact => fact.id === 'C2').ok, false);
  assert.ok(result.checks.some(check => check.timedOut === true));
});

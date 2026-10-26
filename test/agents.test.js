const test = require('node:test');
const assert = require('node:assert/strict');
const generador = require('../src/agents/generador');
const critico = require('../src/agents/critico');

const rubric = {
  version: 'v1',
  criteria: [
    { id: 'C1', descripcion: 'Sintaxis', verificable_en_codigo: true },
    { id: 'C2', descripcion: 'Claridad', verificable_en_codigo: false }
  ]
};

test('los prompts del generador respetan el máximo de 15 líneas', () => {
  const prompt = generador.buildPrompt({
    task: 'Escribe una suma',
    tipo: 'codigo',
    schema: { type: 'object' },
    rubric
  });
  assert.ok(prompt.split('\n').length <= 15);
  assert.match(prompt, /TAREA: Escribe una suma/);
  assert.match(prompt, /module\.exports/);
  assert.match(prompt, /C1/);
});

test('el generador extrae bloques y JSON con texto alrededor', () => {
  const code = generador.extractCode('Aquí está:\n```js\nmodule.exports = 1;\n```\nListo.');
  assert.equal(code, 'module.exports = 1;');
  const parsed = generador.parseJson('Respuesta:\n{"a":1}\nfin');
  assert.deepEqual(parsed, { a: 1 });
});

test('el generador acepta código sin cercas', () => {
  const code = generador.extractCode('module.exports = () => 42;');
  assert.match(code, /module\.exports/);
});

test('el prompt del crítico es limpio y limitado a 15 líneas', () => {
  const prompt = critico.buildPrompt({
    task: 'Evalúa',
    output: 'salida',
    rubric,
    facts: [{ id: 'C1', ok: true, detalle: 'ok' }]
  });
  assert.ok(prompt.split('\n').length <= 15);
  assert.match(prompt, /HECHOS DE VERIFICADORES/);
  assert.match(prompt, /"salida"/);
  assert.doesNotMatch(prompt, /ronda anterior|historial/i);
});

test('el crítico normaliza ids, omisiones y duplicados', () => {
  const parsed = critico.parse(JSON.stringify({
    aprobado: true,
    criterios: [
      { id: 'C1', cumple: false, evidencia: 'primero' },
      { id: 'C1', cumple: true, evidencia: 'duplicado' }
    ],
    motivo: 'x'
  }), rubric);
  assert.equal(parsed.criterios.length, 2);
  assert.equal(parsed.criterios[0].cumple, false);
  assert.equal(parsed.criterios[1].cumple, false);
  assert.match(parsed.criterios[1].evidencia, /omitido/);
});

test('el crítico rechaza JSON inválido con código PARSE', () => {
  assert.throws(() => critico.parse('no json', rubric), error => error.code === 'PARSE');
});

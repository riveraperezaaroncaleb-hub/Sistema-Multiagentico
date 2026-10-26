const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadCases, scoreCase } = require('../bench/run');
const { mulberry32, mean, std, pairedBootstrap, verdict, buildReport } = require('../bench/stats');

function synthetic(dScore, baselineScore) {
  const rows = [];
  for (const caseId of ['a', 'b', 'c']) {
    for (const config of ['A', 'B', 'C']) {
      rows.push({
        caseId,
        config,
        puntaje: baselineScore,
        status: 'ok',
        tokens: { logicos: 10, facturados: 10, costo: null }
      });
    }
    rows.push({
      caseId,
      config: 'D',
      puntaje: dScore,
      status: 'ok',
      tokens: { logicos: 20, facturados: 20, costo: null }
    });
  }
  return rows;
}

test('el benchmark tiene 15 casos válidos, 3 fáciles y oráculos ocultos', () => {
  const cases = loadCases();
  assert.equal(cases.length, 15);
  assert.equal(cases.filter(item => item.dificultad === 'facil').length, 3);
  assert.equal(cases.filter(item => item.tipo === 'codigo').length, 10);
  assert.equal(cases.filter(item => item.tipo === 'texto').length, 5);
  assert.equal(new Set(cases.map(item => item.id)).size, 15);
});

test('el scoring usa tests ocultos y el JSON esperado, no la salida del pipeline', async () => {
  const cases = loadCases();
  const suma = cases.find(item => item.id === 'facil-suma');
  const good = await scoreCase(suma, 'module.exports = { add(a, b) { return a + b; } };');
  const bad = await scoreCase(suma, 'module.exports = { add(a, b) { return a - b; } };');
  assert.equal(good.ok, true);
  assert.equal(bad.ok, false);

  const json = cases.find(item => item.id === 'facil-json');
  assert.equal((await scoreCase(json, JSON.stringify(json.esperado))).ok, true);
  assert.equal((await scoreCase(json, JSON.stringify({ nombre: 'Ada' }))).ok, false);
});

test('mulberry32 y los estadísticos son deterministas', () => {
  const first = mulberry32(42);
  const second = mulberry32(42);
  assert.deepEqual([first(), first(), first()], [second(), second(), second()]);
  assert.equal(mean([1, 2, 3]), 2);
  assert.equal(std([1, 2, 3]), 1);
  assert.equal(std([5]), 0);
});

test('D solo se declara mejor o peor con intervalos pareados concluyentes', () => {
  const better = pairedBootstrap(synthetic(1, 0), 'D', 'B');
  assert.equal(better.n, 3);
  assert.equal(better.mean, 1);
  assert.equal(better.ci[0], 1);
  assert.equal(verdict(synthetic(1, 0)).label, 'D mejor');
  assert.equal(verdict(synthetic(0, 1)).label, 'D peor');
  assert.equal(verdict(synthetic(1, 1)).label, 'ventaja no demostrada');
  assert.equal(verdict([]).label, 'sin datos suficientes');
});

test('el reporte marca MOCK y costo desconocido sin inventar resultados', () => {
  const report = buildReport(synthetic(1, 0), {
    model: 'mock-model',
    tokensPorCaso: 12000,
    maxTokensBench: 2048,
    benchUseCache: false,
    runs: 1,
    mock: true
  });
  assert.match(report.markdown, /DATOS SIMULADOS, NO SON RESULTADOS/);
  assert.match(report.markdown, /Costo/);
  assert.match(report.markdown, /desconocido/);
  assert.match(report.markdown, /A\/B hacen una llamada/);
  assert.equal(report.decision.label, 'D mejor');
});

test('src no conoce los casos ni los tests ocultos del benchmark', () => {
  const root = path.join(__dirname, '..', 'src');
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
    }
  }
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /bench[\\/]cases|bench[\\/]run|cases\.json|\bocultos\b|\bhiddenTests?\b/i, file);
  }
});

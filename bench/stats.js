function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function std(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function grouped(results) {
  const map = new Map();
  for (const row of results) {
    if (!map.has(row.caseId)) map.set(row.caseId, {});
    const entry = map.get(row.caseId);
    if (!entry[row.config]) entry[row.config] = [];
    entry[row.config].push(Number(row.puntaje) || 0);
  }
  return map;
}

function pairedBootstrap(results, configA, configB, { seed = 42, iterations = 10000 } = {}) {
  const groups = grouped(results);
  const diffs = [];
  for (const byConfig of groups.values()) {
    if (byConfig[configA]?.length && byConfig[configB]?.length) {
      diffs.push(mean(byConfig[configA]) - mean(byConfig[configB]));
    }
  }
  if (!diffs.length) return { n: 0, mean: null, ci: [null, null], diffs };
  const random = mulberry32(seed);
  const samples = [];
  for (let iteration = 0; iteration < iterations; iteration++) {
    let sum = 0;
    for (let index = 0; index < diffs.length; index++) {
      sum += diffs[Math.floor(random() * diffs.length)];
    }
    samples.push(sum / diffs.length);
  }
  samples.sort((a, b) => a - b);
  const low = samples[Math.floor(iterations * 0.025)];
  const high = samples[Math.floor(iterations * 0.975) - 1];
  return { n: diffs.length, mean: mean(diffs), ci: [low, high], diffs };
}

function verdict(results) {
  const againstB = pairedBootstrap(results, 'D', 'B');
  const againstC = pairedBootstrap(results, 'D', 'C');
  if (!againstB.n || !againstC.n) {
    return { label: 'sin datos suficientes', againstB, againstC };
  }
  if (againstB.ci[0] > 0 && againstC.ci[0] > 0) {
    return { label: 'D mejor', againstB, againstC };
  }
  if (againstB.ci[1] < 0 || againstC.ci[1] < 0) {
    return { label: 'D peor', againstB, againstC };
  }
  return { label: 'ventaja no demostrada', againstB, againstC };
}

function aggregate(results, config) {
  const rows = results.filter(row => row.config === config);
  const scores = rows.map(row => Number(row.puntaje) || 0);
  const statuses = new Map();
  for (const row of rows) {
    const status = row.status || 'error';
    statuses.set(status, (statuses.get(status) || 0) + 1);
  }
  const mostFrequent = [...statuses.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'sin datos';
  const costs = rows.map(row => row.tokens?.costo);
  const knownCosts = costs.filter(value => typeof value === 'number');
  return {
    runs: rows.length,
    passRate: rows.length ? mean(scores) : 0,
    score: mean(scores),
    std: std(scores),
    logical: rows.reduce((sum, row) => sum + (Number(row.tokens?.logicos) || 0), 0),
    billed: rows.reduce((sum, row) => sum + (Number(row.tokens?.facturados) || 0), 0),
    cost: costs.length && knownCosts.length === costs.length ? knownCosts.reduce((a, b) => a + b, 0) : null,
    mostFrequent
  };
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatCost(value) {
  return value === null ? 'desconocido' : `$${value.toFixed(6)}`;
}

function buildReport(results, meta = {}) {
  const configs = ['A', 'B', 'C', 'D'];
  const aggregates = Object.fromEntries(configs.map(config => [config, aggregate(results, config)]));
  const decision = verdict(results);
  const lines = [];
  const simulated = results.some(row => row.mock) || meta.mock;
  if (simulated) {
    lines.push('# DATOS SIMULADOS, NO SON RESULTADOS');
    lines.push('');
    lines.push('Este reporte usa MOCK. Sirve para validar el arnés, no para afirmar que D supera a A/B/C.');
    lines.push('');
  }
  lines.push('# Reporte del benchmark');
  lines.push('');
  lines.push(`- Modelo: ${meta.model || 'no indicado'}`);
  lines.push(`- Tokens por caso: ${meta.tokensPorCaso || 'no indicado'}`);
  lines.push(`- MAX_TOKENS_BENCH: ${meta.maxTokensBench || 'no indicado'}`);
  lines.push(`- Caché de benchmark: ${meta.benchUseCache ? 'activada' : 'desactivada'}`);
  lines.push(`- Política: A/B hacen una llamada ${meta.pricesKnown ? 'con el presupuesto restante' : `capada a ${meta.maxTokensBench || 'MAX_TOKENS_BENCH'}`}; C/D usan llamadas de hasta el tope por llamada.`);
  lines.push(`- Repeticiones: ${meta.runs || 'no indicado'}`);
  lines.push(`- Semilla bootstrap: ${meta.seed || 42}`);
  lines.push(`- Veredicto: **${decision.label}**`);
  lines.push('');
  lines.push('## Por configuración');
  lines.push('');
  lines.push('| Config | Ejecuciones | Aprobación | Puntaje medio | Desv. | Tokens lógicos | Tokens facturados | Costo | Estado más frecuente |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const config of configs) {
    const row = aggregates[config];
    lines.push(
      `| ${config} | ${row.runs} | ${formatPercent(row.passRate)} | ${row.score.toFixed(4)} | ${row.std.toFixed(4)} | ${row.logical} | ${row.billed} | ${formatCost(row.cost)} | ${row.mostFrequent} |`
    );
  }
  lines.push('');
  lines.push('## D contra B y C');
  lines.push('');
  for (const [name, comparison] of [['B', decision.againstB], ['C', decision.againstC]]) {
    if (!comparison.n) {
      lines.push(`- D vs ${name}: sin datos pareados.`);
      continue;
    }
    lines.push(
      `- D vs ${name}: diferencia media ${comparison.mean.toFixed(4)}, IC95% [${comparison.ci[0].toFixed(4)}, ${comparison.ci[1].toFixed(4)}], n=${comparison.n} casos.`
    );
  }
  lines.push('');
  lines.push('## Casos donde D perdió');
  lines.push('');
  const groups = grouped(results);
  const lost = [];
  for (const [caseId, byConfig] of groups.entries()) {
    if (!byConfig.D?.length) continue;
    const d = mean(byConfig.D);
    const bestBaseline = Math.max(byConfig.B?.length ? mean(byConfig.B) : 0, byConfig.C?.length ? mean(byConfig.C) : 0);
    if (d < bestBaseline) {
      lost.push(`- ${caseId}: D ${d.toFixed(2)} vs B ${(byConfig.B?.length ? mean(byConfig.B) : 0).toFixed(2)} / C ${(byConfig.C?.length ? mean(byConfig.C) : 0).toFixed(2)}`);
    }
  }
  if (lost.length) lines.push(...lost);
  else lines.push('- Ninguno con los datos disponibles.');
  lines.push('');
  lines.push('## Lectura honesta');
  lines.push('');
  lines.push('D solo se declara mejor si el límite inferior del IC95% es mayor que 0 contra B y contra C.');
  lines.push('Si la ventaja no se demuestra, el resultado es que no se demuestra; no se convierte en una victoria.');
  return { markdown: `${lines.join('\n')}\n`, decision, aggregates };
}

module.exports = {
  mulberry32,
  mean,
  std,
  pairedBootstrap,
  verdict,
  aggregate,
  buildReport
};

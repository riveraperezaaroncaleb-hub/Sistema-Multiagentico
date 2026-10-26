#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const util = require('node:util');
const { loadConfig, createBudget, callLLM, estimateTokens, LlmError } = require('../src/llm');
const { runPipeline, loadRubric } = require('../src/pipeline');
const generador = require('../src/agents/generador');
const { verifyCode } = require('../src/verifiers/code');
const { validateSchema } = require('../src/verifiers/schema');
const { buildReport } = require('./stats');

const ROOT = path.join(__dirname, '..');
const CASES_FILE = path.join(__dirname, 'cases.json');
const RESULTS_FILE = path.join(__dirname, 'results.jsonl');

function loadCases() {
  const cases = JSON.parse(fs.readFileSync(CASES_FILE, 'utf8'));
  if (!Array.isArray(cases) || cases.length !== 15) {
    throw new Error('cases.json debe tener exactamente 15 casos.');
  }
  const ids = new Set();
  for (const item of cases) {
    if (!item.id || ids.has(item.id)) throw new Error(`Caso inválido o duplicado: ${item.id}`);
    ids.add(item.id);
    if (item.tipo === 'codigo') {
      if (!item.visibles || !item.ocultos) throw new Error(`Caso de código sin tests: ${item.id}`);
    } else if (item.tipo === 'texto') {
      if (!item.schema || !item.esperado) throw new Error(`Caso de texto sin schema/esperado: ${item.id}`);
    } else {
      throw new Error(`Tipo inválido en ${item.id}`);
    }
  }
  return cases;
}

function readResults() {
  if (!fs.existsSync(RESULTS_FILE)) return [];
  return fs
    .readFileSync(RESULTS_FILE, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function appendResult(row) {
  fs.mkdirSync(path.dirname(RESULTS_FILE), { recursive: true });
  fs.appendFileSync(RESULTS_FILE, `${JSON.stringify(row)}\n`);
}

function hash(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex');
}

function budgetTokens(budget) {
  return {
    logicos: budget.logicalTokens,
    facturados: budget.billedTokens,
    costo: budget.billedCostUsd,
    llamadas: budget.calls,
    reintentos: budget.retries,
    fallos: budget.failures
  };
}

function availableMax(budget, messages) {
  const flat = messages.map(message => `${message.role}: ${message.content}`).join('\n');
  const available = budget.tokensLimit - budget.tokensUsed - estimateTokens(flat);
  if (available < 1) throw new LlmError('BUDGET', 'Sin presupuesto para el prompt.');
  return available;
}

function callMaxTokens(budget, messages, config) {
  const available = availableMax(budget, messages);
  const pricesKnown = Number.isFinite(config.priceIn) && Number.isFinite(config.priceOut);
  return pricesKnown ? available : Math.max(1, Math.min(config.maxTokensBench, available));
}

function parseBaseline(content, caseData) {
  if (caseData.tipo === 'codigo') return generador.extractCode(content);
  return JSON.stringify(generador.parseJson(content));
}

async function scoreCase(caseData, output) {
  if (typeof output !== 'string' || !output.trim()) return { ok: false, detalle: 'sin salida' };
  if (caseData.tipo === 'codigo') {
    const result = await verifyCode({ code: output, tests: caseData.ocultos, timeoutMs: 20000 });
    const hidden = result.facts.find(fact => fact.id === 'C2');
    return { ok: hidden?.ok === true, detalle: hidden?.detalle || 'tests ocultos fallidos' };
  }
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    return { ok: false, detalle: 'JSON inválido' };
  }
  const schema = validateSchema(caseData.schema, parsed);
  if (!schema.ok) return { ok: false, detalle: schema.errors.slice(0, 2).join('; ') };
  return { ok: util.isDeepStrictEqual(parsed, caseData.esperado), detalle: 'comparación con esperado' };
}

async function visibleScore(caseData, output) {
  if (caseData.tipo === 'codigo') {
    const result = await verifyCode({ code: output, tests: caseData.visibles, timeoutMs: 20000 });
    const applicable = result.facts.filter(fact => fact.ok !== null);
    return applicable.length ? applicable.filter(fact => fact.ok).length / applicable.length : 0;
  }
  try {
    const parsed = JSON.parse(output);
    return validateSchema(caseData.schema, parsed).ok ? 1 : 0;
  } catch {
    return 0;
  }
}

async function runSingle(caseData, config, rubric, mode) {
  const budget = createBudget(config);
  const basePrompt = generador.buildPrompt({
    task: caseData.tarea,
    tipo: caseData.tipo,
    schema: caseData.schema,
    rubric
  });
  const prompt = mode === 'B'
    ? `${basePrompt}\nAntes de responder, planifica y revisa internamente. Entrega una sola solución completa.`
    : basePrompt;
  const messages = [{ role: 'user', content: prompt }];
  const meta = { expect: caseData.tipo === 'texto' ? 'json' : 'code', schema: caseData.schema, rubric };
  const maxTokens = callMaxTokens(budget, messages, config);
  const result = await callLLM({
    agent: 'generador',
    purpose: mode,
    messages,
    temperature: config.tempGen,
    maxTokens,
    rubricVersion: rubric.version || 'v1',
    runId: `bench-${mode}-${caseData.id}`,
    config,
    budget,
    useCache: config.benchUseCache,
    meta
  });
  const output = parseBaseline(result.content, caseData);
  return {
    output,
    budget,
    status: 'ok',
    motivo: ''
  };
}

async function runSamples(caseData, config, rubric) {
  const budget = createBudget(config);
  let best = null;
  let bestScore = -1;
  let sample = 0;
  let lastError = null;
  while (budget.calls < budget.maxCalls && budget.tokensUsed < budget.tokensLimit) {
    sample++;
    const prompt = generador.buildPrompt({
      task: caseData.tarea,
      tipo: caseData.tipo,
      schema: caseData.schema,
      rubric
    });
    const messages = [{ role: 'user', content: prompt }];
    const remaining = budget.tokensLimit - budget.tokensUsed - estimateTokens(`user: ${prompt}`);
    if (remaining < 1) break;
    try {
      const result = await callLLM({
        agent: 'generador',
        purpose: 'muestra',
        messages,
        temperature: config.tempGen,
        maxTokens: Math.max(1, Math.min(config.maxTokensBench, remaining)),
        rubricVersion: rubric.version || 'v1',
        runId: `bench-C-${caseData.id}-${sample}`,
        config,
        budget,
        useCache: config.benchUseCache,
        meta: { expect: caseData.tipo === 'texto' ? 'json' : 'code', schema: caseData.schema, rubric }
      });
      const output = parseBaseline(result.content, caseData);
      const score = await visibleScore(caseData, output);
      if (score > bestScore) {
        bestScore = score;
        best = output;
      }
    } catch (error) {
      if (error instanceof LlmError && ['BUDGET', 'MAX_CALLS', 'MAX_SECONDS'].includes(error.code)) break;
      if (error instanceof LlmError) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  return {
    output: best,
    budget,
    status: best === null ? 'error' : 'ok',
    motivo: best === null ? (lastError?.message || 'ninguna muestra válida') : ''
  };
}

async function runMultiagent(caseData, config) {
  const runId = `bench-D-${caseData.id}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const dConfig = { ...config, modelCritic: config.model, hetero: false };
  const result = await runPipeline({
    task: caseData.tarea,
    tipo: caseData.tipo,
    schema: caseData.schema,
    tests: caseData.visibles,
    config: dConfig,
    useCache: config.benchUseCache,
    runId,
    traceDir: path.join(ROOT, 'traces', 'bench'),
    maxTokensGen: config.maxTokensBench,
    maxTokensCorrector: config.maxTokensBench
  });
  return {
    output: result.mejor,
    tokens: result.tokens,
    status: result.status,
    motivo: result.motivo,
    pipeline: result
  };
}

async function execute(caseData, config, rubric, mode, repetition, benchId) {
  const started = Date.now();
  try {
    let run;
    if (mode === 'D') run = await runMultiagent(caseData, config);
    else if (mode === 'C') run = await runSamples(caseData, config, rubric);
    else run = await runSingle(caseData, config, rubric, mode);

    const score = await scoreCase(caseData, run.output);
    const tokens = run.tokens || budgetTokens(run.budget);
    return {
      benchId,
      repeticion: repetition,
      caseId: caseData.id,
      dificultad: caseData.dificultad,
      tipo: caseData.tipo,
      config: mode,
      puntaje: score.ok ? 1 : 0,
      aprobado: score.ok,
      status: run.status,
      motivo: run.motivo || score.detalle,
      tokens,
      salidaHash: hash(run.output),
      salida: run.output ? String(run.output).slice(0, 2000) : null,
      mock: config.mock,
      duracionMs: Date.now() - started,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      benchId,
      repeticion: repetition,
      caseId: caseData.id,
      dificultad: caseData.dificultad,
      tipo: caseData.tipo,
      config: mode,
      puntaje: 0,
      aprobado: false,
      status: error.code === 'BUDGET' || error.code === 'MAX_CALLS' ? 'presupuesto' : (error.code === 'TIMEOUT' || error.code === 'MAX_SECONDS' ? 'timeout' : 'error'),
      motivo: error.message,
      tokens: { logicos: 0, facturados: 0, costo: null, llamadas: 0, reintentos: 0, fallos: 0 },
      salidaHash: hash(''),
      salida: null,
      mock: config.mock,
      duracionMs: Date.now() - started,
      timestamp: new Date().toISOString()
    };
  }
}

async function runBenchmark({ resume = false, limit = null } = {}) {
  const config = loadConfig();
  if (!config.mock && (!config.apiKey || !config.baseUrl)) {
    throw new Error('Faltan API_KEY/BASE_URL. Usa MOCK=true para validar el arnés.');
  }
  const cases = loadCases();
  const selected = limit ? cases.slice(0, limit) : cases;
  if (!resume && fs.existsSync(RESULTS_FILE)) fs.rmSync(RESULTS_FILE, { force: true });
  const existing = resume ? readResults() : [];
  const done = new Set(existing.map(row => `${row.repeticion}|${row.caseId}|${row.config}`));
  const benchId = `bench-${Date.now()}`;
  const rubricCache = new Map();
  const getRubric = tipo => {
    if (!rubricCache.has(tipo)) rubricCache.set(tipo, loadRubric(tipo));
    return rubricCache.get(tipo);
  };

  for (let repetition = 1; repetition <= config.benchRuns; repetition++) {
    for (const caseData of selected) {
      const rubric = getRubric(caseData.tipo);
      for (const mode of ['A', 'B', 'C', 'D']) {
        const key = `${repetition}|${caseData.id}|${mode}`;
        if (done.has(key)) continue;
        const row = await execute(caseData, config, rubric, mode, repetition, benchId);
        appendResult(row);
        process.stdout.write(
          `${caseData.id} rep=${repetition} ${mode}: ${row.aprobado ? 'OK' : 'FALLO'} ` +
          `tokens=${row.tokens.logicos}/${row.tokens.facturados} status=${row.status}\n`
        );
      }
    }
  }

  const all = readResults();
  const report = buildReport(all, {
    model: config.model,
    tokensPorCaso: config.tokensPorCaso,
    maxTokensBench: config.maxTokensBench,
    benchUseCache: config.benchUseCache,
    pricesKnown: Number.isFinite(config.priceIn) && Number.isFinite(config.priceOut),
    runs: new Set(all.map(row => row.repeticion)).size,
    mock: config.mock
  });
  const file = path.join(ROOT, config.mock ? 'report.MOCK.md' : 'report.md');
  fs.writeFileSync(file, report.markdown);
  process.stdout.write(`\nVeredicto: ${report.decision.label}\nReporte: ${file}\n`);
  return { results: all, report, file };
}

if (require.main === module) {
  const resume = process.argv.includes('--resume');
  const limitIndex = process.argv.indexOf('--limit');
  const parsedLimit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : null;
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;
  runBenchmark({ resume, limit }).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  loadCases,
  scoreCase,
  visibleScore,
  runSingle,
  runSamples,
  runMultiagent,
  execute,
  runBenchmark,
  readResults
};

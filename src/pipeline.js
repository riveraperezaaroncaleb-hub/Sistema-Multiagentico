const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { callLLM, loadConfig, createBudget, estimateTokens, LlmError } = require('./llm');
const generador = require('./agents/generador');
const critico = require('./agents/critico');
const corrector = require('./agents/corrector');
const { verifyCode } = require('./verifiers/code');
const { validateSchema } = require('./verifiers/schema');

const STATUS_BY_CODE = {
  BUDGET: 'presupuesto',
  MAX_CALLS: 'presupuesto',
  MAX_SECONDS: 'timeout',
  TIMEOUT: 'timeout',
  REPLAY: 'error',
  CONFIG: 'error',
  API: 'error',
  NETWORK: 'error',
  PARSE: 'error',
  ERROR: 'error'
};

function loadRubric(tipo) {
  const file = path.join(__dirname, '..', 'rubrics', `${tipo}.json`);
  const rubric = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(rubric.criteria) || !rubric.criteria.length) {
    throw new Error(`Rúbrica inválida: ${file}`);
  }
  const ids = new Set();
  for (const item of rubric.criteria) {
    if (!item.id || ids.has(item.id)) throw new Error(`Criterio inválido o duplicado en ${file}`);
    ids.add(item.id);
  }
  return rubric;
}

function redactValue(value, secret) {
  if (!secret) return value;
  if (typeof value === 'string') return value.split(secret).join('[REDACTED]');
  if (Array.isArray(value)) return value.map(item => redactValue(item, secret));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item, secret)]));
  }
  return value;
}

function createTracer({ runId, dir, apiKey }) {
  const safeId = String(runId).replace(/[^a-zA-Z0-9._-]/g, '_');
  const file = path.join(dir, `${safeId}.jsonl`);
  let ready = false;
  return {
    path: file,
    log(entry) {
      try {
        if (!ready) {
          fs.mkdirSync(dir, { recursive: true });
          ready = true;
        }
        const clean = redactValue({ ts: new Date().toISOString(), runId, ...entry }, apiKey);
        fs.appendFileSync(file, `${JSON.stringify(clean)}\n`);
      } catch {
      }
    }
  };
}

function loadReplay(source) {
  if (source && typeof source.next === 'function') return source;
  const entries = Array.isArray(source)
    ? source
    : fs
        .readFileSync(source, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => JSON.parse(line));
  const responses = entries.filter(entry => entry.tipo === 'respuesta' && typeof entry.contenido === 'string');
  const meta = entries.find(entry => entry.tipo === 'inicio') || {};
  let index = 0;
  return {
    meta,
    next(agent) {
      const entry = responses[index++];
      if (!entry) throw new LlmError('REPLAY', `La traza no tiene respuesta para ${agent}.`);
      if (entry.agente !== agent) {
        throw new LlmError('REPLAY', `Se esperaba ${entry.agente} y el pipeline pidió ${agent}.`);
      }
      return {
        content: entry.contenido,
        usage: entry.tokens || { input: 0, output: 0, total: 0 },
        model: entry.model
      };
    },
    remaining() {
      return responses.length - index;
    }
  };
}

function capMaxTokens(budget, messages, maxTokens) {
  const flat = messages.map(message => `${message.role}: ${message.content}`).join('\n');
  const promptTokens = estimateTokens(flat);
  const available = budget.tokensLimit - budget.tokensUsed - promptTokens;
  if (available < 1) throw new LlmError('BUDGET', 'No queda presupuesto para el prompt de la siguiente llamada.');
  return Math.max(1, Math.min(maxTokens, available));
}

function factMap(facts) {
  return new Map((facts || []).map(fact => [fact.id, fact]));
}

function hashOutput(output) {
  return crypto.createHash('sha256').update(String(output || '')).digest('hex');
}

function combine(rubric, critic, facts, rejectedIds = new Set()) {
  const verified = factMap(facts);
  const byId = new Map((critic.criterios || []).map(item => [item.id, item]));
  const criterios = rubric.criteria.map(item => {
    if (item.verificable_en_codigo) {
      const fact = verified.get(item.id);
      const noAplica = fact?.status === 'no_aplica';
      return {
        id: item.id,
        cumple: noAplica ? null : fact?.ok === true,
        noAplica,
        fuente: 'codigo',
        detalle: fact?.detalle || 'verificador no ejecutado'
      };
    }
    const found = byId.get(item.id);
    const rejected = rejectedIds.has(item.id);
    return {
      id: item.id,
      cumple: rejected ? false : found?.cumple === true,
      noAplica: false,
      fuente: 'critico',
      detalle: rejected ? 'rechazado por el corrector' : (found?.evidencia || 'omitido por el crítico')
    };
  });
  const applicable = criterios.filter(item => !item.noAplica);
  const passed = applicable.filter(item => item.cumple === true).length;
  return {
    criterios,
    puntaje: applicable.length ? passed / applicable.length : 0,
    aprobado: applicable.length > 0 && passed === applicable.length
  };
}

async function runPipeline(options = {}) {
  const config = options.config || loadConfig();
  const replay = options.replay ? loadReplay(options.replay) : null;
  const tipo = options.tipo === 'codigo' ? 'codigo' : (replay?.meta?.tipoTarea === 'codigo' ? 'codigo' : 'texto');
  const rubric = options.rubric || loadRubric(tipo);
  const task = String(options.task || replay?.meta?.task || '').trim();
  const schema = options.schema ?? replay?.meta?.schema ?? null;
  const tests = options.tests ?? replay?.meta?.tests ?? null;
  const runId = options.runId || crypto.randomUUID();
  const budget = options.budget || createBudget(config);
  const tracer = options.trace === false
    ? null
    : createTracer({ runId, dir: options.traceDir || path.join(process.cwd(), 'traces'), apiKey: config.apiKey });
  const mockQueues = options.mockOutputs || null;
  const state = {
    round: 0,
    best: null,
    bestScore: -1,
    bestCriterios: [],
    bestVerificadores: [],
    bestChecks: [],
    bestRechazados: [],
    criterios: [],
    verificadores: [],
    checks: [],
    rechazados: []
  };
  const rejected = new Set();
  let status = 'error';
  let motivo = '';
  tracer?.log({ tipo: 'inicio', task, tipoTarea: tipo, schema, tests: tests || null });

  const nextMock = agent => {
    if (!mockQueues) return undefined;
    const value = mockQueues[agent];
    if (value === undefined) return undefined;
    if (Array.isArray(value)) {
      if (!value.length) return undefined;
      return value.length > 1 ? value.shift() : value[0];
    }
    return value;
  };

  const callAgent = async ({ agent, purpose, messages, temperature, maxTokens, meta = {}, useCache = true, model }) => {
    const capped = capMaxTokens(budget, messages, maxTokens);
    const result = await callLLM({
      agent,
      purpose,
      messages,
      temperature,
      model,
      maxTokens: capped,
      rubricVersion: rubric.version || 'v1',
      runId,
      config,
      budget,
      useCache: useCache && options.useCache !== false,
      meta: { ...meta, mockOutput: nextMock(agent) },
      replay,
      onEvent: event => tracer?.log({
        tipo: 'intento',
        ronda: state.round,
        agente: agent,
        motivo: purpose,
        outcome: event.outcome,
        tokens: event.usage,
        error: event.error
      })
    });
    tracer?.log({
      tipo: 'respuesta',
      ronda: state.round,
      agente: agent,
      motivo: purpose,
      entrada: messages.map(message => message.content).join('\n').slice(0, 1000),
      contenido: result.content,
      tokens: result.usage,
      model: result.model,
      cached: result.cached
    });
    return result;
  };

  const callAndParse = async ({ agent, purpose, messages, temperature, maxTokens, meta, parse, model }) => {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await callAgent({
        agent,
        purpose,
        messages,
        temperature,
        maxTokens,
        meta,
        model,
        useCache: attempt === 0
      });
      try {
        return { result, parsed: parse(result.content) };
      } catch (error) {
        lastError = error;
        tracer?.log({ tipo: 'parse_error', ronda: state.round, agente: agent, motivo: purpose, error: error.message });
      }
    }
    throw Object.assign(new LlmError('PARSE', lastError?.message || 'Salida no parseable.'), { cause: lastError });
  };

  const verifyOutput = async (output, parsedOutput) => {
    if (tipo === 'codigo') {
      return verifyCode({
        code: output,
        tests: tests,
        timeoutMs: options.codeTimeoutMs || 20000
      });
    }
    if (schema) {
      const validation = validateSchema(schema, parsedOutput?.parsed);
      return {
        ok: validation.ok,
        facts: [{
          id: 'C1',
          ok: validation.ok,
          detalle: validation.ok ? 'schema válido' : validation.errors.slice(0, 3).join('; ')
        }],
        checks: [{ name: 'schema', ok: validation.ok, stdout: '', stderr: validation.errors.join('\n') }]
      };
    }
    return {
      ok: true,
      facts: [{ id: 'C1', ok: null, status: 'no_aplica', detalle: 'sin schema' }],
      checks: []
    };
  };

  try {
    if (!task) throw new LlmError('CONFIG', 'Falta --task.');
    const seen = new Set();
    let output = null;
    let roundParsed = null;
    let correctionContext = null;
    let pendingRejections = [];
    let finished = false;

    while (state.round < Math.max(1, config.maxRounds) && !finished) {
      state.round++;
      pendingRejections = [];

      if (state.round === 1) {
        const generated = await callAndParse({
          agent: 'generador',
          purpose: 'generar',
          messages: [{ role: 'user', content: generador.buildPrompt({ task, tipo, schema, rubric }) }],
          temperature: config.tempGen,
          maxTokens: options.maxTokensGen || 1024,
          meta: { expect: tipo === 'texto' ? 'json' : 'code', schema, rubric },
          parse: content => generador.parse({ content, tipo })
        });
        roundParsed = generated.parsed;
        output = tipo === 'codigo' ? roundParsed.code : roundParsed.content;
      } else {
        const corrected = await callAndParse({
          agent: 'corrector',
          purpose: 'corregir',
          messages: [{
            role: 'user',
            content: corrector.buildPrompt({
              task,
              output,
              rubric,
              facts: correctionContext.facts,
              failingIds: correctionContext.failingIds,
              rejectedIds: [...rejected]
            })
          }],
          temperature: config.tempGen,
          maxTokens: options.maxTokensCorrector || 1024,
          model: config.hetero ? config.modelCritic : undefined,
          meta: {
            currentContent: output,
            rubric,
            failingIds: correctionContext.failingIds,
            rejectedIds: [...rejected],
            facts: correctionContext.facts
          },
          parse: content => corrector.parse(content, { tipo })
        });
        pendingRejections = corrected.parsed.rechazados || [];
        roundParsed = corrected.parsed;
        output = corrected.parsed.content;
      }

      const hash = hashOutput(output);
      if (seen.has(hash)) {
        status = 'repeticion';
        motivo = 'La salida se repitió exactamente; se detuvo el bucle.';
        finished = true;
        break;
      }
      seen.add(hash);

      if (pendingRejections.length) {
        const nonVerifiable = new Set(
          rubric.criteria.filter(item => !item.verificable_en_codigo).map(item => item.id)
        );
        const valid = pendingRejections.filter(id => nonVerifiable.has(id) && !rejected.has(id));
        const accepted = valid.slice(0, 1);
        accepted.forEach(id => rejected.add(id));
        const ignored = pendingRejections.filter(id => !accepted.includes(id));
        if (ignored.length) {
          tracer?.log({ tipo: 'rechazo_ignorado', ronda: state.round, agente: 'corrector', ids: ignored });
        }
        if (accepted.length) {
          tracer?.log({ tipo: 'rechazo', ronda: state.round, agente: 'corrector', ids: accepted });
        }
      }

      const verifiers = await verifyOutput(output, roundParsed);
      state.verificadores = verifiers.facts;
      state.checks = verifiers.checks || [];

      const criticFacts = [
        ...verifiers.facts,
        ...[...rejected].map(id => ({ id, ok: false, detalle: 'rechazado por el corrector' }))
      ];
      const critic = await callAndParse({
        agent: 'critico',
        purpose: 'criticar',
        messages: [{
          role: 'user',
          content: critico.buildPrompt({ task, output, rubric, facts: criticFacts })
        }],
        temperature: 0,
        maxTokens: options.maxTokensCritic || 512,
        meta: { rubric, facts: criticFacts, passedIds: verifiers.facts.filter(f => f.ok).map(f => f.id) },
        parse: content => critico.parse(content, rubric)
      });

      const combined = combine(rubric, critic.parsed, verifiers.facts, rejected);
      state.criterios = combined.criterios;
      const previousBest = state.bestScore;
      const improved = combined.puntaje > previousBest;

      if (improved) {
        state.best = output;
        state.bestScore = combined.puntaje;
        state.bestCriterios = combined.criterios;
        state.bestVerificadores = verifiers.facts;
        state.bestChecks = verifiers.checks || [];
        state.bestRechazados = [...rejected];
      }

      if (combined.aprobado) {
        status = 'aprobado';
        motivo = critic.parsed.motivo || 'Todos los criterios aplicables cumplen.';
        finished = true;
        break;
      }
      if (state.round > 1 && !improved) {
        status = 'sin_mejora';
        motivo = `El puntaje no mejoró (${Number(combined.puntaje.toFixed(4))} vs ${Number(previousBest.toFixed(4))}).`;
        finished = true;
        break;
      }
      if (state.round >= Math.max(1, config.maxRounds)) {
        status = 'rondas';
        motivo = 'Se alcanzó MAX_ROUNDS sin aprobar.';
        finished = true;
        break;
      }

      const failing = combined.criterios.filter(item => item.cumple !== true);
      correctionContext = {
        failingIds: failing.map(item => item.id),
        facts: combined.criterios.map(item => ({
          id: item.id,
          ok: item.cumple === true,
          status: item.noAplica ? 'no_aplica' : undefined,
          detalle: item.detalle
        }))
      };
      tracer?.log({
        tipo: 'turno',
        ronda: state.round,
        status: 'no_aprobado',
        puntaje: combined.puntaje,
        failingIds: correctionContext.failingIds,
        rechazados: [...rejected]
      });
    }

    if (!finished && status === 'error') {
      status = 'rondas';
      motivo = 'Se alcanzó MAX_ROUNDS sin aprobar.';
    }
  } catch (error) {
    status = STATUS_BY_CODE[error.code] || 'error';
    motivo = error.message;
    if (error.code === 'BUDGET' || error.code === 'MAX_CALLS') status = 'presupuesto';
    if (error.code === 'MAX_SECONDS' || error.code === 'TIMEOUT') status = 'timeout';
  }

  state.rechazados = state.bestRechazados;
  const tokens = {
    logicos: budget.logicalTokens,
    facturados: budget.billedTokens,
    costo: budget.billedCostUsd,
    llamadas: budget.calls,
    reintentos: budget.retries,
    fallos: budget.failures
  };
  const result = {
    status,
    mejor: state.best,
    puntaje: state.bestScore < 0 ? 0 : Number(state.bestScore.toFixed(4)),
    rondas: state.round,
    tokens,
    motivo,
    runId,
    criterios: state.bestCriterios.length ? state.bestCriterios : state.criterios,
    verificadores: state.bestVerificadores.length ? state.bestVerificadores : state.verificadores,
    checks: state.bestChecks.length ? state.bestChecks : state.checks,
    rechazados: state.rechazados,
    trace: tracer?.path || null
  };
  tracer?.log({
    tipo: 'resultado',
    status,
    motivo,
    puntaje: result.puntaje,
    mejor: state.best ? state.best.slice(0, 4000) : null,
    tokens,
    criterios: result.criterios,
    rechazados: state.rechazados
  });
  return result;
}

module.exports = { runPipeline, loadRubric, combine, loadReplay, createTracer, capMaxTokens };

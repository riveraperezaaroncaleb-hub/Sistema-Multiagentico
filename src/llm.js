const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
require('dotenv').config();

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

class LlmError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
  }
}

function envInt(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) ? value : fallback;
}

function envNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function envBool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return /^(1|true|yes|si|sí)$/i.test(raw);
}

function loadConfig(overrides = {}) {
  const priceIn = envNumber('PRICE_IN_PER_MTOK', null);
  const priceOut = envNumber('PRICE_OUT_PER_MTOK', null);
  const config = {
    baseUrl: process.env.BASE_URL || '',
    apiKey: process.env.API_KEY || '',
    model: process.env.MODEL || 'mock-model',
    modelCritic: process.env.MODEL_CRITIC || process.env.MODEL || 'mock-model',
    hetero: envBool('HETERO', false),
    tempGen: envNumber('TEMP_GEN', 0.7),
    maxRounds: envInt('MAX_ROUNDS', 3),
    maxCallsRun: envInt('MAX_CALLS_RUN', 12),
    maxSecondsRun: envInt('MAX_SECONDS_RUN', 300),
    tokensPorCaso: envInt('TOKENS_POR_CASO', 12000),
    maxTokensBench: envInt('MAX_TOKENS_BENCH', 2048),
    priceIn,
    priceOut,
    benchRuns: envInt('BENCH_RUNS', 3),
    benchUseCache: envBool('BENCH_USE_CACHE', false),
    logLevel: (process.env.LOG_LEVEL || 'info').toLowerCase(),
    mock: envBool('MOCK', false),
    mockScenario: process.env.MOCK_SCENARIO || 'ok',
    cacheDir: process.env.CACHE_DIR || path.join(process.cwd(), '.cache', 'llm'),
    timeoutMs: envInt('LLM_TIMEOUT_MS', 30000),
    maxRetries: envInt('LLM_MAX_RETRIES', 1),
    retryDelayMs: envInt('LLM_RETRY_DELAY_MS', 250)
  };
  return { ...config, ...overrides };
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || '').length / 4));
}

function normalizeUsage(usage, prompt, output) {
  const input = Number.isFinite(usage?.prompt_tokens) ? usage.prompt_tokens : estimateTokens(prompt);
  const outputTokens = Number.isFinite(usage?.completion_tokens)
    ? usage.completion_tokens
    : estimateTokens(output);
  const total = Number.isFinite(usage?.total_tokens) ? usage.total_tokens : input + outputTokens;
  return { input, output: outputTokens, total };
}

function createBudget(config, overrides = {}) {
  const pricesKnown = Number.isFinite(config.priceIn) && Number.isFinite(config.priceOut);
  return {
    tokensLimit: overrides.tokensLimit ?? config.tokensPorCaso,
    tokensUsed: 0,
    calls: 0,
    retries: 0,
    failures: 0,
    maxCalls: overrides.maxCalls ?? config.maxCallsRun,
    maxSeconds: overrides.maxSeconds ?? config.maxSecondsRun,
    startedAt: overrides.startedAt ?? Date.now(),
    logicalTokens: 0,
    billedTokens: 0,
    logicalCostUsd: pricesKnown ? 0 : null,
    billedCostUsd: pricesKnown ? 0 : null
  };
}

function costFor(usage, config) {
  if (!Number.isFinite(config.priceIn) || !Number.isFinite(config.priceOut)) return null;
  return (usage.input / 1_000_000) * config.priceIn + (usage.output / 1_000_000) * config.priceOut;
}

function addCost(current, usage, config) {
  const cost = costFor(usage, config);
  if (cost === null || current === null) return current;
  return Number((current + cost).toFixed(8));
}

function assertBudget(budget, estimatedTokens, config, countCall = true) {
  if (Date.now() - budget.startedAt > budget.maxSeconds * 1000) {
    throw new LlmError('MAX_SECONDS', `Se superó MAX_SECONDS_RUN (${budget.maxSeconds}s).`);
  }
  if (countCall && budget.calls + 1 > budget.maxCalls) {
    throw new LlmError('MAX_CALLS', `Se alcanzó MAX_CALLS_RUN (${budget.maxCalls}).`);
  }
  if (budget.tokensUsed + estimatedTokens > budget.tokensLimit) {
    throw new LlmError('BUDGET', `Presupuesto de tokens agotado (${budget.tokensUsed}/${budget.tokensLimit}).`);
  }
  if (countCall) budget.calls++;
}

function consume(budget, usage, config, { billed = false, countLogical = true } = {}) {
  if (countLogical) {
    budget.tokensUsed += usage.total;
    budget.logicalTokens += usage.total;
    budget.logicalCostUsd = addCost(budget.logicalCostUsd, usage, config);
  }
  if (billed) {
    budget.billedTokens += usage.total;
    budget.billedCostUsd = addCost(budget.billedCostUsd, usage, config);
  }
}

function cacheKey({ model, prompt, temperature, rubricVersion, runId }) {
  return crypto
    .createHash('sha256')
    .update([model, prompt, String(temperature), rubricVersion || 'v1', runId].join('\n'))
    .digest('hex');
}

function readCache(config, key) {
  try {
    const file = path.join(config.cacheDir, `${key}.json`);
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data.content !== 'string' || !data.usage) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(config, key, payload) {
  try {
    fs.mkdirSync(config.cacheDir, { recursive: true });
    fs.writeFileSync(path.join(config.cacheDir, `${key}.json`), JSON.stringify(payload));
  } catch {
    return;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function mockForKind(kind, meta = {}, scenario = 'ok', round = 0) {
  const rubric = meta.rubric || { criteria: [] };
  const criteria = rubric.criteria || [];
  const ids = criteria.map(item => item.id);
  const verifiable = new Map(criteria.map(item => [item.id, Boolean(item.verificable_en_codigo)]));

  if (scenario === 'timeout') {
    throw new LlmError('TIMEOUT', 'Timeout simulado por MOCK_SCENARIO=timeout.');
  }

  if (meta.mockOutput !== undefined) return String(meta.mockOutput);

  if (kind === 'critico') {
    if (scenario === 'json_basura') return 'Esto no es JSON: el crítico falló.';
    if (scenario === 'critico_aprueba_mal') {
      return JSON.stringify({
        aprobado: true,
        criterios: ids.map(id => ({ id, cumple: true, evidencia: 'simulado' })),
        motivo: 'aprobado simulado'
      });
    }
    const passed = new Set(meta.passedIds || []);
    const razon = scenario === 'no_converge' ? 'nunca converge' : 'simulado';
    return JSON.stringify({
      aprobado: false,
      criterios: ids.map(id => ({
        id,
        cumple: scenario === 'ok' ? passed.has(id) : false,
        evidencia: razon
      })),
      motivo: razon
    });
  }

  if (kind === 'corrector') {
    const current = meta.currentContent || '';
    if (scenario === 'salida_repetida') {
      return JSON.stringify({ salida: current, rechazados: [] });
    }
    if (scenario === 'corrector_empeora') {
      return JSON.stringify({ salida: '```js\nmodule.exports = null;\n```', rechazados: [] });
    }
    const marker = `\n// ronda ${round + 1}`;
    return JSON.stringify({ salida: `${current}${marker}`, rechazados: [] });
  }

  if (meta.expect === 'json' && meta.schema) {
    return JSON.stringify(mockJson(meta.schema));
  }
  return ['```javascript', 'module.exports = function solve(value) {', '  return value;', '};', '```'].join('\n');
}

function mockJson(schema) {
  if (!schema || typeof schema !== 'object') return {};
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  if (schema.type === 'object' || schema.properties) {
    const result = {};
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if ((schema.required || []).includes(key)) result[key] = mockJson(child);
    }
    return result;
  }
  if (schema.type === 'array') return [mockJson(schema.items || {})];
  if (schema.type === 'number' || schema.type === 'integer') return 1;
  if (schema.type === 'boolean') return true;
  return 'mock';
}

function pullMock(kind, meta, config) {
  const scenario = meta.mockScenario || config.mockScenario;
  const content = mockForKind(kind, meta, scenario, meta.round || 0);
  const prompt = String(meta.prompt || '');
  return {
    content,
    usage: { input: estimateTokens(prompt), output: estimateTokens(content), total: estimateTokens(prompt) + estimateTokens(content) },
    scenario
  };
}

async function callLLM({
  agent = 'generador',
  purpose = 'llamada',
  messages = [],
  temperature = 0,
  maxTokens = 1024,
  rubricVersion = 'v1',
  runId = 'run',
  model,
  config = loadConfig(),
  budget = createBudget(config),
  useCache = true,
  meta = {},
  replay = null,
  onEvent = null
} = {}) {
  const prompt = messages.map(message => `${message.role}: ${message.content}`).join('\n');
  const selectedModel = model || (agent === 'critico' ? config.modelCritic : config.model);
  const key = cacheKey({ model: selectedModel, prompt, temperature, rubricVersion, runId });
  const emit = event => {
    if (typeof onEvent === 'function') onEvent(event);
  };

  if (replay) {
    const recorded = replay.next(agent);
    if (!recorded) throw new LlmError('REPLAY', `Falta la respuesta grabada para ${agent}.`);
    const usage = recorded.usage || { input: 0, output: 0, total: 0 };
    assertBudget(budget, usage.total, config);
    consume(budget, usage, config, { billed: false });
    emit({ agent, purpose, usage, billed: false, cached: false, replay: true, outcome: 'ok' });
    return { content: recorded.content, model: recorded.model || selectedModel, usage, cached: false, replay: true };
  }

  if (useCache) {
    const cached = readCache(config, key);
    if (cached) {
      assertBudget(budget, cached.usage.total, config, false);
      consume(budget, cached.usage, config, { billed: false });
      emit({ agent, purpose, usage: cached.usage, billed: false, cached: true, outcome: 'cache' });
      return { content: cached.content, model: cached.model || selectedModel, usage: cached.usage, cached: true };
    }
  }

  const estimated = estimateTokens(prompt) + maxTokens;
  let lastError = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    assertBudget(budget, estimated, config, true);
    if (attempt > 0) budget.retries++;
    let failureCounted = false;
    const failedUsage = { input: estimateTokens(prompt), output: 0, total: estimateTokens(prompt) };
    const countFailure = billed => {
      if (failureCounted) return;
      failureCounted = true;
      budget.failures++;
      consume(budget, failedUsage, config, { billed });
      emit({ agent, purpose, usage: failedUsage, billed, outcome: 'error', error: lastError?.code || 'ERROR' });
    };

    if (config.mock) {
      try {
        const mocked = pullMock(agent, { ...meta, prompt }, config);
        consume(budget, mocked.usage, config, { billed: false });
        writeCache(config, key, {
          content: mocked.content,
          usage: mocked.usage,
          model: selectedModel,
          scenario: mocked.scenario
        });
        emit({ agent, purpose, usage: mocked.usage, billed: false, cached: false, outcome: 'mock', scenario: mocked.scenario });
        return { content: mocked.content, model: selectedModel, usage: mocked.usage, cached: false, scenario: mocked.scenario };
      } catch (error) {
        lastError = error instanceof LlmError ? error : new LlmError('ERROR', error.message);
        countFailure(false);
        throw lastError;
      }
    }

    if (!config.apiKey) throw new LlmError('CONFIG', 'Falta API_KEY para llamar al proveedor real.');
    if (!config.baseUrl) throw new LlmError('CONFIG', 'Falta BASE_URL para llamar al proveedor real.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const endpoint = /\/chat\/completions$/.test(config.baseUrl)
        ? config.baseUrl
        : `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({ model: selectedModel, messages, temperature, max_tokens: maxTokens }),
        redirect: 'error',
        signal: controller.signal
      });

      if (!response.ok) {
        lastError = new LlmError('API', `El proveedor respondió HTTP ${response.status}.`);
        countFailure(true);
        if (RETRYABLE_STATUS.has(response.status) && attempt < config.maxRetries) {
          await sleep(config.retryDelayMs * 2 ** attempt);
          continue;
        }
        throw lastError;
      }

      let data;
      try {
        data = await response.json();
      } catch {
        throw new LlmError('PARSE', 'La respuesta del proveedor no es JSON válido.');
      }
      const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text;
      if (typeof content !== 'string' || !content.trim()) {
        throw new LlmError('PARSE', 'El proveedor no devolvió contenido.');
      }
      const usage = normalizeUsage(data.usage, prompt, content);
      consume(budget, usage, config, { billed: true });
      writeCache(config, key, { content, usage, model: data.model || selectedModel });
      emit({ agent, purpose, usage, billed: true, cached: false, outcome: 'ok' });
      return { content, model: data.model || selectedModel, usage, cached: false };
    } catch (error) {
      const isTimeout = error.name === 'AbortError' || error.code === 'TIMEOUT';
      if (isTimeout) {
        lastError = new LlmError('TIMEOUT', `Timeout de ${config.timeoutMs}ms en la llamada.`);
      } else if (error instanceof LlmError) {
        lastError = error;
      } else {
        lastError = new LlmError('NETWORK', `Error de red: ${error.message}`);
      }

      const retryable = isTimeout || !(error instanceof LlmError) || error.code === 'PARSE';
      countFailure(true);
      if (retryable && attempt < config.maxRetries) {
        await sleep(config.retryDelayMs * 2 ** attempt);
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new LlmError('ERROR', 'Llamada fallida.');
}

module.exports = {
  callLLM,
  loadConfig,
  createBudget,
  estimateTokens,
  cacheKey,
  LlmError
};

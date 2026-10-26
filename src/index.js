#!/usr/bin/env node
const fs = require('node:fs');
const { loadConfig } = require('./llm');
const { runPipeline } = require('./pipeline');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[key] = next;
      index++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  if (args.mock) config.mock = true;
  if (args.scenario) config.mockScenario = String(args.scenario);
  if (args['run-id']) config.runId = String(args['run-id']);

  if (!args.replay && !args.task) {
    throw new Error('Falta --task o --replay.');
  }

  const options = {
    task: args.task ? String(args.task) : '',
    tipo: args.tipo === 'codigo' ? 'codigo' : 'texto',
    replay: args.replay ? String(args.replay) : null,
    schema: args.schema ? readJson(String(args.schema)) : null,
    tests: args.tests ? fs.readFileSync(String(args.tests), 'utf8') : null,
    traceDir: args['trace-dir'] ? String(args['trace-dir']) : undefined,
    runId: args['run-id'] ? String(args['run-id']) : undefined,
    config
  };

  const result = await runPipeline(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.status === 'aprobado' ? 0 : 1;
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({ status: 'error', motivo: error.message })}\n`);
  process.exitCode = 1;
});

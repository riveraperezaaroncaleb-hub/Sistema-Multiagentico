const http = require('node:http');
const { loadConfig } = require('./llm');
const { runPipeline } = require('./pipeline');

const MAX_BODY = 1024 * 1024;

function sendJson(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      const error = new Error('Cuerpo mayor a 1 MB.');
      error.code = 'BODY_TOO_LARGE';
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function createServer({ config } = {}) {
  const baseConfig = config || loadConfig();
  return http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method !== 'POST' || req.url !== '/run') {
      sendJson(res, 404, { status: 'error', motivo: 'Ruta no encontrada.' });
      return;
    }
    try {
      const raw = await readBody(req);
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        sendJson(res, 400, { status: 'error', motivo: 'JSON inválido.' });
        return;
      }
      if (!body.task && !body.replay) {
        sendJson(res, 400, { status: 'error', motivo: 'Falta task o replay.' });
        return;
      }
      const result = await runPipeline({
        task: body.task ? String(body.task) : '',
        tipo: body.tipo === 'codigo' ? 'codigo' : 'texto',
        schema: body.schema || null,
        tests: typeof body.tests === 'string' ? body.tests : null,
        replay: body.replay || null,
        runId: body.runId ? String(body.runId) : undefined,
        config: baseConfig
      });
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, error.code === 'BODY_TOO_LARGE' ? 413 : 400, {
        status: 'error',
        motivo: error.message
      });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const server = createServer();
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`Servidor en http://127.0.0.1:${port}\n`);
  });
}

module.exports = { createServer, readBody, sendJson };

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const MAX_OUTPUT = 1024 * 1024;
const BLOCKED = [
  /\brequire\s*\(\s*['"](?:node:)?(?:child_process|worker_threads|cluster|net|http|https|tls|dgram|vm|inspector)['"]\s*\)/i,
  /\bfrom\s+['"](?:node:)?(?:child_process|worker_threads|cluster|net|http|https|tls|dgram|vm|inspector)['"]/i,
  /\b(?:process\.binding|process\.dlopen|Deno\.|Bun\.spawn|WebSocket|XMLHttpRequest)\b/,
  /\bfetch\s*\(/
];

function cleanEnv() {
  const keys = ['PATH', 'SystemRoot', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE'];
  const env = {};
  for (const key of keys) {
    if (process.env[key]) env[key] = process.env[key];
  }
  env.NODE_ENV = 'test';
  return env;
}

function killTree(child) {
  if (!child || !child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
      env: cleanEnv()
    });
    killer.on('error', () => {});
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      // El proceso ya terminó.
    }
  }
}

function runProcess(args, { cwd, timeoutMs, maxOutput = MAX_OUTPUT } = {}) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: cleanEnv(),
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let overflow = false;
    let settled = false;
    let hardTimer = null;

    const format = text => {
      if (!overflow) return text.slice(0, maxOutput);
      const marker = '\n[truncado]';
      return `${text.slice(0, Math.max(0, maxOutput - marker.length))}${marker}`;
    };

    const finish = (code, signal, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (hardTimer) clearTimeout(hardTimer);
      resolve({
        code: typeof code === 'number' ? code : null,
        signal: signal || null,
        timedOut,
        overflow,
        error: error ? error.message : null,
        stdout: format(stdout),
        stderr: format(stderr)
      });
    };

    const append = (current, text) => {
      if (current.length >= maxOutput) {
        overflow = true;
        return current;
      }
      const room = maxOutput - current.length;
      if (text.length > room) {
        overflow = true;
        return current + text.slice(0, room);
      }
      return current + text;
    };

    const collect = target => chunk => {
      const text = chunk.toString();
      if (target === 'stdout') stdout = append(stdout, text);
      else stderr = append(stderr, text);
    };

    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));
    child.on('error', error => finish(null, null, error));
    child.on('close', (code, signal) => finish(code, signal));

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
      hardTimer = setTimeout(() => finish(null, 'SIGKILL'), 2000);
    }, timeoutMs);
  });
}

function firstLine(text, max = 300) {
  const line = String(text || '').split(/\r?\n/).find(value => value.trim()) || '';
  return line.trim().slice(0, max);
}

function permissionArgs(tempDir) {
  if (process.allowedNodeEnvironmentFlags.has('--permission')) {
    return ['--permission', `--allow-fs-read=${tempDir}`];
  }
  if (process.allowedNodeEnvironmentFlags.has('--experimental-permission')) {
    return ['--experimental-permission', `--allow-fs-read=${tempDir}`];
  }
  return [];
}

async function removeDir(dir) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

async function verifyCode({ code, tests, timeoutMs = 20000 } = {}) {
  const source = String(code || '');
  const facts = [];
  const checks = [];
  if (!source.trim()) {
    return {
      ok: false,
      facts: [
        { id: 'C1', ok: false, detalle: 'código vacío' },
        { id: 'C2', ok: false, detalle: 'código vacío' }
      ],
      checks
    };
  }
  const blocked = BLOCKED.find(pattern => pattern.test(source));
  if (blocked) {
    return {
      ok: false,
      facts: [
        { id: 'C1', ok: false, detalle: 'política: API prohibida en el código' },
        { id: 'C2', ok: false, detalle: 'política: API prohibida en el código' }
      ],
      checks: [{ name: 'blacklist', ok: false, stdout: '', stderr: blocked.source }]
    };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multiagent-code-'));
  try {
    const solution = path.join(tempDir, 'solution.js');
    fs.writeFileSync(solution, source);

    const syntax = await runProcess(['--check', solution], { cwd: tempDir, timeoutMs });
    checks.push({ name: 'syntax', ok: syntax.code === 0, stdout: syntax.stdout, stderr: syntax.stderr, timedOut: syntax.timedOut });
    facts.push({
      id: 'C1',
      ok: syntax.code === 0 && !syntax.timedOut,
      detalle: syntax.timedOut ? 'timeout en node --check' : firstLine(syntax.stderr) || 'sintaxis válida'
    });

    if (typeof tests === 'string' && tests.trim()) {
      const blockedTest = BLOCKED.find(pattern => pattern.test(tests));
      if (blockedTest) {
        checks.push({ name: 'blacklist_tests', ok: false, stdout: '', stderr: blockedTest.source });
        facts.push({ id: 'C2', ok: false, detalle: 'política: API prohibida en los tests' });
      } else {
        const testFile = path.join(tempDir, 'solution.test.js');
        fs.writeFileSync(testFile, tests);
        const permissions = permissionArgs(tempDir);
        if (!permissions.length) {
          checks.push({ name: 'sandbox', ok: false, stdout: '', stderr: 'Node sin modelo de permisos; ejecución sin sandbox' });
        }
        const test = await runProcess([...permissions, testFile], { cwd: tempDir, timeoutMs });
        checks.push({ name: 'tests', ok: test.code === 0, stdout: test.stdout, stderr: test.stderr, timedOut: test.timedOut });
        facts.push({
          id: 'C2',
          ok: test.code === 0 && !test.timedOut,
          detalle: test.timedOut ? 'timeout en tests' : firstLine(test.stderr) || firstLine(test.stdout) || 'tests ok'
        });
      }
    } else {
      facts.push({ id: 'C2', ok: null, status: 'no_aplica', detalle: 'sin tests visibles' });
    }

    const applicable = facts.filter(fact => fact.ok !== null);
    return { ok: applicable.length > 0 && applicable.every(fact => fact.ok === true), facts, checks };
  } finally {
    await removeDir(tempDir);
  }
}

module.exports = { verifyCode, runProcess, killTree, permissionArgs };

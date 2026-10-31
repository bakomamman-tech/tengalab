import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const WEB = join(ROOT, 'src', 'console', 'public');
const DEFAULT_RELEASES = join(homedir(), 'tengalab-releases');

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.css', ['app.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']]
]);

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function reply(res, code, payload) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sameOrigin(req, serverPort) {
  const host = req.headers.host || '';
  const allowed = host === '127.0.0.1:' + serverPort ||
    host === 'localhost:' + serverPort;
  return allowed && req.headers.origin === 'http://' + host;
}

async function newestEvidence(releases) {
  let entries;
  try {
    entries = await readdir(releases, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^judge-demo-[A-Za-z0-9]+$/.test(entry.name)) continue;
    const folder = join(releases, entry.name);
    try {
      const info = await stat(folder);
      candidates.push({ folder, name: entry.name, modified: info.mtimeMs });
    } catch {
      // Ignore directories that disappeared during the listing.
    }
  }
  candidates.sort((a, b) => b.modified - a.modified);

  for (const candidate of candidates.slice(0, 25)) {
    try {
      const names = ['summary.json', 'proof.json', 'proof.json.sha256'];
      for (const name of names) {
        const info = await lstat(join(candidate.folder, name));
        if (!info.isFile() || info.size > 1024 * 1024) throw new Error('Unsafe evidence file');
      }
      const [summaryRaw, proofRaw, checksumRaw] = await Promise.all(
        names.map(name => readFile(join(candidate.folder, name)))
      );
      const match = /^([0-9a-f]{64})\s+\*?proof\.json\s*$/m.exec(checksumRaw.toString('utf8'));
      const summary = JSON.parse(summaryRaw.toString('utf8'));
      const proof = JSON.parse(proofRaw.toString('utf8'));
      const checksumValid = Boolean(match) && match[1] === digest(proofRaw);
      const sameCommit = summary.gitCommit === proof.gitCommit;
      return {
        folder: candidate.name,
        generatedAt: summary.generatedAt || null,
        gitCommit: summary.gitCommit || null,
        baseline: summary.baseline || null,
        generatedRepair: summary.generatedRepair || null,
        negativeControl: summary.negativeControl || null,
        sourceSha256: summary.sourceSha256 || null,
        evidenceSha256: digest(proofRaw),
        verified: checksumValid && sameCommit &&
          proof.verdict === 'ACCEPT_FIXTURE'
      };
    } catch {
      // An incomplete run is not a verified run.
    }
  }
  return null;
}

async function fixtureDetails(root) {
  const [source, previewBytes] = await Promise.all([
    readFile(join(root, 'src/lab/service.mjs'), 'utf8'),
    readFile(join(root, 'demo/fixtures/meta-generated-preview.json'), 'utf8')
  ]);
  const preview = JSON.parse(previewBytes);
  const originalSha256 = digest(source);
  const replacementSha256 = digest(preview.replacementSource || '');
  const valid = preview.targetPath === 'src/lab/service.mjs' &&
    preview.originalSha256 === originalSha256 &&
    preview.replacementSha256 === replacementSha256 &&
    source !== preview.replacementSource;
  return {
    valid,
    targetPath: preview.targetPath,
    originalSha256,
    replacementSha256,
    original: source,
    proposed: preview.replacementSource,
    provenance: 'Recorded Meta Muse Spark 1.3 proposal; no new API call'
  };
}

export function createProofConsoleServer(options = {}) {
  const root = options.root || ROOT;
  const releases = options.releases || DEFAULT_RELEASES;
  const runProcess = options.runProcess || spawn;
  const run = {
    running: false,
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    error: null,
    output: ''
  };
  function append(chunk) {
    run.output = (run.output + chunk.toString('utf8')).slice(-48000);
  }

  const server = createServer(async (req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('content-security-policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");

    const port = server.address()?.port || 4173;
    const host = req.headers.host;
    if (host !== '127.0.0.1:' + port && host !== 'localhost:' + port) {
      return reply(res, 403, { error: 'Local requests only' });
    }

    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      return reply(res, 400, { error: 'Bad request' });
    }

    try {
      if (req.method === 'GET' && assets.has(pathname)) {
        const [name, type] = assets.get(pathname);
        const bytes = await readFile(join(WEB, name));
        res.writeHead(200, { 'content-type': type });
        return res.end(bytes);
      }

      if (req.method === 'GET' && pathname === '/api/status') {
        return reply(res, 200, { run, evidence: await newestEvidence(releases) });
      }

      if (req.method === 'GET' && pathname === '/api/fixture') {
        return reply(res, 200, await fixtureDetails(root));
      }

      if (req.method === 'POST' && pathname === '/api/run') {
        if (!sameOrigin(req, port)) {
          return reply(res, 403, { error: 'Origin verification failed' });
        }
        if (Number(req.headers['content-length'] || 0) > 0 || req.headers['transfer-encoding']) {
          return reply(res, 400, { error: 'Request body is not supported' });
        }
        if (run.running) {
          return reply(res, 409, { error: 'Verification is already running' });
        }
        run.running = true;
        run.startedAt = new Date().toISOString();
        run.finishedAt = null;
        run.exitCode = null;
        run.error = null;
        run.output = '';

        // Only a fixed, locally committed script may be executed. No user input is
        // passed as a command, a path, or an argument. No API keys are inherited.
        const allowed = ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG',
          'LC_ALL', 'XDG_RUNTIME_DIR', 'DOCKER_CONFIG'];
        const env = {};
        for (const name of allowed) {
          if (process.env[name]) env[name] = process.env[name];
        }
        const child = runProcess('bash', [join(root, 'scripts/judge-demo.sh')], {
          cwd: root,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false
        });
        child.stdout?.on('data', append);
        child.stderr?.on('data', append);
        child.on('error', error => {
          run.error = 'Unable to start the verifier: ' + error.message;
          run.running = false;
          run.finishedAt = new Date().toISOString();
        });
        child.on('close', code => {
          run.exitCode = code;
          run.running = false;
          run.finishedAt = new Date().toISOString();
        });
        return reply(res, 202, { started: true });
      }

      return reply(res, 404, { error: 'Not found' });
    } catch (error) {
      console.error('Proof Console error:', error.message);
      return reply(res, 500, { error: 'Unable to load verification data' });
    }
  });
  return server;
}

if (process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createProofConsoleServer();
  const port = 4173;
  server.listen(port, '127.0.0.1', () => {
    console.log('TengaLab Proof Console: http://localhost:' + port);
    console.log('Local-only dashboard. Press Ctrl+C to stop.');
  });
  server.on('error', error => {
    console.error('Proof Console failed to start:', error.message);
    process.exitCode = 1;
  });
}

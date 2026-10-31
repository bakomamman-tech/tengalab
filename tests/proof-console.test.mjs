import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProofConsoleServer } from '../src/console/server.mjs';

async function usingServer(callback, options = {}) {
  const releases = await mkdtemp(join(tmpdir(), 'tengalab-console-test-'));
  const server = createProofConsoleServer({ releases, ...options });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const base = 'http://127.0.0.1:' + server.address().port;
    return await callback(base);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(releases, { recursive: true, force: true });
  }
}

test('console serves real checked fixture and only whitelisted assets', async () => {
  await usingServer(async base => {
    const fixtureResponse = await fetch(base + '/api/fixture');
    assert.equal(fixtureResponse.status, 200);
    const fixture = await fixtureResponse.json();
    assert.equal(fixture.valid, true);
    assert.equal(fixture.targetPath, 'src/lab/service.mjs');
    assert.notEqual(fixture.original, fixture.proposed);

    const html = await fetch(base);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /Don't trust the patch/);
    assert.equal((await fetch(base + '/package.json')).status, 404);
    assert.equal((await fetch(base + '/.env')).status, 404);
  });
});

test('console rejects cross-site verification requests', async () => {
  await usingServer(async base => {
    const response = await fetch(base + '/api/run', {
      method: 'POST',
      headers: { origin: 'https://other.example' }
    });
    assert.equal(response.status, 403);
  });
});

test('console executes only fixed verifier without inheriting model secrets', async () => {
  let invoked = false;
  const runProcess = (command, args, options) => {
    invoked = true;
    assert.equal(command, 'bash');
    assert.equal(args.length, 1);
    assert.match(args[0], /scripts\/judge-demo\.sh$/);
    assert.equal(options.shell, false);
    assert.equal(options.env.MODEL_API_KEY, undefined);
    assert.equal(options.env.GITHUB_TOKEN, undefined);
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    setImmediate(() => {
      child.stdout.write('DEMONSTRATION PASSED\n');
      child.emit('close', 0);
    });
    return child;
  };
  await usingServer(async base => {
    const response = await fetch(base + '/api/run', {
      method: 'POST',
      headers: { origin: base }
    });
    assert.equal(response.status, 202);
    await new Promise(resolve => setTimeout(resolve, 30));
    const status = await (await fetch(base + '/api/status')).json();
    assert.equal(invoked, true);
    assert.equal(status.run.running, false);
    assert.equal(status.run.exitCode, 0);
    assert.match(status.run.output, /DEMONSTRATION PASSED/);
  }, { runProcess });
});

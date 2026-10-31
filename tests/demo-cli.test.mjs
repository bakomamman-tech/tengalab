import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyEvidence } from '../src/lab/evidence-verify.mjs';

const cli = fileURLToPath(
  new URL('../src/repair/demo-cli.mjs', import.meta.url)
);

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'tengalab-cli-'));

  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  return dir;
}

function run(args, cwd) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, MODEL_API_KEY: '' }
  });
}

async function checkEvidence(output) {
  const match = output.match(/^Evidence:\s+(.+)$/m);
  assert.ok(match, 'Evidence path must be printed');

  const result = await verifyEvidence(match[1].trim());
  assert.equal(result.valid, true);
}

test('offline full repair produces ACCEPT', async (t) => {
  const dir = await setup(t);
  const result = run(['--offline'], dir);

  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Repaired: 6\/6/);
  assert.match(result.stdout, /Verdict: ACCEPT/);

  await checkEvidence(result.stdout);
});

test('offline partial repair produces REJECT', async (t) => {
  const dir = await setup(t);
  const result = run(['--offline', '--reject'], dir);

  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Repaired: 5\/6/);
  assert.match(result.stdout, /Verdict: REJECT/);

  await checkEvidence(result.stdout);
});

test('help displays usage without executing repairs', async (t) => {
  const dir = await setup(t);
  const result = run(['--help'], dir);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
  assert.doesNotMatch(result.stdout, /Evidence:/);
});

test('unknown arguments are rejected', async (t) => {
  const dir = await setup(t);
  const result = run(['--unapproved'], dir);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command-line argument/);
});

test('conflicting modes are rejected', async (t) => {
  const dir = await setup(t);
  const result = run(['--offline', '--live'], dir);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Choose offline or live/);
});

test('live mode requires an API key', async (t) => {
  const dir = await setup(t);
  const result = run(['--live'], dir);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /MODEL_API_KEY is required/);
});

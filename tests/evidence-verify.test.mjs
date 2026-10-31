import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { saveEvidence } from '../src/lab/evidence.mjs';
import { verifyEvidence } from '../src/lab/evidence-verify.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'tengalab-proof-'));

  t.after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  return saveEvidence(
    {
      candidate: 'buggy',
      verdict: 'REJECT',
      checks: [{ id: 'burst', pass: false }],
    },
    { dir, label: 'integrity-test' },
  );
}

test('untouched evidence passes verification', async (t) => {
  const { filepath } = await fixture(t);
  const result = await verifyEvidence(filepath);

  assert.equal(result.valid, true);
  assert.equal(result.reason, 'integrity-verified');
});

test('modified experimental results are rejected', async (t) => {
  const { filepath } = await fixture(t);
  const envelope = JSON.parse(await readFile(filepath, 'utf8'));

  envelope.results.verdict = 'ACCEPT';

  await writeFile(filepath, JSON.stringify(envelope));

  const result = await verifyEvidence(filepath);

  assert.equal(result.valid, false);
  assert.equal(result.reason, 'payload-digest-mismatch');
});

test('modified checksum is rejected', async (t) => {
  const { filepath } = await fixture(t);
  const sidecar = filepath.replace(/\.json$/, '.sha256');

  await writeFile(sidecar, `${'0'.repeat(64)}\n`);

  const result = await verifyEvidence(filepath);

  assert.equal(result.valid, false);
  assert.equal(result.reason, 'sidecar-digest-mismatch');
});

test('malformed JSON evidence is rejected', async (t) => {
  const { filepath } = await fixture(t);

  await writeFile(filepath, '{corrupted-json');

  const result = await verifyEvidence(filepath);

  assert.equal(result.valid, false);
  assert.equal(result.reason, 'unreadable-or-malformed-evidence');
});

test('missing checksum is rejected', async (t) => {
  const { filepath } = await fixture(t);
  const sidecar = filepath.replace(/\.json$/, '.sha256');

  await rm(sidecar);

  const result = await verifyEvidence(filepath);

  assert.equal(result.valid, false);
});

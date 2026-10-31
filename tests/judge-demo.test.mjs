import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  PATCH_TARGET,
  validateGeneratedPatch
} from '../src/repair/patch-preview.mjs';

async function fixture() {
  return JSON.parse(
    await readFile(
      'demo/fixtures/meta-generated-preview.json',
      'utf8'
    )
  );
}

test('packaged Meta patch matches its source digest', async () => {
  const preview = await fixture();
  const original = await readFile(PATCH_TARGET, 'utf8');

  const result = validateGeneratedPatch({
    targetPath: preview.targetPath,
    expectedSha256: preview.originalSha256,
    replacementSource: preview.replacementSource
  }, original);

  assert.equal(result.replacementSha256, preview.replacementSha256);
});

test('judge fixture excludes unrelated private data', async () => {
  const preview = await fixture();

  const allowed = new Set([
    'schemaVersion',
    'status',
    'provider',
    'generationTokens',
    'rationale',
    'targetPath',
    'originalSha256',
    'replacementSha256',
    'replacementBytes',
    'replacementSource'
  ]);

  assert.ok(
    Object.keys(preview).every(key => allowed.has(key))
  );

  assert.equal(preview.provider, 'meta:muse-spark-1.3');
  assert.equal(preview.apiKey, undefined);
  assert.equal(preview.baseline, undefined);
});

test('packaged preview does not claim behavioral acceptance', async () => {
  const preview = await fixture();

  assert.equal(preview.status, 'VALIDATED_NOT_EXECUTED');
  assert.equal(preview.targetPath, PATCH_TARGET);
});

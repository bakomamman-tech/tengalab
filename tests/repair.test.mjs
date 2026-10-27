import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  applyRepair,
  evaluateRepair
} from '../src/repair/engine.mjs';

test('unknown repair recipes are rejected', () => {
  assert.throws(
    () => applyRepair('source', 'arbitrary_ai_code'),
    /Repair not permitted/
  );
});

test('lag-only repair fails full verification', async () => {
  const result = await evaluateRepair('lag_only');

  assert.equal(result.report.passed, false);
  assert.equal(result.report.isFullSuite, true);

  const overflow = result.report.results.find(
    r => r.experiment === 'overflow_then_shutdown'
  );

  assert.equal(overflow.passed, false);
});

test('complete repair passes all six invariants', async () => {
  const result = await evaluateRepair('lag_and_shutdown');

  assert.equal(result.report.isFullSuite, true);
  assert.equal(result.report.passing, 6);
  assert.equal(result.report.passed, true);
});

test('repair evaluation preserves original source', async () => {
  const file = new URL('../src/lab/service.mjs', import.meta.url);
  const before = await readFile(file, 'utf8');

  await evaluateRepair('lag_and_shutdown');

  const after = await readFile(file, 'utf8');
  assert.equal(after, before);
});

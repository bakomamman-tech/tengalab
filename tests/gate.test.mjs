import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPERIMENTS, runExperiment } from '../src/lab/experiments.mjs';
import { verifyCandidate } from '../src/lab/verify.mjs';
import { canonicalDigest } from '../src/lab/evidence.mjs';

test('original buggy candidate fails burst and post-overflow invariants', () => {
  assert.equal(runExperiment('steady', 'buggy').passed, true);
  assert.equal(runExperiment('burst', 'buggy').passed, false);
  assert.equal(runExperiment('overflow_then_shutdown', 'buggy').passed, false);
  assert.equal(verifyCandidate('buggy').passed, false);
});

test('naive repair fixes burst but breaks proper shutdown', () => {
  assert.equal(runExperiment('burst', 'naive').passed, true);
  assert.equal(runExperiment('shutdown', 'naive').passed, false);
  assert.equal(runExperiment('close', 'naive').passed, false);
  assert.equal(verifyCandidate('naive').passed, false);
});

test('correct implementation passes all six independent invariants', () => {
  const report = verifyCandidate('correct');
  assert.equal(report.total, Object.keys(EXPERIMENTS).length);
  assert.equal(report.total, 6);
  assert.equal(report.passing, 6);
  assert.equal(report.passed, true);
});

test('gate never approves a partial set of passing checks as full acceptance', () => {
  const report = verifyCandidate('naive');
  assert.ok(report.passing > 0);
  assert.ok(report.passing < report.total);
  assert.equal(report.passed, false);
  assert.throws(() => verifyCandidate('correct', []), /At least one/);
  assert.throws(() => verifyCandidate('correct', ['steady', 'steady']), /Duplicate/);
});

test('substantive result SHA256 is reproducible', () => {
  const first = verifyCandidate('correct');
  const second = verifyCandidate('correct');
  assert.equal(canonicalDigest(first), canonicalDigest(second));
});

test('passing only a subset can never grant final acceptance', () => {
  const result = verifyCandidate('correct', ['steady']);
  assert.equal(result.passing, 1);
  assert.equal(result.passed, false);
  assert.equal(result.isFullSuite, false);
});

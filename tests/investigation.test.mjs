import test from 'node:test';
import assert from 'node:assert/strict';
import { investigate } from '../src/agent/investigate.mjs';
import { deterministicDecision } from '../src/agent/deterministic.mjs';

test('deterministic investigator executes every approved experiment', async () => {
  const seen = [];
  const result = await investigate({ candidate: 'correct', onStep: ({ result }) => seen.push(result.experiment) });
  assert.equal(result.accepted, true);
  assert.equal(seen.length, 6);
  assert.equal(new Set(seen).size, 6);
  assert.equal(result.decisions.every((d) => d.provider === 'deterministic-baseline'), true);
});

test('investigator rejects naive repair even after it passes burst', async () => {
  const result = await investigate({ candidate: 'naive' });
  assert.equal(result.accepted, false);
  assert.equal(result.history.find((item) => item.experiment === 'burst').passed, true);
  assert.equal(result.history.find((item) => item.experiment === 'shutdown').passed, false);
});

test('baseline planner cannot select an experiment outside the allowlist', () => {
  assert.throws(() => deterministicDecision([], []), /No experiments/);
});

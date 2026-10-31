import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertObservedSuite
} from '../src/lab/probe-result-gate.mjs';

const names = [
  'steady', 'burst', 'shutdown', 'close',
  'overflow_then_shutdown', 'lag_then_close'
];

const failing = [
  'burst', 'overflow_then_shutdown', 'lag_then_close'
];

const good = {
  steady: { running: true, processed: 3 },
  burst: {
    running: true, laggedBy: 268,
    shutdownRequested: false, channelClosed: false
  },
  shutdown: {
    running: false, exitReason: 'explicit-shutdown',
    shutdownRequested: true
  },
  close: {
    running: false, exitReason: 'channel-closed',
    channelClosed: true
  },
  overflow_then_shutdown: {
    running: false, exitReason: 'explicit-shutdown',
    shutdownRequested: true
  },
  lag_then_close: {
    running: false, exitReason: 'channel-closed',
    laggedBy: 268, channelClosed: true
  }
};

function fixture(mode = 'proposed') {
  const results = names.map(experiment => ({
    experiment,
    observed: { ...good[experiment] },
    passed: true
  }));

  if (mode === 'baseline') {
    for (const item of results.filter(
      item => failing.includes(item.experiment)
    )) {
      item.observed.running = false;
      item.observed.exitReason = 'incorrect-lag-shutdown';
      item.passed = false;
    }
  }

  return {
    mode,
    fullSuite: true,
    total: 6,
    passing: mode === 'baseline' ? 3 : 6,
    verdict: mode === 'baseline' ? 'REJECT' : 'ACCEPT',
    results
  };
}

test('accepts independently checked 6/6 repair', () => {
  assert.equal(
    assertObservedSuite(fixture(), 'proposed', []).passing, 6
  );
});

test('accepts the known 3/6 baseline', () => {
  assert.equal(
    assertObservedSuite(
      fixture('baseline'), 'baseline', failing
    ).passing,
    3
  );
});

test('rejects forged 6/6 labels with buggy observations', () => {
  const run = fixture('baseline');
  run.mode = 'proposed';
  run.passing = 6;
  run.verdict = 'ACCEPT';
  run.results.forEach(item => { item.passed = true; });

  assert.throws(
    () => assertObservedSuite(run, 'proposed', []),
    /Pass flag disagrees/
  );
});

test('rejects a fabricated passing total', () => {
  const run = fixture();
  run.passing = 5;

  assert.throws(
    () => assertObservedSuite(run, 'proposed', []),
    /Passing count/
  );
});

test('rejects duplicated experiment names', () => {
  const run = fixture();
  run.results[5].experiment = 'steady';

  assert.throws(
    () => assertObservedSuite(run, 'proposed', []),
    /Duplicate/
  );
});

test('rejects missing observations', () => {
  const run = fixture();
  run.results[0].observed = null;

  assert.throws(
    () => assertObservedSuite(run, 'proposed', []),
    /Missing observations/
  );
});

test('rejects a fabricated ACCEPT verdict', () => {
  const run = fixture('baseline');
  run.verdict = 'ACCEPT';

  assert.throws(
    () => assertObservedSuite(run, 'baseline', failing),
    /Declared verdict/
  );
});

test('rejects an unexpected baseline failure pattern', () => {
  assert.throws(
    () => assertObservedSuite(
      fixture('baseline'), 'baseline', ['burst']
    ),
    /Unexpected failure pattern/
  );
});

import assert from 'node:assert/strict';

// These rules belong to the trusted verifier, not the model.
// They independently recalculate each recorded test result.
const lagged = o =>
  Number.isSafeInteger(o.laggedBy) && o.laggedBy > 0;

const rules = Object.freeze({
  steady: o =>
    o.running === true && o.processed === 3,

  burst: o =>
    o.running === true && lagged(o) &&
    o.shutdownRequested === false &&
    o.channelClosed === false,

  shutdown: o =>
    o.running === false &&
    o.exitReason === 'explicit-shutdown' &&
    o.shutdownRequested === true,

  close: o =>
    o.running === false &&
    o.exitReason === 'channel-closed' &&
    o.channelClosed === true,

  overflow_then_shutdown: o =>
    o.running === false &&
    o.exitReason === 'explicit-shutdown' &&
    o.shutdownRequested === true,

  lag_then_close: o =>
    o.running === false &&
    o.exitReason === 'channel-closed' &&
    lagged(o) &&
    o.channelClosed === true
});

const names = Object.keys(rules);

export function assertObservedSuite(
  run, expectedMode, expectedFailures
) {
  assert.equal(run?.mode, expectedMode, 'Runner mode mismatch');
  assert.equal(run?.fullSuite, true, 'Incomplete suite');
  assert.equal(run?.total, 6, 'Incorrect suite size');

  assert.ok(
    Array.isArray(run?.results),
    'Missing test observations'
  );

  assert.equal(
    run.results.length, 6,
    'Missing or extra experiments'
  );

  const seen = new Set();
  const failures = [];

  for (const result of run.results) {
    const name = result?.experiment;

    assert.ok(
      Object.hasOwn(rules, name),
      `Unknown experiment: ${name}`
    );

    assert.ok(!seen.has(name), `Duplicate experiment: ${name}`);
    seen.add(name);

    const observed = result.observed;

    assert.ok(
      observed && typeof observed === 'object' &&
      !Array.isArray(observed),
      `Missing observations: ${name}`
    );

    const independentlyPassed = rules[name](observed);

    assert.equal(
      result.passed,
      independentlyPassed,
      `Pass flag disagrees with observations: ${name}`
    );

    if (!independentlyPassed) {
      failures.push(name);
    }
  }

  assert.equal(seen.size, names.length);

  assert.deepEqual(
    failures.sort(),
    [...expectedFailures].sort(),
    'Unexpected failure pattern'
  );

  const passing = names.length - failures.length;

  assert.equal(
    run.passing,
    passing,
    'Passing count mismatch'
  );

  assert.equal(
    run.verdict,
    passing === names.length ? 'ACCEPT' : 'REJECT',
    'Declared verdict disagrees with observations'
  );

  return Object.freeze({
    passing,
    total: names.length
  });
}

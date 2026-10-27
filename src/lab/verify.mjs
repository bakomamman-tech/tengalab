import { EXPERIMENTS, runExperiment } from './experiments.mjs';

export function verifyCandidate(candidate, names = Object.keys(EXPERIMENTS)) {
  if (!Array.isArray(names) || names.length === 0) throw new Error('At least one experiment is required');
  if (new Set(names).size !== names.length) throw new Error('Duplicate experiment names');
  const required = Object.keys(EXPERIMENTS);
  const isFullSuite = names.length === required.length && required.every((name) => names.includes(name));
  const results = names.map((name) => runExperiment(name, candidate));
  return {
    candidate,
    passed: isFullSuite && results.every((r) => r.passed),
    isFullSuite,
    passing: results.filter((r) => r.passed).length,
    total: results.length,
    results,
    policy: 'ALL six required invariants must be run and pass; partial suites never grant acceptance',
  };
}

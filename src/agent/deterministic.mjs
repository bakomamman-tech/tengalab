const PRIORITY = ['steady', 'burst', 'shutdown', 'close', 'overflow_then_shutdown', 'lag_then_close'];

/** An honest local baseline, NOT an AI. */
export function deterministicDecision(available, history) {
  const nextExperiment = PRIORITY.find((name) => available.includes(name));
  if (!nextExperiment) throw new Error('No experiments remaining');
  const last = history.at(-1);
  return {
    nextExperiment,
    rationale: last?.passed === false
      ? `Prior ${last.experiment} check failed; attempt an independent invariant check.`
      : 'Follow the fixed baseline experiment sequence.',
    provider: 'deterministic-baseline',
  };
}

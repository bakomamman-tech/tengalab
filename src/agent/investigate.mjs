import { EXPERIMENTS, runExperiment } from '../lab/experiments.mjs';
import { deterministicDecision } from './deterministic.mjs';
import { metaDecision } from './meta.mjs';

export async function investigate({ candidate = 'buggy', agent = 'deterministic', onStep = () => {} } = {}) {
  if (!['deterministic', 'meta'].includes(agent)) throw new Error('Unsupported agent');
  const available = Object.keys(EXPERIMENTS);
  const history = [];
  const decisions = [];
  while (available.length) {
    const decision = agent === 'meta'
      ? await metaDecision({ available: [...available], history, candidate })
      : deterministicDecision([...available], history);
    // The tool-dispatch gate is independent of the planner.
    const idx = available.indexOf(decision.nextExperiment);
    if (idx === -1) throw new Error('Planner attempted a disallowed experiment');
    available.splice(idx, 1);
    const result = runExperiment(decision.nextExperiment, candidate);
    history.push(result);
    decisions.push(decision);
    onStep({ decision, result, completed: history.length, total: Object.keys(EXPERIMENTS).length });
  }
  return {
    candidate,
    agent,
    accepted: history.every((result) => result.passed),
    policy: 'ALL required experiments must pass before candidate acceptance',
    history,
    decisions,
  };
}

import { EventService } from './service.mjs';

/** Each experiment is fresh: no test inherits state from another. */
export const EXPERIMENTS = Object.freeze({
  steady: {
    purpose: 'Verify normal traffic does not terminate the service',
    hypothesis: 'A few normal events should be processed without shutting down',
    run: (service) => {
      for (let i = 0; i < 3; i++) service.pushNormalEvent(i);
      for (let i = 0; i < 3; i++) service.step();
    },
    expect: (s) => s.running && s.processed === 3,
    invariant: 'running=true AND processed=3',
  },
  burst: {
    purpose: 'Try to falsify the claim that ordinary event bursts are harmless',
    hypothesis: 'Receiver lag must not be interpreted as a shutdown request',
    run: (service) => {
      for (let i = 0; i < 300; i++) service.pushNormalEvent(i);
      service.step();
    },
    expect: (s) => s.running && s.laggedBy > 0,
    invariant: 'running=true AND laggedBy>0',
  },
  shutdown: {
    purpose: 'Check that a normal, explicit shutdown still works',
    hypothesis: 'Repairing overflow must not disable legitimate shutdown',
    run: (service) => {
      for (let i = 0; i < 3; i++) service.pushNormalEvent(i);
      for (let i = 0; i < 3; i++) service.step();
      service.requestShutdown();
      service.step();
    },
    expect: (s) => !s.running && s.exitReason === 'explicit-shutdown',
    invariant: 'running=false AND exitReason=explicit-shutdown',
  },
  close: {
    purpose: 'Check that a permanently closed channel terminates the service',
    hypothesis: 'Closed is a terminal state; Lagged is not',
    run: (service) => { service.closeChannel(); service.step(); },
    expect: (s) => !s.running && s.exitReason === 'channel-closed',
    invariant: 'running=false AND exitReason=channel-closed',
  },
  overflow_then_shutdown: {
    purpose: 'Ensure explicit shutdown is not lost behind an event overflow',
    hypothesis: 'A sticky control-plane shutdown works despite queued-event loss',
    run: (service) => {
      for (let i = 0; i < 300; i++) service.pushNormalEvent(i);
      service.requestShutdown();
      service.step();
    },
    expect: (s) => !s.running && s.exitReason === 'explicit-shutdown',
    invariant: 'running=false AND exitReason=explicit-shutdown',
  },
  lag_then_close: {
    purpose: 'Check closure after a recoverable overflow',
    hypothesis: 'The consumer survives lag but stops once the channel truly closes',
    run: (service) => {
      for (let i = 0; i < 300; i++) service.pushNormalEvent(i);
      service.step(); // returns Lagged to the consumer
      service.closeChannel();
      for (let i = 0; i < 34 && service.running; i++) service.step();
    },
    expect: (s) => !s.running && s.exitReason === 'channel-closed' && s.laggedBy > 0,
    invariant: 'running=false AND exitReason=channel-closed AND laggedBy>0',
  },
});

export function runExperiment(name, candidate, capacity = 32) {
  const spec = EXPERIMENTS[name];
  if (!spec) throw new Error(`Unknown experiment: ${name}`);
  const service = new EventService({ candidate, capacity });
  spec.run(service);
  const observed = service.snapshot();
  return {
    experiment: name,
    candidate,
    purpose: spec.purpose,
    hypothesis: spec.hypothesis,
    invariant: spec.invariant,
    passed: Boolean(spec.expect(observed)),
    observed,
    trace: [...service.trace],
  };
}

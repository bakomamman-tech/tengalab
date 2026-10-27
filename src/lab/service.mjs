import { BoundedChannel } from './channel.mjs';

export const CANDIDATES = Object.freeze(['buggy', 'naive', 'correct']);

/**
 * Three intentionally distinct candidate implementations:
 * buggy: incorrectly treats ordinary receiver lag as fatal.
 * naive:  tolerates lag, but suppresses legitimate termination signals.
 * correct: tolerates lag; honors explicit shutdown and closure.
 *
 * This is a deterministic educational fixture, NOT production message transport.
 */
export class EventService {
  constructor({ candidate = 'buggy', capacity = 32 } = {}) {
    if (!CANDIDATES.includes(candidate)) throw new Error(`Unknown candidate: ${candidate}`);
    this.candidate = candidate;
    this.channel = new BoundedChannel(capacity);
    this.running = true;
    this.exitReason = null;
    this.shutdownRequested = false;
    this.processed = 0;
    this.laggedBy = 0;
    this.trace = [];
  }

  pushNormalEvent(value) {
    this.channel.publish({ kind: 'ordinary', value });
  }

  requestShutdown() {
    // Deliberately model both an in-band message and an out-of-band sticky flag.
    // The correct candidate honors the sticky flag even when the queue overflows.
    this.shutdownRequested = true;
    this.channel.publish({ kind: 'shutdown-requested' });
    this.trace.push('shutdown-signal-requested');
  }

  closeChannel() {
    this.channel.close();
    this.trace.push('channel-closed-by-producer');
  }

  stop(reason) {
    this.running = false;
    this.exitReason = reason;
    this.trace.push(`service-stopped:${reason}`);
  }

  step() {
    if (!this.running) return { kind: 'already-stopped', reason: this.exitReason };

    if (this.candidate === 'correct' && this.shutdownRequested) {
      this.stop('explicit-shutdown');
      return { kind: 'stopped', reason: this.exitReason };
    }

    const event = this.channel.receive();
    if (event.kind === 'lagged') {
      this.laggedBy += event.skipped;
      this.trace.push(`receiver-lagged:${event.skipped}`);
      if (this.candidate === 'buggy') this.stop('incorrect-lag-shutdown');
      return event;
    }

    if (event.kind === 'closed') {
      this.trace.push('receiver-closed');
      if (this.candidate !== 'naive') this.stop('channel-closed');
      return event;
    }

    if (event.kind === 'message') {
      if (event.payload.kind === 'shutdown-requested') {
        this.trace.push('shutdown-message-received');
        if (this.candidate !== 'naive') this.stop('explicit-shutdown');
      } else {
        this.processed += 1;
      }
    }
    return event;
  }

  snapshot() {
    return {
      candidate: this.candidate,
      running: this.running,
      exitReason: this.exitReason,
      processed: this.processed,
      laggedBy: this.laggedBy,
      shutdownRequested: this.shutdownRequested,
      channelClosed: this.channel.closed,
    };
  }
}

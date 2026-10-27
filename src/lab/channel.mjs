/**
 * An original deterministic bounded event channel (not a copy of Atuin).
 * Publishing more events than its capacity makes a consumer fall behind.
 * Lag is an observation; it must not mean the service is shutting down.
 */
export class BoundedChannel {
  constructor(capacity = 32) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0) {
      throw new RangeError('capacity must be a positive safe integer');
    }
    this.capacity = capacity;
    this.items = [];
    this.nextSeq = 1;
    this.cursor = 1;
    this.closed = false;
  }

  publish(payload) {
    if (this.closed) throw new Error('channel is closed');
    this.items.push({ seq: this.nextSeq++, payload });
    if (this.items.length > this.capacity) this.items.shift();
  }

  close() {
    this.closed = true;
  }

  receive() {
    const oldest = this.items[0]?.seq ?? this.nextSeq;
    if (this.cursor < oldest) {
      const skipped = oldest - this.cursor;
      this.cursor = oldest;
      return { kind: 'lagged', skipped };
    }
    const item = this.items.find((entry) => entry.seq === this.cursor);
    if (item) {
      this.cursor += 1;
      return { kind: 'message', seq: item.seq, payload: item.payload };
    }
    return { kind: this.closed ? 'closed' : 'empty' };
  }
}

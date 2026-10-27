import test from 'node:test';
import assert from 'node:assert/strict';
import { BoundedChannel } from '../src/lab/channel.mjs';

test('ordinary burst returns Lagged, then latest events', () => {
  const channel = new BoundedChannel(2);
  channel.publish('a'); channel.publish('b'); channel.publish('c');
  assert.deepEqual(channel.receive(), { kind: 'lagged', skipped: 1 });
  assert.deepEqual(channel.receive(), { kind: 'message', seq: 2, payload: 'b' });
  assert.deepEqual(channel.receive(), { kind: 'message', seq: 3, payload: 'c' });
  assert.deepEqual(channel.receive(), { kind: 'empty' });
});

test('closed channel returns Closed after pending messages are drained', () => {
  const channel = new BoundedChannel(2);
  channel.publish('one'); channel.close();
  assert.equal(channel.receive().kind, 'message');
  assert.deepEqual(channel.receive(), { kind: 'closed' });
  assert.throws(() => channel.publish('later'), /closed/);
});

test('invalid capacity is rejected', () => {
  assert.throws(() => new BoundedChannel(0), RangeError);
  assert.throws(() => new BoundedChannel(NaN), RangeError);
});

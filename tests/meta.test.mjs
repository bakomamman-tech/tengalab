import test from 'node:test';
import assert from 'node:assert/strict';
import { metaDecision } from '../src/agent/meta.mjs';

test('Meta adapter requires opt-in credentials and cannot impersonate success', async () => {
  const old = process.env.MODEL_API_KEY;
  delete process.env.MODEL_API_KEY;
  try {
    await assert.rejects(
      () => metaDecision({ available: ['steady'], history: [], candidate: 'buggy' }),
      /MODEL_API_KEY is not set/,
    );
  } finally {
    if (old !== undefined) process.env.MODEL_API_KEY = old;
  }
});

test('Meta adapter creates a constrained Model API request and validates selection', async (t) => {
  const old = process.env.MODEL_API_KEY;
  process.env.MODEL_API_KEY = 'test-placeholder-never-send';
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls += 1;
    assert.equal(url, 'https://api.meta.ai/v1/chat/completions');
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'muse-spark-1.3');
    assert.deepEqual(body.response_format.json_schema.schema.properties.nextExperiment.enum, ['steady', 'burst']);
    assert.equal(body.response_format.type, 'json_schema');
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({
        nextExperiment: 'burst', rationale: 'Try a larger event burst to challenge liveness.',
      }) } }], usage: { total_tokens: 120 } }),
    };
  });
  try {
    const decision = await metaDecision({ available: ['steady', 'burst'], history: [], candidate: 'buggy' });
    assert.equal(decision.nextExperiment, 'burst');
    assert.equal(decision.provider, 'meta:muse-spark-1.3');
    assert.equal(calls, 1);
  } finally {
    if (old === undefined) delete process.env.MODEL_API_KEY;
    else process.env.MODEL_API_KEY = old;
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  proposeGeneratedPatch
} from '../src/repair/meta-generated-patch.mjs';

import {
  PATCH_TARGET,
  sha256Source
} from '../src/repair/patch-preview.mjs';

const originalSource = 'export const result = 1;\n';
const replacementSource = 'export const result = 2;\n';
const evidence = { failingChecks: ['burst'] };

function validProposal() {
  return {
    targetPath: PATCH_TARGET,
    expectedSha256: sha256Source(originalSource),
    replacementSource,
    rationale: 'Correct the failing event behavior.'
  };
}

function fakeFetch(proposal, {
  status = 200,
  finishReason = 'stop',
  malformed = false
} = {}) {
  return async () => ({
    ok: status === 200,
    status,
    json: async () => ({
      choices: [{
        finish_reason: finishReason,
        message: {
          content: malformed
            ? '{invalid-json'
            : JSON.stringify(proposal)
        }
      }],
      usage: { total_tokens: 120 }
    })
  });
}

function run(fetchImpl, overrides = {}) {
  return proposeGeneratedPatch({
    originalSource,
    evidence,
    apiKey: 'test-key-never-sent-to-network',
    fetchImpl,
    ...overrides
  });
}

test('requires API credentials before making requests', async () => {
  await assert.rejects(
    run(async () => {
      throw new Error('Network must not be called');
    }, { apiKey: '' }),
    /MODEL_API_KEY/
  );
});

test('creates structured Meta request and validates source', async () => {
  let captured;

  const preview = await run(async (url, options) => {
    captured = { url, options };
    return fakeFetch(validProposal())();
  });

  assert.equal(
    captured.url,
    'https://api.meta.ai/v1/chat/completions'
  );

  const body = JSON.parse(captured.options.body);

  assert.equal(body.model, 'muse-spark-1.3');
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(preview.status, 'VALIDATED_NOT_EXECUTED');
  assert.equal(preview.replacementSource, replacementSource);
  assert.equal(preview.provider, 'meta:muse-spark-1.3');
  assert.equal(preview.tokenUsage.total_tokens, 120);
});

test('rejects unauthorized replacement targets', async () => {
  await assert.rejects(
    run(fakeFetch({
      ...validProposal(),
      targetPath: '../.env'
    })),
    /allowlisted/
  );
});

test('rejects a stale source checksum', async () => {
  await assert.rejects(
    run(fakeFetch({
      ...validProposal(),
      expectedSha256: 'a'.repeat(64)
    })),
    /Source changed/
  );
});

test('rejects a replacement that changes nothing', async () => {
  await assert.rejects(
    run(fakeFetch({
      ...validProposal(),
      replacementSource: originalSource
    })),
    /no changes/
  );
});

test('fails closed on HTTP errors', async () => {
  await assert.rejects(
    run(fakeFetch(validProposal(), { status: 401 })),
    /HTTP 401/
  );
});

test('rejects incomplete model completions', async () => {
  await assert.rejects(
    run(fakeFetch(validProposal(), {
      finishReason: 'length'
    })),
    /incomplete/
  );
});

test('rejects malformed model JSON', async () => {
  await assert.rejects(
    run(fakeFetch(validProposal(), {
      malformed: true
    })),
    /malformed/
  );
});

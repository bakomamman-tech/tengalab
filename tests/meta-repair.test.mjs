import test from 'node:test';
import assert from 'node:assert/strict';

import { proposeRepair } from '../src/repair/meta.mjs';
import { verifyCandidate } from '../src/lab/verify.mjs';

const evidence = verifyCandidate('buggy');

function fakeReply(recipeId) {
  return {
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            recipeId,
            rationale: 'Based on observed failures'
          })
        }
      }],
      usage: { total_tokens: 12 }
    })
  };
}

test('planner requires credentials', async () => {
  await assert.rejects(
    proposeRepair({ evidence, apiKey: '' }),
    /MODEL_API_KEY/
  );
});

test('planner accepts an authorized proposal', async () => {
  const result = await proposeRepair({
    evidence,
    apiKey: 'mock-key',
    fetchImpl: async () => fakeReply('lag_and_shutdown')
  });

  assert.equal(result.recipeId, 'lag_and_shutdown');
});

test('planner rejects unauthorized repairs', async () => {
  await assert.rejects(
    proposeRepair({
      evidence,
      apiKey: 'mock-key',
      fetchImpl: async () => fakeReply('arbitrary_code')
    }),
    /unauthorized/
  );
});

test('planner rejects incomplete evidence', async () => {
  await assert.rejects(
    proposeRepair({
      evidence: { ...evidence, isFullSuite: false },
      apiKey: 'mock-key'
    }),
    /full-suite/
  );
});

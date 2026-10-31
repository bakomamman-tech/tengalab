import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mkdtemp,
  readFile,
  rm,
  readdir
} from 'node:fs/promises';

import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  runRepairWithEvidence
} from '../src/repair/evidence-pipeline.mjs';

import {
  verifyEvidence
} from '../src/lab/evidence-verify.mjs';

async function setup(t) {
  const dir = await mkdtemp(
    join(tmpdir(), 'tengalab-pipeline-')
  );

  t.after(async () => {
    await rm(dir, {
      recursive: true,
      force: true
    });
  });

  return dir;
}

function planner(recipeId) {
  return async () => ({
    recipeId,
    rationale: 'Controlled integration test',
    provider: 'test-planner',
    tokenUsage: null
  });
}

test('complete repair generates verified ACCEPT evidence',
  async (t) => {
    const dir = await setup(t);

    const result = await runRepairWithEvidence({
      planner: planner('lag_and_shutdown'),
      evidenceDir: dir
    });

    assert.equal(result.verdict, 'ACCEPT');
    assert.equal(result.repairedPassing, 6);
    assert.equal(result.integrity.valid, true);

    const proof = JSON.parse(
      await readFile(result.filepath, 'utf8')
    );

    assert.equal(proof.results.verdict, 'ACCEPT');
    assert.equal(
      proof.results.proposal.provider,
      'test-planner'
    );

    assert.match(
      proof.results.sourceIntegrity.originalSha256,
      /^[a-f0-9]{64}$/
    );
  }
);

test('partial repair generates verified REJECT evidence',
  async (t) => {
    const dir = await setup(t);

    const result = await runRepairWithEvidence({
      planner: planner('lag_only'),
      evidenceDir: dir
    });

    assert.equal(result.verdict, 'REJECT');
    assert.ok(result.repairedPassing < 6);

    const integrity = await verifyEvidence(
      result.filepath
    );

    assert.equal(integrity.valid, true);
  }
);

test('unauthorized proposal cannot generate approval',
  async (t) => {
    const dir = await setup(t);

    await assert.rejects(
      runRepairWithEvidence({
        planner: planner('arbitrary_ai_code'),
        evidenceDir: dir
      }),
      /Unauthorized repair proposal/
    );

    assert.deepEqual(await readdir(dir), []);
  }
);

test('planner failure cannot become accepted evidence',
  async (t) => {
    const dir = await setup(t);

    await assert.rejects(
      runRepairWithEvidence({
        planner: async () => {
          throw new Error('Model unavailable');
        },
        evidenceDir: dir
      }),
      /Model unavailable/
    );

    assert.deepEqual(await readdir(dir), []);
  }
);

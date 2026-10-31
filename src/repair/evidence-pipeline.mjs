import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { verifyCandidate } from '../lab/verify.mjs';
import { saveEvidence } from '../lab/evidence.mjs';
import { verifyEvidence } from '../lab/evidence-verify.mjs';

import {
  applyRepair,
  evaluateRepair,
  REPAIR_IDS
} from './engine.mjs';

import { proposeRepair } from './meta.mjs';

function sha256(value) {
  return createHash('sha256')
    .update(value)
    .digest('hex');
}

function completeReport(report) {
  return (
    report?.isFullSuite === true &&
    Array.isArray(report.results) &&
    report.results.length === 6
  );
}

export async function runRepairWithEvidence({
  planner = proposeRepair,
  evidenceDir = 'evidence',
  label = 'repair-attempt'
} = {}) {

  // Stage 1: Independently establish the failure.
  const baseline = verifyCandidate('buggy');

  if (!completeReport(baseline) ||
      baseline.passed !== false) {
    throw new Error(
      'A failed full-suite baseline is required'
    );
  }

  // Stage 2: Ask the planner to propose a repair.
  // A proposal is never accepted as test evidence.
  const proposal = await planner({
    evidence: baseline
  });

  if (!REPAIR_IDS.includes(proposal?.recipeId)) {
    throw new Error('Unauthorized repair proposal');
  }

  if (typeof proposal.rationale !== 'string' ||
      !proposal.rationale.trim()) {
    throw new Error('Missing repair rationale');
  }

  // Stage 3: Independently evaluate the repair.
  const evaluation = await evaluateRepair(
    proposal.recipeId
  );

  const report = evaluation.report;

  const accepted =
    completeReport(report) &&
    report.passed === true &&
    report.passing === 6 &&
    report.results.every(r => r.passed === true);

  // Stage 4: Record source-code fingerprints.
  const source = await readFile(
    new URL('../lab/service.mjs', import.meta.url),
    'utf8'
  );

  const patchedSource = applyRepair(
    source,
    proposal.recipeId
  );

  // Stage 5: Assemble the evidence record.
  const record = {
    recordType: 'tengalab.repair-attempt.v1',
    scenario: 'receiver-lag-and-shutdown',
    baseline,

    proposal: {
      recipeId: proposal.recipeId,
      rationale: proposal.rationale.trim(),
      provider: proposal.provider ?? 'unspecified',
      tokenUsage: proposal.tokenUsage ?? null
    },

    sourceIntegrity: {
      sourceFile: 'src/lab/service.mjs',
      originalSha256: sha256(source),
      proposedPatchedSha256: sha256(patchedSource)
    },

    verification: report,
    verdict: accepted ? 'ACCEPT' : 'REJECT',

    limitations: [
      'Verification uses a deterministic software fixture.',
      'Source hashes identify content but do not authenticate its author.',
      'Model recommendations are not independent test evidence.',
      'Acceptance applies only to the six approved invariants.'
    ]
  };

  // Stage 6: Persist and immediately check integrity.
  const saved = await saveEvidence(record, {
    dir: evidenceDir,
    label
  });

  const integrity = await verifyEvidence(
    saved.filepath
  );

  if (!integrity.valid) {
    throw new Error(
      `Saved evidence failed integrity check: ${integrity.reason}`
    );
  }

  return {
    verdict: record.verdict,
    recipeId: proposal.recipeId,
    filepath: saved.filepath,
    digest: saved.digest,
    integrity,
    baselinePassing: baseline.passing,
    repairedPassing: report.passing
  };
}

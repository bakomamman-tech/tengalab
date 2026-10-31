import assert from 'node:assert/strict';
import { assertObservedSuite } from '../src/lab/probe-result-gate.mjs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

import {
  validateGeneratedPatch
} from '../src/repair/patch-preview.mjs';

const [previewPath, logPath, outputPath] = process.argv.slice(2);

if (!previewPath || !logPath || !outputPath) {
  throw new Error(
    'Usage: node scripts/record-probe.mjs PREVIEW LOG OUTPUT'
  );
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function extractJson(log, start, end) {
  const sections = log.split(start);
  assert.equal(sections.length, 2, 'Missing or repeated section');

  const parts = sections[1].split(end);
  assert.equal(parts.length, 2, 'Missing or repeated delimiter');

  return JSON.parse(parts[0].trim());
}

const expectedExperiments = new Set([
  'steady',
  'burst',
  'shutdown',
  'close',
  'overflow_then_shutdown',
  'lag_then_close'
]);

function validateResults(result, mode, passing, verdict) {
  assert.equal(result.mode, mode);
  assert.equal(result.fullSuite, true);
  assert.equal(result.total, 6);
  assert.equal(result.passing, passing);
  assert.equal(result.verdict, verdict);

  assert.ok(Array.isArray(result.results));
  assert.equal(result.results.length, 6);

  const names = new Set(result.results.map(
    item => item.experiment
  ));

  assert.deepEqual(names, expectedExperiments);

  for (const item of result.results) {
    assert.equal(typeof item.passed, 'boolean');
  }

  assert.equal(
    result.results.filter(item => item.passed).length,
    passing
  );
}

const rawPreview = await readFile(previewPath);
const rawLog = await readFile(logPath);

assert.ok(rawPreview.length <= 512 * 1024);
assert.ok(rawLog.length <= 1024 * 1024);

const preview = JSON.parse(rawPreview.toString('utf8'));
const log = rawLog.toString('utf8');

const baseline = extractJson(
  log,
  '=== ISOLATED ORIGINAL BASELINE ===',
  '=== VALIDATE AND STAGE GENERATED SOURCE ==='
);

const proposed = extractJson(
  log,
  '=== ISOLATED META-GENERATED REPAIR ===',
  '=== EXPERIMENT COMPLETE ==='
);

validateResults(baseline, 'baseline', 3, 'REJECT');
validateResults(proposed, 'proposed', 6, 'ACCEPT');

const originalSource = await readFile(
  'src/lab/service.mjs', 'utf8'
);

const validated = validateGeneratedPatch({
  targetPath: preview.targetPath,
  expectedSha256: preview.originalSha256,
  replacementSource: preview.replacementSource
}, originalSource);

assert.equal(
  validated.replacementSha256,
  preview.replacementSha256
);

assert.equal(preview.status, 'VALIDATED_NOT_EXECUTED');
assert.ok(
  log.includes(`Patch SHA256: ${validated.replacementSha256}`)
);

const commit = execFileSync(
  'git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }
).trim();

const imageId = execFileSync(
  '/usr/bin/docker',
  [
    '--context', 'rootless',
    'image', 'inspect',
    '--format', '{{.Id}}',
    'node:22-bookworm-slim'
  ],
  { encoding: 'utf8' }
).trim();

// Recompute truth from recorded observations, not pass labels.
assertObservedSuite(
  baseline,
  'baseline',
  ['burst', 'overflow_then_shutdown', 'lag_then_close']
);

assertObservedSuite(
  proposed,
  'proposed',
  []
);

const report = {
  schemaVersion: 1,
  experiment: 'tengalab-live-generated-repair',
  recordedAt: new Date().toISOString(),
  provider: preview.provider,
  modelRationale: preview.rationale,
  gitCommit: commit,
  containerImageId: imageId,
  originalSha256: validated.originalSha256,
  replacementSha256: validated.replacementSha256,
  previewFileSha256: sha256(rawPreview),
  executionLogSha256: sha256(rawLog),
  baseline,
  proposed,
  verdict: 'ACCEPT_FIXTURE',
  limitations: [
    'Acceptance covers six deterministic fixture tests only',
    'Container execution is not proof against malicious code',
    'SHA-256 checks detect changes but do not authenticate origin',
    'The report records supplied runner output, not an independently attested execution',
    'The container image identifier was inspected when recording'
  ]
};

const bytes = Buffer.from(
  JSON.stringify(report, null, 2) + '\n'
);

await writeFile(outputPath, bytes, {
  flag: 'wx',
  mode: 0o600
});

await writeFile(
  `${outputPath}.sha256`,
  `${sha256(bytes)}  ${basename(outputPath)}\n`,
  { flag: 'wx', mode: 0o600 }
);

console.log('EVIDENCE CHECK: PASSED');
console.log('Verdict:', report.verdict);
console.log('Git commit:', commit);
console.log('Source SHA256:', validated.replacementSha256);
console.log('Evidence:', outputPath);
console.log('Evidence SHA256:', sha256(bytes));

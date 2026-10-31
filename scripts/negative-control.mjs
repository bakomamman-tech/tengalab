import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  access, mkdir, mkdtemp, readFile, writeFile
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  PATCH_TARGET,
  sha256Source,
  validateGeneratedPatch
} from '../src/repair/patch-preview.mjs';

const root = process.cwd();
const releases = join(homedir(), 'tengalab-releases');

await mkdir(releases, { recursive: true });

const directory = await mkdtemp(
  join(releases, 'negative-control-')
);

const original = await readFile(PATCH_TARGET, 'utf8');

// Intentionally makes a textual change, not a behavioral repair.
const replacement = original +
  '\n// TengaLab negative control: defect deliberately remains.\n';

const validated = validateGeneratedPatch({
  targetPath: PATCH_TARGET,
  expectedSha256: sha256Source(original),
  replacementSource: replacement
}, original);

const previewPath = join(directory, 'preview.json');
const logPath = join(directory, 'probe.log');
const reportPath = join(directory, 'proof.json');

await writeFile(previewPath, JSON.stringify({
  ...validated,
  provider: 'local:negative-control',
  rationale: 'No behavioral repair; deliberately unchanged logic'
}, null, 2), { mode: 0o600 });

const env = { ...process.env };
delete env.MODEL_API_KEY;
delete env.OPENROUTER_API_KEY;

const probe = spawnSync('bash', [
  'scripts/probe-generated-patch.sh',
  previewPath
], {
  cwd: root,
  env,
  encoding: 'utf8',
  timeout: 120000,
  maxBuffer: 2 * 1024 * 1024
});

await writeFile(logPath, probe.stdout ?? '', {
  mode: 0o600
});

if (probe.status !== 0) {
  throw new Error(
    'Container probe failed unexpectedly: ' +
    (probe.stderr || probe.error?.message || probe.status)
  );
}

function extract(start, end) {
  const sections = probe.stdout.split(start);
  assert.equal(sections.length, 2);

  const parts = sections[1].split(end);
  assert.equal(parts.length, 2);

  return JSON.parse(parts[0].trim());
}

const baseline = extract(
  '=== ISOLATED ORIGINAL BASELINE ===',
  '=== VALIDATE AND STAGE GENERATED SOURCE ==='
);

const proposed = extract(
  '=== ISOLATED META-GENERATED REPAIR ===',
  '=== EXPERIMENT COMPLETE ==='
);

assert.equal(baseline.passing, 3);
assert.equal(baseline.verdict, 'REJECT');

assert.equal(proposed.passing, 3);
assert.equal(proposed.verdict, 'REJECT');

const recorder = spawnSync(
  process.execPath,
  [
    'scripts/record-probe.mjs',
    previewPath,
    logPath,
    reportPath
  ],
  {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 20000
  }
);

await writeFile(
  join(directory, 'recorder-stderr.txt'),
  recorder.stderr ?? '',
  { mode: 0o600 }
);

assert.notEqual(
  recorder.status, 0,
  'SECURITY FAILURE: recorder accepted the defective patch'
);

assert.match(
  recorder.stderr ?? '',
  /3 !== 6/,
  'Recorder failed for a reason other than the expected failing score'
);

await assert.rejects(
  access(reportPath),
  { code: 'ENOENT' },
  'SECURITY FAILURE: accepted proof file exists'
);

console.log('\nTENGALAB ADVERSARIAL NEGATIVE CONTROL');
console.log('Model API calls: NONE');
console.log(`Baseline: ${baseline.passing}/6 REJECT`);
console.log(`Modified patch: ${proposed.passing}/6 REJECT`);
console.log('Static validation: PASSED');
console.log('Behavioral acceptance: DENIED');
console.log('Incorrect ACCEPT proof: NOT CREATED');
console.log('NEGATIVE CONTROL: PASSED');
console.log('Experiment directory:', directory);

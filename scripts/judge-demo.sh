#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PREVIEW="${1:-demo/fixtures/meta-generated-preview.json}"

if [[ "$PREVIEW" != /* ]]; then
  PREVIEW="$ROOT/$PREVIEW"
fi

if [[ ! -f "$PREVIEW" ]]; then
  echo "ERROR: Demo preview not found" >&2
  exit 1
fi

if [[ -n "${MODEL_API_KEY:-}" ]]; then
  echo "ERROR: Unset MODEL_API_KEY for this offline demo" >&2
  exit 1
fi

mkdir -p "$HOME/tengalab-releases"

OUT="$(mktemp -d "$HOME/tengalab-releases/judge-demo-XXXXXXXX")"

echo
echo "=============================================="
echo "   TENGALAB — INDEPENDENT REPAIR PROOF"
echo '   "Don'"'"'t trust the patch. Prove it."'
echo "=============================================="
echo
echo "Evidence directory: $OUT"
echo

echo "[1/4] Running automated regression tests"

if npm test > "$OUT/unit-tests.log" 2>&1; then
  grep -E '^ℹ (tests|pass|fail) ' \
    "$OUT/unit-tests.log" || true
else
  tail -n 40 "$OUT/unit-tests.log"
  echo "FAIL: Regression tests failed" >&2
  exit 1
fi

echo
echo "[2/4] Running original and Meta-generated repair in Docker"

if ./scripts/probe-generated-patch.sh "$PREVIEW" \
    > "$OUT/positive-probe.log" \
    2> "$OUT/positive-stderr.log"; then
  echo "Container execution completed"
else
  cat "$OUT/positive-stderr.log" >&2
  echo "FAIL: Container verification failed" >&2
  exit 1
fi

echo
echo "[3/4] Independently recording evidence"

node scripts/record-probe.mjs \
  "$PREVIEW" \
  "$OUT/positive-probe.log" \
  "$OUT/proof.json"

(
  cd "$OUT"
  sha256sum -c proof.json.sha256
)

echo
echo "[4/4] Running ineffective-patch negative control"

if node scripts/negative-control.mjs \
    > "$OUT/negative-control.log" 2>&1; then
  grep -E \
    'Baseline:|Modified patch:|Behavioral acceptance:|NEGATIVE CONTROL:' \
    "$OUT/negative-control.log"
else
  cat "$OUT/negative-control.log" >&2
  echo "FAIL: Negative control did not pass" >&2
  exit 1
fi

node --input-type=module - "$OUT" <<'JS'
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const directory = process.argv[2];

const proof = JSON.parse(
  await readFile(join(directory, 'proof.json'), 'utf8')
);

const negative = await readFile(
  join(directory, 'negative-control.log'), 'utf8'
);

assert.equal(proof.baseline.passing, 3);
assert.equal(proof.baseline.verdict, 'REJECT');
assert.equal(proof.proposed.passing, 6);
assert.equal(proof.proposed.verdict, 'ACCEPT');
assert.equal(proof.verdict, 'ACCEPT_FIXTURE');

assert.ok(
  negative.includes('NEGATIVE CONTROL: PASSED')
);

assert.ok(
  negative.includes('Incorrect ACCEPT proof: NOT CREATED')
);

const summary = {
  experiment: 'TengaLab judge demonstration',
  generatedAt: new Date().toISOString(),
  provider: proof.provider,
  baseline: { passed: 3, total: 6, verdict: 'REJECT' },
  generatedRepair: {
    passed: 6,
    total: 6,
    verdict: 'ACCEPT_FIXTURE'
  },
  negativeControl: {
    passed: 3,
    total: 6,
    verdict: 'REJECT'
  },
  sourceSha256: proof.replacementSha256,
  evidenceSha256: proof.executionLogSha256,
  gitCommit: proof.gitCommit,
  limitation: 'Results cover the six deterministic fixture tests'
};

await writeFile(
  join(directory, 'summary.json'),
  JSON.stringify(summary, null, 2) + '\n',
  { mode: 0o600 }
);

console.log('\n==============================================');
console.log('             TENGALAB RESULTS');
console.log('==============================================');
console.log('Original buggy source:       3/6 REJECT');
console.log('Meta-generated source:       6/6 ACCEPT_FIXTURE');
console.log('Ineffective modified source: 3/6 REJECT');
console.log('Evidence integrity:          VERIFIED');
console.log('==============================================');
console.log('Demo summary:', join(directory, 'summary.json'));
console.log('Full proof:', join(directory, 'proof.json'));
console.log('\nDEMONSTRATION PASSED');
JS

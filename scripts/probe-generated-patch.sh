#!/usr/bin/env bash
set -euo pipefail

PREVIEW="${1:?Provide the generated preview JSON path}"
DOCKER=/usr/bin/docker
IMAGE=node:22-bookworm-slim

if [[ ! -f "$PREVIEW" ]]; then
  echo "Preview file not found"
  exit 1
fi

SECURITY="$("$DOCKER" --context rootless info \
  --format '{{json .SecurityOptions}}')"

if [[ "$SECURITY" != *'"name=rootless"'* ]]; then
  echo "FAIL: Docker context is not rootless"
  exit 1
fi

if ! "$DOCKER" --context rootless image inspect \
  "$IMAGE" >/dev/null 2>&1; then
  echo "FAIL: Trusted Node image is not cached"
  exit 1
fi

STAGE="$(mktemp -d /tmp/tengalab-probe-XXXXXXXX)"
chmod 0755 "$STAGE"
CONTAINER_NAME=""

cleanup() {
  if [[ -n "$CONTAINER_NAME" ]]; then
    "$DOCKER" --context rootless rm -f \
      "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$STAGE"
}
trap cleanup EXIT

# Stage only committed source and package metadata.
# No .env, API keys, home directory or Docker socket.
git archive --format=tar HEAD src package.json |
  tar -xf - -C "$STAGE"

# The judge wrapper uses umask 077 for private evidence.
# Allow the non-root container user to read only this staged
# copy of committed source code, never the original repository.
if [[ ! -f "$STAGE/src/lab/verify.mjs" ]]; then
  echo "FAIL: Verification harness missing from stage" >&2
  exit 1
fi

chmod -R a+rX -- "$STAGE"

run_isolated() {
  local mode="$1"
  CONTAINER_NAME="tengalab-probe-$RANDOM-$$"

  timeout --kill-after=3s 30s \
    "$DOCKER" --context rootless run \
      --rm \
      --name "$CONTAINER_NAME" \
      --pull never \
      --network none \
      --read-only \
      --cap-drop ALL \
      --security-opt no-new-privileges:true \
      --security-opt seccomp=builtin \
      --pids-limit 64 \
      --memory 256m \
      --memory-swap 256m \
      --cpus 0.5 \
      --user 65534:65534 \
      --tmpfs /tmp:rw,nosuid,nodev,noexec,size=16m \
      --mount "type=bind,src=$STAGE,dst=/work,readonly" \
      --workdir /work \
      "$IMAGE" \
      node --input-type=module -e '
        import { verifyCandidate } from
          "./src/lab/verify.mjs";

        const mode = process.argv[1];
        const result = await verifyCandidate("buggy");

        const passing = result.passing;
        const full = result.isFullSuite &&
          result.results.length === 6;

        const verdict = full && passing === 6
          ? "ACCEPT"
          : "REJECT";

        console.log(JSON.stringify({
          mode,
          passing,
          total: result.results.length,
          fullSuite: result.isFullSuite,
          verdict,
          results: result.results
        }, null, 2));

        if (mode === "baseline" &&
            (!full || passing !== 3)) {
          console.error("Unexpected baseline");
          process.exitCode = 2;
        }
      ' "$mode"

  "$DOCKER" --context rootless rm -f \
    "$CONTAINER_NAME" >/dev/null 2>&1 || true
  CONTAINER_NAME=""
}

echo "=== ISOLATED ORIGINAL BASELINE ==="
run_isolated baseline

echo "=== VALIDATE AND STAGE GENERATED SOURCE ==="
node --input-type=module - "$PREVIEW" "$STAGE" <<'JS'
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  validateGeneratedPatch
} from './src/repair/patch-preview.mjs';

const previewPath = process.argv[2];
const stage = process.argv[3];

const raw = await readFile(previewPath, 'utf8');

if (Buffer.byteLength(raw) > 512 * 1024) {
  throw new Error('Preview file is oversized');
}

const preview = JSON.parse(raw);
const original = await readFile(
  join(stage, 'src/lab/service.mjs'), 'utf8'
);

const validated = validateGeneratedPatch({
  targetPath: preview.targetPath,
  expectedSha256: preview.originalSha256,
  replacementSource: preview.replacementSource
}, original);

if (validated.replacementSha256 !==
    preview.replacementSha256) {
  throw new Error('Replacement checksum mismatch');
}

await writeFile(
  join(stage, 'src/lab/service.mjs'),
  validated.replacementSource,
  { mode: 0o644 }
);

console.log('Patch SHA256:', validated.replacementSha256);
console.log('Original repository: UNCHANGED');
JS

echo "=== ISOLATED META-GENERATED REPAIR ==="
run_isolated proposed

echo "=== EXPERIMENT COMPLETE ==="
echo "This probe does not create signed evidence."

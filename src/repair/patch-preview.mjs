import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';

export const PATCH_TARGET = 'src/lab/service.mjs';
export const MAX_PATCH_BYTES = 128 * 1024;

export function sha256Source(text) {
  return createHash('sha256')
    .update(text, 'utf8')
    .digest('hex');
}

export function validateGeneratedPatch(proposal, originalSource) {
  if (!proposal || typeof proposal !== 'object' ||
      Array.isArray(proposal)) {
    throw new Error('Patch proposal must be an object');
  }

  if (typeof originalSource !== 'string') {
    throw new Error('Original source must be a string');
  }

  const allowed = new Set([
    'targetPath', 'expectedSha256', 'replacementSource'
  ]);

  if (Object.keys(proposal).some(key => !allowed.has(key))) {
    throw new Error('Unexpected patch proposal field');
  }

  if (proposal.targetPath !== PATCH_TARGET) {
    throw new Error('Patch target is not allowlisted');
  }

  if (typeof proposal.expectedSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(proposal.expectedSha256)) {
    throw new Error('Invalid expected source SHA-256');
  }

  if (typeof proposal.replacementSource !== 'string' ||
      proposal.replacementSource.length === 0) {
    throw new Error('Replacement source must be a nonempty string');
  }

  const byteCount = Buffer.byteLength(
    proposal.replacementSource, 'utf8'
  );

  if (byteCount > MAX_PATCH_BYTES) {
    throw new Error('Replacement source exceeds size limit');
  }

  const originalSha256 = sha256Source(originalSource);

  if (proposal.expectedSha256 !== originalSha256) {
    throw new Error('Source changed since patch was proposed');
  }

  if (proposal.replacementSource === originalSource) {
    throw new Error('Patch makes no changes');
  }

  return Object.freeze({
    status: 'VALIDATED_NOT_EXECUTED',
    targetPath: PATCH_TARGET,
    originalSha256,
    replacementSha256: sha256Source(proposal.replacementSource),
    replacementBytes: byteCount,
    replacementSource: proposal.replacementSource
  });
}

export async function previewGeneratedPatch(
  proposal, { repoDir = process.cwd() } = {}
) {
  // The application chooses the repository, never the AI.
  const root = await realpath(repoDir);
  const target = resolve(root, PATCH_TARGET);

  if (await realpath(target) !== target) {
    throw new Error('Symlinked patch targets are not supported');
  }

  const handle = await open(
    target, constants.O_RDONLY | constants.O_NOFOLLOW
  );

  let originalSource;

  try {
    if (!(await handle.stat()).isFile()) {
      throw new Error('Patch target must be a regular file');
    }

    originalSource = await handle.readFile({
      encoding: 'utf8'
    });
  } finally {
    await handle.close();
  }

  return validateGeneratedPatch(proposal, originalSource);
}

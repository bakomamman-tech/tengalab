import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp, mkdir, readFile, rm, symlink, writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  PATCH_TARGET,
  MAX_PATCH_BYTES,
  sha256Source,
  validateGeneratedPatch,
  previewGeneratedPatch
} from '../src/repair/patch-preview.mjs';

const before = 'export const result = 1;\n';
const after = 'export const result = 2;\n';

const proposal = () => ({
  targetPath: PATCH_TARGET,
  expectedSha256: sha256Source(before),
  replacementSource: after
});

test('accepts a correctly based replacement for preview', () => {
  const preview = validateGeneratedPatch(proposal(), before);

  assert.equal(preview.status, 'VALIDATED_NOT_EXECUTED');
  assert.equal(preview.originalSha256, sha256Source(before));
  assert.equal(preview.replacementSha256, sha256Source(after));
});

test('rejects path traversal and other target files', () => {
  for (const targetPath of [
    '../.env', '/etc/passwd', 'src/repair/meta.mjs'
  ]) {
    assert.throws(
      () => validateGeneratedPatch(
        { ...proposal(), targetPath }, before
      ),
      /allowlisted/
    );
  }
});

test('rejects stale source digests', () => {
  assert.throws(
    () => validateGeneratedPatch(proposal(), 'changed'),
    /Source changed/
  );
});

test('rejects unchanged replacements', () => {
  assert.throws(
    () => validateGeneratedPatch(
      { ...proposal(), replacementSource: before }, before
    ),
    /no changes/
  );
});

test('rejects oversized patches', () => {
  assert.throws(
    () => validateGeneratedPatch({
      ...proposal(),
      replacementSource: 'x'.repeat(MAX_PATCH_BYTES + 1)
    }, before),
    /size limit/
  );
});

test('rejects unexpected proposal fields', () => {
  assert.throws(
    () => validateGeneratedPatch({
      ...proposal(), command: 'rm -rf /'
    }, before),
    /Unexpected/
  );
});

test('rejects malformed proposal and checksum', () => {
  assert.throws(
    () => validateGeneratedPatch(null, before),
    /object/
  );

  assert.throws(
    () => validateGeneratedPatch({
      ...proposal(), expectedSha256: 'abc'
    }, before),
    /SHA-256/
  );
});

test('preview never changes the original source', async t => {
  const root = await mkdtemp(join(tmpdir(), 'tengalab-preview-'));

  t.after(() => rm(root, { recursive: true, force: true }));

  const target = join(root, PATCH_TARGET);

  await mkdir(join(root, 'src', 'lab'), { recursive: true });
  await writeFile(target, before);

  const preview = await previewGeneratedPatch(
    proposal(), { repoDir: root }
  );

  assert.equal(preview.status, 'VALIDATED_NOT_EXECUTED');
  assert.equal(await readFile(target, 'utf8'), before);
});

test('preview rejects symlinked target files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'tengalab-symlink-'));

  t.after(() => rm(root, { recursive: true, force: true }));

  const target = join(root, PATCH_TARGET);

  await mkdir(join(root, 'src', 'lab'), { recursive: true });
  await writeFile(join(root, 'real.mjs'), before);
  await symlink(join(root, 'real.mjs'), target);

  await assert.rejects(
    previewGeneratedPatch(proposal(), { repoDir: root }),
    /Symlinked/
  );
});

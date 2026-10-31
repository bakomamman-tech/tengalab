import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPublicSite } from '../scripts/build-public-site.mjs';

test('public demo is a static, read-only exhibit with genuine source digests', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tengalab-public-test-'));
  try {
    await buildPublicSite(dir);
    const [page, script, snapshot] = await Promise.all([
      readFile(join(dir, 'index.html'), 'utf8'),
      readFile(join(dir, 'app.js'), 'utf8'),
      readFile(join(dir, 'data.json'), 'utf8')
    ]);
    const data = JSON.parse(snapshot);
    const sha = text => createHash('sha256').update(text).digest('hex');

    assert.doesNotMatch(page, /id="run-button"/);
    assert.match(page, /Explore the verified repair/);
    assert.match(page, /read-only public page|read-only/i);
    assert.doesNotMatch(script, /\/api\/run|spawn\(|MODEL_API_KEY|GITHUB_TOKEN/);
    assert.equal(data.preview.originalSha256, sha(data.preview.original));
    assert.equal(data.preview.replacementSha256, sha(data.preview.proposed));
    assert.equal(data.baseline.passed, 3);
    assert.equal(data.generatedRepair.passed, 6);
    assert.equal(data.negativeControl.passed, 3);
    assert.equal(data.automatedTests, 68);
    assert.match(data.limitations, /not production/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

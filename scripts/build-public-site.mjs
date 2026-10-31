#!/usr/bin/env node
// Build an entirely static, read-only public demo from the committed sources.
// Never copy the local proof runner, environment files, API credentials, or
// localhost command-execution endpoint to the public site.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const digest = value => createHash('sha256').update(value).digest('hex');
const historical = Object.freeze({
  gitCommit: '72380e53c755db31f774ff74b10b99af4c002051',
  generatedAt: '2026-10-31T07:22:49.000Z',
  evidenceSha256: '390caab78701a38b80eeaf356fa8dd9064ed3c2ce96bef712ad37df7ed7b5cde',
  baseline: { passed: 3, total: 6, verdict: 'REJECT' },
  generatedRepair: { passed: 6, total: 6, verdict: 'ACCEPT_FIXTURE' },
  negativeControl: { passed: 3, total: 6, verdict: 'REJECT' },
  automatedTests: 68,
  provenance: 'Recorded local verification; not externally attested',
  source: 'Meta Muse Spark 1.3 generated a replacement during an earlier live API call.',
  limitations: 'Six deterministic fixture invariants only; not production correctness certification.'
});

export async function buildPublicSite(outDir = join(ROOT, 'public-dist')) {
  const [original, previewJSON, html, css, client] = await Promise.all([
    readFile(join(ROOT, 'src/lab/service.mjs'), 'utf8'),
    readFile(join(ROOT, 'demo/fixtures/meta-generated-preview.json'), 'utf8'),
    readFile(join(ROOT, 'src/console/public/index.html'), 'utf8'),
    readFile(join(ROOT, 'src/console/public/app.css'), 'utf8'),
    readFile(join(ROOT, 'public-site/app.js'), 'utf8')
  ]);

  const preview = JSON.parse(previewJSON);
  const originalSha256 = digest(original);
  const replacementSha256 = digest(preview.replacementSource || '');
  if (preview.targetPath !== 'src/lab/service.mjs' ||
      preview.originalSha256 !== originalSha256 ||
      preview.replacementSha256 !== replacementSha256 ||
      replacementSha256 !== 'c8b6fb5669b562a4aa48b5f116b8693b979ce505e0eb0fb3d431f6dace8cf349' ||
      original === preview.replacementSource) {
    throw new Error('Public build aborted: source proposal failed checksum validation');
  }

  // The public page never exposes /api/run or executes model-generated code.
  const oldButton = /<button id="run-button"[^>]*>.*?<\/button>/;
  if (!oldButton.test(html)) throw new Error('Dashboard button anchor changed');
  let page = html.replace(oldButton,
    '<a class="run-button" href="#comparison">⌁ Explore the verified repair</a>');
  page = page
    .replace('<title>TengaLab — Proof Console</title>',
      '<title>TengaLab — Live Public Proof Exhibit</title>')
    .replace('href="/app.css"', 'href="./app.css"')
    .replace('src="/app.js"', 'src="./app.js"')
    .replace('LOCAL / OFFLINE', 'PUBLIC / READ-ONLY')
    .replace('Latest verification completed successfully', 'Recorded verification successful')
    .replace('Run the complete Node.js test suite.', '68 regression tests passed in the recorded run.')
    .replace('Test original and model-generated sources separately.',
      'Previously executed source comparison in rootless Docker.')
    .replace('Recompute observations and verify the checksum.',
      'Inspect the recorded local integrity-check result.')
    .replace('Reject a deliberately ineffective modification.',
      'Negative control rejected the ineffective modification.')
    .replace('Verification terminal', 'Recorded verification output')
    .replace('<span>LOCALHOST</span>', '<span>REPLAY</span>')
    .replace('These code panes load from the committed preview fixture and original source. The comparison is read-only; starting verification does not make a new Meta API call.',
      'Explore the original source and Meta Muse-generated replacement. This public page replays verified local results; it does not call the model, run Docker, or execute the repair.')
    .replace('An AI-generated patch may look convincing without fixing the underlying defect.',
      'An AI-generated patch may look convincing without fixing the underlying defect.');

  // Enforce that the original private command-action button cannot survive build.
  if (page.includes('id="run-button"') || page.includes('src="/app.js"')) {
    throw new Error('Public build accidentally retained an execution control');
  }

  const data = {
    ...historical,
    preview: {
      provider: preview.provider || 'Meta Muse Spark 1.3',
      targetPath: preview.targetPath,
      originalSha256,
      replacementSha256,
      original,
      proposed: preview.replacementSource
    }
  };

  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(join(outDir, 'index.html'), page),
    writeFile(join(outDir, 'app.css'), css + '\n' + await readFile(join(ROOT, 'public-site/public.css'), 'utf8')),
    writeFile(join(outDir, 'app.js'), client),
    writeFile(join(outDir, 'data.json'), JSON.stringify(data, null, 2) + '\n')
  ]);
  console.log('PUBLIC DEMO BUILD: VERIFIED');
  console.log('Static output:', outDir);
  console.log('Source proposal SHA256:', replacementSha256);
  console.log('No backend runner or secrets included.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildPublicSite(process.env.TENGALAB_PUBLIC_DIR || join(ROOT, 'public-dist'));
}

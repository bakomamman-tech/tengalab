'use strict';

// Public-facing read-only exhibit. No network requests other than ./data.json.
// No /api/run, Docker, localhost server process, secrets, or model API.
const byId = id => document.getElementById(id);
let diffOnly = true;
let comparison;

function show(id, value) { byId(id).textContent = String(value ?? '—'); }
function setDigest(id, value) {
  show(id, value ? value.slice(0, 18) + '…' : '—');
  byId(id).title = value || 'No digest';
}
function metric(prefix, data) {
  show(prefix + '-count', data.passed + '/' + data.total);
  show(prefix + '-verdict', data.verdict);
}

// A display-only line diff using longest-common-subsequence alignment.
function diffSources(original, proposed) {
  const before = original.replace(/\r\n/g, '\n').split('\n');
  const after = proposed.replace(/\r\n/g, '\n').split('\n');
  const beforeChanged = new Set();
  const afterChanged = new Set();
  const table = Array.from({ length: before.length + 1 },
    () => new Uint16Array(after.length + 1));

  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      table[i][j] = before[i] === after[j]
        ? 1 + table[i + 1][j + 1]
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  let i = 0, j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) { i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) beforeChanged.add(i++);
    else afterChanged.add(j++);
  }
  while (i < before.length) beforeChanged.add(i++);
  while (j < after.length) afterChanged.add(j++);
  return { before, after, beforeChanged, afterChanged };
}

function renderLines(id, lines, changed, kind) {
  const selected = new Set();
  if (diffOnly) {
    for (const index of changed) {
      for (let i = Math.max(0, index - 2); i <= Math.min(lines.length - 1, index + 2); i++)
        selected.add(i);
    }
  } else for (let i = 0; i < lines.length; i++) selected.add(i);

  const fragment = document.createDocumentFragment();
  let prev = -1;
  for (const index of [...selected].sort((a, b) => a - b)) {
    if (index > prev + 1) {
      const gap = document.createElement('span');
      gap.className = 'source-gap';
      gap.textContent = '      ··· ' + (index - prev - 1) + ' unchanged lines ···';
      fragment.appendChild(gap);
    }
    const element = document.createElement('span');
    const changedLine = changed.has(index);
    element.className = 'source-line' + (changedLine ? ' source-' + kind : '');
    element.textContent =
      (changedLine ? kind === 'removed' ? '−' : '+' : ' ') +
      String(index + 1).padStart(4, ' ') + '  ' + lines[index];
    fragment.appendChild(element);
    prev = index;
  }
  if (prev < lines.length - 1) {
    const gap = document.createElement('span');
    gap.className = 'source-gap';
    gap.textContent = '      ··· ' + (lines.length - prev - 1) + ' unchanged lines ···';
    fragment.appendChild(gap);
  }
  const target = byId(id);
  target.replaceChildren(fragment);
  target.scrollTop = 0;
}
function renderComparison() {
  if (!comparison) return;
  renderLines('original-code', comparison.before, comparison.beforeChanged, 'removed');
  renderLines('proposed-code', comparison.after, comparison.afterChanged, 'added');
  show('diff-toggle', diffOnly ? 'Show full source' : 'Show changes only');
  byId('diff-toggle').setAttribute('aria-pressed', String(diffOnly));
}

async function boot() {
  try {
    const response = await fetch('./data.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Data unavailable: HTTP ' + response.status);
    const data = await response.json();

    if (data.baseline.passed !== 3 ||
        data.generatedRepair.passed !== 6 ||
        data.negativeControl.passed !== 3 ||
        data.preview.targetPath !== 'src/lab/service.mjs' ||
        typeof data.preview.original !== 'string' ||
        typeof data.preview.proposed !== 'string') {
      throw new Error('Unexpected published evidence snapshot');
    }

    metric('baseline', data.baseline);
    metric('repair', data.generatedRepair);
    metric('negative', data.negativeControl);
    show('integrity-status', 'REPORTED');
    show('evidence-label', 'LOCAL CHECK');
    show('recorded-at', new Date(data.generatedAt).toLocaleString());
    show('git-commit', data.gitCommit.slice(0, 12));
    setDigest('source-digest', data.preview.replacementSha256);
    setDigest('proof-digest', data.evidenceSha256);
    show('evidence-folder', 'Recorded locally · Oct 31, 2026');
    show('run-state', 'Recorded verification completed successfully — read-only public replay');
    show('terminal-badge', 'RECORDED');
    show('top-status', 'RECORDED EXPERIMENT · READ-ONLY');

    comparison = diffSources(data.preview.original, data.preview.proposed);
    renderComparison();
    show('fixture-status', 'Source digests checked at site build. Highlighted lines show the Meta-generated replacement.');

    show('terminal-output', [
      'TENGALAB — VERIFIED EXPERIMENT RECORD (READ-ONLY REPLAY)',
      '',
      'Meta Muse Spark 1.3 generated the source proposal during an earlier live API call.',
      'A separate local Docker verifier then ran six deterministic fixture checks.',
      '',
      '[1/4] Automated regression tests: 68 PASSED',
      '[2/4] Rootless Docker: ORIGINAL and META GENERATED source tested',
      '[3/4] Locally generated proof and SHA-256 checksum: CHECK PASSED',
      '[4/4] Ineffective-patch negative control: REJECTED',
      '',
      'Original buggy source:       3/6 REJECT',
      'Meta-generated source:       6/6 ACCEPT_FIXTURE',
      'Ineffective modified source: 3/6 REJECT',
      '',
      'Recorded code revision: ' + data.gitCommit,
      'Recorded proof log SHA-256: ' + data.evidenceSha256,
      '',
      'RECORDED DEMONSTRATION: PASSED',
      '',
      'Important: This public website does NOT execute Docker or generate a fresh AI patch.',
      'Fixture acceptance is not a claim of general production correctness.'
    ].join('\n'));
  } catch (error) {
    show('top-status', 'COULD NOT LOAD VERIFIED RECORD');
    show('run-state', error.message);
    show('fixture-status', error.message);
    show('terminal-output', 'The read-only experiment snapshot could not be loaded.');
  }
}

byId('diff-toggle').addEventListener('click', () => {
  diffOnly = !diffOnly;
  renderComparison();
});

boot();

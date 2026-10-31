'use strict';

const el = id => document.getElementById(id);
const elements = {
  button: el('run-button'),
  output: el('terminal-output'),
  status: el('run-state'),
  badge: el('terminal-badge'),
  top: el('top-status')
};

let lastLog = '';
let refreshing = false;
let fixtureValidated = false;

function text(id, value) {
  el(id).textContent = String(value ?? '—');
}

function fillMetric(prefix, data) {
  if (!data || !Number.isInteger(data.passed) || !Number.isInteger(data.total)) {
    text(prefix + '-count', '—');
    text(prefix + '-verdict', 'NO RESULT');
    return;
  }
  text(prefix + '-count', data.passed + '/' + data.total);
  text(prefix + '-verdict', data.verdict || 'UNKNOWN');
}

function dateLabel(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

function digestLabel(id, value) {
  text(id, value ? value.slice(0, 16) + '…' : '—');
  el(id).title = value || 'No digest';
}

function showEvidence(record) {
  if (!record) {
    fillMetric('baseline', null);
    fillMetric('repair', null);
    fillMetric('negative', null);
    text('integrity-status', '—');
    text('evidence-label', 'NO RECORDING');
    text('recorded-at', 'No completed evidence');
    text('git-commit', '—');
    digestLabel('source-digest', null);
    digestLabel('proof-digest', null);
    text('evidence-folder', '—');
    return;
  }

  fillMetric('baseline', record.baseline);
  fillMetric('repair', record.generatedRepair);
  fillMetric('negative', record.negativeControl);
  text('integrity-status', record.verified ? 'VERIFIED' : 'CHECK');
  text('evidence-label', record.verified ? 'SHA-256 MATCH' : 'REVIEW REQUIRED');
  text('recorded-at', dateLabel(record.generatedAt));
  text('git-commit', record.gitCommit ? record.gitCommit.slice(0, 12) : '—');
  digestLabel('source-digest', record.sourceSha256);
  digestLabel('proof-digest', record.evidenceSha256);
  text('evidence-folder', record.folder || '—');
  el('integrity-status').style.color = record.verified ? '#9df4cf' : '#f3c07c';
}

function showRun(run, record) {
  elements.button.disabled = Boolean(run.running) || !fixtureValidated;
  elements.button.innerHTML = run.running ?
    '<span>◌</span> Verification running…' :
    '<span>▶</span> Run independent verification';

  if (run.running) {
    elements.status.textContent = 'Running real tests and Docker verification…';
    elements.badge.textContent = 'RUNNING';
    elements.top.textContent = 'VERIFICATION IN PROGRESS';
  } else if (run.finishedAt) {
    const success = run.exitCode === 0 && !run.error;
    elements.status.textContent = success ?
      'Latest verification completed successfully' :
      'Latest verification failed — inspect the log';
    elements.badge.textContent = success ? 'COMPLETED' : 'FAILED';
    elements.top.textContent = success ? 'LATEST RUN PASSED' : 'LATEST RUN FAILED';
  } else {
    elements.status.textContent = record ?
      'Showing a previously recorded run; ready to rerun' :
      'Ready for local verification';
    elements.badge.textContent = 'IDLE';
    elements.top.textContent = record && record.verified ?
      'RECORDED EVIDENCE VERIFIED' : 'AWAITING FIRST RUN';
  }

  const log = run.output || '';
  if (log !== lastLog) {
    lastLog = log;
    elements.output.textContent = log || '# Start a verification run to watch the real engine output.\n# No simulated verdicts. No Meta API key required.';
    elements.output.scrollTop = elements.output.scrollHeight;
  }
  if (run.error && !log) elements.output.textContent = run.error;
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    if (!response.ok) throw new Error('Unable to read local status (' + response.status + ')');
    const data = await response.json();
    showEvidence(data.evidence);
    showRun(data.run, data.evidence);
  } catch (error) {
    elements.top.textContent = 'LOCAL SERVER UNAVAILABLE';
    elements.status.textContent = error.message;
    elements.button.disabled = true;
  } finally {
    refreshing = false;
  }
}


let diffOnly = true;
let sourceComparison = null;

function sourceDiff(original, proposed) {
  const before = original.replace(/\r\n/g, '\n').split('\n');
  const after = proposed.replace(/\r\n/g, '\n').split('\n');
  const beforeChanged = new Set();
  const afterChanged = new Set();
  const rows = Array.from({ length: before.length + 1 },
    () => new Uint16Array(after.length + 1));

  // Longest-common-subsequence alignment is used for display only.
  // Experimental verdicts still come exclusively from the proof gate.
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      rows[i][j] = before[i] === after[j] ?
        1 + rows[i + 1][j + 1] :
        Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      i++;
      j++;
    } else if (rows[i + 1][j] >= rows[i][j + 1]) {
      beforeChanged.add(i++);
    } else {
      afterChanged.add(j++);
    }
  }
  while (i < before.length) beforeChanged.add(i++);
  while (j < after.length) afterChanged.add(j++);
  return { before, after, beforeChanged, afterChanged };
}

function displaySource(id, lines, changed, kind) {
  const target = el(id);
  const selected = new Set();

  if (diffOnly) {
    for (const index of changed) {
      for (let context = Math.max(0, index - 2);
        context <= Math.min(lines.length - 1, index + 2); context++) {
        selected.add(context);
      }
    }
  } else {
    for (let index = 0; index < lines.length; index++) selected.add(index);
  }

  const fragment = document.createDocumentFragment();
  let previous = -1;
  for (const index of [...selected].sort((a, b) => a - b)) {
    if (index > previous + 1) {
      const gap = document.createElement('span');
      gap.className = 'source-gap';
      gap.textContent = '      ··· ' + (index - previous - 1) + ' unchanged lines ···';
      fragment.appendChild(gap);
    }

    const line = document.createElement('span');
    const altered = changed.has(index);
    line.className = 'source-line' + (altered ? ' source-' + kind : '');
    line.textContent =
      (altered ? (kind === 'removed' ? '−' : '+') : ' ') +
      String(index + 1).padStart(4, ' ') + '  ' + lines[index];
    fragment.appendChild(line);
    previous = index;
  }

  if (previous < lines.length - 1) {
    const gap = document.createElement('span');
    gap.className = 'source-gap';
    gap.textContent = '      ··· ' + (lines.length - previous - 1) + ' unchanged lines ···';
    fragment.appendChild(gap);
  }

  target.replaceChildren(fragment);
  target.scrollTop = 0;
}

function drawComparison() {
  if (!sourceComparison) return;
  displaySource('original-code', sourceComparison.before,
    sourceComparison.beforeChanged, 'removed');
  displaySource('proposed-code', sourceComparison.after,
    sourceComparison.afterChanged, 'added');
  el('diff-toggle').textContent = diffOnly ? 'Show full source' : 'Show changes only';
  el('diff-toggle').setAttribute('aria-pressed', String(diffOnly));
}

async function loadFixture() {
  try {
    const response = await fetch('/api/fixture', { cache: 'no-store' });
    if (!response.ok) throw new Error('Cannot load fixture (' + response.status + ')');
    const data = await response.json();
    sourceComparison = sourceDiff(data.original, data.proposed);
    drawComparison();
    fixtureValidated = data.valid === true;
    text('fixture-status', fixtureValidated ?
      '✓ Source target and SHA-256 digests match the recorded Meta-generated repair.' :
      '⚠ Source checksum mismatch. Do not run until the fixture is reviewed.');
  } catch (error) {
    text('fixture-status', 'Fixture unavailable: ' + error.message);
    text('original-code', 'Source unavailable');
    text('proposed-code', 'Repair unavailable');
  }
  await refresh();
}

el('diff-toggle').addEventListener('click', () => {
  diffOnly = !diffOnly;
  drawComparison();
});

elements.button.addEventListener('click', async () => {
  if (!fixtureValidated || elements.button.disabled) return;
  elements.button.disabled = true;
  elements.status.textContent = 'Starting verifier…';
  try {
    const response = await fetch('/api/run', { method: 'POST' });
    const data = await response.json();
    if (!response.ok || !data.started) throw new Error(data.error || 'Unable to start');
    lastLog = '';
    elements.output.textContent = '# Starting the real verification engine…';
  } catch (error) {
    elements.status.textContent = 'Run could not start: ' + error.message;
  }
  await refresh();
});

loadFixture();
setInterval(refresh, 1400);

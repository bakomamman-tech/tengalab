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

async function loadFixture() {
  try {
    const response = await fetch('/api/fixture', { cache: 'no-store' });
    if (!response.ok) throw new Error('Cannot load fixture (' + response.status + ')');
    const data = await response.json();
    text('original-code', data.original);
    text('proposed-code', data.proposed);
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

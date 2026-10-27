#!/usr/bin/env node
import { verifyCandidate } from './lab/verify.mjs';
import { saveEvidence } from './lab/evidence.mjs';
import { investigate } from './agent/investigate.mjs';

const [command, ...args] = process.argv.slice(2);
function option(name, fallback) {
  const at = args.indexOf(`--${name}`);
  if (at === -1) return fallback;
  if (!args[at + 1] || args[at + 1].startsWith('--')) throw new Error(`Missing --${name} value`);
  return args[at + 1];
}

async function main() {
  if (command === 'compare') {
    const reports = ['buggy', 'naive', 'correct'].map((candidate) => verifyCandidate(candidate));
    console.log('\nTENGALAB · EXPERIMENT 001 · INDEPENDENT PROOF GATE');
    console.log('"Don\'t trust the patch. Prove it."\n');
    for (const report of reports) {
      console.log(`${report.candidate.padEnd(8)} ${String(report.passing).padStart(1)}/${report.total} ${report.passed ? 'ACCEPT' : 'REJECT'}`);
      for (const result of report.results) console.log(`   ${result.passed ? 'PASS' : 'FAIL'}  ${result.experiment.padEnd(24)} ${result.observed.exitReason ?? '(still running)'}`);
    }
    const saved = await saveEvidence({ mode: 'comparison', reports });
    console.log(`\nEvidence: ${saved.filepath}`);
    console.log(`SHA256:   ${saved.digest}`);
    // For this EXPECTED comparison, buggy + naive MUST fail; correct MUST pass.
    if (reports[0].passed || reports[1].passed || !reports[2].passed) process.exitCode = 1;
  } else if (command === 'investigate') {
    const candidate = option('candidate', 'buggy');
    const agent = option('agent', 'deterministic');
    console.log(`\nTENGALAB · investigator=${agent} · candidate=${candidate}`);
    const result = await investigate({ candidate, agent, onStep({ decision, result }) {
      console.log(`\n${decision.provider}: ${decision.nextExperiment}`);
      console.log(` Reason: ${decision.rationale}`);
      console.log(` Evidence: ${result.passed ? 'PASS' : 'FAIL'}; ${JSON.stringify(result.observed)}`);
    } });
    const saved = await saveEvidence({ mode: 'investigation', ...result });
    console.log(`\nProof gate: ${result.accepted ? 'ACCEPT' : 'REJECT'}`);
    console.log(`Evidence: ${saved.filepath}`);
    console.log(`SHA256:   ${saved.digest}`);
    if (!result.accepted) process.exitCode = 2; // A failed verification is a meaningful exit status.
  } else {
    console.error(`Usage:\n  npm run demo\n  node src/cli.mjs compare\n  node src/cli.mjs investigate --candidate buggy|naive|correct --agent deterministic|meta`);
    process.exitCode = 64;
  }
}

main().catch((error) => {
  console.error(`TengaLab error: ${error.message}`);
  process.exitCode = 1;
});

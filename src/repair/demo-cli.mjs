import { runRepairWithEvidence } from './evidence-pipeline.mjs';

const args = process.argv.slice(2);
const allowed = new Set([
  '--offline', '--live', '--reject', '--help'
]);

async function main() {
  if (args.includes('--help')) {
    console.log(
      'Usage: node src/repair/demo-cli.mjs ' +
      '[--offline | --live] [--reject]'
    );
    return;
  }

  if (args.some(a => !allowed.has(a))) {
    throw new Error('Unknown command-line argument');
  }

  if (args.includes('--offline') && args.includes('--live')) {
    throw new Error('Choose offline or live, not both');
  }

  const live = args.includes('--live');
  const reject = args.includes('--reject');

  if (live && reject) {
    throw new Error('--reject is for offline demos only');
  }

  if (live && !process.env.MODEL_API_KEY) {
    throw new Error('MODEL_API_KEY is required for live mode');
  }

  const planner = live
    ? undefined
    : async () => ({
        recipeId: reject ? 'lag_only' : 'lag_and_shutdown',
        rationale: 'Controlled demonstration proposal',
        provider: 'offline-demo',
        tokenUsage: null
      });

  console.log('\nTENGALAB — AUTONOMOUS REPAIR LAB');
  console.log("Don't trust the patch. Prove it.");
  console.log('Mode:', live ? 'LIVE META AI' : 'OFFLINE');

  const result = await runRepairWithEvidence({
    planner,
    label: live ? 'demo-meta-live' : 'demo-offline'
  });

  console.log('\nBaseline:', `${result.baselinePassing}/6`);
  console.log('Repaired:', `${result.repairedPassing}/6`);
  console.log('Repair:', result.recipeId);
  console.log('Verdict:', result.verdict);
  console.log('Integrity:', result.integrity.reason);
  console.log('Evidence:', result.filepath);
  console.log('SHA256:', result.digest);
}

main().catch(error => {
  console.error('TengaLab error:', error.message);
  process.exitCode = 1;
});

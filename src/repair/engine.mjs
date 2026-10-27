import {
  copyFile, mkdtemp, readFile, writeFile, rm
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const lagBug =
  "if (this.candidate === 'buggy') this.stop('incorrect-lag-shutdown');";

const lagRepair =
  '// Receiver lag is recoverable; do not stop the service.';

const shutdownGuard =
  "if (this.candidate === 'correct' && this.shutdownRequested) {";

const repairedGuard =
  'if (this.shutdownRequested) {';

const recipes = Object.freeze({
  lag_only: [
    [lagBug, lagRepair]
  ],
  lag_and_shutdown: [
    [lagBug, lagRepair],
    [shutdownGuard, repairedGuard]
  ]
});

export const REPAIR_IDS = Object.freeze(Object.keys(recipes));

export function applyRepair(source, recipeId) {
  if (!Object.hasOwn(recipes, recipeId)) {
    throw new Error(`Repair not permitted: ${recipeId}`);
  }

  let patched = source;

  for (const [before, after] of recipes[recipeId]) {
    const occurrences = patched.split(before).length - 1;

    if (occurrences !== 1) {
      throw new Error('Repair anchor missing or ambiguous');
    }

    patched = patched.replace(before, after);
  }

  return patched;
}

export async function evaluateRepair(recipeId) {
  const base = new URL('../lab/', import.meta.url);
  const original = await readFile(
    new URL('service.mjs', base), 'utf8'
  );

  const patched = applyRepair(original, recipeId);
  const directory = await mkdtemp(
    join(tmpdir(), 'tengalab-repair-')
  );

  try {
    for (const filename of [
      'channel.mjs',
      'service.mjs',
      'experiments.mjs',
      'verify.mjs'
    ]) {
      await copyFile(
        new URL(filename, base),
        join(directory, filename)
      );
    }

    await writeFile(
      join(directory, 'service.mjs'), patched
    );

    const moduleUrl = pathToFileURL(
      join(directory, 'verify.mjs')
    ).href;

    const { verifyCandidate } = await import(moduleUrl);

    return {
      recipeId,
      report: verifyCandidate('buggy')
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

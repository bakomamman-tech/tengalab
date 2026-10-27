import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export function canonicalDigest(payload) {
  // Hash only substantive results; timestamps/run IDs are deliberately excluded.
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export async function saveEvidence(payload, { dir = 'evidence', label = 'experiment-001' } = {}) {
  const safe = label.replace(/[^a-z0-9_-]/gi, '_').slice(0, 70);
  const folder = resolve(dir);
  await mkdir(folder, { recursive: true });
  const digest = canonicalDigest(payload);
  const id = randomUUID().slice(0, 8);
  const filename = `${safe}-${id}.json`;
  const filepath = resolve(folder, filename);
  const envelope = {
    title: 'TengaLab Experiment 001 — Verifiable Evidence',
    createdAt: new Date().toISOString(),
    schemaVersion: 1,
    sha256OfResults: digest,
    results: payload,
    limitations: [
      'The event service is a deterministic original fixture, not a production application.',
      'A passing candidate satisfies these checks only; it is not a proof of all possible behaviors.',
      'Meta model selection is never counted as test execution evidence.',
    ],
  };
  await writeFile(filepath, `${JSON.stringify(envelope, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  await writeFile(filepath.replace(/\.json$/, '.sha256'), `${digest}\n`, { flag: 'wx', mode: 0o600 });
  return { filepath, digest };
}

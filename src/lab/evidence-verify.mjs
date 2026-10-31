import { readFile } from 'node:fs/promises';
import { canonicalDigest } from './evidence.mjs';

export async function verifyEvidence(filepath) {
  if (typeof filepath !== 'string' || !filepath.endsWith('.json')) {
    return { valid: false, reason: 'invalid-evidence-path' };
  }

  let envelope;
  let sidecar;

  try {
    const [contents, checksum] = await Promise.all([
      readFile(filepath, 'utf8'),
      readFile(filepath.replace(/\.json$/, '.sha256'), 'utf8'),
    ]);

    envelope = JSON.parse(contents);
    sidecar = checksum.trim();
  } catch {
    return { valid: false, reason: 'unreadable-or-malformed-evidence' };
  }

  if (
    !envelope ||
    typeof envelope !== 'object' ||
    Array.isArray(envelope) ||
    envelope.schemaVersion !== 1 ||
    !Object.hasOwn(envelope, 'results') ||
    !/^[a-f0-9]{64}$/.test(envelope.sha256OfResults ?? '')
  ) {
    return { valid: false, reason: 'invalid-evidence-schema' };
  }

  const actualDigest = canonicalDigest(envelope.results);

  if (actualDigest !== envelope.sha256OfResults) {
    return { valid: false, reason: 'payload-digest-mismatch' };
  }

  if (sidecar !== actualDigest) {
    return { valid: false, reason: 'sidecar-digest-mismatch' };
  }

  return {
    valid: true,
    reason: 'integrity-verified',
    digest: actualDigest,
    schemaVersion: envelope.schemaVersion,
  };
}

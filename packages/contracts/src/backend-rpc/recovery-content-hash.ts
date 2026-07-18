import type { BackendRecoveryContentHash } from './foreign-epoch-recovery';

type CanonicalJson = null | boolean | number | string | CanonicalJson[] | { [key: string]: CanonicalJson };

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonicalize(value: unknown, seen = new Set<object>()): CanonicalJson {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('RECOVERY_CONTENT_HASH_UNSUPPORTED: non-finite number');
    }
    return value;
  }
  if (typeof value === 'bigint') return { $bigint: value.toString() };
  if (value === undefined) return { $undefined: true };
  if (value instanceof Uint8Array) return { $bytes: bytesToHex(value) };
  if (value instanceof Date) return { $date: value.toISOString() };
  if (typeof value !== 'object') {
    throw new Error(`RECOVERY_CONTENT_HASH_UNSUPPORTED: ${typeof value}`);
  }
  if (seen.has(value)) {
    throw new Error('RECOVERY_CONTENT_HASH_UNSUPPORTED: cyclic value');
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry) => canonicalize(entry, seen));
    }
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry, seen)]),
    );
  } finally {
    seen.delete(value);
  }
}

export function canonicalRecoveryJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export async function hashRecoveryContent(value: unknown): Promise<BackendRecoveryContentHash> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('RECOVERY_CONTENT_HASH_UNAVAILABLE: SHA-256 support is required');
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(canonicalRecoveryJson(value)));
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}

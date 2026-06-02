import type { BrowserReadModelSnapshotMetadata } from '@/application/queries/browser/browser-read-model';

export type BrowserAsyncReadToken = {
  datasourceVersion: number;
  readModelSnapshotMetadata: BrowserReadModelSnapshotMetadata | null;
};

function stableMetadataString(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableMetadataString).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableMetadataString(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function isBrowserReadModelSnapshotMetadataEqual(
  left: BrowserReadModelSnapshotMetadata | null | undefined,
  right: BrowserReadModelSnapshotMetadata | null | undefined,
): boolean {
  if (!left || !right) {
    return left == null && right == null;
  }
  return left.queryFingerprint === right.queryFingerprint
    && (left.generation ?? null) === (right.generation ?? null)
    && stableMetadataString(left.readOwner ?? null) === stableMetadataString(right.readOwner ?? null);
}

export function isBrowserAsyncReadTokenCurrent(
  token: BrowserAsyncReadToken,
  current: BrowserAsyncReadToken,
): boolean {
  return token.datasourceVersion === current.datasourceVersion
    && isBrowserReadModelSnapshotMetadataEqual(
      token.readModelSnapshotMetadata,
      current.readModelSnapshotMetadata,
    );
}

import { describe, expect, it } from 'vitest';
import {
  isBrowserAsyncReadTokenCurrent,
  type BrowserAsyncReadToken,
} from '../browserAsyncReadGuard';

const token: BrowserAsyncReadToken = {
  datasourceVersion: 3,
  readModelSnapshotMetadata: {
    queryFingerprint: 'query-a',
    generation: 7,
    readOwner: { kind: 'queue-projection', queueId: 'retrieval' },
  },
};

describe('browserAsyncReadGuard', () => {
  it('accepts async supplements only when datasource version and read metadata still match', () => {
    expect(isBrowserAsyncReadTokenCurrent(token, {
      datasourceVersion: 3,
      readModelSnapshotMetadata: {
        queryFingerprint: 'query-a',
        generation: 7,
        readOwner: { kind: 'queue-projection', queueId: 'retrieval' },
      },
    })).toBe(true);
  });

  it.each([
    ['datasource version', { datasourceVersion: 4, readModelSnapshotMetadata: token.readModelSnapshotMetadata }],
    ['query fingerprint', {
      datasourceVersion: 3,
      readModelSnapshotMetadata: {
        queryFingerprint: 'query-b',
        generation: 7,
        readOwner: { kind: 'queue-projection', queueId: 'retrieval' },
      },
    }],
    ['generation', {
      datasourceVersion: 3,
      readModelSnapshotMetadata: {
        queryFingerprint: 'query-a',
        generation: 8,
        readOwner: { kind: 'queue-projection', queueId: 'retrieval' },
      },
    }],
    ['read owner', {
      datasourceVersion: 3,
      readModelSnapshotMetadata: {
        queryFingerprint: 'query-a',
        generation: 7,
        readOwner: { kind: 'queue-projection', queueId: 'filter-group' },
      },
    }],
  ])('rejects stale async supplements after %s changes', (_name, current) => {
    expect(isBrowserAsyncReadTokenCurrent(token, current)).toBe(false);
  });

  it('rejects supplements captured before read metadata once current Browser state has metadata', () => {
    expect(isBrowserAsyncReadTokenCurrent({
      datasourceVersion: 1,
      readModelSnapshotMetadata: null,
    }, {
      datasourceVersion: 1,
      readModelSnapshotMetadata: token.readModelSnapshotMetadata,
    })).toBe(false);
  });
});

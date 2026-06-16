import { describe, expect, it } from 'vitest';
import { TransactionProvenanceRegistry } from '../transaction-provenance-registry';

describe('TransactionProvenanceRegistry', () => {
  it('records explicit block-scoped provenance and prunes expired entries', () => {
    let now = 1_000;
    const registry = new TransactionProvenanceRegistry({
      defaultTtlMs: 500,
      now: () => now,
    });

    registry.record({
      blockId: 'source-block',
      reason: 'progressive-excerpt-source-mark',
      source: 'progressive-excerpt',
    });
    registry.record({
      blockId: 'topic-card',
      reason: 'progressive-excerpt-topic-card',
      source: 'progressive-excerpt',
      ttlMs: 1_000,
    });

    expect(registry.createSnapshot()).toEqual({
      capturedAt: 1_000,
      entries: [
        {
          blockId: 'source-block',
          expiresAt: 1_500,
          reason: 'progressive-excerpt-source-mark',
          source: 'progressive-excerpt',
          suppressAutoCard: true,
        },
        {
          blockId: 'topic-card',
          expiresAt: 2_000,
          reason: 'progressive-excerpt-topic-card',
          source: 'progressive-excerpt',
          suppressAutoCard: true,
        },
      ],
    });

    now = 1_600;

    expect(registry.createSnapshot()).toEqual({
      capturedAt: 1_600,
      entries: [
        {
          blockId: 'topic-card',
          expiresAt: 2_000,
          reason: 'progressive-excerpt-topic-card',
          source: 'progressive-excerpt',
          suppressAutoCard: true,
        },
      ],
    });
  });

  it('keeps the later expiration when the same block is recorded twice', () => {
    let now = 1_000;
    const registry = new TransactionProvenanceRegistry({
      defaultTtlMs: 500,
      now: () => now,
    });

    registry.record({
      blockId: 'topic-card',
      reason: 'progressive-excerpt-topic-card',
      source: 'progressive-excerpt',
    });
    now = 1_100;
    registry.record({
      blockId: 'topic-card',
      reason: 'progressive-excerpt-artifact',
      source: 'progressive-excerpt',
      ttlMs: 1_000,
    });

    expect(registry.createSnapshot(1_100).entries).toEqual([
      {
        blockId: 'topic-card',
        expiresAt: 2_100,
        reason: 'progressive-excerpt-artifact',
        source: 'progressive-excerpt',
        suppressAutoCard: true,
      },
    ]);
  });
});

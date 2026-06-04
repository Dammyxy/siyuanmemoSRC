import { describe, expect, it } from 'vitest';
import {
  buildLogicalCardKey,
  buildLogicalXiuyuanKey,
  chooseCanonicalXiuyuan,
  compareXiuyuanAuthority,
  inferXiuyuanOwnership,
  mergeXiuyuanSnapshots,
  normalizeXiuyuanOwnership,
} from '../logicalKeys';

type XiuyuanSnapshot = {
  id: string;
  blockIDs: string[];
  templateID: string;
  fields: Array<Record<string, unknown>>;
  meta: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

function createXiuyuanSnapshot(overrides: Partial<XiuyuanSnapshot> = {}): XiuyuanSnapshot {
  return {
    id: 'xy_local',
    blockIDs: ['20260417120000-local01'],
    templateID: 'basic',
    fields: [],
    meta: {},
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('logicalKeys Xiuyuan ownership authority', () => {
  it('infers ownership for historical riff and local Xiuyuans', () => {
    expect(inferXiuyuanOwnership(createXiuyuanSnapshot({
      templateID: 'builtin-riff-sync',
      meta: {},
    }))).toBe('riff-managed');

    expect(inferXiuyuanOwnership(createXiuyuanSnapshot({
      templateID: 'basic',
      meta: { source: 'riff-sync' },
    }))).toBe('riff-managed');

    expect(inferXiuyuanOwnership(createXiuyuanSnapshot({
      templateID: 'basic',
      meta: {},
    }))).toBe('local-owned');
  });

  it('normalizes missing ownership into meta without changing the logical record', () => {
    const normalized = normalizeXiuyuanOwnership(createXiuyuanSnapshot({
      templateID: 'builtin-riff-sync',
      meta: { source: 'riff-sync' },
    }));

    expect(normalized.meta.ownership).toBe('riff-managed');
    expect(normalized.id).toBe('xy_local');
  });

  it('prefers local-owned over newer riff-managed records', () => {
    const localOlder = createXiuyuanSnapshot({
      id: 'xy_local',
      meta: { ownership: 'local-owned' },
      updatedAt: 100,
    });
    const riffNewer = createXiuyuanSnapshot({
      id: 'xy_riff',
      meta: { ownership: 'riff-managed', source: 'riff-sync' },
      updatedAt: 999,
    });

    expect(compareXiuyuanAuthority(localOlder, riffNewer)).toBeLessThan(0);
    expect(chooseCanonicalXiuyuan([riffNewer, localOlder]).id).toBe('xy_local');
  });

  it('uses updatedAt, createdAt, then id when ownership is equal', () => {
    const older = createXiuyuanSnapshot({
      id: 'xy_a',
      meta: { ownership: 'riff-managed' },
      updatedAt: 100,
      createdAt: 100,
    });
    const newer = createXiuyuanSnapshot({
      id: 'xy_b',
      meta: { ownership: 'riff-managed' },
      updatedAt: 200,
      createdAt: 100,
    });
    const sameTimeLowerId = createXiuyuanSnapshot({
      id: 'xy_a',
      meta: { ownership: 'riff-managed' },
      updatedAt: 200,
      createdAt: 100,
    });

    expect(chooseCanonicalXiuyuan([older, newer]).id).toBe('xy_b');
    expect(chooseCanonicalXiuyuan([newer, sameTimeLowerId]).id).toBe('xy_a');
  });

  it('keeps preferred local ownership when merging incoming riff metadata', () => {
    const local = createXiuyuanSnapshot({
      id: 'xy_local',
      meta: { ownership: 'local-owned', cardIds: ['local-card'] },
      updatedAt: 100,
    });
    const riff = createXiuyuanSnapshot({
      id: 'xy_riff',
      meta: { ownership: 'riff-managed', source: 'riff-sync', cardIds: ['riff-card'] },
      updatedAt: 999,
    });

    const merged = mergeXiuyuanSnapshots(local, riff).value;

    expect(merged.id).toBe('xy_local');
    expect(merged.meta?.ownership).toBe('local-owned');
    expect(merged.meta?.source).toBe('riff-sync');
    expect(merged.meta?.cardIds).toEqual(['local-card', 'riff-card']);
  });

  it('uses live relation key as logical identity for CDF relation cards and Xiuyuans', () => {
    const firstXiuyuan = createXiuyuanSnapshot({
      id: 'xy-first',
      blockIDs: ['concept-block', 'shared-source-block'],
      templateID: 'builtin-concept-definition-forward',
      meta: {
        liveRelationKey: 'shared-source-block:concept-a:definition-forward',
      },
    });
    const secondXiuyuan = createXiuyuanSnapshot({
      id: 'xy-second',
      blockIDs: ['concept-block', 'shared-source-block'],
      templateID: 'builtin-concept-definition-forward',
      meta: {
        liveRelationKey: 'shared-source-block:concept-b:definition-forward',
      },
    });
    const firstCard = {
      xiuyuanID: 'xy-first',
      blockId: 'shared-source-block',
      meta: {
        faceIndex: 0,
        liveRelationKey: 'shared-source-block:concept-a:definition-forward',
      },
    };
    const secondCard = {
      xiuyuanID: 'xy-second',
      blockId: 'shared-source-block',
      meta: {
        faceIndex: 0,
        liveRelationKey: 'shared-source-block:concept-b:definition-forward',
      },
    };

    expect(buildLogicalXiuyuanKey(firstXiuyuan)).toBe('cdf-live:shared-source-block:concept-a:definition-forward');
    expect(buildLogicalXiuyuanKey(secondXiuyuan)).toBe('cdf-live:shared-source-block:concept-b:definition-forward');
    expect(buildLogicalCardKey(firstCard, firstXiuyuan)).toBe('cdf-live:shared-source-block:concept-a:definition-forward');
    expect(buildLogicalCardKey(secondCard, secondXiuyuan)).toBe('cdf-live:shared-source-block:concept-b:definition-forward');
    expect(buildLogicalCardKey(firstCard, firstXiuyuan)).not.toBe(buildLogicalCardKey(secondCard, secondXiuyuan));
  });
});

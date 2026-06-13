import { describe, expect, it } from 'vitest';
import {
  chooseCanonicalXiuyuan,
  compareXiuyuanAuthority,
  inferXiuyuanOwnership,
} from '../XiuyuanOwnershipPolicy';

type XiuyuanPolicyFixture = {
  id: string;
  templateID: string;
  meta: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

function xiuyuan(overrides: Partial<XiuyuanPolicyFixture> = {}): XiuyuanPolicyFixture {
  return {
    id: 'xy-a',
    templateID: 'basic',
    meta: {},
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('XiuyuanOwnershipPolicy', () => {
  it('infers explicit, historical Riff, and local ownership evidence', () => {
    expect(inferXiuyuanOwnership(xiuyuan({
      meta: { ownership: 'local-owned' },
      templateID: 'builtin-riff-sync',
    }))).toBe('local-owned');

    expect(inferXiuyuanOwnership(xiuyuan({
      templateID: 'builtin-riff-sync',
    }))).toBe('riff-managed');

    expect(inferXiuyuanOwnership(xiuyuan({
      meta: { source: 'riff-sync' },
    }))).toBe('riff-managed');

    expect(inferXiuyuanOwnership(xiuyuan())).toBe('local-owned');
  });

  it('chooses canonical Xiuyuan by ownership, updatedAt, createdAt, then stable id', () => {
    const localOlder = xiuyuan({
      id: 'xy-local',
      meta: { ownership: 'local-owned' },
      updatedAt: 100,
      createdAt: 100,
    });
    const riffNewer = xiuyuan({
      id: 'xy-riff',
      meta: { ownership: 'riff-managed' },
      updatedAt: 999,
      createdAt: 999,
    });
    const riffSameUpdatedNewerCreated = xiuyuan({
      id: 'xy-riff-created',
      meta: { ownership: 'riff-managed' },
      updatedAt: 200,
      createdAt: 300,
    });
    const riffSameUpdatedOlderCreated = xiuyuan({
      id: 'xy-riff-old-created',
      meta: { ownership: 'riff-managed' },
      updatedAt: 200,
      createdAt: 100,
    });
    const riffSameTimesLowerId = xiuyuan({
      id: 'xy-a',
      meta: { ownership: 'riff-managed' },
      updatedAt: 200,
      createdAt: 300,
    });

    expect(compareXiuyuanAuthority(localOlder, riffNewer)).toBeLessThan(0);
    expect(chooseCanonicalXiuyuan([riffNewer, localOlder])).toBe(localOlder);
    expect(chooseCanonicalXiuyuan([riffSameUpdatedOlderCreated, riffSameUpdatedNewerCreated])).toBe(riffSameUpdatedNewerCreated);
    expect(chooseCanonicalXiuyuan([riffSameUpdatedNewerCreated, riffSameTimesLowerId])).toBe(riffSameTimesLowerId);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBlocksByIds, request } from '../api.ts';
import { getRiffNewCards, type RiffBlock } from '../riff.ts';

vi.mock('../api.ts', () => ({
  getBlocksByIds: vi.fn(),
  request: vi.fn(),
}));

function createRiffBlock(id: string, overrides: Partial<RiffBlock> = {}): RiffBlock {
  return {
    id,
    box: '',
    path: '',
    hPath: '',
    content: `content-${id}`,
    created: '',
    updated: '',
    type: 'p',
    subType: '',
    ial: {},
    ...overrides,
  };
}

describe('Riff API incremental new-card filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enriches missing timestamps before filtering cards by incremental since', async () => {
    const oldBlockId = '20260301120000-oldcard';
    const newBlockId = '20260303120000-newcard';
    vi.mocked(request).mockResolvedValue({
      blocks: [
        createRiffBlock(oldBlockId),
        createRiffBlock(newBlockId),
      ],
      total: 2,
      pageCount: 1,
    });
    vi.mocked(getBlocksByIds).mockResolvedValue([
      { id: oldBlockId, created_time: '2026-03-01T12:00:00.000Z' },
      { id: newBlockId, created_time: '2026-03-03T12:00:00.000Z' },
    ]);

    const result = await getRiffNewCards('deck-1', Date.parse('2026-03-02T00:00:00.000Z'));

    expect(result.map(card => card.id)).toEqual([newBlockId]);
    expect(getBlocksByIds).toHaveBeenCalledWith([oldBlockId, newBlockId]);
  });

  it('uses the SiYuan block id timestamp fallback and excludes unknown timestamps from incremental scans', async () => {
    const newBlockId = '20260304120000-newcard';
    vi.mocked(request).mockResolvedValue({
      blocks: [
        createRiffBlock(newBlockId),
        createRiffBlock('not-a-siyuan-id'),
      ],
      total: 2,
      pageCount: 1,
    });
    vi.mocked(getBlocksByIds).mockResolvedValue([]);

    const result = await getRiffNewCards('deck-1', Date.parse('2026-03-03T00:00:00.000Z'));

    expect(result.map(card => card.id)).toEqual([newBlockId]);
  });
});

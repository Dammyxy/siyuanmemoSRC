import { describe, expect, it, vi } from 'vitest';
import { AIWorkbenchContextRuntime } from '../AIWorkbenchContextRuntime';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { AIWorkbenchState } from '@/types/ai';

function card(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: 'card-1',
    xiuyuanID: 'xiuyuan-1',
    blockId: 'block-1',
    due: 0,
    stability: 1,
    difficulty: 1,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 0,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: 0,
    updatedAt: 0,
    meta: {
      frontBlockIDs: ['front-1'],
      backBlockIDs: ['back-1'],
    },
    ...overrides,
  };
}

describe('AIWorkbenchContextRuntime', () => {
  it('builds review context snapshots without changing context shape', async () => {
    const runtime = new AIWorkbenchContextRuntime({
      state: {} as AIWorkbenchState,
      siyuanPort: {
        sql: vi.fn(async () => [
          { id: 'block-1', root_id: 'doc-1', type: 'p', content: 'Block', markdown: 'Block md', hpath: '/Doc' },
          { id: 'front-1', root_id: 'doc-1', type: 'p', content: 'Front', markdown: 'Front md', hpath: '/Doc' },
          { id: 'back-1', root_id: 'doc-1', type: 'p', content: 'Back', markdown: 'Back md', hpath: '/Doc' },
        ]),
        copyStdMarkdown: vi.fn(async (blockId: string) => `std:${blockId}`),
      } as never,
      cardContentQueryService: {
        getBlockContentsWithType: vi.fn(async (blockIds: string[]) => new Map(
          blockIds.map((blockId) => [blockId, { type: 'p', content: `content:${blockId}`, isDocument: false }]),
        )),
      } as never,
    });

    const snapshot = await runtime.buildContextSnapshot({
      source: 'review',
      currentCard: card(),
      currentBlockId: 'block-1',
      revealed: true,
      selectedBlockIds: ['extra-1'],
    });

    expect(snapshot.source).toBe('review');
    expect(snapshot.selectedBlockIds).toEqual(['extra-1', 'block-1', 'front-1', 'back-1']);
    expect(snapshot.currentCard).toMatchObject({
      cardId: 'card-1',
      blockId: 'block-1',
      revealed: true,
      frontText: 'content:front-1',
      backText: 'content:back-1',
      sourceText: 'content:front-1\n\ncontent:back-1\n\ncontent:block-1',
    });
  });

  it('creates manual attachments and ignores empty content', () => {
    const runtime = new AIWorkbenchContextRuntime({
      state: {} as AIWorkbenchState,
      siyuanPort: {} as never,
      cardContentQueryService: {} as never,
    });

    expect(runtime.createManualContextAttachment('  ')).toBeNull();
    expect(runtime.createManualContextAttachment('hello')).toMatchObject({
      providerKey: 'manual-text',
      title: '手工材料',
      content: 'hello',
    });
  });
});

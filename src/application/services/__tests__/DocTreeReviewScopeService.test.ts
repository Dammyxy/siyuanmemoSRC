import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FSRSCard } from '@/types/card';
import { DocTreeReviewScopeService } from '@/application/services/DocTreeReviewScopeService';
import { classifyTransactionBatch } from '@/core/infrastructure/websocket/transaction-classifier';

function createFixture(options?: {
  allCards?: FSRSCard[];
  sqlRows?: Array<Record<string, unknown>>;
  readPort?: ConstructorParameters<typeof DocTreeReviewScopeService>[2];
}) {
  let currentRows = options?.sqlRows ?? [];

  const siyuanApi = {
    sql: vi.fn(async () => currentRows),
  };

  const storage = {
    getAllCards: vi.fn(() => options?.allCards ?? []),
  };

  const service = new DocTreeReviewScopeService(siyuanApi as any, storage as any, options?.readPort ?? null);

  return {
    service,
    siyuanApi,
    storage,
    setSqlRows: (rows: Array<Record<string, unknown>>) => {
      currentRows = rows;
    },
  };
}

describe('DocTreeReviewScopeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('hydrates doc tree locations and collects recursive cards by physical tree path', async () => {
    const now = Date.now();
    const allCards: FSRSCard[] = [
      { id: 'doc-root-item', blockId: 'block-doc-1', type: 'item', due: now - 1, meta: { rootId: 'doc-1' } } as FSRSCard,
      { id: 'piece-topic', blockId: 'piece-doc-1', type: 'topic', due: now - 1, meta: { rootId: 'piece-doc-1' } } as FSRSCard,
      { id: 'excerpt-topic', blockId: 'excerpt-doc-1', type: 'topic', due: now - 1, meta: { rootId: 'excerpt-doc-1' } } as FSRSCard,
      { id: 'outside-topic', blockId: 'outside-doc-1', type: 'topic', due: now - 1, meta: { rootId: 'outside-doc-1' } } as FSRSCard,
    ];
    const { service } = createFixture({
      allCards,
      sqlRows: [
        { id: 'doc-1', box: 'nb', path: '/articles/doc-1.sy' },
        { id: 'piece-doc-1', box: 'nb', path: '/articles/doc-1/01 piece.sy' },
        { id: 'excerpt-doc-1', box: 'nb', path: '/articles/doc-1/01 piece/[摘录 001] x.sy' },
        { id: 'outside-doc-1', box: 'nb', path: '/articles/other.sy' },
      ],
    });

    await service.hydrate();
    const scope = service.collectDocReviewScope('doc-1');

    expect(scope?.docIds).toEqual(['doc-1', 'piece-doc-1', 'excerpt-doc-1']);
    expect(scope?.cards.map((card) => card.id)).toEqual([
      'doc-root-item',
      'piece-topic',
      'excerpt-topic',
    ]);
  });

  it('includes ordinary cards whose rootId is missing by resolving block root_id during hydration', async () => {
    const now = Date.now();
    const allCards: FSRSCard[] = [
      { id: 'card-1', blockId: 'block-1', type: 'item', due: now - 1 } as FSRSCard,
      { id: 'card-2', blockId: 'block-2', type: 'item', due: now - 1 } as FSRSCard,
      { id: 'card-outside', blockId: 'block-outside', type: 'item', due: now - 1 } as FSRSCard,
    ];
    const { service, siyuanApi } = createFixture({
      allCards,
      sqlRows: [
        { id: 'doc-1', box: 'nb', path: '/articles/doc-1.sy' },
        { id: 'doc-2', box: 'nb', path: '/articles/doc-2.sy' },
      ],
    });

    vi.mocked(siyuanApi.sql)
      .mockResolvedValueOnce([
        { id: 'doc-1', box: 'nb', path: '/articles/doc-1.sy' },
        { id: 'doc-2', box: 'nb', path: '/articles/doc-2.sy' },
      ])
      .mockResolvedValueOnce([
        { id: 'block-1', root_id: 'doc-1' },
        { id: 'block-2', root_id: 'doc-1' },
        { id: 'block-outside', root_id: 'doc-2' },
      ]);

    await service.hydrate();
    const scope = service.collectDocReviewScope('doc-1');

    expect(scope?.cards.map((card) => card.id)).toEqual(['card-1', 'card-2']);
  });

  it('returns null before hydrate completes so callers can show loading state', () => {
    const { service, siyuanApi } = createFixture();

    const scope = service.collectDocReviewScope('doc-1');

    expect(scope).toBeNull();
    expect(siyuanApi.sql).toHaveBeenCalledTimes(1);
  });

  it('collects recursive cards from SQL projection port without scanning all cards', async () => {
    const scopedCards = [
      { id: 'card-doc-1', blockId: 'block-doc-1', type: 'item', due: Date.now(), meta: { rootId: 'doc-1' } } as FSRSCard,
      { id: 'card-piece', blockId: 'block-piece', type: 'topic', due: Date.now(), meta: { rootId: 'piece-doc-1' } } as FSRSCard,
    ];
    const readPort = {
      queryCardIdsByRootIds: vi.fn(() => ['card-doc-1', 'card-piece']),
      queryRootlessCardBlockIds: vi.fn(() => []),
      getDeckCardsByIds: vi.fn(() => scopedCards),
    };
    const { service, storage } = createFixture({
      readPort,
      sqlRows: [
        { id: 'doc-1', box: 'nb', path: '/articles/doc-1.sy' },
        { id: 'piece-doc-1', box: 'nb', path: '/articles/doc-1/01 piece.sy' },
      ],
    });

    await service.hydrate();
    const scope = service.collectDocReviewScope('doc-1');

    expect(scope?.cards.map((card) => card.id)).toEqual(['card-doc-1', 'card-piece']);
    expect(readPort.queryCardIdsByRootIds).toHaveBeenCalledWith(['doc-1', 'piece-doc-1'], {
      excludeKnownMissing: true,
    });
    expect(storage.getAllCards).not.toHaveBeenCalled();
  });

  it('falls back to storage scan when SQL projection scope query fails', async () => {
    const allCards = [
      { id: 'card-legacy', blockId: 'block-legacy', type: 'item', due: Date.now(), meta: { rootId: 'doc-1' } } as FSRSCard,
    ];
    const readPort = {
      queryCardIdsByRootIds: vi.fn(() => {
        throw new Error('SQL unavailable');
      }),
      queryRootlessCardBlockIds: vi.fn(() => []),
      getDeckCardsByIds: vi.fn(() => []),
    };
    const { service, storage } = createFixture({
      allCards,
      readPort,
      sqlRows: [
        { id: 'doc-1', box: 'nb', path: '/articles/doc-1.sy' },
      ],
    });

    await service.hydrate();
    const scope = service.collectDocReviewScope('doc-1');

    expect(scope?.cards.map((card) => card.id)).toEqual(['card-legacy']);
    expect(storage.getAllCards).toHaveBeenCalled();
  });

  it('drops moved-out child docs after a debounced rebuild triggered by a transaction', async () => {
    vi.useFakeTimers();

    const now = Date.now();
    const allCards: FSRSCard[] = [
      { id: 'root-item', blockId: 'doc-1', type: 'item', due: now - 1, meta: { rootId: 'doc-1' } } as FSRSCard,
      { id: 'moved-topic', blockId: 'piece-doc-1', type: 'topic', due: now - 1, meta: { rootId: 'piece-doc-1' } } as FSRSCard,
    ];
    const { service, setSqlRows } = createFixture({
      allCards,
      sqlRows: [
        { id: 'doc-1', box: 'nb', path: '/articles/doc-1.sy' },
        { id: 'piece-doc-1', box: 'nb', path: '/articles/doc-1/01 piece.sy' },
      ],
    });

    await service.hydrate();
    expect(service.collectDocReviewScope('doc-1')?.cards.map((card) => card.id)).toEqual([
      'root-item',
      'moved-topic',
    ]);

    setSqlRows([
      { id: 'doc-1', box: 'nb', path: '/articles/doc-1.sy' },
      { id: 'piece-doc-1', box: 'nb', path: '/archive/piece-doc-1.sy' },
    ]);

    const transactions = [
      {
        doOperations: [
          {
            action: 'move',
            id: 'piece-doc-1',
            data: {
              old: { type: 'd' },
              new: { type: 'd' },
            },
          },
        ],
        undoOperations: null,
      },
    ];
    const classification = classifyTransactionBatch(transactions as never);
    expect(service.shouldHandleTransactionBatch(classification)).toBe(true);
    service.handle(transactions as never, classification);

    await vi.advanceTimersByTimeAsync(260);

    expect(service.collectDocReviewScope('doc-1')?.cards.map((card) => card.id)).toEqual([
      'root-item',
    ]);
  });

  it('skips ordinary classified no-op batches without scheduling rebuild', async () => {
    vi.useFakeTimers();
    const { service, siyuanApi } = createFixture({
      sqlRows: [
        { id: 'doc-1', box: 'nb', path: '/articles/doc-1.sy' },
      ],
    });
    await service.hydrate();
    vi.mocked(siyuanApi.sql).mockClear();

    const transactions = [{
      doOperations: [{
        action: 'update',
        id: 'paragraph-1',
        data: {
          new: {
            content: 'ordinary paragraph',
          },
        },
      }],
      undoOperations: null,
    }];
    const classification = classifyTransactionBatch(transactions as never);

    expect(service.shouldHandleTransactionBatch(classification)).toBe(false);
    service.handle(transactions as never, classification);
    await vi.advanceTimersByTimeAsync(260);

    expect(siyuanApi.sql).not.toHaveBeenCalled();
  });
});

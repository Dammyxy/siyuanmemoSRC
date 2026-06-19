/**
 * TransactionWebSocketService 单元测试
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type FSRSPlugin from '@/index';
import {
  TransactionWebSocketService,
  type ITransactionHandler,
  type Transaction,
} from '../TransactionWebSocketService';

describe('TransactionWebSocketService', () => {
  let service: TransactionWebSocketService;
  let wsMainListener: ((event: unknown) => void) | null;
  let eventBus: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
  };

  const createTransaction = (blockId: string): Transaction => ({
    doOperations: [
      {
        action: 'update',
        id: blockId,
        data: {},
      },
    ],
    undoOperations: null,
  });

  const emitTransactions = (transactions: Transaction[]): void => {
    wsMainListener?.({
      detail: {
        cmd: 'transactions',
        data: transactions,
      },
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    wsMainListener = null;
    eventBus = {
      on: vi.fn((event: string, listener: (event: unknown) => void) => {
        if (event === 'ws-main') {
          wsMainListener = listener;
        }
      }),
      off: vi.fn((event: string, listener: (event: unknown) => void) => {
        if (event === 'ws-main' && wsMainListener === listener) {
          wsMainListener = null;
        }
      }),
    };
    service = new TransactionWebSocketService({ eventBus } as unknown as FSRSPlugin);
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
  });

  it('start only binds one ws-main listener and stop detaches it', () => {
    service.start();
    service.start();

    expect(eventBus.on).toHaveBeenCalledTimes(1);
    expect(eventBus.on).toHaveBeenCalledWith('ws-main', expect.any(Function));
    expect(wsMainListener).toEqual(expect.any(Function));

    service.stop();

    expect(eventBus.off).toHaveBeenCalledTimes(1);
    expect(eventBus.off).toHaveBeenCalledWith('ws-main', expect.any(Function));
    expect(wsMainListener).toBeNull();
  });

  it('distributes parsed transactions to all registered handlers', () => {
    const handler1: ITransactionHandler = { handle: vi.fn() };
    const handler2: ITransactionHandler = { handle: vi.fn() };
    const transactions = [createTransaction('block-1')];

    service.registerHandler(handler1);
    service.registerHandler(handler2);
    service.start();
    emitTransactions(transactions);

    expect(handler1.handle).toHaveBeenCalledWith(transactions, expect.objectContaining({
      transactionCount: 1,
      changedBlockIds: ['block-1'],
    }), expect.anything());
    expect(handler2.handle).toHaveBeenCalledWith(transactions, expect.objectContaining({
      transactionCount: 1,
      changedBlockIds: ['block-1'],
    }), expect.anything());
  });

  it('keeps per-edit transaction receipt logging at debug level', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.resetModules();
    const { TransactionWebSocketService: DynamicTransactionWebSocketService } = await import('../TransactionWebSocketService');
    const { setGlobalLogLevel } = await import('@/utils/logger');
    setGlobalLogLevel('debug');
    const dynamicService = new DynamicTransactionWebSocketService({ eventBus } as unknown as FSRSPlugin);
    const handler: ITransactionHandler = { handle: vi.fn() };

    dynamicService.registerHandler(handler);
    dynamicService.start();
    info.mockClear();
    debug.mockClear();
    emitTransactions([createTransaction('block-1')]);

    expect(info).not.toHaveBeenCalledWith(
      '[SiYuanMemo][TransactionWebSocketService]',
      'Transaction received, count:',
      1,
    );
    expect(debug).toHaveBeenCalledWith(
      '[SiYuanMemo][TransactionWebSocketService]',
      'Transaction received, count:',
      1,
    );
    dynamicService.stop();
  });

  it('classifies once and skips handlers whose predicate does not match', () => {
    const skippedHandler: ITransactionHandler = {
      getTransactionConsumerId: () => 'skipped-consumer',
      shouldHandleTransactionBatch: vi.fn(() => false),
      handle: vi.fn(),
    };
    const matchedHandler: ITransactionHandler = {
      getTransactionConsumerId: () => 'matched-consumer',
      shouldHandleTransactionBatch: vi.fn(() => true),
      handle: vi.fn(),
    };
    const transactions = [createTransaction('block-ordinary')];

    service.registerHandler(skippedHandler);
    service.registerHandler(matchedHandler);
    service.start();
    emitTransactions(transactions);

    expect(skippedHandler.shouldHandleTransactionBatch).toHaveBeenCalledTimes(1);
    expect(skippedHandler.handle).not.toHaveBeenCalled();
    expect(matchedHandler.shouldHandleTransactionBatch).toHaveBeenCalledTimes(1);
    expect(matchedHandler.handle).toHaveBeenCalledWith(transactions, expect.objectContaining({
      transactionCount: 1,
      changedBlockIds: ['block-ordinary'],
    }), expect.objectContaining({
      autoCard: expect.objectContaining({
        candidateOperations: expect.arrayContaining([
          expect.objectContaining({ blockId: 'block-ordinary' }),
        ]),
      }),
    }));
  });

  it('passes provenance-aware fan-out plans to handlers', () => {
    service.stop();
    service = new TransactionWebSocketService(
      { eventBus } as unknown as FSRSPlugin,
      {
        provenanceRegistry: {
          createSnapshot: () => ({
            capturedAt: Date.now(),
            entries: [{
              blockId: 'block-4',
              expiresAt: Date.now() + 1_000,
              reason: 'progressive-excerpt-topic-card',
              source: 'progressive-excerpt',
            }],
          }),
        },
      },
    );
    const handler: ITransactionHandler = {
      shouldHandleTransactionBatch: vi.fn(() => true),
      handle: vi.fn(),
    };

    service.registerHandler(handler);
    service.start();
    emitTransactions([{
      doOperations: [{
        action: 'update',
        id: 'block-4',
        data: { new: { content: 'Prompt >> Answer' } },
      }],
      undoOperations: null,
    }]);

    expect(handler.handle).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        transactionCount: 1,
      }),
      expect.objectContaining({
        autoCard: expect.objectContaining({
          candidateOperations: [],
          suppressedOperations: [
            expect.objectContaining({
              blockId: 'block-4',
              provenanceReason: 'progressive-excerpt-topic-card',
            }),
          ],
        }),
      }),
    );
  });

  it('keeps distributing when one handler throws', () => {
    const handler1: ITransactionHandler = {
      handle: vi.fn(() => {
        throw new Error('handler failed');
      }),
    };
    const handler2: ITransactionHandler = { handle: vi.fn() };
    const transactions = [createTransaction('block-2')];

    service.registerHandler(handler1);
    service.registerHandler(handler2);
    service.start();
    emitTransactions(transactions);

    expect(handler1.handle).toHaveBeenCalledWith(transactions, expect.objectContaining({
      transactionCount: 1,
    }), expect.anything());
    expect(handler2.handle).toHaveBeenCalledWith(transactions, expect.objectContaining({
      transactionCount: 1,
    }), expect.anything());
  });

  it('does not call handlers after unregister', () => {
    const handler: ITransactionHandler = { handle: vi.fn() };

    service.registerHandler(handler);
    service.unregisterHandler(handler);
    service.start();
    emitTransactions([createTransaction('block-3')]);

    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('parses string ws-main payloads', () => {
    const handler: ITransactionHandler = { handle: vi.fn() };
    const transactions = [createTransaction('block-4')];

    service.registerHandler(handler);
    service.start();
    wsMainListener?.({
      detail: {
        data: JSON.stringify({
          cmd: 'transactions',
          data: transactions,
        }),
      },
    });

    expect(handler.handle).toHaveBeenCalledWith(transactions, expect.objectContaining({
      transactionCount: 1,
      changedBlockIds: ['block-4'],
    }), expect.anything());
  });

  it('does not start without plugin.eventBus.on', () => {
    service.stop();
    service = new TransactionWebSocketService({ eventBus: {} } as unknown as FSRSPlugin);
    const handler: ITransactionHandler = { handle: vi.fn() };

    service.registerHandler(handler);
    service.start();

    expect(handler.handle).not.toHaveBeenCalled();
  });
});

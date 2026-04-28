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

    expect(handler1.handle).toHaveBeenCalledWith(transactions);
    expect(handler2.handle).toHaveBeenCalledWith(transactions);
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

    expect(handler1.handle).toHaveBeenCalledWith(transactions);
    expect(handler2.handle).toHaveBeenCalledWith(transactions);
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

    expect(handler.handle).toHaveBeenCalledWith(transactions);
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

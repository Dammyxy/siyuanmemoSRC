import { describe, expect, it } from 'vitest';
import { parseTransactionsPayload } from '../transaction-types';

describe('transaction-types', () => {
  it('keeps removeFlashcards operations that only carry blockIDs', () => {
    const transactions = parseTransactionsPayload([{
      doOperations: [{
        action: 'removeFlashcards',
        blockIDs: ['block-1', 'block-2'],
      }],
      undoOperations: null,
    }]);

    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.doOperations).toHaveLength(1);
    expect(transactions[0]?.doOperations[0]).toMatchObject({
      action: 'removeFlashcards',
      id: '',
      blockIDs: ['block-1', 'block-2'],
    });
  });

  it('keeps ids fallback arrays when id is absent', () => {
    const transactions = parseTransactionsPayload([{
      doOperations: [{
        action: 'removeFlashcards',
        ids: ['block-3'],
      }],
      undoOperations: null,
    }]);

    expect(transactions[0]?.doOperations[0]).toMatchObject({
      action: 'removeFlashcards',
      id: '',
      ids: ['block-3'],
    });
  });

  it('preserves SiYuan string operation data for downstream classification', () => {
    const transactions = parseTransactionsPayload([{
      doOperations: [{
        action: 'update',
        id: 'block-html',
        data: '<div data-node-id="block-html"><div contenteditable="true">ordinary line</div></div>',
      }],
      undoOperations: null,
    }]);

    expect(transactions[0]?.doOperations[0]).toMatchObject({
      action: 'update',
      id: 'block-html',
      data: expect.stringContaining('data-node-id'),
    });
  });
});

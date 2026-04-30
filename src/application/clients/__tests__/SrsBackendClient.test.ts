import { describe, expect, it, vi } from 'vitest';
import { SrsBackendClient, type SrsBackendTransport } from '../SrsBackendClient';

describe('SrsBackendClient', () => {
  it('sends browser phase-2 rpc envelopes with positional params', async () => {
    const requests: Array<{ method: string; params: unknown }> = [];
    const transport: SrsBackendTransport = {
      request: vi.fn(async (request) => {
        requests.push({ method: request.method, params: request.params });
        switch (request.method) {
          case 'browser.deck.page':
            return { jsonrpc: '2.0', id: request.id, result: { total: 0, cards: [] } };
          case 'browser.deck.matchedIds':
            return { jsonrpc: '2.0', id: request.id, result: { ids: ['card-1'] } };
          case 'browser.deck.rowsByIds':
            return { jsonrpc: '2.0', id: request.id, result: { cards: [{ id: 'card-1', blockId: 'block-1' }] } };
          case 'browser.stats':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                totalCards: 1,
                dueCards: 1,
                newCards: 0,
                learningCards: 0,
                reviewCards: 1,
                suspendedCards: 0,
                lostCards: 0,
              },
            };
          case 'browser.count':
            return { jsonrpc: '2.0', id: request.id, result: { count: 1 } };
          case 'browser.sourceExistence.refreshCandidates':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                candidates: [
                  {
                    cardId: 'card-1',
                    blockId: 'block-1',
                    sourceExists: null,
                    sourceCheckedAt: null,
                  },
                ],
              },
            };
          case 'browser.sourceExistence.byBlockIds':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                statusByBlockId: [
                  { blockId: 'block-1', exists: false },
                ],
              },
            };
          case 'browser.sourceExistence.update':
            return { jsonrpc: '2.0', id: request.id, result: { updated: 1 } };
          case 'browser.sourceExistence.summary':
            return { jsonrpc: '2.0', id: request.id, result: { unknown: 0, stale: 0, missing: 1 } };
          case 'browser.sourceExistence.applySweep':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: { checked: 1, updated: 1, changed: true, changedToMissing: false },
            };
          case 'browser.sourceExistence.applySweepHost':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: { checked: 1, updated: 1, changed: true, changedToMissing: false },
            };
          case 'kernel.transaction.ingest':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                accepted: 1,
                queued: 1,
                receivedAt: 1,
                duplicate: false,
                queueLength: 1,
                maxQueueLength: 256,
              },
            };
          case 'review.feedback':
            return { jsonrpc: '2.0', id: request.id, error: { code: 'BACKEND_UNAVAILABLE', message: 'review not ready' } };
          default:
            return { jsonrpc: '2.0', id: request.id, error: { code: 'METHOD_NOT_FOUND', message: 'not mocked' } };
        }
      }),
    };

    const client = new SrsBackendClient(transport);
    await client.browserDeckPage({ preset: 'all' }, { startRow: 0, endRow: 10 });
    await expect(client.browserDeckMatchedIds({ preset: 'all' })).resolves.toEqual(['card-1']);
    await expect(client.browserDeckRowsByIds(['card-1'])).resolves.toEqual([{ id: 'card-1', blockId: 'block-1' }]);
    await expect(client.browserStats()).resolves.toMatchObject({ totalCards: 1, dueCards: 1 });
    await expect(client.browserCountCards({ includeSuspended: false })).resolves.toBe(1);
    await expect(client.browserSourceExistenceRefreshCandidates({ blockIds: ['block-1'] })).resolves.toHaveLength(1);
    await expect(client.browserSourceExistenceByBlockIds(['block-1'])).resolves.toEqual(new Map([['block-1', false]]));
    await expect(client.browserSourceExistenceUpdate([{ blockId: 'block-1', exists: false }], 1)).resolves.toBe(1);
    await expect(client.browserSourceExistenceSummary()).resolves.toEqual({ unknown: 0, stale: 0, missing: 1 });
    await expect(client.browserSourceExistenceApplySweep({ blockIds: ['block-1'] }, ['block-1'], 1)).resolves.toEqual({
      checked: 1,
      updated: 1,
      changed: true,
      changedToMissing: false,
    });
    await expect(client.browserSourceExistenceApplySweepHost({ blockIds: ['block-1'] }, 1)).resolves.toEqual({
      checked: 1,
      updated: 1,
      changed: true,
      changedToMissing: false,
    });
    await expect(client.ingestKernelTransactions({
      source: 'kernel-sidecar',
      transactions: [{ id: 'tx-1' }],
      receivedAt: 1,
      idempotencyKey: 'tx-1',
    })).resolves.toEqual({
      accepted: 1,
      queued: 1,
      receivedAt: 1,
      duplicate: false,
      queueLength: 1,
      maxQueueLength: 256,
    });
    await expect(client.reviewFeedback({
      cardId: 'card-1',
      rating: 3,
      queueType: 'incremental-learning',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
    })).rejects.toThrow('BACKEND_UNAVAILABLE: review not ready');

    expect(requests.map((request) => request.method)).toEqual([
      'browser.deck.page',
      'browser.deck.matchedIds',
      'browser.deck.rowsByIds',
      'browser.stats',
      'browser.count',
      'browser.sourceExistence.refreshCandidates',
      'browser.sourceExistence.byBlockIds',
      'browser.sourceExistence.update',
      'browser.sourceExistence.summary',
      'browser.sourceExistence.applySweep',
      'browser.sourceExistence.applySweepHost',
      'kernel.transaction.ingest',
      'review.feedback',
    ]);
    expect(requests[0].params).toEqual([{ query: { preset: 'all' }, page: { startRow: 0, endRow: 10 } }]);
    expect(requests[1].params).toEqual([{ query: { preset: 'all' } }]);
    expect(requests[12].params).toEqual([{
      cardId: 'card-1',
      rating: 3,
      queueType: 'incremental-learning',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
    }]);
  });
});

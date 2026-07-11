import { describe, expect, it, vi } from 'vitest';
import {
  BACKEND_RPC_VERSION,
  STORAGE_DURABILITY_RECEIPT_VERSION,
  type BackendCardCrudBatchMutateRequest,
  type BackendCardScheduleBatchUpdateRequest,
} from '../../../packages/contracts/src/backend-rpc';
import { BackendCardRpcRuntime } from './BackendCardRpcAdapter';
import { BackendRpcDispatcher } from './BackendRpcDispatcher';
import {
  BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS,
  createBackendRpcHandlerRegistry,
} from './BackendRpcRegistry';

describe('BackendCardRpcAdapter', () => {
  it('commits one Card/Schedule batch through Worker authority and returns journal durability', async () => {
    const request: BackendCardScheduleBatchUpdateRequest = {
      mutationId: 'card-schedule:test-1',
      schedulingWriteSource: 'manual-reschedule',
      cards: [{
        id: 'card-1',
        xiuyuanID: 'xy-card-1',
        blockId: 'block-card-1',
        due: 1_800_000_000_000,
        stability: 5,
        difficulty: 4,
        reps: 3,
        lapses: 0,
        state: 2,
        lastReview: 1_700_000_000_000,
        elapsedDays: 1,
        scheduledDays: 10,
        priority: 50,
        type: 'item',
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: 1_600_000_000_000,
        updatedAt: 1_700_000_000_000,
      }],
    };
    const commitCardScheduleBatch = vi.fn(async () => ({
      updatedCardIds: ['card-1'],
      durabilityReceipt: {
        version: STORAGE_DURABILITY_RECEIPT_VERSION,
        mutationId: request.mutationId,
        family: 'card-schedule' as const,
        stage: 'journaled' as const,
        journalSequence: 8,
        affectedAggregates: [{
          family: 'card-schedule',
          aggregateId: 'card-1',
          causalBaseRevision: null,
        }],
        requiredTruthOutputs: [{
          family: 'card-schedule',
          kind: 'changeset' as const,
          aggregateIds: ['card-1'],
        }],
        truthGenerationId: null,
        retry: {
          attemptCount: 0,
          nextAttemptAt: null,
          lastError: null,
        },
        diagnosticCode: null,
        diagnosticMessage: null,
        updatedAt: 1_700_000_000_100,
      },
    }));
    const card = new BackendCardRpcRuntime({
      database: { commitCardScheduleBatch },
    });
    const dispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry(BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS),
    );

    const response = await dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 1,
      method: 'card.schedule.batchUpdate',
      params: request,
    }, { card });

    expect(commitCardScheduleBatch).toHaveBeenCalledWith(request);
    expect(response.result).toMatchObject({
      updatedCardIds: ['card-1'],
      durabilityReceipt: {
        mutationId: request.mutationId,
        family: 'card-schedule',
        stage: 'journaled',
        journalSequence: 8,
      },
    });
  });

  it('commits one Card CRUD projection patch through Worker authority', async () => {
    const request: BackendCardCrudBatchMutateRequest = {
      mutationId: 'card-crud:test-1',
      upsertCards: [{
        id: 'card-crud-1',
        xiuyuanID: 'xy-crud-1',
        blockId: 'block-crud-1',
        due: 1_800_000_000_000,
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
        state: 0,
        lastReview: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        priority: 50,
        type: 'item',
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      }],
      upsertXiuyuans: [{
        id: 'xy-crud-1',
        blockIDs: ['block-crud-1'],
        fields: [],
        templateID: 'builtin-quick-card',
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      }],
      deleteCardIds: ['card-crud-old'],
      deleteXiuyuanIds: ['xy-crud-old'],
    };
    const commitCardCrudBatch = vi.fn(async () => ({
      upsertedCardIds: ['card-crud-1'],
      upsertedXiuyuanIds: ['xy-crud-1'],
      deletedCardIds: ['card-crud-old'],
      deletedXiuyuanIds: ['xy-crud-old'],
      durabilityReceipt: {
        version: STORAGE_DURABILITY_RECEIPT_VERSION,
        mutationId: request.mutationId,
        family: 'card-crud' as const,
        stage: 'journaled' as const,
        journalSequence: 9,
        affectedAggregates: [{
          family: 'card-crud',
          aggregateId: 'card-crud-1',
          causalBaseRevision: null,
        }, {
          family: 'card-crud',
          aggregateId: 'card-crud-old',
          causalBaseRevision: null,
        }],
        requiredTruthOutputs: [{
          family: 'card-crud',
          kind: 'changeset' as const,
          aggregateIds: ['card-crud-1'],
        }, {
          family: 'card-crud',
          kind: 'tombstone' as const,
          aggregateIds: ['card-crud-old'],
        }],
        truthGenerationId: null,
        retry: {
          attemptCount: 0,
          nextAttemptAt: null,
          lastError: null,
        },
        diagnosticCode: null,
        diagnosticMessage: null,
        updatedAt: 1_700_000_000_100,
      },
    }));
    const card = new BackendCardRpcRuntime({
      database: {
        commitCardScheduleBatch: vi.fn(),
        commitCardCrudBatch,
      },
    });
    const dispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry(BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS),
    );

    const response = await dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 2,
      method: 'card.crud.batchMutate',
      params: request,
    }, { card });

    expect(commitCardCrudBatch).toHaveBeenCalledWith(request);
    expect(response.result).toMatchObject({
      upsertedCardIds: ['card-crud-1'],
      deletedCardIds: ['card-crud-old'],
      durabilityReceipt: {
        mutationId: request.mutationId,
        family: 'card-crud',
        stage: 'journaled',
        journalSequence: 9,
      },
    });
  });

  it('reads Native Riff import exclusion through Worker authority', async () => {
    const request = { blockId: 'block-native-riff-excluded' };
    const findNativeRiffImportExclusion = vi.fn(async () => ({
      exclusion: {
        version: 1 as const,
        blockId: request.blockId,
        nativeCardId: 'native-card-1',
        deckId: 'deck-1',
        excludedAt: 1_700_000_000_000,
        source: 'user' as const,
        reason: 'user-excluded',
      },
    }));
    const card = new BackendCardRpcRuntime({
      database: {
        commitCardScheduleBatch: vi.fn(),
        commitCardCrudBatch: vi.fn(),
        findNativeRiffImportExclusion,
      },
    });
    const dispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry(BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS),
    );

    const response = await dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 3,
      method: 'card.nativeRiffImportExclusion.find',
      params: request,
    }, { card });

    expect(findNativeRiffImportExclusion).toHaveBeenCalledWith(request);
    expect(response.result).toEqual({
      exclusion: {
        version: 1,
        blockId: request.blockId,
        nativeCardId: 'native-card-1',
        deckId: 'deck-1',
        excludedAt: 1_700_000_000_000,
        source: 'user',
        reason: 'user-excluded',
      },
    });
  });

  it('rejects Native Riff import exclusion reads without blockId', () => {
    const findNativeRiffImportExclusion = vi.fn();
    const card = new BackendCardRpcRuntime({
      database: {
        commitCardScheduleBatch: vi.fn(),
        commitCardCrudBatch: vi.fn(),
        findNativeRiffImportExclusion,
      },
    });

    expect(() => card.handleNativeRiffImportExclusionFind({ blockId: '   ' }))
      .toThrow('INVALID_REQUEST: card.nativeRiffImportExclusion.find requires blockId');
    expect(findNativeRiffImportExclusion).not.toHaveBeenCalled();
  });
});

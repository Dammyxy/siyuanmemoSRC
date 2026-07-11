import { describe, expect, it, vi } from 'vitest';
import {
  BACKEND_RPC_VERSION,
  STORAGE_DURABILITY_RECEIPT_VERSION,
  type BackendQueueStateBatchMutateRequest,
} from '../../../packages/contracts/src/backend-rpc';
import { BackendQueueRpcRuntime } from './BackendQueueRpcAdapter';
import { BackendRpcDispatcher } from './BackendRpcDispatcher';
import {
  BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS,
  createBackendRpcHandlerRegistry,
} from './BackendRpcRegistry';

describe('BackendQueueRpcAdapter', () => {
  it('loads and mutates formal queue state through Worker authority', async () => {
    const loadQueueState = vi.fn(async () => ({
      retrievalPracticeQueue: ['card-existing'],
    }));
    const request: BackendQueueStateBatchMutateRequest = {
      mutationId: 'queue:test-1',
      mutations: [{
        operation: 'set',
        key: 'retrievalPracticeQueue',
        value: ['card-existing', 'card-new'],
      }],
    };
    const commitQueueStateBatch = vi.fn(async () => ({
      updatedKeys: ['retrievalPracticeQueue'],
      deletedKeys: [],
      durabilityReceipt: {
        version: STORAGE_DURABILITY_RECEIPT_VERSION,
        mutationId: request.mutationId,
        family: 'queue' as const,
        stage: 'journaled' as const,
        journalSequence: 12,
        affectedAggregates: [{
          family: 'queue',
          aggregateId: 'retrievalPracticeQueue',
          causalBaseRevision: null,
        }],
        requiredTruthOutputs: [{
          family: 'queue',
          kind: 'changeset' as const,
          aggregateIds: ['retrievalPracticeQueue'],
        }],
        truthGenerationId: null,
        retry: {
          attemptCount: 0,
          nextAttemptAt: null,
          lastError: null,
        },
        diagnosticCode: null,
        diagnosticMessage: null,
        updatedAt: 1_786_000_000_000,
      },
    }));
    const queue = new BackendQueueRpcRuntime({
      database: {
        loadQueueState,
        commitQueueStateBatch,
      },
    });
    const dispatcher = new BackendRpcDispatcher(
      createBackendRpcHandlerRegistry(BACKEND_KERNEL_RPC_HANDLER_REGISTRATIONS),
    );

    const loadResponse = await dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 1,
      method: 'queue.state.loadAll',
      params: {},
    }, { queue });
    const mutateResponse = await dispatcher.dispatch({
      jsonrpc: BACKEND_RPC_VERSION,
      id: 2,
      method: 'queue.state.batchMutate',
      params: request,
    }, { queue });

    expect(loadQueueState).toHaveBeenCalledTimes(1);
    expect(loadResponse.result).toEqual({
      values: {
        retrievalPracticeQueue: ['card-existing'],
      },
    });
    expect(commitQueueStateBatch).toHaveBeenCalledWith(request);
    expect(mutateResponse.result).toMatchObject({
      updatedKeys: ['retrievalPracticeQueue'],
      deletedKeys: [],
      durabilityReceipt: {
        mutationId: request.mutationId,
        family: 'queue',
        stage: 'journaled',
        journalSequence: 12,
      },
    });
  });
});

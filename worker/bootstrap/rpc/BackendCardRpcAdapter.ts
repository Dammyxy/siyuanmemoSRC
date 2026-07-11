import type {
  BackendCardCrudBatchMutateRequest,
  BackendCardCrudBatchMutateResult,
  BackendNativeRiffImportExclusionFindRequest,
  BackendNativeRiffImportExclusionFindResult,
  BackendCardScheduleBatchUpdateRequest,
  BackendCardScheduleBatchUpdateResult,
  BackendRpcHandlerAdapter,
} from '../../../packages/contracts/src/backend-rpc';
import {
  BACKEND_CARD_RPC_METHODS,
  type BackendCardRpcMethod,
} from '../../../packages/contracts/src/backend-rpc';
import type { BackendRpcHandlerContext } from './BackendRpcHandlerContext';
import type {
  BackendRpcHandlerRegistration,
} from './BackendRpcRegistry';

export interface BackendCardRpcDatabase {
  commitCardCrudBatch(
    request: BackendCardCrudBatchMutateRequest,
  ): Promise<BackendCardCrudBatchMutateResult>;
  commitCardScheduleBatch(
    request: BackendCardScheduleBatchUpdateRequest,
  ): Promise<BackendCardScheduleBatchUpdateResult>;
  findNativeRiffImportExclusion(
    request: BackendNativeRiffImportExclusionFindRequest,
  ): Promise<BackendNativeRiffImportExclusionFindResult>;
}

export class BackendCardRpcRuntime {
  constructor(private readonly options: { database: BackendCardRpcDatabase }) {}

  handleCrudBatchMutate(params: unknown): Promise<BackendCardCrudBatchMutateResult> {
    const request = readRequiredNamedParams<BackendCardCrudBatchMutateRequest>(
      params,
      'card.crud.batchMutate requires named params',
    );
    if (!String(request.mutationId || '').trim()) {
      throw new Error('INVALID_REQUEST: card.crud.batchMutate requires mutationId');
    }
    const mutationCount = [
      request.upsertCards,
      request.upsertXiuyuans,
      request.deleteCardIds,
      request.deleteXiuyuanIds,
    ].reduce((total, value) => total + (Array.isArray(value) ? value.length : 0), 0);
    if (mutationCount === 0) {
      throw new Error('INVALID_REQUEST: card.crud.batchMutate requires mutations');
    }
    return this.options.database.commitCardCrudBatch(request);
  }

  handleScheduleBatchUpdate(params: unknown): Promise<BackendCardScheduleBatchUpdateResult> {
    const request = readRequiredNamedParams<BackendCardScheduleBatchUpdateRequest>(
      params,
      'card.schedule.batchUpdate requires named params',
    );
    if (!String(request.mutationId || '').trim()) {
      throw new Error('INVALID_REQUEST: card.schedule.batchUpdate requires mutationId');
    }
    if (!Array.isArray(request.cards) || request.cards.length === 0) {
      throw new Error('INVALID_REQUEST: card.schedule.batchUpdate requires cards');
    }
    return this.options.database.commitCardScheduleBatch(request);
  }

  handleNativeRiffImportExclusionFind(
    params: unknown,
  ): Promise<BackendNativeRiffImportExclusionFindResult> {
    const request = readRequiredNamedParams<BackendNativeRiffImportExclusionFindRequest>(
      params,
      'card.nativeRiffImportExclusion.find requires named params',
    );
    if (!String(request.blockId || '').trim()) {
      throw new Error('INVALID_REQUEST: card.nativeRiffImportExclusion.find requires blockId');
    }
    return this.options.database.findNativeRiffImportExclusion(request);
  }
}

export interface BackendCardRpcHandlerContext extends BackendRpcHandlerContext {
  readonly card: BackendCardRpcRuntime;
}

export type BackendCardRpcHandlerRegistration = BackendRpcHandlerRegistration<
  BackendCardRpcHandlerContext
>;

const BACKEND_CARD_RPC_HANDLER_ADAPTERS: {
  readonly [Method in BackendCardRpcMethod]: BackendRpcHandlerAdapter<
    unknown,
    unknown,
    BackendCardRpcHandlerContext
  >;
} = {
  'card.crud.batchMutate': {
    method: 'card.crud.batchMutate',
    family: 'card',
    handle(params, context): Promise<BackendCardCrudBatchMutateResult> {
      return context.card.handleCrudBatchMutate(params);
    },
  },
  'card.schedule.batchUpdate': {
    method: 'card.schedule.batchUpdate',
    family: 'card',
    handle(params, context): Promise<BackendCardScheduleBatchUpdateResult> {
      return context.card.handleScheduleBatchUpdate(params);
    },
  },
  'card.nativeRiffImportExclusion.find': {
    method: 'card.nativeRiffImportExclusion.find',
    family: 'card',
    handle(params, context): Promise<BackendNativeRiffImportExclusionFindResult> {
      return context.card.handleNativeRiffImportExclusionFind(params);
    },
  },
};

export const BACKEND_CARD_RPC_HANDLER_REGISTRATIONS: readonly BackendCardRpcHandlerRegistration[] =
  Object.freeze(
    BACKEND_CARD_RPC_METHODS.map((method) => ({
      ...BACKEND_CARD_RPC_HANDLER_ADAPTERS[method],
      owner: 'BackendCardRpcAdapter',
    })),
  );

function readRequiredNamedParams<TParams extends object>(params: unknown, message: string): TParams {
  const candidate = Array.isArray(params) ? params[0] : params;
  if (!candidate || typeof candidate !== 'object') {
    throw new Error(`INVALID_REQUEST: ${message}`);
  }
  return candidate as TParams;
}

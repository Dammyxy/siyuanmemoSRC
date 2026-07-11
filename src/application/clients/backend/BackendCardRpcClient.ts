import type {
  BackendCardCrudBatchMutateRequest,
  BackendCardCrudBatchMutateResult,
  BackendNativeRiffImportExclusionFindRequest,
  BackendNativeRiffImportExclusionFindResult,
  BackendCardScheduleBatchUpdateRequest,
  BackendCardScheduleBatchUpdateResult,
} from '../../../../packages/contracts/src/backend-rpc';
import type { BackendRpcCaller } from './BackendRpcCaller';

export interface BackendCardClientFacet {
  cardCrudBatchMutate(
    request: BackendCardCrudBatchMutateRequest,
  ): Promise<BackendCardCrudBatchMutateResult>;
  cardScheduleBatchUpdate(
    request: BackendCardScheduleBatchUpdateRequest,
  ): Promise<BackendCardScheduleBatchUpdateResult>;
  findNativeRiffImportExclusion(
    request: BackendNativeRiffImportExclusionFindRequest,
  ): Promise<BackendNativeRiffImportExclusionFindResult>;
}

export class BackendCardRpcClient implements BackendCardClientFacet {
  constructor(private readonly rpcCaller: BackendRpcCaller) {}

  cardCrudBatchMutate(
    request: BackendCardCrudBatchMutateRequest,
  ): Promise<BackendCardCrudBatchMutateResult> {
    return this.rpcCaller.call<BackendCardCrudBatchMutateResult>(
      'card.crud.batchMutate',
      request,
    );
  }

  cardScheduleBatchUpdate(
    request: BackendCardScheduleBatchUpdateRequest,
  ): Promise<BackendCardScheduleBatchUpdateResult> {
    return this.rpcCaller.call<BackendCardScheduleBatchUpdateResult>(
      'card.schedule.batchUpdate',
      request,
    );
  }

  findNativeRiffImportExclusion(
    request: BackendNativeRiffImportExclusionFindRequest,
  ): Promise<BackendNativeRiffImportExclusionFindResult> {
    return this.rpcCaller.call<BackendNativeRiffImportExclusionFindResult>(
      'card.nativeRiffImportExclusion.find',
      request,
    );
  }
}

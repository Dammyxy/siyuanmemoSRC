import type {
  BackendCardCrudBatchMutateRequest,
  BackendCardCrudBatchMutateResult,
  BackendNativeRiffImportExclusionFindRequest,
  BackendNativeRiffImportExclusionFindResult,
  BackendCardScheduleBatchUpdateRequest,
  BackendCardScheduleBatchUpdateResult,
  BackendRpcMethod,
  BackendRpcMethodContract,
} from '../backend-rpc';

export const BACKEND_CARD_RPC_METHODS = [
  'card.crud.batchMutate',
  'card.schedule.batchUpdate',
  'card.nativeRiffImportExclusion.find',
] as const satisfies readonly BackendRpcMethod[];

export type BackendCardRpcMethod = typeof BACKEND_CARD_RPC_METHODS[number];

export type BackendCardRpcMethodContractMap = {
  readonly 'card.crud.batchMutate': BackendRpcMethodContract<
    'card.crud.batchMutate',
    BackendCardCrudBatchMutateRequest,
    BackendCardCrudBatchMutateResult
  >;
  readonly 'card.schedule.batchUpdate': BackendRpcMethodContract<
    'card.schedule.batchUpdate',
    BackendCardScheduleBatchUpdateRequest,
    BackendCardScheduleBatchUpdateResult
  >;
  readonly 'card.nativeRiffImportExclusion.find': BackendRpcMethodContract<
    'card.nativeRiffImportExclusion.find',
    BackendNativeRiffImportExclusionFindRequest,
    BackendNativeRiffImportExclusionFindResult
  >;
};

export const BACKEND_CARD_RPC_METHOD_FAMILY_CATALOG = [
  { method: 'card.crud.batchMutate', family: 'card', clientExposure: 'facade' },
  { method: 'card.schedule.batchUpdate', family: 'card', clientExposure: 'facade' },
  { method: 'card.nativeRiffImportExclusion.find', family: 'card', clientExposure: 'facade' },
] as const satisfies readonly BackendRpcMethodContract[];

export const BACKEND_CARD_RPC_METHOD_CONTRACT_BY_METHOD = Object.freeze(
  Object.fromEntries(
    BACKEND_CARD_RPC_METHOD_FAMILY_CATALOG.map((entry) => [entry.method, entry]),
  ),
) as Readonly<BackendCardRpcMethodContractMap>;

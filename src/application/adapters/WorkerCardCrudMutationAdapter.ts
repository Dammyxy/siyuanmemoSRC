import type {
  BackendCardCrudBatchMutateRequest,
  BackendCardCrudBatchMutateResult,
} from '../../../packages/contracts/src/backend-rpc';

export interface WorkerCardCrudMutationExecutor {
  execute(
    request: BackendCardCrudBatchMutateRequest,
  ): Promise<BackendCardCrudBatchMutateResult>;
}

export class WorkerCardCrudMutationAdapter {
  constructor(
    private readonly executor: WorkerCardCrudMutationExecutor,
    private readonly createMutationId: () => string = createCardCrudMutationId,
  ) {}

  async commit(
    input: Omit<BackendCardCrudBatchMutateRequest, 'mutationId'>,
  ): Promise<BackendCardCrudBatchMutateResult> {
    const request: BackendCardCrudBatchMutateRequest = {
      mutationId: this.createMutationId(),
      upsertCards: input.upsertCards,
      upsertXiuyuans: input.upsertXiuyuans,
      deleteCardIds: input.deleteCardIds,
      deleteXiuyuanIds: input.deleteXiuyuanIds,
    };
    const result = await this.executor.execute(request);
    const receipt = result.durabilityReceipt;
    if (
      receipt.family !== 'card-crud'
      || (receipt.stage !== 'journaled' && receipt.stage !== 'truth-committed')
      || receipt.mutationId !== request.mutationId
    ) {
      throw new Error('STORAGE_JOURNAL_FAILED: Card CRUD Worker mutation returned invalid durability receipt');
    }
    return result;
  }
}

let fallbackMutationSequence = 0;

function createCardCrudMutationId(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.();
  if (randomUUID) {
    return `card-crud:${randomUUID}`;
  }
  fallbackMutationSequence += 1;
  return `card-crud:${Date.now()}:${fallbackMutationSequence}`;
}

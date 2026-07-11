import type {
  SrsCardSemanticRepairPlan,
} from '@/core/card/semantics';
import { applyCardSemanticPatch } from '@/core/card/semantics';
import type {
  SrsCardSemanticsRepairPreviewReady,
  SrsCardSemanticsRepairRepository,
} from '@/application/services/SrsCardSemanticsRepairService';
import type { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
import type { FSRSCard } from '@/types/card';
import type {
  BackendCardCrudBatchMutateRequest,
  BackendCardCrudBatchMutateResult,
} from '../../../packages/contracts/src/backend-rpc';

type SemanticRepairStorage = Pick<
  UnifiedStorageManager,
  'getAllCards' | 'getCardDTO'
>;

export class WorkerSrsCardSemanticsRepairRepository
implements SrsCardSemanticsRepairRepository {
  constructor(private readonly deps: {
    storage: SemanticRepairStorage;
    execute: (
      request: BackendCardCrudBatchMutateRequest,
    ) => Promise<BackendCardCrudBatchMutateResult>;
  }) {}

  querySrsCardSemanticRepairCandidates(): FSRSCard[] {
    return this.deps.storage.getAllCards()
      .filter((card) => this.deps.storage.getCardDTO(card.id)?.meta?.sourceExists !== false);
  }

  async applySrsCardSemanticRepairPlans(input: {
    safePlans: SrsCardSemanticRepairPlan[];
    skippedPlans: SrsCardSemanticRepairPlan[];
    preview: SrsCardSemanticsRepairPreviewReady;
  }): Promise<{
    receiptId: string;
    updatedCards: FSRSCard[];
    repairedCount: number;
    failedCardIds: string[];
  }> {
    const cardById = new Map(
      this.deps.storage.getAllCards().map((card) => [card.id, card] as const),
    );
    const updatedCards: FSRSCard[] = [];
    const failedCardIds: string[] = [];
    for (const plan of input.safePlans) {
      const card = cardById.get(plan.cardId);
      if (!card || !plan.patch) {
        failedCardIds.push(plan.cardId);
        continue;
      }
      updatedCards.push(applyCardSemanticPatch(card, plan.patch));
    }

    if (updatedCards.length === 0) {
      return {
        receiptId: 'srs-card-semantic-repair:no-op',
        updatedCards,
        repairedCount: 0,
        failedCardIds,
      };
    }

    const mutationId = createSemanticRepairMutationId(input.safePlans);
    const result = await this.deps.execute({
      mutationId,
      upsertCards: updatedCards,
      upsertXiuyuans: [],
      deleteCardIds: [],
      deleteXiuyuanIds: [],
    });
    return {
      receiptId: result.durabilityReceipt.mutationId,
      updatedCards,
      repairedCount: updatedCards.length,
      failedCardIds,
    };
  }
}

function createSemanticRepairMutationId(
  plans: readonly SrsCardSemanticRepairPlan[],
): string {
  const payload = plans
    .filter((plan) => plan.status === 'safe-repair' && plan.patch)
    .map((plan) => ({
      cardId: plan.cardId,
      patch: plan.patch,
    }))
    .sort((left, right) => left.cardId.localeCompare(right.cardId));
  return `srs-card-semantic-repair:${fnv1a32(JSON.stringify(payload))}`;
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

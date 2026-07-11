import type {
  CardApplicationStoragePort,
  CardStorageMutationOptions,
  CardStorageUpdateOptions,
} from '@/core/storage/ports';
import {
  UnifiedStorageManager,
  type UnifiedCardStore,
} from '@/core/storage/UnifiedStorageManager';
import type { StructuredCardQuery } from '@/types/card-query';
import type { FSRSCard } from '@/types/card';
import { err, isErr, ok, type Result } from '@/types/result';

export class WorkerCardCrudStorageAdapter implements CardApplicationStoragePort {
  constructor(private readonly projection: UnifiedStorageManager) {}

  getCard(cardId: string): FSRSCard | undefined {
    return this.projection.getCard(cardId);
  }

  getCardByBlockId(blockId: string): FSRSCard | undefined {
    return this.projection.getCardByBlockId(blockId);
  }

  getAllCards(): FSRSCard[] {
    return this.projection.getAllCards();
  }

  queryCards(query?: StructuredCardQuery): FSRSCard[] {
    return this.projection.queryCards(query);
  }

  async updateCard(
    card: FSRSCard,
    options: CardStorageUpdateOptions = {},
  ): Promise<Result<void>> {
    return this.batchUpdateCards([card], options);
  }

  async batchUpdateCards(
    cards: FSRSCard[],
    options: CardStorageUpdateOptions = {},
  ): Promise<Result<void>> {
    const deduped = new Map<string, FSRSCard>();
    for (const card of cards ?? []) {
      const cardId = String(card?.id || '').trim();
      if (!cardId) {
        return err(new Error('INVALID_REQUEST: Card CRUD update requires card id'));
      }
      deduped.set(cardId, card);
    }
    if (deduped.size === 0) {
      return ok(undefined);
    }

    return this.runProjectionMutation('worker-card-crud.batch-update', async (transaction) => {
      const cardsToUpdate = Array.from(deduped.values());
      const updateResult = await this.projection.batchUpdateCards(cardsToUpdate, {
        ...options,
        suppressAutosave: true,
        transaction,
      });
      if (isErr(updateResult)) {
        return updateResult;
      }
      return this.projection.saveXiuyuanCardDelta({
        xiuyuanIds: [],
        cardIds: cardsToUpdate.map((card) => card.id),
        transaction,
      });
    });
  }

  async deleteCard(
    cardId: string,
    options: CardStorageMutationOptions = {},
  ): Promise<Result<void>> {
    return this.deleteCards([cardId], options);
  }

  async deleteCards(
    cardIds: readonly string[],
    options: CardStorageMutationOptions = {},
  ): Promise<Result<void>> {
    const normalizedCardIds = Array.from(new Set(
      (cardIds ?? [])
        .map((cardId) => String(cardId || '').trim())
        .filter(Boolean),
    ));
    if (normalizedCardIds.length === 0) {
      return ok(undefined);
    }

    return this.runProjectionMutation('worker-card-crud.batch-delete', async (transaction) => {
      const existingCards = normalizedCardIds
        .map((cardId) => this.projection.getCard(cardId))
        .filter((card): card is FSRSCard => Boolean(card));
      if (existingCards.length === 0) {
        return ok(undefined);
      }

      const candidateXiuyuanIds = Array.from(new Set(
        existingCards
          .map((card) => String(card.xiuyuanID || '').trim())
          .filter(Boolean),
      ));
      for (const card of existingCards) {
        const deleteResult = await this.projection.deleteCard(card.id, {
          ...options,
          suppressAutosave: true,
          transaction,
        });
        if (isErr(deleteResult)) {
          return deleteResult;
        }
      }

      const deletedXiuyuanIds = candidateXiuyuanIds.filter(
        (xiuyuanId) => !this.projection.getXiuYuan(xiuyuanId),
      );
      return this.projection.saveXiuyuanCardDelta({
        xiuyuanIds: [],
        cardIds: [],
        deleteCardIds: existingCards.map((card) => card.id),
        deleteXiuyuanIds: deletedXiuyuanIds,
        transaction,
      });
    });
  }

  private async runProjectionMutation(
    label: string,
    operation: (
      transaction: Parameters<UnifiedStorageManager['runWriteTransaction']>[1] extends (
        transaction: infer T,
      ) => unknown ? T : never,
    ) => Promise<Result<unknown>>,
  ): Promise<Result<void>> {
    return this.projection.runWriteTransaction(label, async (transaction) => {
      const rollbackSnapshot = this.cloneStore(this.projection.getStoreData());
      try {
        const result = await operation(transaction);
        if (isErr(result)) {
          this.projection.restoreStoreSnapshot(rollbackSnapshot);
          return err(result.error);
        }
        return ok(undefined);
      } catch (error) {
        this.projection.restoreStoreSnapshot(rollbackSnapshot);
        return err(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private cloneStore(store: UnifiedCardStore): UnifiedCardStore {
    return JSON.parse(JSON.stringify(store)) as UnifiedCardStore;
  }
}

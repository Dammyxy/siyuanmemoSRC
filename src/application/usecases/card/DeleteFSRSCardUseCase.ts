/**
 * DeleteFSRSCardUseCase - 删除 FSRS 卡片用例
 * 
 * @description
 * 处理 SiYuanMemo 本地 FSRS 卡片的删除操作。
 * 
 * **职责**：
 * - 验证卡片存在
 * - 删除本地卡片
 * - 保存到存储
 * 
 * **业务规则**：
 * - 如果卡片不存在，返回 deleted=false
 * - 删除后自动保存
 * 
 * @example
 * ```typescript
 * const useCase = new DeleteFSRSCardUseCase(storage, { siyuanApi });
 * 
 * const result = await useCase.execute({ cardId: 'card-123' });
 * 
 * if (result.ok) {
 *   if (result.value.deleted) {
 *     console.log('Card deleted');
 *   } else {
 *     console.log('Card not found');
 *   }
 * } else {
 *   console.error('Delete failed:', result.error);
 * }
 * ```
 */

import type {
  CardStorageMutationOptions,
  DeleteFSRSCardStoragePort,
} from '@/core/storage/ports';
import { ok, err, type Result } from '@/types/result';
import type {
  DeleteFSRSCardCommand,
  DeleteFSRSCardCommandResult,
  DeleteFSRSCardsCommand,
  DeleteFSRSCardsCommandResult,
} from '@/application/commands/card/DeleteFSRSCardCommand';
import type { CardDeletionSiyuanPort } from '@/application/ports/CardDeletionSiyuanPort';
import { buildClearedBlockAttrs } from './shared/CardBlockAttrCleaner';
import { isIgnorableMissingBlockError } from './shared/SiyuanBlockErrorClassifier';
import { throwOnFailedStorageOperation } from './shared/StorageOperationResult';
import { createLogger } from '@/utils/logger';

const logger = createLogger('DeleteFSRSCardUseCase');
type BatchCleanupTargetMap = Map<string, Set<string>>;

/**
 * 删除 FSRS 卡片用例
 */
export class DeleteFSRSCardUseCase {
  private readonly siyuanApi: CardDeletionSiyuanPort;

  constructor(
    private readonly storage: DeleteFSRSCardStoragePort,
    ports: { siyuanApi: CardDeletionSiyuanPort }
  ) {
    this.siyuanApi = ports.siyuanApi;
  }
  
  /**
   * 执行删除操作
   * 
   * @param command - 删除命令
   * @returns Result<DeleteFSRSCardCommandResult> - 成功返回删除结果，失败返回错误
   */
  async execute(command: DeleteFSRSCardCommand): Promise<Result<DeleteFSRSCardCommandResult>> {
    try {
      // 1. 检查卡片是否存在
      const card = this.storage.getCard(command.cardId);
      if (!card) {
        logger.info('Card not found:', command.cardId);
        return ok({
          deleted: false
        });
      }
      
      // 2. 删除本地卡片
      const deleteResult = await this.storage.deleteCard(command.cardId);
      throwOnFailedStorageOperation(deleteResult, `Failed to delete card: ${command.cardId}`);
      
      logger.info('Card deleted from local storage:', command.cardId);
      
      // 3. 删除块属性（插件自定义属性）
      if (card.blockId) {
        await this.removeCardBlockAttrs(card.blockId, [command.cardId]);
      }
      
      return ok({ deleted: true });
    } catch (error) {
      logger.error('Failed to delete card:', error);
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async executeBatch(command: DeleteFSRSCardsCommand): Promise<Result<DeleteFSRSCardsCommandResult>> {
    try {
      const cardIds = this.normalizeCardIds(command.cardIds);
      if (cardIds.length === 0) {
        return ok({
          attemptedCount: 0,
          deletedCount: 0,
          deletedCardIds: [],
          failedCardIds: [],
        });
      }

      const cardsToDelete = cardIds
        .map((cardId) => ({ cardId, card: this.storage.getCard(cardId) }))
        .filter((entry): entry is { cardId: string; card: NonNullable<ReturnType<DeleteFSRSCardStoragePort['getCard']>> } => {
          if (!entry.card) {
            logger.info('Card already absent from local storage:', entry.cardId);
            return false;
          }
          return true;
        });
      const alreadyAbsentCardIds = cardIds.filter((cardId) => !cardsToDelete.some((entry) => entry.cardId === cardId));
      const deletedCardIds: string[] = [...alreadyAbsentCardIds];
      const cleanupTargets: BatchCleanupTargetMap = new Map();

      for (const { cardId, card } of cardsToDelete) {
        deletedCardIds.push(cardId);
        if (card.blockId) {
          this.addCleanupTarget(cleanupTargets, card.blockId, cardId);
        }
      }

      const deleteResult = await this.storage.deleteCards(cardsToDelete.map(({ cardId }) => cardId));
      throwOnFailedStorageOperation(deleteResult, 'Failed to batch delete FSRS cards');
      await this.removeCardBlockAttrsBatch(cleanupTargets);

      return ok({
        attemptedCount: cardIds.length,
        deletedCount: deletedCardIds.length,
        deletedCardIds,
        failedCardIds: [],
      });
    } catch (error) {
      logger.error('Failed to batch delete FSRS cards:', error);
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private normalizeCardIds(cardIds: readonly string[] | undefined): string[] {
    return Array.from(new Set(
      (cardIds ?? [])
        .map((cardId) => String(cardId || '').trim())
        .filter(Boolean)
    ));
  }

  private addCleanupTarget(targets: BatchCleanupTargetMap, blockId: string, cardId: string): void {
    const normalizedBlockId = String(blockId || '').trim();
    const normalizedCardId = String(cardId || '').trim();
    if (!normalizedBlockId || !normalizedCardId) {
      return;
    }
    if (!targets.has(normalizedBlockId)) {
      targets.set(normalizedBlockId, new Set());
    }
    targets.get(normalizedBlockId)!.add(normalizedCardId);
  }

  private async removeCardBlockAttrsBatch(cleanupTargets: BatchCleanupTargetMap): Promise<void> {
    for (const [blockId, deletedCardIds] of cleanupTargets.entries()) {
      await this.removeCardBlockAttrs(blockId, Array.from(deletedCardIds));
    }
  }

  /**
   * 删除卡片相关的块属性（插件自定义属性）
   * 
   * @private
   * @param blockId - 块 ID
   */
  private async removeCardBlockAttrs(blockId: string, deletedCardIds: readonly string[]): Promise<void> {
    try {
      // 获取当前块属性
      const attrs = await this.siyuanApi.getBlockAttrs(blockId);
      const newAttrs = buildClearedBlockAttrs(attrs, { deletedCardIds });
      
      // 如果有属性需要删除，调用 API
      if (Object.keys(newAttrs).length > 0) {
        await this.siyuanApi.setBlockAttrs(blockId, newAttrs);
        logger.info('Removed block attrs:', Object.keys(newAttrs));
      }
    } catch (error) {
      if (isIgnorableMissingBlockError(error)) {
        logger.info(`Skip remove attrs for missing block: ${blockId}`);
        return;
      }
      logger.warn('Failed to remove block attrs:', error);
      // 不抛出异常，不影响卡片删除流程
    }
  }
}

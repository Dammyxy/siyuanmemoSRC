/**
 * UpdateFSRSCardUseCase - 更新 FSRS 卡片用例
 * 
 * @description
 * 处理 FSRS 卡片的更新操作。
 * 支持部分更新，只更新提供的字段。
 * 
 * ✅ DDD 架构：使用 UnifiedStorageManager 替代旧的 StorageManager
 * 
 * **职责**：
 * - 验证卡片存在
 * - 应用更新
 * - 保存到存储
 * 
 * **业务规则**：
 * - 卡片必须存在才能更新
 * - 不能更新 id 和 blockId
 * - 更新后自动保存
 * 
 * @example
 * ```typescript
 * const useCase = new UpdateFSRSCardUseCase(unifiedStorage);
 * 
 * const result = await useCase.execute({
 *   cardId: 'card-123',
 *   updates: {
 *     due: new Date('2024-01-01'),
 *     stability: 10.5
 *   }
 * });
 * 
 * if (result.ok) {
 *   console.log('Card updated:', result.value.card);
 * } else {
 *   console.error('Update failed:', result.error);
 * }
 * ```
 */

import type { UpdateFSRSCardStoragePort } from '@/core/storage/ports';
import type { FSRSCard } from '@/types';
import { ok, err, type Result } from '@/types/result';
import type { UpdateFSRSCardCommand, UpdateFSRSCardCommandResult } from '@/application/commands/card/UpdateFSRSCardCommand';
import { throwOnFailedStorageOperation } from './shared/StorageOperationResult';
import { createLogger } from '@/utils/logger';

const logger = createLogger('UpdateFSRSCardUseCase');

/**
 * 更新 FSRS 卡片用例
 */
export class UpdateFSRSCardUseCase {
  constructor(
    private readonly storage: UpdateFSRSCardStoragePort
  ) {}
  
  /**
   * 执行更新操作
   * 
   * @param command - 更新命令
   * @returns Result<UpdateFSRSCardCommandResult> - 成功返回更新后的卡片，失败返回错误
   */
  async execute(command: UpdateFSRSCardCommand): Promise<Result<UpdateFSRSCardCommandResult>> {
    try {
      logger.info('Updating card:', command.cardId);
      
      // 1. 获取卡片
      const card = this.storage.getCard(command.cardId);
      if (!card) {
        return err(new Error(`Card not found: ${command.cardId}`));
      }
      
      logger.debug('Found card:', {
        id: card.id,
        blockId: card.blockId,
        oldPriority: card.priority,
        newPriority: command.updates.priority
      });
      
      // 2. 应用更新（合并字段）
      const updates = command.updates;
      const updatedCard: FSRSCard = {
        ...card,
        ...(updates.due instanceof Date && { due: updates.due.getTime() }),
        ...(typeof updates.stability === 'number' && { stability: updates.stability }),
        ...(typeof updates.difficulty === 'number' && { difficulty: updates.difficulty }),
        ...(typeof updates.elapsed_days === 'number' && { elapsedDays: updates.elapsed_days }),
        ...(typeof updates.scheduled_days === 'number' && { scheduledDays: updates.scheduled_days }),
        ...(typeof updates.reps === 'number' && { reps: updates.reps }),
        ...(typeof updates.lapses === 'number' && { lapses: updates.lapses }),
        ...(updates.state !== undefined && { state: updates.state }),
        ...(updates.last_review instanceof Date && { lastReview: updates.last_review.getTime() }),
        ...(typeof updates.priority === 'number' && { priority: updates.priority }),
        ...(updates.type !== undefined && { type: updates.type }),
        ...(updates.meta && { meta: updates.meta }),
      };
      
      logger.debug('Persisting updated card:', updatedCard.id);
      
      // 3. 保存到存储（使用新架构）
      await this.persistUpdatedCard(updatedCard);
      
      logger.info('Card updated successfully:', updatedCard.id);
      
      return ok({
        card: updatedCard
      });
    } catch (error) {
      logger.error('Failed to update card:', error);
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async persistUpdatedCard(card: FSRSCard): Promise<void> {
    const updateResult = await this.storage.updateCard(card);
    throwOnFailedStorageOperation(updateResult, `Failed to update card: ${card.id}`);
  }
}

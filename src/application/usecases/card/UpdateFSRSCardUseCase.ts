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

import type { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
import type { FSRSCard } from '@/types';
import { ok, err, type Result } from '@/types/result';
import type { UpdateFSRSCardCommand, UpdateFSRSCardCommandResult } from '@/application/commands/card/UpdateFSRSCardCommand';

/**
 * 更新 FSRS 卡片用例
 */
export class UpdateFSRSCardUseCase {
  constructor(
    private readonly storage: UnifiedStorageManager
  ) {}
  
  /**
   * 执行更新操作
   * 
   * @param command - 更新命令
   * @returns Result<UpdateFSRSCardCommandResult> - 成功返回更新后的卡片，失败返回错误
   */
  async execute(command: UpdateFSRSCardCommand): Promise<Result<UpdateFSRSCardCommandResult>> {
    try {
      console.log('[UpdateFSRSCardUseCase] Updating card:', command.cardId);
      
      // 1. 获取卡片
      const card = this.storage.getCard(command.cardId);
      if (!card) {
        return err(new Error(`Card not found: ${command.cardId}`));
      }
      
      console.log('[UpdateFSRSCardUseCase] Found card:', {
        id: card.id,
        blockId: card.blockId,
        oldPriority: card.priority,
        newPriority: command.updates.priority
      });
      
      // 2. 应用更新（合并字段）
      const updatedCard: FSRSCard = {
        ...card,
        ...command.updates
      };
      
      console.log('[UpdateFSRSCardUseCase] Calling storage.updateCard()...');
      
      // 3. 保存到存储（使用新架构）
      const updateResult = await this.storage.updateCard(updatedCard);
      if (!updateResult.ok) {
        console.error('[UpdateFSRSCardUseCase] storage.updateCard() failed:', updateResult.error);
        return err(updateResult.error);
      }
      
      console.log('[UpdateFSRSCardUseCase] ✅ Card updated successfully');
      
      return ok({
        card: updatedCard
      });
    } catch (error) {
      console.error('[UpdateFSRSCardUseCase] Failed to update card:', error);
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

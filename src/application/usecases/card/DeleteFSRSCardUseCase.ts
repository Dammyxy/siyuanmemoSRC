/**
 * DeleteFSRSCardUseCase - 删除 FSRS 卡片用例
 * 
 * @description
 * 处理 FSRS 卡片的删除操作。
 * 支持可选地同时删除 Riff 卡片。
 * 
 * **职责**：
 * - 验证卡片存在
 * - 删除本地卡片
 * - 可选：删除 Riff 卡片
 * - 保存到存储
 * 
 * **业务规则**：
 * - 如果卡片不存在，返回 deleted=false
 * - Riff 删除失败不影响本地删除
 * - 删除后自动保存
 * 
 * @example
 * ```typescript
 * const useCase = new DeleteFSRSCardUseCase(storage);
 * 
 * const result = await useCase.execute({
 *   cardId: 'card-123',
 *   deleteFromRiff: true
 * });
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

import type { StorageManager } from '@/core/storage/manager';
import { ok, err, type Result } from '@/types/result';
import { removeRiffCards } from '@/core/siyuan/riff';
import type { DeleteFSRSCardCommand, DeleteFSRSCardCommandResult } from '@/application/commands/card/DeleteFSRSCardCommand';

/**
 * 删除 FSRS 卡片用例
 */
export class DeleteFSRSCardUseCase {
  constructor(
    private readonly storage: StorageManager
  ) {}
  
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
        console.log('[DeleteFSRSCardUseCase] Card not found:', command.cardId);
        return ok({
          deleted: false
        });
      }
      
      // 2. 删除本地卡片
      this.storage.deleteCard(command.cardId);
      await this.storage.saveCards();
      
      console.log('[DeleteFSRSCardUseCase] Card deleted from local storage:', command.cardId);
      
      // 3. 可选：从 Riff 删除
      let deletedFromRiff: boolean | undefined;
      if (command.deleteFromRiff && card.blockId) {
        try {
          await removeRiffCards([card.blockId]);
          deletedFromRiff = true;
          console.log('[DeleteFSRSCardUseCase] Card deleted from Riff:', card.blockId);
        } catch (error) {
          console.warn('[DeleteFSRSCardUseCase] Failed to delete from Riff:', error);
          deletedFromRiff = false;
          // 不阻断流程，本地删除已成功
        }
      }
      
      return ok({
        deleted: true,
        deletedFromRiff
      });
    } catch (error) {
      console.error('[DeleteFSRSCardUseCase] Failed to delete card:', error);
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

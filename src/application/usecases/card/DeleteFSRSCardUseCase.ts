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

import type { DeleteFSRSCardStoragePort } from '@/core/storage/ports';
import { ok, err, type Result } from '@/types/result';
import { removeRiffCards, BUILTIN_DECK_ID } from '@/core/siyuan/riff';
import { getBlockAttrs, setBlockAttrs } from '@/core/siyuan/api';
import type { DeleteFSRSCardCommand, DeleteFSRSCardCommandResult } from '@/application/commands/card/DeleteFSRSCardCommand';
import { createLogger } from '@/utils/logger';

const logger = createLogger('DeleteFSRSCardUseCase');

/**
 * 删除 FSRS 卡片用例
 */
export class DeleteFSRSCardUseCase {
  constructor(
    private readonly storage: DeleteFSRSCardStoragePort
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
        logger.info('Card not found:', command.cardId);
        return ok({
          deleted: false
        });
      }
      
      // 2. 删除本地卡片
      await this.deleteCardFromStorage(command.cardId);
      await this.storage.saveCards();
      
      logger.info('Card deleted from local storage:', command.cardId);
      
      // 3. 删除块属性（插件自定义属性）
      if (card.blockId) {
        await this.removeCardBlockAttrs(card.blockId);
      }
      
      // 4. 可选：从 Riff 删除（会删除 custom-riff-* 属性）
      let deletedFromRiff: boolean | undefined;
      if (command.deleteFromRiff && card.blockId) {
        try {
          await removeRiffCards(BUILTIN_DECK_ID, [card.blockId]);
          deletedFromRiff = true;
          logger.info('Card deleted from Riff:', card.blockId);
        } catch (error) {
          logger.warn('Failed to delete from Riff:', error);
          deletedFromRiff = false;
          // 不阻断流程，本地删除已成功
        }
      }
      
      return ok({
        deleted: true,
        deletedFromRiff
      });
    } catch (error) {
      logger.error('Failed to delete card:', error);
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async deleteCardFromStorage(cardId: string): Promise<void> {
    if (typeof this.storage.deleteCard === 'function') {
      const result = await this.storage.deleteCard(cardId);
      if (result && typeof result === 'object' && 'ok' in (result as any) && !(result as any).ok) {
        const error = (result as any).error;
        throw error instanceof Error ? error : new Error(`Failed to delete card: ${cardId}`);
      }
      return;
    }

    if (typeof this.storage.removeCard === 'function') {
      const removed = this.storage.removeCard(cardId);
      if (!removed) {
        throw new Error(`Failed to delete card via removeCard(): ${cardId}`);
      }
      return;
    }

    throw new Error('No available delete capability on DeleteFSRSCardStoragePort');
  }

  /**
   * 删除卡片相关的块属性（插件自定义属性）
   * 
   * @private
   * @param blockId - 块 ID
   */
  private async removeCardBlockAttrs(blockId: string): Promise<void> {
    try {
      // 获取当前块属性
      const attrs = await getBlockAttrs(blockId);
      
      // 需要删除的插件自定义属性列表
      const attrsToRemove = [
        'custom-card-type',           // 卡片类型
        'custom-fsrs-card-type',      // 卡片类型标记（concept/descriptor）
        'custom-xiuyuan-id',          // Xiuyuan ID
        'custom-template-id',         // 模板 ID
        'custom-list-template',       // 列表模板标记
        'custom-priority',            // 优先级
        'custom-fsrs-a-factor',       // A-Factor（旧属性，兼容清理）
      ];
      
      // 构建新的属性对象（将要删除的属性设为空字符串）
      const newAttrs: Record<string, string> = {};
      for (const key of attrsToRemove) {
        if (key in attrs) {
          newAttrs[key] = '';  // 思源 API：空字符串表示删除属性
        }
      }
      
      // 如果有属性需要删除，调用 API
      if (Object.keys(newAttrs).length > 0) {
        await setBlockAttrs(blockId, newAttrs);
        logger.info('Removed block attrs:', Object.keys(newAttrs));
      }
    } catch (error) {
      logger.warn('Failed to remove block attrs:', error);
      // 不抛出异常，不影响卡片删除流程
    }
  }
}

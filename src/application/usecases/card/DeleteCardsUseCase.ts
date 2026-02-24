/**
 * DeleteCardsUseCase - 批量删除卡片用例
 * 
 * @description
 * 编排批量删除卡片的业务流程，优化性能。
 * 
 * **设计原则**：
 * - 用例模式：封装批量删除业务用例
 * - 性能优化：按 xiuyuanId 分组，减少重复加载
 * - 事务边界：定义批量操作的事务边界
 * - 使用 Result 类型：统一错误处理
 * 
 * **职责**：
 * - 验证输入命令
 * - 按 xiuyuanId 分组卡片（避免重复加载）
 * - 批量删除每个 Xiuyuan 下的卡片
 * - 通过 XiuyuanRepository 持久化
 * - 发布批量删除事件
 * - 返回删除结果
 * 
 * **性能优化**：
 * - 同一个 Xiuyuan 下的多张卡片只加载一次
 * - 批量发布事件，减少同步触发次数
 * - 使用索引快速定位 Xiuyuan
 * 
 * **业务流程**：
 * 1. 验证 DeleteCardsCommand
 * 2. 按 xiuyuanId 分组卡片
 * 3. 对每个 Xiuyuan：
 *    a. 加载 Xiuyuan 聚合根（只加载一次）
 *    b. 批量删除该 Xiuyuan 下的所有卡片
 *    c. 持久化更新后的 Xiuyuan
 * 4. 发布批量删除事件（一次性）
 * 5. 返回删除结果
 */

import { Result, ok, err } from '@/types/result';
import { DeleteCardsCommand, DeleteCardsResult, validateDeleteCardsCommand } from '../../commands/card/DeleteCardsCommand';
import { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import { CardDeletionService } from '@/core/xiuyuan/domain/services/CardDeletionService';
import { CardId } from '@/core/xiuyuan/domain/CardId';
import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import { CardsDeletedEvent } from '@/core/xiuyuan/domain/events/CardsDeletedEvent';
import { getBlockAttrs, setBlockAttrs } from '@/core/siyuan/api';
import type { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import type { IDeletionTracker } from '@/core/xiuyuan/domain/services/IDeletionTracker';

export class DeleteCardsUseCase {
  constructor(
    private readonly xiuyuanRepo: IXiuyuanRepository,
    private readonly cardDeletionService: CardDeletionService,
    private readonly eventBus: EventBus,
    private readonly deletionTracker: IDeletionTracker
  ) {}

  /**
   * 执行批量删除卡片用例
   * 
   * @param command - 批量删除卡片命令
   * @returns Result<DeleteCardsResult> - 成功返回删除结果，失败返回错误
   */
  async execute(command: DeleteCardsCommand): Promise<Result<DeleteCardsResult>> {
    console.log(`[DeleteCardsUseCase] 🚀 开始批量删除 ${command.cardIds.length} 张卡片`);
    
    // 1. 验证输入命令
    const validationError = validateDeleteCardsCommand(command);
    if (validationError) {
      return err(new Error(`Invalid command: ${validationError}`));
    }

    const { cardIds } = command;
    const deletedCardIds: string[] = [];
    const failedCardIds: string[] = [];
    const blockIdsToClean: string[] = [];

    // 2. 按 xiuyuanId 分组卡片（性能优化的关键）
    const xiuyuanGroups = await this.groupCardsByXiuyuan(cardIds);
    console.log(`[DeleteCardsUseCase] 📊 分组结果: ${xiuyuanGroups.size} 个 Xiuyuan, ${xiuyuanGroups.get('orphan')?.length || 0} 张孤儿卡片`);

    // 3. 处理每个 Xiuyuan 下的卡片（批量删除）
    for (const [xiuyuanIdStr, cardIdsInGroup] of xiuyuanGroups) {
      // 3.1 批量处理孤儿卡片（没有 Xiuyuan 的卡片）
      if (xiuyuanIdStr === 'orphan') {
        console.log(`[DeleteCardsUseCase] 🔧 批量处理 ${cardIdsInGroup.length} 张孤儿卡片`);
        const orphanResult = await this.deleteOrphanCardsBatch(cardIdsInGroup);
        deletedCardIds.push(...orphanResult.deleted);
        failedCardIds.push(...orphanResult.failed);
        blockIdsToClean.push(...orphanResult.blockIds);
        continue;
      }

      // 3.2 处理有 Xiuyuan 的卡片
      const xiuyuanIdResult = XiuyuanId.create(xiuyuanIdStr);
      if (!xiuyuanIdResult.ok) {
        console.error(`[DeleteCardsUseCase] ❌ 无效的 xiuyuanId: ${xiuyuanIdStr}`);
        failedCardIds.push(...cardIdsInGroup);
        continue;
      }

      // 3.3 加载 Xiuyuan（每个 Xiuyuan 只加载一次）
      const xiuyuanResult = await this.xiuyuanRepo.findById(xiuyuanIdResult.value);
      if (!xiuyuanResult.ok || !xiuyuanResult.value) {
        console.error(`[DeleteCardsUseCase] ❌ 无法加载 Xiuyuan: ${xiuyuanIdStr}`);
        failedCardIds.push(...cardIdsInGroup);
        continue;
      }

      const xiuyuan = xiuyuanResult.value;
      console.log(`[DeleteCardsUseCase] ✅ 加载 Xiuyuan ${xiuyuanIdStr}, 准备删除 ${cardIdsInGroup.length} 张卡片`);

      // 3.4 批量删除该 Xiuyuan 下的所有卡片
      const deleteResult = await this.deleteCardsFromXiuyuan(xiuyuan, cardIdsInGroup);
      deletedCardIds.push(...deleteResult.deleted);
      failedCardIds.push(...deleteResult.failed);
      blockIdsToClean.push(...deleteResult.blockIds);

      // 3.5 持久化更新后的 Xiuyuan（每个 Xiuyuan 只保存一次）
      const saveResult = await this.xiuyuanRepo.save(xiuyuan);
      if (!saveResult.ok) {
        const error = (saveResult as { ok: false; error: any }).error;
        console.error(`[DeleteCardsUseCase] ❌ 保存 Xiuyuan 失败: ${xiuyuanIdStr}`, error);
        // 已删除的卡片标记为失败
        failedCardIds.push(...deleteResult.deleted);
        deletedCardIds.splice(deletedCardIds.length - deleteResult.deleted.length, deleteResult.deleted.length);
        continue;
      }

      // 3.6 发布该 Xiuyuan 的领域事件
      const events = xiuyuan.getDomainEvents();
      console.log(`[DeleteCardsUseCase] 📢 发布 ${events.length} 个领域事件 (Xiuyuan ${xiuyuanIdStr})`);
      await this.eventBus.publishAll(events);
      xiuyuan.clearDomainEvents();
    }

    // 4. 批量清理块属性
    if (blockIdsToClean.length > 0) {
      console.log(`[DeleteCardsUseCase] 🧹 清理 ${blockIdsToClean.length} 个块的属性`);
      await this.cleanBlockAttrs(blockIdsToClean);
      
      // ✅ 标记这些块为已删除（防止孤儿卡片）
      this.deletionTracker.markManyAsDeleted(blockIdsToClean);
      console.log(`[DeleteCardsUseCase] 🔖 标记 ${blockIdsToClean.length} 个块为已删除`);
    }

    // 5. 批量从 Riff 删除
    if (blockIdsToClean.length > 0) {
      console.log(`[DeleteCardsUseCase] 🔄 从 Riff 批量删除 ${blockIdsToClean.length} 张卡片`);
      await this.deleteFromRiffBatch(blockIdsToClean);
    }

    // 6. 发布批量删除事件（一次性，用于 RiffSync）
    if (deletedCardIds.length > 0) {
      console.log(`[DeleteCardsUseCase] 📢 发布批量删除事件: ${deletedCardIds.length} 张卡片`);
      await this.eventBus.publish(new CardsDeletedEvent('batch-delete', deletedCardIds));
    }

    // 7. 返回删除结果
    const result: DeleteCardsResult = {
      deletedCount: deletedCardIds.length,
      deletedCardIds,
      failedCardIds,
    };

    console.log(`[DeleteCardsUseCase] ✅ 批量删除完成: 成功 ${result.deletedCount}, 失败 ${failedCardIds.length}`);
    return ok(result);
  }

  /**
   * 按 xiuyuanId 分组卡片
   * 
   * 增强版：尝试多种方式查找 xiuyuanId，减少孤儿卡片
   * 
   * @private
   * @param cardIds - 卡片 ID 列表
   * @returns Map<xiuyuanId, cardIds[]> - 分组结果，'orphan' 表示孤儿卡片
   */
  private async groupCardsByXiuyuan(cardIds: string[]): Promise<Map<string, string[]>> {
    const groups = new Map<string, string[]>();
    const storage = (this.xiuyuanRepo as any).storage;

    for (const cardId of cardIds) {
      let xiuyuanId: string | undefined;

      // 1. 优先使用索引
      xiuyuanId = this.xiuyuanRepo.getXiuyuanIdByCardId(cardId);

      // 2. 如果索引失效，从 FSRSCard 获取
      if (!xiuyuanId && storage) {
        const fsrsCard = storage.getCard(cardId);
        xiuyuanId = fsrsCard?.xiuyuanID;
      }

      // 3. 如果还是找不到，尝试从块属性中读取
      if (!xiuyuanId) {
        try {
          const fsrsCard = storage?.getCard(cardId);
          const blockId = fsrsCard?.blockId || cardId;
          const attrs = await getBlockAttrs(blockId);
          xiuyuanId = attrs?.['custom-xiuyuan-id'] || attrs?.['custom-fsrs-xiuyuan-id'];
          
          if (xiuyuanId) {
            console.log(`[DeleteCardsUseCase] 🔧 从块属性恢复 xiuyuanId: ${cardId} -> ${xiuyuanId}`);
            
            // 自动修复索引和 FSRSCard
            if (storage && fsrsCard) {
              fsrsCard.xiuyuanID = xiuyuanId;
              // 索引会在下次 Repository.save() 时自动重建
            }
          }
        } catch (error) {
          console.warn(`[DeleteCardsUseCase] ⚠️ 无法从块属性读取 xiuyuanId: ${cardId}`, error);
        }
      }

      // 4. 如果还是找不到，标记为孤儿卡片
      const groupKey = xiuyuanId || 'orphan';

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(cardId);
    }

    return groups;
  }

  /**
   * 从 Xiuyuan 中批量删除卡片
   * 
   * @private
   * @param xiuyuan - Xiuyuan 聚合根
   * @param cardIds - 要删除的卡片 ID 列表
   * @returns 删除结果
   */
  private async deleteCardsFromXiuyuan(
    xiuyuan: Xiuyuan,
    cardIds: string[]
  ): Promise<{ deleted: string[]; failed: string[]; blockIds: string[] }> {
    const deleted: string[] = [];
    const failed: string[] = [];
    const blockIds: string[] = [];
    const storage = (this.xiuyuanRepo as any).storage;

    for (const cardIdStr of cardIds) {
      try {
        // 获取 blockId（删除前）
        if (storage) {
          const card = storage.getCard(cardIdStr);
          if (card?.blockId) {
            blockIds.push(card.blockId);
          }
        }

        // 创建 CardId
        const cardIdResult = CardId.create(cardIdStr);
        if (!cardIdResult.ok) {
          console.error(`[DeleteCardsUseCase] ❌ 无效的 cardId: ${cardIdStr}`);
          failed.push(cardIdStr);
          continue;
        }

        // 查找实际的 CardId 实例
        const cards = xiuyuan.getCards();
        const actualCardId = cards.find(c => c.getId().getValue() === cardIdStr)?.getId();

        if (!actualCardId) {
          console.warn(`[DeleteCardsUseCase] ⚠️ 卡片不在 Xiuyuan 中: ${cardIdStr}`);
          failed.push(cardIdStr);
          continue;
        }

        // 删除卡片
        const deleteResult = this.cardDeletionService.deleteCard(xiuyuan, actualCardId);
        if (!deleteResult.ok) {
          const error = (deleteResult as { ok: false; error: any }).error;
          console.error(`[DeleteCardsUseCase] ❌ 删除卡片失败: ${cardIdStr}`, error);
          failed.push(cardIdStr);
          continue;
        }

        deleted.push(cardIdStr);
      } catch (error) {
        console.error(`[DeleteCardsUseCase] ❌ 删除卡片异常: ${cardIdStr}`, error);
        failed.push(cardIdStr);
      }
    }

    return { deleted, failed, blockIds };
  }

  /**
   * 删除孤儿卡片（没有 Xiuyuan 的卡片）
   * 
   * @private
   * @param cardId - 卡片 ID
   * @returns Result<{blockId?: string}> - 成功返回 blockId，失败返回错误
   */
  private async deleteOrphanCard(cardId: string): Promise<Result<{ blockId?: string }>> {
    try {
      const storage = (this.xiuyuanRepo as any).storage;
      if (!storage) {
        return err(new Error('Storage not available'));
      }

      // 获取 blockId
      const fsrsCard = storage.getCard(cardId);
      const blockId = fsrsCard?.blockId;

      // 从 storage 删除
      const deleteResult = await storage.deleteCard(cardId);
      if (!deleteResult.ok) {
        // 如果卡片不存在，认为删除成功（幂等性）
        const error = (deleteResult as { ok: false; error: any }).error;
        const errorMsg = error?.message || String(error);
        if (errorMsg.includes('not found') || errorMsg.includes('不存在')) {
          console.warn(`[DeleteCardsUseCase] ⚠️ 卡片已删除: ${cardId}`);
          return ok({ blockId });
        }
        return deleteResult as Result<{ blockId?: string }>;
      }

      // 保存
      const saveResult = await storage.save();
      if (!saveResult.ok) {
        return saveResult as Result<{ blockId?: string }>;
      }

      return ok({ blockId });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 批量删除孤儿卡片（优化版）
   * 
   * 一次性删除所有孤儿卡片，只保存一次，提升性能。
   * 
   * @private
   * @param cardIds - 孤儿卡片 ID 列表
   * @returns 删除结果
   */
  private async deleteOrphanCardsBatch(
    cardIds: string[]
  ): Promise<{ deleted: string[]; failed: string[]; blockIds: string[] }> {
    const deleted: string[] = [];
    const failed: string[] = [];
    const blockIds: string[] = [];
    
    try {
      const storage = (this.xiuyuanRepo as any).storage;
      if (!storage) {
        console.error(`[DeleteCardsUseCase] ❌ Storage not available`);
        return { deleted, failed: cardIds, blockIds };
      }

      // 1. 批量删除所有孤儿卡片
      for (const cardId of cardIds) {
        try {
          // 获取 blockId
          const fsrsCard = storage.getCard(cardId);
          const blockId = fsrsCard?.blockId;

          // 从 storage 删除
          const deleteResult = await storage.deleteCard(cardId);
          if (!deleteResult.ok) {
            // 如果卡片不存在，认为删除成功（幂等性）
            const error = (deleteResult as { ok: false; error: any }).error;
            const errorMsg = error?.message || String(error);
            if (errorMsg.includes('not found') || errorMsg.includes('不存在')) {
              console.warn(`[DeleteCardsUseCase] ⚠️ 孤儿卡片已删除: ${cardId}`);
              deleted.push(cardId);
              if (blockId) blockIds.push(blockId);
              continue;
            }
            
            console.error(`[DeleteCardsUseCase] ❌ 删除孤儿卡片失败: ${cardId}`, error);
            failed.push(cardId);
            continue;
          }

          deleted.push(cardId);
          if (blockId) blockIds.push(blockId);
        } catch (error) {
          console.error(`[DeleteCardsUseCase] ❌ 删除孤儿卡片异常: ${cardId}`, error);
          failed.push(cardId);
        }
      }

      // 2. 一次性保存（性能优化的关键）
      if (deleted.length > 0) {
        const saveResult = await storage.save();
        if (!saveResult.ok) {
          console.error(`[DeleteCardsUseCase] ❌ 保存孤儿卡片删除失败`, saveResult);
          // 保存失败，所有删除都失败
          failed.push(...deleted);
          deleted.length = 0;
          blockIds.length = 0;
        } else {
          console.log(`[DeleteCardsUseCase] ✅ 批量删除 ${deleted.length} 张孤儿卡片成功`);
        }
      }

      return { deleted, failed, blockIds };
    } catch (error) {
      console.error(`[DeleteCardsUseCase] ❌ 批量删除孤儿卡片异常:`, error);
      return { deleted, failed: cardIds, blockIds };
    }
  }

  /**
   * 批量清理块属性
   * 
   * @private
   * @param blockIds - 块 ID 列表
   */
  private async cleanBlockAttrs(blockIds: string[]): Promise<void> {
    const attrsToRemove = [
      'custom-card-type',
      'custom-fsrs-card-type',
      'custom-xiuyuan-id',
      'custom-xiuyuan-template',
      'custom-template-id',
      'custom-list-template',
      'custom-priority',
      'custom-fsrs-a-factor',
    ];

    for (const blockId of blockIds) {
      try {
        const attrs = await getBlockAttrs(blockId);
        const newAttrs: Record<string, string> = {};

        for (const key of attrsToRemove) {
          if (key in attrs) {
            newAttrs[key] = '';
          }
        }

        if (Object.keys(newAttrs).length > 0) {
          await setBlockAttrs(blockId, newAttrs);
        }
      } catch (error) {
        console.warn(`[DeleteCardsUseCase] ⚠️ 清理块属性失败: ${blockId}`, error);
      }
    }
  }

  /**
   * 批量从 Riff 删除卡片
   * 
   * @private
   * @param blockIds - 块 ID 列表
   */
  private async deleteFromRiffBatch(blockIds: string[]): Promise<void> {
    try {
      const { removeRiffCards, BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
      await removeRiffCards(BUILTIN_DECK_ID, blockIds);
      console.log(`[DeleteCardsUseCase] ✅ 从 Riff 批量删除成功: ${blockIds.length} 张卡片`);
    } catch (error) {
      console.error(`[DeleteCardsUseCase] ❌ 从 Riff 批量删除失败:`, error);
    }
  }
}

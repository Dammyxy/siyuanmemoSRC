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

import { Result, ok, err, isErr } from '@/types/result';
import { DeleteCardsCommand, DeleteCardsResult, validateDeleteCardsCommand } from '../../commands/card/DeleteCardsCommand';
import { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import { CardDeletionService } from '@/core/xiuyuan/domain/services/CardDeletionService';
import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import { CardsDeletedEvent } from '@/core/xiuyuan/domain/events/CardsDeletedEvent';
import type { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import type { IDeletionTracker } from '@/core/xiuyuan/domain/services/IDeletionTracker';
import type { CardDeletionSiyuanPort } from '@/application/ports/CardDeletionSiyuanPort';
import { buildClearedBlockAttrs } from './shared/CardBlockAttrCleaner';
import { warmupXiuyuanCardIndex } from './shared/WarmupXiuyuanCardIndex';
import { createLogger } from '@/utils/logger';

const logger = createLogger('DeleteCardsUseCase');

type CleanupTargetMap = Map<string, Set<string>>;

type DeletionPersistPlanItem = {
  xiuyuan: Xiuyuan;
  deletedCardIds: string[];
  cleanupTargets: CleanupTargetMap;
  mode: 'save' | 'delete';
};

type DeletionPersistResult = {
  deletedCardIds: string[];
  failedCardIds: string[];
  cleanupTargets: CleanupTargetMap;
};

export class DeleteCardsUseCase {
  private readonly siyuanApi: CardDeletionSiyuanPort;

  constructor(
    private readonly xiuyuanRepo: IXiuyuanRepository,
    private readonly cardDeletionService: CardDeletionService,
    private readonly eventBus: EventBus,
    private readonly deletionTracker: IDeletionTracker,
    ports: { siyuanApi: CardDeletionSiyuanPort }
  ) {
    this.siyuanApi = ports.siyuanApi;
  }

  /**
   * 执行批量删除卡片用例
   * 
   * @param command - 批量删除卡片命令
   * @returns Result<DeleteCardsResult> - 成功返回删除结果，失败返回错误
   */
  async execute(command: DeleteCardsCommand): Promise<Result<DeleteCardsResult>> {
    logger.info(`[DeleteCardsUseCase] 🚀 开始批量删除 ${command.cardIds.length} 张卡片`);
    
    // 1. 验证输入命令
    const validationError = validateDeleteCardsCommand(command);
    if (validationError) {
      return err(new Error(`Invalid command: ${validationError}`));
    }

    const warmupResult = await warmupXiuyuanCardIndex(this.xiuyuanRepo);
    if (isErr(warmupResult)) {
      return warmupResult as Result<DeleteCardsResult>;
    }

    const { cardIds } = command;
    const deletedCardIds: string[] = [];
    const failedCardIds: string[] = [];
    const cleanupTargets: CleanupTargetMap = new Map();
    const persistPlan: DeletionPersistPlanItem[] = [];

    // 2. 按 xiuyuanId 分组卡片（单一路径：依赖索引）
    const { groups: xiuyuanGroups, unresolvedCardIds } = this.groupCardsByXiuyuan(cardIds);
    if (unresolvedCardIds.length > 0) {
      failedCardIds.push(...unresolvedCardIds);
      logger.warn(`[DeleteCardsUseCase] ⚠️ ${unresolvedCardIds.length} 张卡片缺少 Xiuyuan 索引，已标记失败`);
    }
    logger.info(`[DeleteCardsUseCase] 📊 分组结果: ${xiuyuanGroups.size} 个 Xiuyuan`);

    // 3. 处理每个 Xiuyuan 下的卡片（批量删除）
    for (const [xiuyuanIdStr, cardIdsInGroup] of xiuyuanGroups) {
      // 3.1 处理有 Xiuyuan 的卡片
      const xiuyuanIdResult = XiuyuanId.create(xiuyuanIdStr);
      if (isErr(xiuyuanIdResult)) {
        logger.error(`[DeleteCardsUseCase] ❌ 无效的 xiuyuanId: ${xiuyuanIdStr}`);
        failedCardIds.push(...cardIdsInGroup);
        continue;
      }

      // 3.2 加载 Xiuyuan（每个 Xiuyuan 只加载一次）
      const xiuyuanResult = await this.xiuyuanRepo.findById(xiuyuanIdResult.value);
      if (isErr(xiuyuanResult) || !xiuyuanResult.value) {
        logger.error(`[DeleteCardsUseCase] ❌ 无法加载 Xiuyuan: ${xiuyuanIdStr}`);
        failedCardIds.push(...cardIdsInGroup);
        continue;
      }

      const xiuyuan = xiuyuanResult.value;
      logger.info(`[DeleteCardsUseCase] ✅ 加载 Xiuyuan ${xiuyuanIdStr}, 准备删除 ${cardIdsInGroup.length} 张卡片`);

      // 3.3 批量删除该 Xiuyuan 下的所有卡片
      const deleteResult = await this.deleteCardsFromXiuyuan(xiuyuan, cardIdsInGroup);
      failedCardIds.push(...deleteResult.failed);

      if (deleteResult.deleted.length === 0) {
        xiuyuan.clearDomainEvents();
        continue;
      }

      persistPlan.push({
        xiuyuan,
        deletedCardIds: deleteResult.deleted,
        cleanupTargets: deleteResult.cleanupTargets,
        mode: xiuyuan.getCards().length === 0 ? 'delete' : 'save',
      });
    }

    const persistResult = await this.persistDeletedXiuyuans(persistPlan);
    deletedCardIds.push(...persistResult.deletedCardIds);
    failedCardIds.push(...persistResult.failedCardIds);
    this.mergeCleanupTargets(cleanupTargets, persistResult.cleanupTargets);

    // 4. 批量清理块属性
    const blockIdsToClean = Array.from(cleanupTargets.keys());
    if (blockIdsToClean.length > 0) {
      logger.info(`[DeleteCardsUseCase] 🧹 清理 ${blockIdsToClean.length} 个块的属性`);
      await this.cleanBlockAttrs(cleanupTargets);
      
      // ✅ 标记这些块为已删除（防止孤儿卡片）
      this.deletionTracker.markManyAsDeleted(blockIdsToClean);
      logger.info(`[DeleteCardsUseCase] 🔖 标记 ${blockIdsToClean.length} 个块为已删除`);
    }

    // 5. 发布批量删除事件（一次性，用于 RiffSync）
    if (deletedCardIds.length > 0) {
      logger.info(`[DeleteCardsUseCase] 📢 发布批量删除事件: ${deletedCardIds.length} 张卡片`);
      await this.eventBus.publish(new CardsDeletedEvent('batch-delete', deletedCardIds, blockIdsToClean));
    }

    // 6. 返回删除结果
    const result: DeleteCardsResult = {
      deletedCount: deletedCardIds.length,
      deletedCardIds,
      failedCardIds,
    };

    logger.info(`[DeleteCardsUseCase] ✅ 批量删除完成: 成功 ${result.deletedCount}, 失败 ${failedCardIds.length}`);
    return ok(result);
  }

  private async persistDeletedXiuyuans(items: DeletionPersistPlanItem[]): Promise<DeletionPersistResult> {
    const result: DeletionPersistResult = {
      deletedCardIds: [],
      failedCardIds: [],
      cleanupTargets: new Map(),
    };
    if (items.length === 0) {
      return result;
    }

    const saveItems = items.filter((item) => item.mode === 'save');
    const deleteItems = items.filter((item) => item.mode === 'delete');
    logger.info('[DeleteCardsUseCase] 💾 批量持久化删除结果', {
      saveXiuyuanCount: saveItems.length,
      deleteXiuyuanCount: deleteItems.length,
    });

    await this.persistPlanGroup(saveItems, 'save', result);
    await this.persistPlanGroup(deleteItems, 'delete', result);
    return result;
  }

  private async persistPlanGroup(
    items: DeletionPersistPlanItem[],
    mode: DeletionPersistPlanItem['mode'],
    result: DeletionPersistResult,
  ): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const persistResult = mode === 'save'
      ? await this.xiuyuanRepo.saveMany(items.map((item) => item.xiuyuan))
      : await this.xiuyuanRepo.deleteMany(items.map((item) => item.xiuyuan));

    if (isErr(persistResult)) {
      logger.error(`[DeleteCardsUseCase] ❌ 批量${mode === 'save' ? '保存' : '删除'} Xiuyuan 失败`, persistResult.error);
      result.failedCardIds.push(...items.flatMap((item) => item.deletedCardIds));
      return;
    }

    for (const item of items) {
      result.deletedCardIds.push(...item.deletedCardIds);
      this.mergeCleanupTargets(result.cleanupTargets, item.cleanupTargets);

      // 批量删除统一通过 batch 事件向外同步，避免重复触发逐卡 Riff 删除。
      item.xiuyuan.clearDomainEvents();
    }
  }

  /**
   * 按 xiuyuanId 分组卡片
   * 
   * @private
   * @param cardIds - 卡片 ID 列表
   * @returns 分组结果和未解析索引的卡片
   */
  private groupCardsByXiuyuan(cardIds: string[]): {
    groups: Map<string, string[]>;
    unresolvedCardIds: string[];
  } {
    const groups = new Map<string, string[]>();
    const unresolvedCardIds: string[] = [];

    for (const cardId of cardIds) {
      const xiuyuanId = this.xiuyuanRepo.getXiuyuanIdByCardId(cardId);
      if (!xiuyuanId) {
        unresolvedCardIds.push(cardId);
        continue;
      }

      if (!groups.has(xiuyuanId)) {
        groups.set(xiuyuanId, []);
      }
      groups.get(xiuyuanId)!.push(cardId);
    }

    return { groups, unresolvedCardIds };
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
  ): Promise<{ deleted: string[]; failed: string[]; cleanupTargets: CleanupTargetMap }> {
    const deleted: string[] = [];
    const failed: string[] = [];
    const cleanupTargets: CleanupTargetMap = new Map();

    for (const cardIdStr of cardIds) {
      try {
        // 查找实际的 CardId 实例
        const cards = xiuyuan.getCards();
        const actualCard = cards.find(c => c.getId().getValue() === cardIdStr);
        if (!actualCard) {
          logger.warn(`[DeleteCardsUseCase] ⚠️ 卡片不在 Xiuyuan 中: ${cardIdStr}`);
          failed.push(cardIdStr);
          continue;
        }

        const blockId = this.resolveCleanupBlockIdByFaceIndex(xiuyuan, actualCard.getFaceIndex());

        const actualCardId = actualCard.getId();

        // 删除卡片
        const deleteResult = this.cardDeletionService.deleteCard(xiuyuan, actualCardId);
        if (isErr(deleteResult)) {
          logger.error(`[DeleteCardsUseCase] ❌ 删除卡片失败: ${cardIdStr}`, deleteResult.error);
          failed.push(cardIdStr);
          continue;
        }

        if (blockId) {
          this.addCleanupTarget(cleanupTargets, blockId, actualCardId.getValue());
        } else {
          logger.warn(`[DeleteCardsUseCase] Deleted card has no resolved blockId; Riff delete sync will be skipped`, {
            cardId: actualCardId.getValue(),
            xiuyuanId: xiuyuan.getId().getValue(),
          });
        }

        deleted.push(cardIdStr);
      } catch (error) {
        logger.error(`[DeleteCardsUseCase] ❌ 删除卡片异常: ${cardIdStr}`, error);
        failed.push(cardIdStr);
      }
    }

    return { deleted, failed, cleanupTargets };
  }

  private resolveCleanupBlockIdByFaceIndex(xiuyuan: Xiuyuan, faceIndex: number): string | null {
    const representativeBlockId = xiuyuan.getRepresentativeBlockId();
    if (typeof representativeBlockId === 'string' && representativeBlockId.trim().length > 0) {
      return representativeBlockId;
    }

    const backBlockId = xiuyuan.getBackBlockIDs(faceIndex)[0];
    const frontBlockId = xiuyuan.getFrontBlockIDs(faceIndex)[0];
    const isListTemplateCard = xiuyuan.getTemplateID().getValue() === 'builtin-list-item';

    if (isListTemplateCard) {
      if (backBlockId) {
        return backBlockId;
      }
      if (frontBlockId) {
        return frontBlockId;
      }
    } else {
      if (frontBlockId) {
        return frontBlockId;
      }
      if (backBlockId) {
        return backBlockId;
      }
    }

    return null;
  }

  /**
   * 批量清理块属性
   * 
   * @private
   * @param blockIds - 块 ID 列表
   */
  private async cleanBlockAttrs(cleanupTargets: CleanupTargetMap): Promise<void> {
    for (const [blockId, cardIdSet] of cleanupTargets.entries()) {
      try {
        const attrs = await this.siyuanApi.getBlockAttrs(blockId);
        const newAttrs = buildClearedBlockAttrs(attrs, {
          deletedCardIds: Array.from(cardIdSet),
        });

        if (Object.keys(newAttrs).length > 0) {
          await this.siyuanApi.setBlockAttrs(blockId, newAttrs);
        }
      } catch (error) {
        logger.warn(`[DeleteCardsUseCase] ⚠️ 清理块属性失败: ${blockId}`, error);
      }
    }
  }

  private addCleanupTarget(targets: CleanupTargetMap, blockId: string, cardId: string): void {
    if (!targets.has(blockId)) {
      targets.set(blockId, new Set());
    }
    targets.get(blockId)!.add(cardId);
  }

  private mergeCleanupTargets(target: CleanupTargetMap, source: CleanupTargetMap): void {
    for (const [blockId, cardIdSet] of source.entries()) {
      if (!target.has(blockId)) {
        target.set(blockId, new Set());
      }

      const merged = target.get(blockId)!;
      for (const cardId of cardIdSet) {
        merged.add(cardId);
      }
    }
  }
}

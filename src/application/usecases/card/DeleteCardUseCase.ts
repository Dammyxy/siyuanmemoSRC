/**
 * DeleteCardUseCase - 删除卡片用例
 * 
 * @description
 * 编排卡片删除的业务流程，协调领域层和基础设施层。
 * 
 * **设计原则**：
 * - 用例模式：封装单一业务用例
 * - 编排：协调多个领域对象和服务
 * - 事务边界：定义事务的开始和结束
 * - 使用 Result 类型：统一错误处理
 * 
 * **职责**：
 * - 验证输入命令
 * - 查找包含指定卡片的 Xiuyuan 聚合根
 * - 使用 CardDeletionService 删除卡片
 * - 通过 XiuyuanRepository 持久化
 * - 返回删除结果
 * 
 * **业务流程**：
 * 1. 验证 DeleteCardCommand
 * 2. 将命令转换为领域对象（CardId）
 * 3. 查找包含该卡片的 Xiuyuan 聚合根
 * 4. 使用 CardDeletionService 删除卡片
 * 5. 持久化更新后的 Xiuyuan
 * 6. 返回删除结果
 */

import { Result, ok, err } from '@/types/result';
import { DeleteCardCommand, validateDeleteCardCommand } from '../../commands/card/DeleteCardCommand';
import { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import { CardDeletionService } from '@/core/xiuyuan/domain/services/CardDeletionService';
import { CardId } from '@/core/xiuyuan/domain/CardId';
import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';
import type { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import type { CardDeletionSiyuanPort } from '@/application/ports/CardDeletionSiyuanPort';
import { CardDeletionSiyuanAdapter } from '@/infrastructure/siyuan/CardDeletionSiyuanAdapter';
import { buildClearedBlockAttrs } from './shared/CardBlockAttrCleaner';
import { warmupXiuyuanCardIndex } from './shared/WarmupXiuyuanCardIndex';
import { createLogger } from '@/utils/logger';

const logger = createLogger('DeleteCardUseCase');

export class DeleteCardUseCase {
  private readonly siyuanApi: CardDeletionSiyuanPort;

  constructor(
    private readonly xiuyuanRepo: IXiuyuanRepository,
    private readonly cardDeletionService: CardDeletionService,
    private readonly eventBus: EventBus,
    ports?: { siyuanApi?: CardDeletionSiyuanPort }
  ) {
    this.siyuanApi = ports?.siyuanApi ?? new CardDeletionSiyuanAdapter();
  }

  /**
   * 执行删除卡片用例
   * 
   * @param command - 删除卡片命令
   * @returns Result<void> - 成功返回 void，失败返回错误
   */
  async execute(command: DeleteCardCommand): Promise<Result<void>> {
    // 1. 验证输入命令
    const validationError = validateDeleteCardCommand(command);
    if (validationError) {
      return err(new Error(`Invalid command: ${validationError}`));
    }

    // 2. 将命令转换为领域对象
    const cardIdResult = CardId.create(command.cardId);
    if (!cardIdResult.ok) {
      return cardIdResult as Result<void>;
    }

    const cardId = cardIdResult.value;

    const warmupResult = await warmupXiuyuanCardIndex(this.xiuyuanRepo);
    if (!warmupResult.ok) {
      return warmupResult as Result<void>;
    }

    // 3. 查找包含该卡片的 Xiuyuan 聚合根和实际的 CardId 实例
    const searchResult = await this.findXiuyuanAndCardId(cardId);
    if (!searchResult.ok) {
      return searchResult as Result<void>;
    }

    const { xiuyuan, actualCardId } = searchResult.value;
    const blockId = this.resolveBlockIdForCard(xiuyuan, actualCardId);
    
    // 4. 使用 CardDeletionService 删除卡片（使用实际的 CardId 实例）
    const deleteResult = this.cardDeletionService.deleteCard(xiuyuan, actualCardId);
    if (!deleteResult.ok) {
      return deleteResult;
    }

    // 5. 持久化更新后的 Xiuyuan
    const saveResult = await this.xiuyuanRepo.save(xiuyuan);
    if (!saveResult.ok) {
      return saveResult;
    }

    // 6. 删除块属性（插件自定义属性）
    if (blockId) {
      try {
        await this.removeCardBlockAttrs(blockId);
        logger.info(`[DeleteCardUseCase] Removed block attrs for: ${blockId}`);
      } catch (error) {
        logger.error(`[DeleteCardUseCase] Failed to remove block attrs:`, error);
        // 不阻断流程
      }
    }

    // 7. 从 Riff 删除卡片（会删除 custom-riff-* 属性）
    if (blockId) {
      try {
        await this.siyuanApi.removeRiffCards(this.siyuanApi.BUILTIN_DECK_ID, [blockId]);
        logger.info(`[DeleteCardUseCase] Deleted card from Riff: ${blockId}`);
      } catch (error) {
        logger.error(`[DeleteCardUseCase] Failed to delete card from Riff:`, error);
        // Riff 删除失败不应该阻止整个删除操作
      }
    }

    // 8. 发布领域事件（包括 CardDeletedEvent）
    // RiffSyncEventHandler 会监听这个事件并同步到 Riff
    const events = xiuyuan.getDomainEvents();
    logger.info(`[DeleteCardUseCase] Publishing ${events.length} domain events...`);
    for (const event of events) {
      logger.info(`[DeleteCardUseCase] Event: ${event.getEventName()}`);
    }
    await this.eventBus.publishAll(events);
    logger.info(`[DeleteCardUseCase] Events published successfully`);
    xiuyuan.clearDomainEvents();

    // 9. 返回成功结果
    return ok(undefined);
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
      const attrs = await this.siyuanApi.getBlockAttrs(blockId);
      const newAttrs = buildClearedBlockAttrs(attrs);
      
      // 如果有属性需要删除，调用 API
      if (Object.keys(newAttrs).length > 0) {
        await this.siyuanApi.setBlockAttrs(blockId, newAttrs);
        logger.info('[DeleteCardUseCase] Removed block attrs:', Object.keys(newAttrs));
      }
    } catch (error) {
      logger.warn('[DeleteCardUseCase] Failed to remove block attrs:', error);
      // 不抛出异常，不影响卡片删除流程
    }
  }

  /**
   * 查找包含指定卡片的 Xiuyuan 和实际的 CardId 实例
   * 
   * @private
   * @param cardId - 卡片 ID
   * @returns Result<{xiuyuan: Xiuyuan | null, actualCardId: CardId | null}> - 成功返回 Xiuyuan 和 CardId，未找到返回 null
   */
  private async findXiuyuanAndCardId(cardId: CardId): Promise<Result<{ xiuyuan: Xiuyuan; actualCardId: CardId }>> {
    // 单一路径：通过索引定位 Xiuyuan，再在聚合内查找卡片
    const xiuyuanIdStr = this.xiuyuanRepo.getXiuyuanIdByCardId(cardId.getValue());
    if (!xiuyuanIdStr) {
      return err(new Error(`Card ${cardId.getValue()} has no Xiuyuan index mapping`));
    }

    const xiuyuanIdResult = XiuyuanId.create(xiuyuanIdStr);
    if (!xiuyuanIdResult.ok) {
      return err(new Error(`Invalid xiuyuanId in index: ${xiuyuanIdStr}`));
    }

    const xiuyuanResult = await this.xiuyuanRepo.findById(xiuyuanIdResult.value);
    if (!xiuyuanResult.ok) {
      return xiuyuanResult as Result<{ xiuyuan: Xiuyuan; actualCardId: CardId }>;
    }
    if (!xiuyuanResult.value) {
      return err(new Error(`Xiuyuan ${xiuyuanIdStr} not found for card ${cardId.getValue()}`));
    }

    const xiuyuan = xiuyuanResult.value;
    const matched = xiuyuan.getCards().find(c => c.getId().equals(cardId));
    if (!matched) {
      return err(new Error(`Card ${cardId.getValue()} not found in Xiuyuan ${xiuyuan.getId().getValue()}`));
    }

    return ok({ xiuyuan, actualCardId: matched.getId() });
  }

  private resolveBlockIdForCard(xiuyuan: Xiuyuan, cardId: CardId): string | null {
    const card = xiuyuan.getCard(cardId);
    if (!card) {
      return null;
    }

    const faceIndex = card.getFaceIndex();
    const frontBlockId = xiuyuan.getFrontBlockIDs(faceIndex)[0];
    if (frontBlockId) {
      return frontBlockId;
    }

    const backBlockId = xiuyuan.getBackBlockIDs(faceIndex)[0];
    if (backBlockId) {
      return backBlockId;
    }

    const representativeBlockId = xiuyuan.getRepresentativeBlockId();
    return representativeBlockId || null;
  }
}

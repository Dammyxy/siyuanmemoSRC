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
import { EventBus } from '@/core/shared/domain/events/EventBus';

export class DeleteCardUseCase {
  constructor(
    private readonly xiuyuanRepo: IXiuyuanRepository,
    private readonly cardDeletionService: CardDeletionService,
    private readonly eventBus: EventBus
  ) {}

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

    // 3. 查找包含该卡片的 Xiuyuan 聚合根和实际的 CardId 实例
    const searchResult = await this.findXiuyuanAndCardId(cardId);
    if (!searchResult.ok) {
      return searchResult as Result<void>;
    }

    const { xiuyuan, actualCardId } = searchResult.value;
    
    // 🔧 降级处理：如果卡片没有 Xiuyuan（历史遗留数据），直接删除
    if (!xiuyuan || !actualCardId) {
      console.warn(`[DeleteCardUseCase] Card ${cardId.getValue()} not found in any Xiuyuan - using fallback deletion`);
      
      // 1. 从 storage 删除卡片
      const storage = (this.xiuyuanRepo as any).storage;
      if (storage) {
        const deleteResult = await storage.deleteCard(cardId.getValue());
        if (!deleteResult.ok) {
          console.error(`[DeleteCardUseCase] Failed to delete card from storage:`, deleteResult.error);
          return deleteResult;
        }
        console.log(`[DeleteCardUseCase] Deleted card from storage: ${cardId.getValue()}`);
        
        // 2. 立即保存
        const saveResult = await storage.save();
        if (!saveResult.ok) {
          console.error(`[DeleteCardUseCase] Failed to save after deletion:`, saveResult.error);
          return saveResult;
        }
      }
      
      // 3. 从 Riff 删除（会自动删除块属性）
      try {
        const { removeRiffCards } = await import('@/core/siyuan/riff');
        await removeRiffCards('', [cardId.getValue()]);
        console.log(`[DeleteCardUseCase] Deleted card from Riff: ${cardId.getValue()}`);
      } catch (error) {
        console.error(`[DeleteCardUseCase] Failed to delete card from Riff:`, error);
        // Riff 删除失败不应该阻止整个删除操作
      }
      
      return ok(undefined);
    }

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

    // 6. 🔧 修复：从 Riff 删除卡片（会自动删除块属性）
    try {
      const { removeRiffCards } = await import('@/core/siyuan/riff');
      await removeRiffCards('', [cardId.getValue()]);
      console.log(`[DeleteCardUseCase] Deleted card from Riff: ${cardId.getValue()}`);
    } catch (error) {
      console.error(`[DeleteCardUseCase] Failed to delete card from Riff:`, error);
      // Riff 删除失败不应该阻止整个删除操作
    }

    // 7. 发布领域事件（包括 CardDeletedEvent）
    // RiffSyncEventHandler 会监听这个事件并同步到 Riff
    const events = xiuyuan.getDomainEvents();
    console.log(`[DeleteCardUseCase] Publishing ${events.length} domain events...`);
    for (const event of events) {
      console.log(`[DeleteCardUseCase] Event: ${event.getEventName()}`);
    }
    await this.eventBus.publishAll(events);
    console.log(`[DeleteCardUseCase] Events published successfully`);
    xiuyuan.clearDomainEvents();

    // 8. 返回成功结果
    return ok(undefined);
  }

  /**
   * 查找包含指定卡片的 Xiuyuan 和实际的 CardId 实例
   * 
   * @private
   * @param cardId - 卡片 ID
   * @returns Result<{xiuyuan: Xiuyuan | null, actualCardId: CardId | null}> - 成功返回 Xiuyuan 和 CardId，未找到返回 null
   */
  private async findXiuyuanAndCardId(cardId: CardId): Promise<Result<{xiuyuan: any, actualCardId: any}>> {
    console.log(`[DeleteCardUseCase] 🔍 查找卡片: ${cardId.getValue()}`);
    
    // ✅ 优化：先从 storage 获取卡片的 xiuyuanID，直接定位到对应的 Xiuyuan
    const storage = (this.xiuyuanRepo as any).storage;
    if (storage) {
      const fsrsCard = storage.getCard(cardId.getValue());
      if (fsrsCard && fsrsCard.xiuyuanID) {
        console.log(`[DeleteCardUseCase] 🔍 从 FSRSCard 获取 xiuyuanID: ${fsrsCard.xiuyuanID}`);
        
        // 直接通过 xiuyuanID 查找 Xiuyuan
        const xiuyuanResult = await this.xiuyuanRepo.findById(fsrsCard.xiuyuanID);
        if (xiuyuanResult.ok && xiuyuanResult.value) {
          const xiuyuan = xiuyuanResult.value;
          const cards = xiuyuan.getCards();
          console.log(`[DeleteCardUseCase] 🔍 Xiuyuan ${xiuyuan.getId().getValue()} 有 ${cards.length} 张卡片`);
          
          // 在该 Xiuyuan 中查找卡片
          for (const card of cards) {
            if (card.getId().equals(cardId)) {
              console.log(`[DeleteCardUseCase] ✅ 找到卡片: ${card.getId().getValue()} in Xiuyuan ${xiuyuan.getId().getValue()}`);
              return ok({ xiuyuan, actualCardId: card.getId() });
            }
          }
          
          console.warn(`[DeleteCardUseCase] ⚠️ Xiuyuan ${xiuyuan.getId().getValue()} 中没有找到卡片 ${cardId.getValue()}`);
        }
      }
    }
    
    // 降级方案：遍历所有 Xiuyuan
    console.log(`[DeleteCardUseCase] 🔍 降级方案：遍历所有 Xiuyuan`);
    const allXiuyuansResult = await this.xiuyuanRepo.findAll();
    if (!allXiuyuansResult.ok) {
      return allXiuyuansResult as Result<{xiuyuan: any, actualCardId: any}>;
    }

    const allXiuyuans = allXiuyuansResult.value;
    console.log(`[DeleteCardUseCase] 🔍 总共 ${allXiuyuans.length} 个 Xiuyuan`);

    // 遍历所有 Xiuyuan，查找包含该卡片的 Xiuyuan
    for (const xiuyuan of allXiuyuans) {
      const cards = xiuyuan.getCards();
      console.log(`[DeleteCardUseCase] 🔍 Xiuyuan ${xiuyuan.getId().getValue()} 有 ${cards.length} 张卡片`);
      
      for (const card of cards) {
        const currentCardId = card.getId().getValue();
        const targetCardId = cardId.getValue();
        const isEqual = card.getId().equals(cardId);
        
        console.log(`[DeleteCardUseCase] 🔍 比较卡片: ${currentCardId} === ${targetCardId} ? ${isEqual}`);
        
        if (isEqual) {
          console.log(`[DeleteCardUseCase] ✅ 找到卡片: ${currentCardId} in Xiuyuan ${xiuyuan.getId().getValue()}`);
          return ok({ xiuyuan, actualCardId: card.getId() });
        }
      }
    }

    // 未找到包含该卡片的 Xiuyuan
    console.log(`[DeleteCardUseCase] ❌ 未找到卡片: ${cardId.getValue()}`);
    return ok({ xiuyuan: null, actualCardId: null });
  }
}

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
import { EventBus } from '@/core/shared/domain/events/EventBus';
import { getBlockAttrs, setBlockAttrs } from '@/core/siyuan/api';

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
        const fsrsCard = storage.getCard(cardId.getValue());
        const blockId = fsrsCard?.blockId;
        
        const deleteResult = await storage.deleteCard(cardId.getValue());
        if (!deleteResult.ok) {
          // 如果卡片不存在，认为删除成功（幂等性）
          const errorMsg = deleteResult.error?.message || String(deleteResult.error);
          if (errorMsg.includes('not found') || errorMsg.includes('不存在')) {
            console.warn(`[DeleteCardUseCase] Card already deleted: ${cardId.getValue()}`);
            return ok(undefined);
          }
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
        
        // 3. 删除块属性（插件自定义属性）
        if (blockId) {
          await this.removeCardBlockAttrs(blockId);
        }
        
        // 4. 从 Riff 删除（会删除 custom-riff-* 属性）
        if (blockId) {
          try {
            const { removeRiffCards, BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
            await removeRiffCards(BUILTIN_DECK_ID, [blockId]);
            console.log(`[DeleteCardUseCase] Deleted card from Riff: ${blockId}`);
          } catch (error) {
            console.error(`[DeleteCardUseCase] Failed to delete card from Riff:`, error);
            // Riff 删除失败不应该阻止整个删除操作
          }
        }
      }
      
      return ok(undefined);
    }

    // 4. 🔧 在删除前先获取 blockId（删除后就获取不到了）
    const storage = (this.xiuyuanRepo as any).storage;
    const card = storage?.getCard(cardId.getValue());
    const blockId = card?.blockId;
    
    // 5. 使用 CardDeletionService 删除卡片（使用实际的 CardId 实例）
    const deleteResult = this.cardDeletionService.deleteCard(xiuyuan, actualCardId);
    if (!deleteResult.ok) {
      return deleteResult;
    }

    // 6. 持久化更新后的 Xiuyuan
    const saveResult = await this.xiuyuanRepo.save(xiuyuan);
    if (!saveResult.ok) {
      return saveResult;
    }

    // 7. 删除块属性（插件自定义属性）
    if (blockId) {
      try {
        await this.removeCardBlockAttrs(blockId);
        console.log(`[DeleteCardUseCase] Removed block attrs for: ${blockId}`);
      } catch (error) {
        console.error(`[DeleteCardUseCase] Failed to remove block attrs:`, error);
        // 不阻断流程
      }
    }

    // 8. 🔧 修复：从 Riff 删除卡片（会删除 custom-riff-* 属性）
    if (blockId) {
      try {
        const { removeRiffCards, BUILTIN_DECK_ID } = await import('@/core/siyuan/riff');
        await removeRiffCards(BUILTIN_DECK_ID, [blockId]);
        console.log(`[DeleteCardUseCase] Deleted card from Riff: ${blockId}`);
      } catch (error) {
        console.error(`[DeleteCardUseCase] Failed to delete card from Riff:`, error);
        // Riff 删除失败不应该阻止整个删除操作
      }
    }

    // 9. 发布领域事件（包括 CardDeletedEvent）
    // RiffSyncEventHandler 会监听这个事件并同步到 Riff
    const events = xiuyuan.getDomainEvents();
    console.log(`[DeleteCardUseCase] Publishing ${events.length} domain events...`);
    for (const event of events) {
      console.log(`[DeleteCardUseCase] Event: ${event.getEventName()}`);
    }
    await this.eventBus.publishAll(events);
    console.log(`[DeleteCardUseCase] Events published successfully`);
    xiuyuan.clearDomainEvents();

    // 10. 返回成功结果
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
      const attrs = await getBlockAttrs(blockId);
      
      // 需要删除的插件自定义属性列表
      const attrsToRemove = [
        'custom-card-type',           // 卡片类型
        'custom-fsrs-card-type',      // 卡片类型标记（concept/descriptor）
        'custom-xiuyuan-id',          // Xiuyuan ID
        'custom-xiuyuan-template',    // Xiuyuan 模板标记
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
        console.log('[DeleteCardUseCase] Removed block attrs:', Object.keys(newAttrs));
      }
    } catch (error) {
      console.warn('[DeleteCardUseCase] Failed to remove block attrs:', error);
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
  private async findXiuyuanAndCardId(cardId: CardId): Promise<Result<{xiuyuan: any, actualCardId: any}>> {
    console.log(`[DeleteCardUseCase] 🔍 查找卡片: ${cardId.getValue()}`);
    
    // 🚀 优化方案1：使用索引快速查找（O(1)时间复杂度）
    const xiuyuanIdStr = this.xiuyuanRepo.getXiuyuanIdByCardId(cardId.getValue());
    if (xiuyuanIdStr) {
      console.log(`[DeleteCardUseCase] ✅ 从索引获取 xiuyuanID: ${xiuyuanIdStr}`);
      const xiuyuanIdResult = XiuyuanId.create(xiuyuanIdStr);
      if (xiuyuanIdResult.ok) {
        const xiuyuanResult = await this.xiuyuanRepo.findById(xiuyuanIdResult.value);
        if (!xiuyuanResult.ok) {
          console.warn(`[DeleteCardUseCase] ⚠️ findById 失败: ${xiuyuanIdStr}`);
          // 继续尝试其他方案
        } else if (!xiuyuanResult.value) {
          console.warn(`[DeleteCardUseCase] ⚠️ 索引失效：Xiuyuan ${xiuyuanIdStr} 已被删除`);
          // Xiuyuan已被删除，继续尝试其他方案
        } else {
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
          
          // 🔧 索引失效：卡片已经不在Xiuyuan中了
          console.warn(`[DeleteCardUseCase] ⚠️ 索引失效：Xiuyuan ${xiuyuan.getId().getValue()} 中没有找到卡片 ${cardId.getValue()}`);
        }
      }
    }
    
    // ✅ 优化方案2：先从 storage 获取卡片的 xiuyuanID，直接定位到对应的 Xiuyuan
    const storage = (this.xiuyuanRepo as any).storage;
    if (storage) {
      const fsrsCard = storage.getCard(cardId.getValue());
      if (fsrsCard && fsrsCard.xiuyuanID) {
        console.log(`[DeleteCardUseCase] 🔍 从 FSRSCard 获取 xiuyuanID: ${fsrsCard.xiuyuanID}`);
        
        // 直接通过 xiuyuanID 查找 Xiuyuan
        const xiuyuanIdResult = XiuyuanId.create(fsrsCard.xiuyuanID);
        if (xiuyuanIdResult.ok) {
          const xiuyuanResult = await this.xiuyuanRepo.findById(xiuyuanIdResult.value);
          console.log(`[DeleteCardUseCase] 🔍 findById 结果: ok=${xiuyuanResult.ok}, value=${xiuyuanResult.ok && xiuyuanResult.value ? 'exists' : 'null'}`);
          
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
          } else {
            console.warn(`[DeleteCardUseCase] ⚠️ findById 失败或返回 null，xiuyuanID: ${fsrsCard.xiuyuanID}`);
          }
        }
      } else if (fsrsCard) {
        // 卡片存在但没有xiuyuanID，可能是历史遗留数据
        console.warn(`[DeleteCardUseCase] ⚠️ FSRSCard 没有 xiuyuanID: ${cardId.getValue()}`);
      } else {
        // 卡片不存在于storage
        console.warn(`[DeleteCardUseCase] ⚠️ FSRSCard 不存在: ${cardId.getValue()}`);
        // 卡片已经被删除，直接返回成功
        return ok({ xiuyuan: null, actualCardId: null });
      }
    }
    
    // 🚀 所有快速查找方案都失败，说明卡片可能已被删除或数据不一致
    // 不要遍历所有Xiuyuan（太慢），直接使用fallback deletion
    console.warn(`[DeleteCardUseCase] ⚠️ 索引和FSRSCard都失败，卡片可能已被删除或Xiuyuan已被删除`);
    return ok({ xiuyuan: null, actualCardId: null });
  }
}

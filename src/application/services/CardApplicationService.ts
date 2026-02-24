/**
 * CardApplicationService - 卡片应用服务
 * 
 * @description
 * 卡片相关操作的主要入口点，封装三个核心用例。
 * 作为表现层和应用层之间的桥梁，提供清晰的 API。
 * 
 * **设计原则**：
 * - 应用服务模式：协调用例执行
 * - 依赖注入：通过构造函数注入用例
 * - 薄包装：不包含业务逻辑，仅委托给用例
 * - 统一接口：为表现层提供一致的 API
 * 
 * **职责**：
 * - 提供卡片创建、删除、更新的统一接口
 * - 委托具体业务逻辑给对应的用例
 * - 处理用例之间的协调（如果需要）
 * 
 * **使用场景**：
 * - 表现层（UI 组件、事件处理器）调用此服务
 * - 服务委托给具体的用例执行业务逻辑
 * - 用例协调领域层和基础设施层
 */

import { Result } from '@/types/result';
import { CreateCardCommand } from '../commands/card/CreateCardCommand';
import { DeleteCardCommand } from '../commands/card/DeleteCardCommand';
import { DeleteCardsCommand, DeleteCardsResult } from '../commands/card/DeleteCardsCommand';
import { UpdateCardCommand } from '../commands/card/UpdateCardCommand';
import { UpdateFSRSCardCommand, UpdateFSRSCardCommandResult } from '../commands/card/UpdateFSRSCardCommand';
import { DeleteFSRSCardCommand, DeleteFSRSCardCommandResult } from '../commands/card/DeleteFSRSCardCommand';
import { CreateCardUseCase } from '../usecases/card/CreateCardUseCase';
import { DeleteCardUseCase } from '../usecases/card/DeleteCardUseCase';
import { DeleteCardsUseCase } from '../usecases/card/DeleteCardsUseCase';
import { UpdateCardUseCase } from '../usecases/card/UpdateCardUseCase';
import { UpdateFSRSCardUseCase } from '../usecases/card/UpdateFSRSCardUseCase';
import { DeleteFSRSCardUseCase } from '../usecases/card/DeleteFSRSCardUseCase';
import { Card } from '@/core/xiuyuan/domain/Card';
import { GetDueCardsQuery, GetDueCardsQueryResult } from '../queries/card/GetDueCardsQuery';
import { GetDueCardsQueryHandler } from '../queries/card/GetDueCardsQueryHandler';
import { GetCardQuery, GetCardQueryResult } from '../queries/card/GetCardQuery';
import { GetCardQueryHandler } from '../queries/card/GetCardQueryHandler';
import { GetCardsQuery, GetCardsQueryResult } from '../queries/card/GetCardsQuery';
import { GetCardsQueryHandler } from '../queries/card/GetCardsQueryHandler';
import type { ICardReadModel } from '../queries/card/ICardReadModel';
import { CardScheduleService } from '@/core/card/domain/services/CardScheduleService';

/**
 * 卡片应用服务
 * 
 * @class CardApplicationService
 */
export class CardApplicationService {
  private readonly getDueCardsQueryHandler: GetDueCardsQueryHandler;
  private readonly getCardQueryHandler: GetCardQueryHandler;
  private readonly getCardsQueryHandler: GetCardsQueryHandler;
  private readonly updateFSRSCardUseCase: UpdateFSRSCardUseCase;
  private readonly deleteFSRSCardUseCase: DeleteFSRSCardUseCase;
  private readonly readModel: ICardReadModel;  // ✅ 保存 Read Model 引用
  
  /**
   * 构造函数
   * 
   * @param createCardUseCase - 创建卡片用例
   * @param deleteCardUseCase - 删除卡片用例
   * @param deleteCardsUseCase - 批量删除卡片用例
   * @param updateCardUseCase - 更新卡片用例
   * @param readModel - 卡片读取模型（用于查询）
   * @param scheduleService - 卡片调度服务（用于查询）
   * @param unifiedStorage - 统一存储管理器（用于 FSRS 卡片操作）
   */
  constructor(
    private readonly createCardUseCase: CreateCardUseCase,
    private readonly deleteCardUseCase: DeleteCardUseCase,
    private readonly deleteCardsUseCase: DeleteCardsUseCase,
    private readonly updateCardUseCase: UpdateCardUseCase,
    readModel: ICardReadModel,  // ✅ 使用 Read Model 接口
    scheduleService: CardScheduleService,
    unifiedStorage: any  // UnifiedStorageManager
  ) {
    this.readModel = readModel;
    // 初始化查询处理器
    this.getDueCardsQueryHandler = new GetDueCardsQueryHandler(
      readModel,
      scheduleService
    );
    this.getCardQueryHandler = new GetCardQueryHandler(readModel);
    this.getCardsQueryHandler = new GetCardsQueryHandler(readModel);
    
    // ✅ 使用 UnifiedStorageManager 初始化 FSRS 卡片用例
    this.updateFSRSCardUseCase = new UpdateFSRSCardUseCase(unifiedStorage);
    this.deleteFSRSCardUseCase = new DeleteFSRSCardUseCase(unifiedStorage);
  }

  /**
   * 创建卡片
   * 
   * @param command - 创建卡片命令
   * @returns Result<Card> - 成功返回创建的卡片，失败返回错误
   * 
   * @example
   * ```typescript
   * const result = await cardService.createCard({
   *   blockId: '20240101120000-abc123',
   *   templateId: 'basic',
   *   faces: [
   *     { question: 'What is DDD?', answer: 'Domain-Driven Design' }
   *   ],
   *   priority: 5
   * });
   * 
   * if (result.ok) {
   *   console.log('Card created:', result.value);
   * } else {
   *   console.error('Failed to create card:', result.error);
   * }
   * ```
   */
  async createCard(command: CreateCardCommand): Promise<Result<Card>> {
    return this.createCardUseCase.execute(command);
  }

  /**
   * 删除卡片
   * 
   * @param command - 删除卡片命令
   * @returns Result<void> - 成功返回 void，失败返回错误
   * 
   * @example
   * ```typescript
   * const result = await cardService.deleteCard({
   *   cardId: 'card-123'
   * });
   * 
   * if (result.ok) {
   *   console.log('Card deleted successfully');
   * } else {
   *   console.error('Failed to delete card:', result.error);
   * }
   * ```
   */
  async deleteCard(command: DeleteCardCommand): Promise<Result<void>> {
    return this.deleteCardUseCase.execute(command);
  }

  /**
   * 批量删除卡片
   * 
   * @param command - 批量删除卡片命令
   * @returns Result<DeleteCardsResult> - 成功返回删除结果，失败返回错误
   * 
   * @description
   * 批量删除多张卡片，性能优化版本。
   * 
   * **性能优势**：
   * - 同一个 Xiuyuan 下的多张卡片只加载一次
   * - 批量发布事件，减少同步触发次数
   * - 使用索引快速定位 Xiuyuan
   * 
   * **使用场景**：
   * - 用户在卡片浏览器中选择多张卡片并删除
   * - 批量清理过期卡片
   * - 删除某个 Xiuyuan 下的所有卡片
   * 
   * @example
   * ```typescript
   * const result = await cardService.deleteCards({
   *   cardIds: ['card-1', 'card-2', 'card-3']
   * });
   * 
   * if (result.ok) {
   *   console.log(`Deleted ${result.value.deletedCount} cards`);
   *   console.log(`Failed ${result.value.failedCardIds.length} cards`);
   * } else {
   *   console.error('Failed to delete cards:', result.error);
   * }
   * ```
   */
  async deleteCards(command: DeleteCardsCommand): Promise<Result<DeleteCardsResult>> {
    return this.deleteCardsUseCase.execute(command);
  }

  /**
   * 更新卡片
   * 
   * @param command - 更新卡片命令
   * @returns Result<void> - 成功返回 void，失败返回错误
   * 
   * @example
   * ```typescript
   * const result = await cardService.updateCard({
   *   cardId: 'card-123',
   *   xiuyuanId: 'xiuyuan-456',
   *   faceIndex: 1
   * });
   * 
   * if (result.ok) {
   *   console.log('Card updated successfully');
   * } else {
   *   console.error('Failed to update card:', result.error);
   * }
   * ```
   */
  async updateCard(command: UpdateCardCommand): Promise<Result<void>> {
    return this.updateCardUseCase.execute(command);
  }
  
  // ========================================================================
  // 查询方法
  // ========================================================================
  
  /**
   * 获取到期卡片
   * 
   * @param query - 查询对象（可选）
   * @returns 查询结果，包含到期卡片列表和统计信息
   * 
   * @example
   * ```typescript
   * // 获取当前到期的卡片
   * const result = await cardService.getDueCards();
   * console.log(`到期卡片数量：${result.count} / ${result.total}`);
   * 
   * // 获取指定时间的到期卡片
   * const result2 = await cardService.getDueCards({
   *   now: new Date('2024-01-15T10:00:00Z')
   * });
   * ```
   */
  async getDueCards(query: GetDueCardsQuery = {}): Promise<GetDueCardsQueryResult> {
    return this.getDueCardsQueryHandler.execute(query);
  }
  
  /**
   * 获取到期卡片数量
   * 
   * @returns 到期卡片数量
   * 
   * @example
   * ```typescript
   * const count = await cardService.getDueCount();
   * console.log(`到期卡片数量：${count}`);
   * ```
   */
  async getDueCount(): Promise<number> {
    const result = await this.getDueCards();
    return result.count;
  }
  
  /**
   * 获取单个卡片
   * 
   * @param query - 查询对象
   * @returns 查询结果
   * @throws Error 如果卡片不存在
   * 
   * @example
   * ```typescript
   * const result = await cardService.getCard({ cardId: 'card-123' });
   * console.log('Card:', result.card);
   * ```
   */
  async getCard(query: GetCardQuery): Promise<GetCardQueryResult> {
    return this.getCardQueryHandler.execute(query);
  }
  
  /**
   * 获取卡片列表
   * 
   * @param query - 查询对象（可选）
   * @returns 查询结果
   * 
   * @example
   * ```typescript
   * // 获取所有卡片
   * const result = await cardService.getCards({});
   * console.log(`总卡片数：${result.total}`);
   * 
   * // 按状态过滤
   * const result2 = await cardService.getCards({
   *   filter: { state: 0 }
   * });
   * ```
   */
  async getCards(query: GetCardsQuery = {}): Promise<GetCardsQueryResult> {
    return this.getCardsQueryHandler.execute(query);
  }
  
  /**
   * 更新 FSRS 卡片
   * 
   * @param command - 更新命令
   * @returns Result<UpdateFSRSCardCommandResult> - 成功返回更新后的卡片，失败返回错误
   * 
   * @description
   * 更新 FSRS 卡片的字段。支持部分更新，只更新提供的字段。
   * 
   * **使用场景**：
   * - 更新卡片的复习数据
   * - 更新卡片的元数据
   * - 批量更新多个字段
   * 
   * @example
   * ```typescript
   * const result = await cardService.updateFSRSCard({
   *   cardId: 'card-123',
   *   updates: {
   *     due: new Date('2024-01-01'),
   *     stability: 10.5,
   *     priority: 8
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
  async updateFSRSCard(command: UpdateFSRSCardCommand): Promise<Result<UpdateFSRSCardCommandResult>> {
    return this.updateFSRSCardUseCase.execute(command);
  }
  
  /**
   * 删除 FSRS 卡片
   * 
   * @param command - 删除命令
   * @returns Result<DeleteFSRSCardCommandResult> - 成功返回删除结果，失败返回错误
   * 
   * @description
   * 删除 FSRS 卡片。支持可选地同时删除 Riff 卡片。
   * 
   * **使用场景**：
   * - 删除单个卡片
   * - 删除卡片并从 Riff 系统中移除
   * 
   * @example
   * ```typescript
   * const result = await cardService.deleteFSRSCard({
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
  async deleteFSRSCard(command: DeleteFSRSCardCommand): Promise<Result<DeleteFSRSCardCommandResult>> {
    return this.deleteFSRSCardUseCase.execute(command);
  }
  
  // ========================================================================
  // 便捷方法（用于 CardService 和 AutoCardHandler 迁移）
  // ========================================================================
  
  /**
   * 通过块 ID 获取卡片
   * 
   * @param blockId - 块 ID
   * @returns 卡片，如果不存在则返回 null
   * 
   * @description
   * 这是一个便捷方法，用于简化从 CardService 和 AutoCardHandler 的迁移。
   * 通过 Read Model 访问数据。
   * 
   * @example
   * ```typescript
   * const card = cardService.getCardByBlockId('20240101120000-abc123');
   * if (card) {
   *   console.log('Found card:', card.id);
   * }
   * ```
   */
  getCardByBlockId(blockId: string): any {
    try {
      const card = this.readModel.getCardByBlockId(blockId);
      return card || null;
    } catch (error) {
      // 卡片不存在
      return null;
    }
  }
  
  /**
   * 保存卡片到存储
   * 
   * @param card - 卡片对象
   * 
   * @description
   * 这是一个便捷方法，用于简化从 CardService 和 AutoCardHandler 的迁移。
   * 
   * ⚠️ 注意：此方法直接操作 UnifiedStorageManager，绕过了 DDD 架构。
   * 建议使用 Use Cases 进行写操作。
   * 
   * @deprecated 建议使用 updateCard() 或相应的 Use Case
   * 
   * @example
   * ```typescript
   * const card = createDefaultCard(blockId);
   * cardService.setCard(card);
   * await cardService.saveCards();
   * ```
   */
  setCard(card: any): void {
    // ⚠️ 临时方案：需要访问 UnifiedStorageManager
    // 这违反了 DDD 原则，但为了向后兼容暂时保留
    throw new Error('setCard() is deprecated. Please use updateCard() or appropriate Use Case.');
  }
  
  /**
   * 移除卡片
   * 
   * @param cardId - 卡片 ID
   * 
   * @description
   * 这是一个便捷方法，用于简化从 CardService 和 AutoCardHandler 的迁移。
   * 
   * ⚠️ 注意：此方法直接操作 UnifiedStorageManager，绕过了 DDD 架构。
   * 建议使用 deleteCard() Use Case。
   * 
   * @deprecated 建议使用 deleteCard() Use Case
   * 
   * @example
   * ```typescript
   * await cardService.deleteCard({ cardId: 'card-123' });
   * ```
   */
  removeCard(cardId: string): void {
    // ⚠️ 临时方案：需要访问 UnifiedStorageManager
    // 这违反了 DDD 原则，但为了向后兼容暂时保留
    throw new Error('removeCard() is deprecated. Please use deleteCard() Use Case.');
  }
  
  /**
   * 保存所有卡片到持久化存储
   * 
   * @description
   * 这是一个便捷方法，用于简化从 CardService 和 AutoCardHandler 的迁移。
   * 
   * ⚠️ 注意：此方法直接操作 UnifiedStorageManager，绕过了 DDD 架构。
   * 
   * @deprecated 建议使用 Use Cases，它们会自动保存
   * 
   * @example
   * ```typescript
   * // 不推荐
   * cardService.setCard(card1);
   * await cardService.saveCards();
   * 
   * // 推荐
   * await cardService.updateCard({ ... });
   * ```
   */
  async saveCards(): Promise<void> {
    // ⚠️ 临时方案：需要访问 UnifiedStorageManager
    // 这违反了 DDD 原则，但为了向后兼容暂时保留
    throw new Error('saveCards() is deprecated. Use Cases handle persistence automatically.');
  }

  /**
   * 批量删除卡片
   *
   * 用于同步服务等需要批量删除卡片的场景。
   * 注意：此方法会触发领域事件。
   *
   * @param cardIds 卡片 ID 列表
   * @returns 删除结果
   */
  async batchDeleteCards(cardIds: string[]): Promise<{ ok: true; value: { deletedCount: number; failedCount: number } } | { ok: false; error: Error }> {
    if (!cardIds || cardIds.length === 0) {
      return { ok: true, value: { deletedCount: 0, failedCount: 0 } };
    }

    let deletedCount = 0;
    let failedCount = 0;

    for (const cardId of cardIds) {
      try {
        const result = await this.deleteCard({ cardId });
        if (result.ok) {
          deletedCount++;
        } else {
          failedCount++;
          console.error(`[CardApplicationService] Failed to delete card ${cardId}:`, result.error);
        }
      } catch (error) {
        failedCount++;
        console.error(`[CardApplicationService] Error deleting card ${cardId}:`, error);
      }
    }

    // 保存更改
    await this.saveCards();

    return { ok: true, value: { deletedCount, failedCount } };
  }

  /**
   * 批量创建卡片（不触发领域事件）
   *
   * 用于同步服务等需要批量创建卡片的场景。
   * 注意：此方法不会触发领域事件，适用于从外部数据源同步。
   *
   * @param cards FSRSCard 列表
   * @returns 创建结果
   */
  async batchCreateCardsWithoutEvents(cards: any[]): Promise<{ ok: true; value: { createdCount: number; failedCount: number } } | { ok: false; error: Error }> {
    if (!cards || cards.length === 0) {
      return { ok: true, value: { createdCount: 0, failedCount: 0 } };
    }

    let createdCount = 0;
    let failedCount = 0;

    for (const card of cards) {
      try {
        this.storage.setCard(card);
        createdCount++;
      } catch (error) {
        failedCount++;
        console.error(`[CardApplicationService] Error creating card ${card.id}:`, error);
      }
    }

    // 保存更改
    await this.saveCards();

    return { ok: true, value: { createdCount, failedCount } };
  }

  /**
   * 批量更新卡片（不触发领域事件）
   *
   * 用于同步服务等需要批量更新卡片的场景。
   * 注意：此方法不会触发领域事件，适用于从外部数据源同步。
   *
   * @param cards FSRSCard 列表
   * @returns 更新结果
   */
  async batchUpdateCardsWithoutEvents(cards: any[]): Promise<{ ok: true; value: { updatedCount: number; failedCount: number } } | { ok: false; error: Error }> {
    if (!cards || cards.length === 0) {
      return { ok: true, value: { updatedCount: 0, failedCount: 0 } };
    }

    let updatedCount = 0;
    let failedCount = 0;

    for (const card of cards) {
      try {
        const existingCard = this.storage.getCard(card.id);
        if (existingCard) {
          this.storage.setCard(card);
          updatedCount++;
        } else {
          failedCount++;
          console.warn(`[CardApplicationService] Card ${card.id} not found for update`);
        }
      } catch (error) {
        failedCount++;
        console.error(`[CardApplicationService] Error updating card ${card.id}:`, error);
      }
    }

    // 保存更改
    await this.saveCards();

    return { ok: true, value: { updatedCount, failedCount } };
  }

}

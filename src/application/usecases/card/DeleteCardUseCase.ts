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
    if (!xiuyuan || !actualCardId) {
      return err(new Error(`Card with ID ${cardId.getValue()} not found in any Xiuyuan`));
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

    // 6. 发布领域事件
    const events = xiuyuan.getDomainEvents();
    await this.eventBus.publishAll(events);
    xiuyuan.clearDomainEvents();

    // 7. 返回成功结果
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
    // 获取所有 Xiuyuan
    const allXiuyuansResult = await this.xiuyuanRepo.findAll();
    if (!allXiuyuansResult.ok) {
      return allXiuyuansResult as Result<{xiuyuan: any, actualCardId: any}>;
    }

    const allXiuyuans = allXiuyuansResult.value;

    // 遍历所有 Xiuyuan，查找包含该卡片的 Xiuyuan
    // 注意：需要通过值比较，因为 CardId 是值对象
    for (const xiuyuan of allXiuyuans) {
      const cards = xiuyuan.getCards();
      for (const card of cards) {
        if (card.getId().equals(cardId)) {
          return ok({ xiuyuan, actualCardId: card.getId() });
        }
      }
    }

    // 未找到包含该卡片的 Xiuyuan
    return ok({ xiuyuan: null, actualCardId: null });
  }
}

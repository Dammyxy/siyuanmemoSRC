/**
 * UpdateCardUseCase - 更新卡片用例
 * 
 * @description
 * 编排卡片更新的业务流程，协调领域层和基础设施层。
 * 
 * **设计原则**：
 * - 用例模式：封装单一业务用例
 * - 编排：协调多个领域对象和服务
 * - 事务边界：定义事务的开始和结束
 * - 使用 Result 类型：统一错误处理
 * 
 * **职责**：
 * - 验证输入命令
 * - 查找 Xiuyuan 聚合根
 * - 获取并更新 Card 实体
 * - 通过 XiuyuanRepository 持久化
 * - 返回更新结果
 * 
 * **业务流程**：
 * 1. 验证 UpdateCardCommand
 * 2. 将命令转换为领域对象（XiuyuanId, CardId）
 * 3. 查找 Xiuyuan 聚合根
 * 4. 获取要更新的 Card
 * 5. 根据命令更新 Card（faceIndex 或 scheduleInfo）
 * 6. 调用 Xiuyuan.updateCard 更新卡片
 * 7. 持久化更新后的 Xiuyuan
 * 8. 返回更新结果
 */

import { Result, ok, err } from '@/types/result';
import { UpdateCardCommand, validateUpdateCardCommand } from '../../commands/card/UpdateCardCommand';
import { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';
import { CardId } from '@/core/xiuyuan/domain/CardId';
import { Card } from '@/core/xiuyuan/domain/Card';

export class UpdateCardUseCase {
  constructor(
    private readonly xiuyuanRepo: IXiuyuanRepository
  ) {}

  /**
   * 执行更新卡片用例
   * 
   * @param command - 更新卡片命令
   * @returns Result<void> - 成功返回 void，失败返回错误
   */
  async execute(command: UpdateCardCommand): Promise<Result<void>> {
    // 1. 验证输入命令
    const validationError = validateUpdateCardCommand(command);
    if (validationError) {
      return err(new Error(`Invalid command: ${validationError}`));
    }

    // 2. 将命令转换为领域对象
    const xiuyuanIdResult = XiuyuanId.create(command.xiuyuanId);
    if (!xiuyuanIdResult.ok) {
      return err(new Error(`Invalid xiuyuanId: ${xiuyuanIdResult.error.message}`));
    }

    const cardIdResult = CardId.create(command.cardId);
    if (!cardIdResult.ok) {
      return err(new Error(`Invalid cardId: ${cardIdResult.error.message}`));
    }

    const xiuyuanId = xiuyuanIdResult.value;
    const cardId = cardIdResult.value;

    // 3. 查找 Xiuyuan 聚合根
    const xiuyuanResult = await this.xiuyuanRepo.findById(xiuyuanId);
    if (!xiuyuanResult.ok) {
      return xiuyuanResult as Result<void>;
    }

    const xiuyuan = xiuyuanResult.value;
    if (!xiuyuan) {
      return err(new Error(`Xiuyuan not found: ${command.xiuyuanId}`));
    }

    // 4. 查找实际的 CardId 实例（因为 Map 使用引用相等性）
    const actualCardId = this.findActualCardId(xiuyuan, cardId);
    if (!actualCardId) {
      return err(new Error(`Card not found: ${command.cardId}`));
    }

    // 5. 获取要更新的 Card
    const card = xiuyuan.getCard(actualCardId);
    if (!card) {
      return err(new Error(`Card not found: ${command.cardId}`));
    }

    // 6. 根据命令更新 Card
    let updatedCard = card;

    // 更新 faceIndex（如果提供）
    if (command.faceIndex !== undefined) {
      // 验证 faceIndex 是否有效
      const faces = xiuyuan.getFaces();
      if (command.faceIndex < 0 || command.faceIndex >= faces.length) {
        return err(new Error(`Invalid faceIndex: ${command.faceIndex}. Must be between 0 and ${faces.length - 1}`));
      }

      // 创建新的 Card 实例（Card 是不可变的）
      const newCardResult = Card.create({
        id: updatedCard.getId(),
        xiuyuanId: updatedCard.getXiuyuanId(),
        faceIndex: command.faceIndex,
        scheduleInfo: updatedCard.getScheduleInfo(),
        createdAt: updatedCard.getCreatedAt(),
        updatedAt: new Date()
      });

      if (!newCardResult.ok) {
        return newCardResult as Result<void>;
      }

      updatedCard = newCardResult.value;
    }

    // 更新 scheduleInfo（如果提供）
    if (command.scheduleInfo !== undefined) {
      // 创建新的 Card 实例（Card 是不可变的）
      const newCardResult = Card.create({
        id: updatedCard.getId(),
        xiuyuanId: updatedCard.getXiuyuanId(),
        faceIndex: updatedCard.getFaceIndex(),
        scheduleInfo: command.scheduleInfo,
        createdAt: updatedCard.getCreatedAt(),
        updatedAt: new Date()
      });

      if (!newCardResult.ok) {
        return newCardResult as Result<void>;
      }

      updatedCard = newCardResult.value;
    }

    // 7. 调用 Xiuyuan.updateCard 更新卡片（使用实际的 CardId 实例）
    const updateResult = xiuyuan.updateCard(actualCardId, updatedCard);
    if (!updateResult.ok) {
      return updateResult;
    }

    // 8. 持久化更新后的 Xiuyuan
    const saveResult = await this.xiuyuanRepo.save(xiuyuan);
    if (!saveResult.ok) {
      return saveResult;
    }

    // 9. 返回成功结果
    return ok(undefined);
  }

  /**
   * 查找实际的 CardId 实例
   * 
   * @private
   * @param xiuyuan - Xiuyuan 聚合根
   * @param cardId - 卡片 ID（用于值比较）
   * @returns CardId | null - 找到返回实际的 CardId 实例，未找到返回 null
   */
  private findActualCardId(xiuyuan: any, cardId: CardId): CardId | null {
    const cards = xiuyuan.getCards();
    for (const card of cards) {
      if (card.getId().equals(cardId)) {
        return card.getId();
      }
    }
    return null;
  }
}

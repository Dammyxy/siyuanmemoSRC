/**
 * CardDeletionService - 卡片删除领域服务
 * 
 * @description
 * 封装卡片删除的业务逻辑，协调 Xiuyuan 聚合根和 Card 实体。
 * 
 * **设计原则**：
 * - 领域服务：封装不属于单个实体的业务逻辑
 * - 无状态：不保存任何状态，只提供业务操作
 * - 使用 Result 类型：统一错误处理
 * - 单一职责：只负责卡片删除相关的业务逻辑
 * 
 * **职责**：
 * - 验证卡片删除的业务规则
 * - 协调 Xiuyuan 和 Card 的删除
 * - 确保业务不变性
 */

import { Result, ok, err, isErr } from '../../../../types/result';
import { Xiuyuan } from '../Xiuyuan';
import { CardId } from '../CardId';

export class CardDeletionService {
  /**
   * 从 Xiuyuan 删除卡片
   * 
   * @description
   * 从 Xiuyuan 聚合根中删除指定的卡片。
   * 
   * **业务规则**：
   * - 卡片必须存在
   * - 卡片必须属于指定的 Xiuyuan
   * 
   * @param xiuyuan - Xiuyuan 聚合根
   * @param cardId - 要删除的卡片 ID
   * @returns Result<void> - 成功返回 void，失败返回错误
   */
  deleteCard(xiuyuan: Xiuyuan, cardId: CardId): Result<void> {
    // 1. 验证卡片存在
    const card = xiuyuan.getCard(cardId);
    if (!card) {
      return err(new Error(
        `Card with ID ${cardId.getValue()} not found in Xiuyuan ${xiuyuan.getId().getValue()}`
      ));
    }

    // 2. 验证卡片属于当前 Xiuyuan
    if (!card.getXiuyuanId().equals(xiuyuan.getId())) {
      return err(new Error(
        `Card ${cardId.getValue()} does not belong to Xiuyuan ${xiuyuan.getId().getValue()}`
      ));
    }

    // 3. 委托给 Xiuyuan 聚合根删除卡片
    const deleteResult = xiuyuan.deleteCard(cardId);
    if (!deleteResult.ok) {
      return deleteResult;
    }

    return ok(undefined);
  }

  /**
   * 批量删除卡片
   * 
   * @description
   * 从 Xiuyuan 聚合根中删除多个卡片。
   * 
   * **业务规则**：
   * - 所有卡片必须存在
   * - 所有卡片必须属于指定的 Xiuyuan
   * - 如果任何一个卡片删除失败，整个操作失败
   * 
   * @param xiuyuan - Xiuyuan 聚合根
   * @param cardIds - 要删除的卡片 ID 列表
   * @returns Result<void> - 成功返回 void，失败返回错误
   */
  deleteCards(xiuyuan: Xiuyuan, cardIds: CardId[]): Result<void> {
    // 验证所有卡片都存在
    for (const cardId of cardIds) {
      const card = xiuyuan.getCard(cardId);
      if (!card) {
        return err(new Error(
          `Card with ID ${cardId.getValue()} not found in Xiuyuan ${xiuyuan.getId().getValue()}`
        ));
      }
    }

    // 删除所有卡片
    for (const cardId of cardIds) {
      const deleteResult = this.deleteCard(xiuyuan, cardId);
      if (isErr(deleteResult)) {
        return err(new Error(
          `Failed to delete card ${cardId.getValue()}: ${deleteResult.error.message}`
        ));
      }
    }

    return ok(undefined);
  }

  /**
   * 删除 Xiuyuan 的所有卡片
   * 
   * @description
   * 删除 Xiuyuan 聚合根中的所有卡片。
   * 
   * @param xiuyuan - Xiuyuan 聚合根
   * @returns Result<void> - 成功返回 void，失败返回错误
   */
  deleteAllCards(xiuyuan: Xiuyuan): Result<void> {
    const cards = xiuyuan.getCards();
    const cardIds = cards.map(card => card.getId());

    if (cardIds.length === 0) {
      return ok(undefined);
    }

    return this.deleteCards(xiuyuan, cardIds);
  }

  /**
   * 验证卡片删除的前置条件
   * 
   * @description
   * 验证是否可以删除指定的卡片。
   * 
   * **验证规则**：
   * - 卡片必须存在
   * - 卡片必须属于指定的 Xiuyuan
   * 
   * @param xiuyuan - Xiuyuan 聚合根
   * @param cardId - 要删除的卡片 ID
   * @returns Result<void> - 成功返回 void，失败返回错误
   */
  validateCardDeletion(xiuyuan: Xiuyuan, cardId: CardId): Result<void> {
    // 验证卡片存在
    const card = xiuyuan.getCard(cardId);
    if (!card) {
      return err(new Error(
        `Card with ID ${cardId.getValue()} not found in Xiuyuan ${xiuyuan.getId().getValue()}`
      ));
    }

    // 验证卡片属于当前 Xiuyuan
    if (!card.getXiuyuanId().equals(xiuyuan.getId())) {
      return err(new Error(
        `Card ${cardId.getValue()} does not belong to Xiuyuan ${xiuyuan.getId().getValue()}`
      ));
    }

    return ok(undefined);
  }
}

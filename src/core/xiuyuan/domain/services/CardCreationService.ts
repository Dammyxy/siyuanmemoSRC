/**
 * CardCreationService - 卡片创建领域服务
 * 
 * @description
 * 封装卡片创建的业务逻辑，协调 Xiuyuan 聚合根和 Card 实体。
 * 
 * **设计原则**：
 * - 领域服务：封装不属于单个实体的业务逻辑
 * - 无状态：不保存任何状态，只提供业务操作
 * - 使用 Result 类型：统一错误处理
 * - 单一职责：只负责卡片创建相关的业务逻辑
 * 
 * **职责**：
 * - 验证卡片创建的业务规则
 * - 协调 Xiuyuan 和 Card 的创建
 * - 确保业务不变性
 */

import { Result, ok, err } from '../../../../types/result';
import { Xiuyuan } from '../Xiuyuan';
import { Card } from '../Card';
import { CardId } from '../CardId';

export class CardCreationService {
  /**
   * 为 Xiuyuan 创建卡片
   * 
   * @description
   * 创建一个新卡片并添加到 Xiuyuan 聚合根。
   * 
   * **业务规则**：
   * - faceIndex 必须在有效范围内（0 到 faces.length - 1）
   * - 卡片 ID 必须唯一
   * - 卡片必须关联到有效的 Xiuyuan
   * 
   * @param xiuyuan - Xiuyuan 聚合根
   * @param faceIndex - 卡片面索引
   * @param cardId - 卡片 ID（可选，如果不提供则自动生成）
   * @returns Result<Card> - 成功返回创建的 Card，失败返回错误
   */
  createCard(
    xiuyuan: Xiuyuan,
    faceIndex: number,
    cardId?: CardId
  ): Result<Card> {
    // 1. 验证 faceIndex
    const faces = xiuyuan.getFaces();
    if (faceIndex < 0 || faceIndex >= faces.length) {
      return err(new Error(
        `Invalid faceIndex: ${faceIndex}. Must be between 0 and ${faces.length - 1}`
      ));
    }

    // 2. 如果提供了 cardId，验证其唯一性
    if (cardId) {
      const existingCard = xiuyuan.getCard(cardId);
      if (existingCard) {
        return err(new Error(
          `Card with ID ${cardId.getValue()} already exists in this Xiuyuan`
        ));
      }
    }

    // 3. 委托给 Xiuyuan 聚合根创建卡片
    const cardResult = xiuyuan.createCard(faceIndex, cardId);
    if (!cardResult.ok) {
      return cardResult;
    }

    return ok(cardResult.value);
  }

  /**
   * 批量创建卡片
   * 
   * @description
   * 为 Xiuyuan 的所有面创建卡片。
   * 
   * **业务规则**：
   * - 为每个面创建一个卡片
   * - 如果任何一个卡片创建失败，整个操作失败
   * 
   * @param xiuyuan - Xiuyuan 聚合根
   * @returns Result<Card[]> - 成功返回创建的所有 Card，失败返回错误
   */
  createCardsForAllFaces(xiuyuan: Xiuyuan): Result<Card[]> {
    const faces = xiuyuan.getFaces();
    const cards: Card[] = [];

    for (let i = 0; i < faces.length; i++) {
      const cardResult = this.createCard(xiuyuan, i);
      if (!cardResult.ok) {
        return err(new Error(
          `Failed to create card for face ${i}: ${cardResult.error.message}`
        ));
      }
      cards.push(cardResult.value);
    }

    return ok(cards);
  }

  /**
   * 验证卡片创建的前置条件
   * 
   * @description
   * 验证是否可以为指定的 Xiuyuan 创建卡片。
   * 
   * **验证规则**：
   * - Xiuyuan 必须有至少一个面
   * - faceIndex 必须有效
   * 
   * @param xiuyuan - Xiuyuan 聚合根
   * @param faceIndex - 卡片面索引
   * @returns Result<void> - 成功返回 void，失败返回错误
   */
  validateCardCreation(xiuyuan: Xiuyuan, faceIndex: number): Result<void> {
    // 验证 Xiuyuan 有面
    const faces = xiuyuan.getFaces();
    if (faces.length === 0) {
      return err(new Error('Xiuyuan must have at least one face to create a card'));
    }

    // 验证 faceIndex
    if (faceIndex < 0 || faceIndex >= faces.length) {
      return err(new Error(
        `Invalid faceIndex: ${faceIndex}. Must be between 0 and ${faces.length - 1}`
      ));
    }

    return ok(undefined);
  }
}

/**
 * CardTypeMarkerService
 * 
 * 管理卡片类型标记系统，提供概念卡和描述符卡的标记功能。
 * 
 * 职责：
 * - 设置和获取卡片类型标记（concept/descriptor）
 * - 根据类型标记推导技术类型（item/topic）
 * - 同步块属性
 * - 批量操作支持
 * 
 * @see .kiro/specs/card-type-system-enhancement/design.md 第 2.1 节
 */

import type { FSRSCard } from '@/types/card';
import { CardType } from '@/types/card';
import type { StorageManager } from '@/core/storage/manager';
import * as siyuanApi from '@/core/siyuan/api';
import { TYPE_MAPPING } from './type-mapping';

/** 卡片类型标记 */
export type CardTypeMarker = 'concept' | 'descriptor';

/**
 * 卡片类型标记服务
 */
export class CardTypeMarkerService {
  private storage: StorageManager;
  private markerCache: Map<string, CardTypeMarker> = new Map();

  constructor(storage: StorageManager) {
    this.storage = storage;
  }

  /**
   * 设置卡片类型标记
   * 
   * @param cardId - 卡片 ID
   * @param marker - 类型标记（concept 或 descriptor）
   * 
   * @example
   * ```typescript
   * await service.setCardTypeMarker('card-1', 'concept');
   * ```
   */
  async setCardTypeMarker(cardId: string, marker: CardTypeMarker): Promise<void> {
    const card = this.storage.getCard(cardId);
    if (!card) {
      throw new Error(`Card not found: ${cardId}`);
    }

    // 1. 更新卡片的类型标记
    card.cardTypeMarker = marker;

    // 2. 根据标记推导技术类型
    card.type = this.inferTechnicalType(marker);

    // 3. 更新存储
    this.storage.setCard(card);
    await this.storage.saveCards();

    // 4. 同步块属性
    await this.syncBlockAttributes(card);

    // 5. 更新缓存
    this.markerCache.set(cardId, marker);

    console.log(`[CardTypeMarkerService] Set card type marker: ${cardId} -> ${marker} (type: ${card.type})`);
  }

  /**
   * 获取卡片类型标记
   * 
   * @param cardId - 卡片 ID
   * @returns 类型标记，如果未设置则返回 undefined
   * 
   * @example
   * ```typescript
   * const marker = service.getCardTypeMarker('card-1');
   * if (marker === 'concept') {
   *   console.log('This is a concept card');
   * }
   * ```
   */
  getCardTypeMarker(cardId: string): CardTypeMarker | undefined {
    // 1. 检查缓存
    if (this.markerCache.has(cardId)) {
      return this.markerCache.get(cardId);
    }

    // 2. 从存储读取
    const card = this.storage.getCard(cardId);
    const marker = card?.cardTypeMarker;

    // 3. 更新缓存
    if (marker) {
      this.markerCache.set(cardId, marker);
    }

    return marker;
  }

  /**
   * 根据类型标记推导技术类型
   * 
   * 映射规则：
   * - concept -> topic (使用 A-Factor 调度器)
   * - descriptor -> item (使用 FSRS 调度器)
   * 
   * @param marker - 类型标记
   * @returns 技术类型
   * 
   * @example
   * ```typescript
   * const type = service.inferTechnicalType('concept');
   * console.log(type); // 'topic'
   * ```
   */
  inferTechnicalType(marker: CardTypeMarker): CardType {
    return TYPE_MAPPING[marker];
  }

  /**
   * 批量设置类型标记
   * 
   * @param cardIds - 卡片 ID 列表
   * @param marker - 类型标记
   * 
   * @example
   * ```typescript
   * await service.batchSetMarker(['card-1', 'card-2'], 'concept');
   * ```
   */
  async batchSetMarker(cardIds: string[], marker: CardTypeMarker): Promise<void> {
    const technicalType = this.inferTechnicalType(marker);
    const updatedCards: FSRSCard[] = [];

    // 1. 批量更新卡片
    for (const cardId of cardIds) {
      const card = this.storage.getCard(cardId);
      if (!card) {
        console.warn(`[CardTypeMarkerService] Card not found: ${cardId}`);
        continue;
      }

      card.cardTypeMarker = marker;
      card.type = technicalType;
      this.storage.setCard(card);
      updatedCards.push(card);

      // 更新缓存
      this.markerCache.set(cardId, marker);
    }

    // 2. 批量保存
    await this.storage.saveCards();

    // 3. 批量同步块属性
    await this.batchSyncBlockAttributes(updatedCards);

    console.log(`[CardTypeMarkerService] Batch set marker: ${cardIds.length} cards -> ${marker}`);
  }

  /**
   * 同步块属性
   * 
   * 将卡片类型标记同步到思源块属性中
   * 
   * @param card - 卡片对象
   */
  private async syncBlockAttributes(card: FSRSCard): Promise<void> {
    const attrs: Record<string, string> = {};

    // 添加类型标记属性
    if (card.cardTypeMarker) {
      attrs['custom-fsrs-card-type'] = card.cardTypeMarker;
    }

    // 如果是概念卡且是神经漫游种子，添加种子标记
    if (card.cardTypeMarker === 'concept' && card.neuralRoamSeed) {
      attrs['custom-fsrs-neural-seed'] = 'true';
    }

    // 更新块属性
    if (Object.keys(attrs).length > 0) {
      await siyuanApi.setBlockAttrs(card.blockId, attrs);
    }
  }

  /**
   * 批量同步块属性
   * 
   * @param cards - 卡片列表
   */
  private async batchSyncBlockAttributes(cards: FSRSCard[]): Promise<void> {
    // 批量更新块属性
    for (const card of cards) {
      await this.syncBlockAttributes(card);
    }
  }

  /**
   * 清除缓存
   * 
   * 在需要强制重新读取数据时调用
   */
  clearCache(): void {
    this.markerCache.clear();
  }

  /**
   * 验证类型映射一致性
   * 
   * 检查卡片的 cardTypeMarker 和 type 字段是否符合映射规则
   * 
   * @param card - 卡片对象
   * @returns 是否一致
   */
  validateTypeMapping(card: FSRSCard): boolean {
    if (!card.cardTypeMarker) {
      return true; // 没有标记的卡片不需要验证
    }

    const expectedType = this.inferTechnicalType(card.cardTypeMarker);
    return card.type === expectedType;
  }

  /**
   * 修复类型映射不一致的卡片
   * 
   * 扫描所有卡片，修复类型映射不一致的情况
   * 
   * @returns 修复的卡片数量
   */
  async fixInconsistentCards(): Promise<number> {
    const allCards = this.storage.getAllCards();
    let fixedCount = 0;

    for (const card of allCards) {
      if (!this.validateTypeMapping(card)) {
        const expectedType = this.inferTechnicalType(card.cardTypeMarker!);
        console.warn(
          `[CardTypeMarkerService] Fixing inconsistent card: ${card.id} ` +
          `(marker: ${card.cardTypeMarker}, type: ${card.type} -> ${expectedType})`
        );

        card.type = expectedType;
        this.storage.setCard(card);
        fixedCount++;
      }
    }

    if (fixedCount > 0) {
      await this.storage.saveCards();
      console.log(`[CardTypeMarkerService] Fixed ${fixedCount} inconsistent cards`);
    }

    return fixedCount;
  }
}

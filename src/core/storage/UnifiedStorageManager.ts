/**
 * UnifiedStorageManager - 统一存储管理器
 * 
 * @module UnifiedStorageManager
 * @description
 * 统一管理 XiuYuan 和 FSRSCard 数据，使用 MessagePack 格式持久化，
 * 提供内存索引以支持高性能查询（< 100ms for 100,000 cards）。
 * 
 * **核心功能**：
 * - 统一存储：XiuYuan 和 Card 存储在同一个 MessagePack 文件
 * - 内存索引：blockID, xiuyuanID, type, due, priority 索引
 * - 防抖保存：1 秒延迟自动保存，避免频繁 I/O
 * - 数据一致性：检测孤儿卡片、空 XiuYuan、无效引用
 * 
 * **性能要求**：
 * - 加载 100,000 卡片 < 2s
 * - 查询到期卡片 < 100ms
 * - 创建/删除/更新卡片 < 50ms
 * 
 * **Validates: Requirements 1.1, 1.2, 1.6**
 */

import type { FSRSCard, CardType } from '../../types/card';
import type { IXiuyuan } from '../xiuyuan/types';
import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';

/**
 * 统一存储数据结构
 */
export interface UnifiedCardStore {
  version: number;
  xiuyuans: Record<string, IXiuyuan>;
  cards: Record<string, FSRSCard>;
}

/**
 * 存储统计信息
 */
export interface StorageStats {
  totalCards: number;
  totalXiuYuans: number;
  cardsByType: Record<CardType, number>;
  dueCards: number;
  newCards: number;
  learningCards: number;
  reviewCards: number;
}

/**
 * 统一存储管理器
 */
export class UnifiedStorageManager {
  // === 数据存储 ===
  private xiuyuans: Map<string, IXiuyuan> = new Map();
  private cards: Map<string, FSRSCard> = new Map();

  // === 内存索引 ===
  private indexByBlockID: Map<string, string[]> = new Map();
  private indexByXiuyuanID: Map<string, string[]> = new Map();
  private indexByType: Map<CardType, string[]> = new Map();
  private indexByDue: FSRSCard[] = [];
  private indexByPriority: Map<number, string[]> = new Map();

  // === 脏标记和自动保存 ===
  private dirty: boolean = false;
  private saveTimer: NodeJS.Timeout | null = null;
  private readonly SAVE_DELAY = 1000; // 1 秒延迟

  // === 持久化回调 ===
  private saveCallback: ((data: UnifiedCardStore) => Promise<void>) | null = null;
  private loadCallback: (() => Promise<UnifiedCardStore>) | null = null;

  /**
   * 设置持久化回调
   * @param save 保存回调函数（接收数据作为参数）
   * @param load 加载回调函数
   */
  setPersistenceCallbacks(
    save: (data: UnifiedCardStore) => Promise<void>,
    load: () => Promise<UnifiedCardStore>
  ): void {
    this.saveCallback = save;
    this.loadCallback = load;
  }

  /**
   * 加载数据
   */
  async load(): Promise<Result<void>> {
    try {
      if (!this.loadCallback) {
        return err(new Error('Load callback not set'));
      }

      const store = await this.loadCallback();

      // 清空现有数据
      this.xiuyuans.clear();
      this.cards.clear();

      // 加载 XiuYuans
      for (const [id, xiuyuan] of Object.entries(store.xiuyuans)) {
        this.xiuyuans.set(id, xiuyuan);
      }

      // 加载 Cards
      for (const [id, card] of Object.entries(store.cards)) {
        this.cards.set(id, card);
      }

      // 重建索引
      this.rebuildIndexes();

      this.dirty = false;
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 保存数据
   */
  async save(): Promise<Result<void>> {
    try {
      if (!this.saveCallback) {
        return err(new Error('Save callback not set'));
      }

      // 获取当前数据并传递给保存回调
      const storeData = this.getStoreData();
      await this.saveCallback(storeData);
      this.dirty = false;

      // 清除保存定时器
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 调度保存（防抖）
   */
  private scheduleSave(): void {
    this.dirty = true;

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.save().catch(error => {
        console.error('Failed to auto-save:', error);
      });
    }, this.SAVE_DELAY);
  }

  /**
   * 重建所有索引
   */
  private rebuildIndexes(): void {
    // 清空索引
    this.indexByBlockID.clear();
    this.indexByXiuyuanID.clear();
    this.indexByType.clear();
    this.indexByDue = [];
    this.indexByPriority.clear();

    // 重建索引
    for (const card of this.cards.values()) {
      this.updateIndexesForCard(card, 'add');
    }

    // 排序 due 索引
    this.indexByDue.sort((a, b) => a.due - b.due);
  }

  /**
   * 更新卡片索引
   * @param card 卡片
   * @param action 操作类型（add 或 remove）
   */
  private updateIndexesForCard(card: FSRSCard, action: 'add' | 'remove'): void {
    if (action === 'add') {
      // blockID 索引
      const blockCards = this.indexByBlockID.get(card.blockId) || [];
      if (!blockCards.includes(card.id)) {
        blockCards.push(card.id);
        this.indexByBlockID.set(card.blockId, blockCards);
      }

      // xiuyuanID 索引
      const xiuyuanID = card.meta?.xiuyuanID;
      if (xiuyuanID) {
        const xiuyuanCards = this.indexByXiuyuanID.get(xiuyuanID) || [];
        if (!xiuyuanCards.includes(card.id)) {
          xiuyuanCards.push(card.id);
          this.indexByXiuyuanID.set(xiuyuanID, xiuyuanCards);
        }
      }

      // type 索引
      const typeCards = this.indexByType.get(card.type) || [];
      if (!typeCards.includes(card.id)) {
        typeCards.push(card.id);
        this.indexByType.set(card.type, typeCards);
      }

      // due 索引
      this.indexByDue.push(card);

      // priority 索引
      const priorityCards = this.indexByPriority.get(card.priority) || [];
      if (!priorityCards.includes(card.id)) {
        priorityCards.push(card.id);
        this.indexByPriority.set(card.priority, priorityCards);
      }
    } else {
      // 移除 blockID 索引
      const blockCards = this.indexByBlockID.get(card.blockId);
      if (blockCards) {
        const index = blockCards.indexOf(card.id);
        if (index !== -1) {
          blockCards.splice(index, 1);
        }
        if (blockCards.length === 0) {
          this.indexByBlockID.delete(card.blockId);
        }
      }

      // 移除 xiuyuanID 索引
      const xiuyuanID = card.meta?.xiuyuanID;
      if (xiuyuanID) {
        const xiuyuanCards = this.indexByXiuyuanID.get(xiuyuanID);
        if (xiuyuanCards) {
          const index = xiuyuanCards.indexOf(card.id);
          if (index !== -1) {
            xiuyuanCards.splice(index, 1);
          }
          if (xiuyuanCards.length === 0) {
            this.indexByXiuyuanID.delete(xiuyuanID);
          }
        }
      }

      // 移除 type 索引
      const typeCards = this.indexByType.get(card.type);
      if (typeCards) {
        const index = typeCards.indexOf(card.id);
        if (index !== -1) {
          typeCards.splice(index, 1);
        }
        if (typeCards.length === 0) {
          this.indexByType.delete(card.type);
        }
      }

      // 移除 due 索引
      const dueIndex = this.indexByDue.findIndex(c => c.id === card.id);
      if (dueIndex !== -1) {
        this.indexByDue.splice(dueIndex, 1);
      }

      // 移除 priority 索引
      const priorityCards = this.indexByPriority.get(card.priority);
      if (priorityCards) {
        const index = priorityCards.indexOf(card.id);
        if (index !== -1) {
          priorityCards.splice(index, 1);
        }
        if (priorityCards.length === 0) {
          this.indexByPriority.delete(card.priority);
        }
      }
    }
  }

  /**
   * 获取存储数据（用于持久化）
   */
  getStoreData(): UnifiedCardStore {
    const xiuyuans: Record<string, IXiuyuan> = {};
    for (const [id, xiuyuan] of this.xiuyuans.entries()) {
      xiuyuans[id] = xiuyuan;
    }

    const cards: Record<string, FSRSCard> = {};
    for (const [id, card] of this.cards.entries()) {
      cards[id] = card;
    }

    return {
      version: 1,
      xiuyuans,
      cards,
    };
  }

  // === CRUD 操作 ===

  /**
   * 创建卡片
   * @param xiuyuan XiuYuan 实体
   * @param card FSRSCard 实体
   */
  async createCard(xiuyuan: IXiuyuan, card: FSRSCard): Promise<Result<void>> {
    try {
      // 保存 XiuYuan（如果不存在）
      if (!this.xiuyuans.has(xiuyuan.id)) {
        this.xiuyuans.set(xiuyuan.id, xiuyuan);
      }

      // 保存 Card
      this.cards.set(card.id, card);

      // 更新索引
      this.updateIndexesForCard(card, 'add');

      // 重新排序 due 索引以保持一致性
      this.indexByDue.sort((a, b) => a.due - b.due);

      // 调度保存
      this.scheduleSave();

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 批量创建卡片
   * @param xiuyuan XiuYuan 实体
   * @param cards FSRSCard 实体数组
   */
  /**
     * 批量创建卡片（原子性操作）
     * @param xiuyuan XiuYuan 实体
     * @param cards 卡片数组
     * @returns 成功或失败结果
     * 
     * 特性：
     * - 原子性：要么全部成功，要么全部失败
     * - 失败回滚：如果任何操作失败，回滚所有更改
     * - 性能优化：一次性更新索引，一次保存
     */
    async batchCreateCards(xiuyuan: IXiuyuan, cards: FSRSCard[]): Promise<Result<void>> {
      // 验证输入
      if (!xiuyuan || !xiuyuan.id) {
        return err(new Error('Invalid xiuyuan: missing id'));
      }
      if (!cards || cards.length === 0) {
        return err(new Error('Invalid cards: empty array'));
      }

      // 验证所有卡片
      for (const card of cards) {
        if (!card.id) {
          return err(new Error('Invalid card: missing id'));
        }
        if (card.xiuyuanID !== xiuyuan.id) {
          return err(new Error(`Card ${card.id} xiuyuanID mismatch: expected ${xiuyuan.id}, got ${card.xiuyuanID}`));
        }
        if (this.cards.has(card.id)) {
          return err(new Error(`Card ${card.id} already exists`));
        }
      }

      // 保存原始状态用于回滚
      const xiuyuanExisted = this.xiuyuans.has(xiuyuan.id);
      const originalXiuyuan = xiuyuanExisted ? this.xiuyuans.get(xiuyuan.id) : undefined;

      // 保存原始索引状态（用于回滚）
      const originalIndexByBlockID = new Map(this.indexByBlockID);
      const originalIndexByXiuyuanID = new Map(this.indexByXiuyuanID);
      const originalIndexByType = new Map(this.indexByType);
      const originalIndexByPriority = new Map(this.indexByPriority);
      const originalIndexByDue = [...this.indexByDue];

      try {
        // 1. 保存 XiuYuan（如果不存在）
        if (!xiuyuanExisted) {
          this.xiuyuans.set(xiuyuan.id, xiuyuan);
        }

        // 2. 批量保存 Cards（不更新索引）
        for (const card of cards) {
          this.cards.set(card.id, card);
        }

        // 3. 一次性更新所有索引
        for (const card of cards) {
          this.updateIndexesForCard(card, 'add');
        }

        // 4. 重新排序 due 索引（只排序一次）
        this.indexByDue.sort((a, b) => a.due - b.due);

        // 5. 调度保存（只保存一次）
        this.scheduleSave();

        return ok(undefined);
      } catch (error) {
        // 回滚所有更改

        // 回滚 XiuYuan
        if (!xiuyuanExisted) {
          this.xiuyuans.delete(xiuyuan.id);
        } else if (originalXiuyuan) {
          this.xiuyuans.set(xiuyuan.id, originalXiuyuan);
        }

        // 回滚 Cards
        for (const card of cards) {
          this.cards.delete(card.id);
        }

        // 回滚索引
        this.indexByBlockID = originalIndexByBlockID;
        this.indexByXiuyuanID = originalIndexByXiuyuanID;
        this.indexByType = originalIndexByType;
        this.indexByPriority = originalIndexByPriority;
        this.indexByDue = originalIndexByDue;

        return err(error instanceof Error ? error : new Error(String(error)));
      }
    }


  /**
   * 获取卡片
   * @param cardId 卡片 ID
   */
  getCard(cardId: string): FSRSCard | undefined {
    return this.cards.get(cardId);
  }

  /**
   * 更新卡片
   * @param card 更新后的卡片
   */
  async updateCard(card: FSRSCard): Promise<Result<void>> {
    try {
      const oldCard = this.cards.get(card.id);
      if (!oldCard) {
        return err(new Error(`Card not found: ${card.id}`));
      }

      // 移除旧索引
      this.updateIndexesForCard(oldCard, 'remove');

      // 更新卡片
      this.cards.set(card.id, card);

      // 添加新索引
      this.updateIndexesForCard(card, 'add');

      // 重新排序 due 索引
      this.indexByDue.sort((a, b) => a.due - b.due);

      // 调度保存
      this.scheduleSave();

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 删除卡片
   * @param cardId 卡片 ID
   */
  async deleteCard(cardId: string): Promise<Result<void>> {
    try {
      const card = this.cards.get(cardId);
      if (!card) {
        return err(new Error(`Card not found: ${cardId}`));
      }

      // 移除索引
      this.updateIndexesForCard(card, 'remove');

      // 删除卡片
      this.cards.delete(cardId);

      // 检查是否需要删除 XiuYuan
      const xiuyuanID = card.meta?.xiuyuanID;
      if (xiuyuanID) {
        const xiuyuanCards = this.indexByXiuyuanID.get(xiuyuanID);
        if (!xiuyuanCards || xiuyuanCards.length === 0) {
          // 没有其他卡片引用此 XiuYuan，删除它
          this.xiuyuans.delete(xiuyuanID);
        }
      }

      // 调度保存
      this.scheduleSave();

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 删除 XiuYuan（级联删除所有关联卡片）
   * @param xiuyuanId XiuYuan ID
   */
  async deleteXiuYuan(xiuyuanId: string): Promise<Result<void>> {
    try {
      const xiuyuan = this.xiuyuans.get(xiuyuanId);
      if (!xiuyuan) {
        return err(new Error(`XiuYuan not found: ${xiuyuanId}`));
      }

      // 获取所有关联卡片
      const cardIds = this.indexByXiuyuanID.get(xiuyuanId) || [];

      // 删除所有关联卡片
      for (const cardId of [...cardIds]) {
        const card = this.cards.get(cardId);
        if (card) {
          this.updateIndexesForCard(card, 'remove');
          this.cards.delete(cardId);
        }
      }

      // 删除 XiuYuan
      this.xiuyuans.delete(xiuyuanId);

      // 调度保存
      this.scheduleSave();

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // === 查询方法 ===

  /**
   * 获取到期卡片
   * @param limit 限制数量
   */
  getDueCards(limit: number): FSRSCard[] {
    const now = Date.now();
    const dueCards: FSRSCard[] = [];

    for (const card of this.indexByDue) {
      if (card.due <= now && card.state !== 4) {
        dueCards.push(card);
        if (dueCards.length >= limit) {
          break;
        }
      }
    }

    return dueCards;
  }

  /**
   * 根据块 ID 获取卡片
   * @param blockId 块 ID
   */
  getCardsByBlockId(blockId: string): FSRSCard[] {
    const cardIds = this.indexByBlockID.get(blockId) || [];
    return cardIds.map(id => this.cards.get(id)).filter((c): c is FSRSCard => c !== undefined);
  }

  /**
   * 根据 XiuYuan ID 获取卡片
   * @param xiuyuanId XiuYuan ID
   */
  getCardsByXiuyuanId(xiuyuanId: string): FSRSCard[] {
    const cardIds = this.indexByXiuyuanID.get(xiuyuanId) || [];
    return cardIds.map(id => this.cards.get(id)).filter((c): c is FSRSCard => c !== undefined);
  }

  /**
   * 根据类型获取卡片
   * @param type 卡片类型
   */
  getCardsByType(type: CardType): FSRSCard[] {
    const cardIds = this.indexByType.get(type) || [];
    return cardIds.map(id => this.cards.get(id)).filter((c): c is FSRSCard => c !== undefined);
  }

  /**
   * 获取所有卡片
   */
  getAllCards(): FSRSCard[] {
    return Array.from(this.cards.values());
  }

  /**
   * 获取 XiuYuan
   * @param xiuyuanId XiuYuan ID
   */
  getXiuYuan(xiuyuanId: string): IXiuyuan | undefined {
    return this.xiuyuans.get(xiuyuanId);
  }

  /**
   * 获取所有 XiuYuans
   */
  getAllXiuYuans(): IXiuyuan[] {
    return Array.from(this.xiuyuans.values());
  }

  // === 数据一致性 ===

  /**
   * 验证数据一致性
   * @returns 问题列表
   */
  async validateConsistency(): Promise<string[]> {
    const issues: string[] = [];

    // 检查孤儿卡片（没有 xiuyuanID 或 xiuyuanID 无效）
    for (const card of this.cards.values()) {
      const xiuyuanID = card.meta?.xiuyuanID;
      if (!xiuyuanID) {
        issues.push(`Card ${card.id} has no xiuyuanID`);
      } else if (!this.xiuyuans.has(xiuyuanID)) {
        issues.push(`Card ${card.id} references non-existent XiuYuan ${xiuyuanID}`);
      }
    }

    // 检查空 XiuYuan（没有关联卡片）
    for (const xiuyuan of this.xiuyuans.values()) {
      const cardIds = this.indexByXiuyuanID.get(xiuyuan.id);
      if (!cardIds || cardIds.length === 0) {
        issues.push(`XiuYuan ${xiuyuan.id} has no associated cards`);
      }
    }

    return issues;
  }

  /**
   * 自动修复数据一致性问题
   * @returns 修复的问题数量
   */
  async autoFix(): Promise<number> {
    let fixedCount = 0;

    // 删除孤儿卡片
    const orphanCards: string[] = [];
    for (const card of this.cards.values()) {
      const xiuyuanID = card.meta?.xiuyuanID;
      if (!xiuyuanID || !this.xiuyuans.has(xiuyuanID)) {
        orphanCards.push(card.id);
      }
    }

    for (const cardId of orphanCards) {
      const card = this.cards.get(cardId);
      if (card) {
        this.updateIndexesForCard(card, 'remove');
        this.cards.delete(cardId);
        fixedCount++;
      }
    }

    // 删除空 XiuYuan
    const emptyXiuYuans: string[] = [];
    for (const xiuyuan of this.xiuyuans.values()) {
      const cardIds = this.indexByXiuyuanID.get(xiuyuan.id);
      if (!cardIds || cardIds.length === 0) {
        emptyXiuYuans.push(xiuyuan.id);
      }
    }

    for (const xiuyuanId of emptyXiuYuans) {
      this.xiuyuans.delete(xiuyuanId);
      fixedCount++;
    }

    if (fixedCount > 0) {
      this.scheduleSave();
    }

    return fixedCount;
  }

  /**
   * 获取统计信息
   */
  getStats(): StorageStats {
    const stats: StorageStats = {
      totalCards: this.cards.size,
      totalXiuYuans: this.xiuyuans.size,
      cardsByType: {} as Record<CardType, number>,
      dueCards: 0,
      newCards: 0,
      learningCards: 0,
      reviewCards: 0,
    };

    const now = Date.now();

    for (const card of this.cards.values()) {
      // 按类型统计
      stats.cardsByType[card.type] = (stats.cardsByType[card.type] || 0) + 1;

      // 按状态统计
      if (card.state === 0) {
        stats.newCards++;
      } else if (card.state === 1 || card.state === 3) {
        stats.learningCards++;
      } else if (card.state === 2) {
        stats.reviewCards++;
      }

      // 到期卡片统计
      if (card.due <= now && card.state !== 4) {
        stats.dueCards++;
      }
    }

    return stats;
  }
}

/**
 * Xiuyuan Service
 * 负责 Xiuyuan 的业务逻辑：创建、更新、删除
 * 核心职责：协调 Xiuyuan 与 FSRSCard、Riff 的关系
 */

import type { IXiuyuan, ICardMapping, ICardTemplate, IXiuyuanField } from './types';
import { XiuyuanStorage } from './storage';
import type { StorageManager } from '@/core/storage/manager';
import { markBlockAsCard } from '@/core/siyuan/block';
import * as riffAPI from '@/core/siyuan/riff';
import type { FSRSCard } from '@/types';
import { CardState, CardType } from '@/types';

/**
 * Xiuyuan 服务
 */
export class XiuyuanService {
  private storage: XiuyuanStorage;
  private storageManager: StorageManager;

  constructor(storage: XiuyuanStorage, storageManager: StorageManager) {
    this.storage = storage;
    this.storageManager = storageManager;
  }

  // ============ 初始化 ============

  async init(): Promise<void> {
    await this.storage.load();
    console.log('[Xiuyuan] Initialized:', this.storage.getStats());
  }

  async save(): Promise<void> {
    await this.storage.save();
  }

  // ============ 模板操作 ============

  getTemplate(id: string): ICardTemplate | undefined {
    return this.storage.getTemplate(id);
  }

  getAllTemplates(): ICardTemplate[] {
    return this.storage.getAllTemplates();
  }

  createTemplate(template: ICardTemplate): void {
    this.storage.createTemplate(template);
  }

  // ============ 核心业务：从块创建 Xiuyuan ============

  /**
   * 从选中的块创建 Xiuyuan 和卡片
   *
   * 实现策略：
   * - 基础问答模板：第一个块作为闪卡（包含问题+答案的关系）
   * - 思源 Riff 系统：一个块只能对应一张闪卡
   * - 所以只生成 1 张卡片，使用第一个块的 ID
   */
  async createFromBlocks(
    blockIDs: string[],
    templateID: string,
    fieldMapping: Record<string, string>,
    deckID: string = riffAPI.BUILTIN_DECK_ID
  ): Promise<{ xiuyuan: IXiuyuan; cards: ICardMapping[] }> {
    const template = this.storage.getTemplate(templateID);
    if (!template) {
      throw new Error(`Template not found: ${templateID}`);
    }

    // 1. 构建字段
    const fields: IXiuyuanField[] = template.fields.map(f => ({
      name: f.name,
      blockID: fieldMapping[f.name] || '',
      marker: f.name,
    }));

    // 2. 创建 Xiuyuan
    const xiuyuan = this.storage.createXiuyuan({
      blockIDs,
      fields,
      templateID,
    });

    // 3. 创建卡片（只用第一个块，因为思源一个块只能对应一张卡片）
    const cards: ICardMapping[] = [];
    const now = Date.now();
    const mainBlockID = blockIDs[0];
    const rule = template.cardRules[0]; // 只使用第一个规则

    if (!rule) {
      throw new Error('Template has no card rules');
    }

    // 创建 mapping
    const mapping: ICardMapping = {
      xiuyuanID: xiuyuan.id,
      cardID: mainBlockID,
      frontFields: rule.frontFields,
      backFields: rule.backFields,
      typeMarker: rule.typeMarker,
    };
    this.storage.createMapping(mapping);
    cards.push(mapping);

    // 4. 调用 Riff API 创建闪卡（思源原生）
    try {
      await riffAPI.addRiffCards(deckID, [mainBlockID]);
    } catch (err) {
      console.warn('[Xiuyuan] Riff API addRiffCards failed:', err);
    }

    // 5. 创建 FSRSCard 存入 StorageManager（让卡片浏览器可见）
    // 在 meta 中存储答案块 ID，供复习界面渲染使用
    const answerBlockID = blockIDs.length > 1 ? blockIDs[1] : undefined;
    const fsrsCard: FSRSCard = {
      id: mainBlockID,
      blockId: mainBlockID,
      due: now,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      state: CardState.New,
      lastReview: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      priority: 50,
      type: CardType.Item,
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: now,
      updatedAt: now,
      meta: answerBlockID ? {
        xiuyuanID: xiuyuan.id,
        answerBlockID,
        templateID,
      } : undefined,
    };
    this.storageManager.setCard(fsrsCard);

    // 6. 标记块属性
    try {
      await markBlockAsCard(mainBlockID, mainBlockID, fsrsCard.priority);
    } catch (err) {
      console.warn('[Xiuyuan] markBlockAsCard failed:', err);
    }

    // 7. 持久化
    await this.save();
    await this.storageManager.saveCards();

    console.log('[Xiuyuan] Created:', { xiuyuan, cards });
    return { xiuyuan, cards };
  }

  // ============ 查询 ============

  getXiuyuan(id: string): IXiuyuan | undefined {
    return this.storage.getXiuyuan(id);
  }

  getXiuyuansByBlockID(blockID: string): IXiuyuan[] {
    return this.storage.getXiuyuansByBlockID(blockID);
  }

  getMappingByCardID(cardID: string): ICardMapping | undefined {
    return this.storage.getMappingByCardID(cardID);
  }

  getMappingsByXiuyuanID(xiuyuanID: string): ICardMapping[] {
    return this.storage.getMappingsByXiuyuanID(xiuyuanID);
  }

  getAllXiuyuans(): IXiuyuan[] {
    return this.storage.getAllXiuyuans();
  }

  // ============ 删除 ============

  async deleteXiuyuan(id: string): Promise<boolean> {
    const xiuyuan = this.storage.getXiuyuan(id);
    if (!xiuyuan) return false;

    // 删除关联的 FSRSCard
    const mappings = this.storage.getMappingsByXiuyuanID(id);
    for (const mapping of mappings) {
      this.storageManager.removeCard(mapping.cardID);
    }

    const result = this.storage.deleteXiuyuan(id);
    if (result) {
      await this.save();
      await this.storageManager.saveCards();
    }
    return result;
  }

  // ============ 统计 ============

  getStats() {
    return this.storage.getStats();
  }
}

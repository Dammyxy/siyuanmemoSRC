﻿/**
 * Xiuyuan Service
 * 
 * @module XiuyuanService
 * @description
 * Xiuyuan 服务层，负责业务逻辑的协调和执行。
 * 
 * **核心职责**：
 * 1. 协调 Xiuyuan 与 FSRSCard 的关系
 * 2. 管理 Xiuyuan 的生命周期（创建、查询、删除）
 * 3. 与思源 Riff API 交互
 * 4. 与 StorageManager 同步卡片数据
 * 
 * **架构决策**：
 * @see ADR-004: Xiuyuan 卡片来源抽象层 - 设计决策和架构说明
 * @see ../../../docs/adr/ADR-004-xiuyuan-card-source.md
 * 
 * **Xiuyuan 与 FSRSCard 的关系**：
 * ```
 * Xiuyuan (卡片来源)
 *    ↓ 生成
 * CardMapping (映射关系)
 *    ↓ 关联
 * FSRSCard (复习卡片)
 * ```
 * 
 * - **Xiuyuan**: 存储字段映射和模板信息（类似 Anki 的 Note）
 * - **CardMapping**: 定义 Xiuyuan 到 Card 的映射关系（正面/反面字段）
 * - **FSRSCard**: 实际的复习卡片，存储调度信息（due, stability 等）
 * 
 * **数据流**：
 * 1. 创建：Xiuyuan → 生成 CardMapping → 创建 FSRSCard
 * 2. 复习：FSRSCard → 查询 CardMapping → 获取 Xiuyuan → 渲染字段
 * 3. 删除：删除 Xiuyuan → 删除所有关联的 FSRSCard
 * 
 * @example
 * ```typescript
 * const service = new XiuyuanService(storage, storageManager);
 * await service.init();
 * 
 * // 创建 Xiuyuan 和卡片
 * const result = await service.createFromBlocks(
 *   ['block-1', 'block-2'],
 *   'basic',
 *   { question: 'block-1', answer: 'block-2' }
 * );
 * console.log('Created:', result.xiuyuan.id);
 * 
 * // 查询
 * const xiuyuan = service.getXiuyuan(result.xiuyuan.id);
 * const mapping = service.getMappingByCardID('block-1');
 * 
 * // 删除
 * await service.deleteXiuyuan(result.xiuyuan.id);
 * ```
 */

import type { IXiuyuan, ICardMapping, ICardTemplate, IXiuyuanField } from './types';
import { XiuyuanStorage } from './storage';
import type { StorageManager } from '@/core/storage/manager';
import { markBlockAsCard } from '@/core/siyuan/block';
import * as riffAPI from '@/core/siyuan/riff';
import type { FSRSCard } from '@/types';
import { CardState, CardType } from '@/types';
import { ok, err, type Result } from '@/types/result';
import { 
  generateXiuyuanCardID, 
  calculateRenderBlockIDs,
  type XiuyuanCardMeta 
} from './cardMeta';

/**
 * Xiuyuan 服务
 * 
 * @class XiuyuanService
 * @description
 * 提供 Xiuyuan 的高级业务操作，封装复杂的业务逻辑。
 */
export class XiuyuanService {
  /** Xiuyuan 存储管理器 */
  private storage: XiuyuanStorage;
  
  /** 卡片存储管理器 */
  private storageManager: StorageManager;

  /**
   * 创建 XiuyuanService 实例
   * 
   * @param storage - Xiuyuan 存储管理器
   * @param storageManager - 卡片存储管理器
   * 
   * @example
   * ```typescript
   * const storage = new XiuyuanStorage('siyuan-plugin-fsrs');
   * const service = new XiuyuanService(storage, storageManager);
   * ```
   */
  constructor(storage: XiuyuanStorage, storageManager: StorageManager) {
    this.storage = storage;
    this.storageManager = storageManager;
  }

  // ============ 初始化 ============

  /**
   * 初始化服务
   * 
   * @description
   * 加载 Xiuyuan 数据并打印统计信息。
   * 应在插件启动时调用。
   * 
   * @returns Result<void>，成功时返回 ok(undefined)，失败时返回 err(Error)
   * 
   * @example
   * ```typescript
   * const result = await service.init();
   * if (result.ok) {
   *   console.log('Xiuyuan service ready');
   * } else {
   *   console.error('Init failed:', result.error.message);
   * }
   * ```
   * 
   * **Validates: Requirements 8.1, 8.2, 8.3**
   * - 8.1: Uses Result type pattern for operations that can fail
   * - 8.2: Returns { ok: true, value: T } on success
   * - 8.3: Returns { ok: false, error: Error } on failure
   */
  async init(): Promise<Result<void>> {
    const loadResult = await this.storage.load();
    if (!loadResult.ok) {
      return loadResult;
    }
    console.log('[Xiuyuan] Initialized:', this.storage.getStats());
    return ok(undefined);
  }

  /**
   * 保存 Xiuyuan 数据
   * 
   * @description
   * 将 Xiuyuan 数据持久化到文件系统。
   * 
   * @returns Result<void>，成功时返回 ok(undefined)，失败时返回 err(Error)
   * 
   * @example
   * ```typescript
   * const result = await service.save();
   * if (!result.ok) {
   *   console.error('Save failed:', result.error.message);
   * }
   * ```
   * 
   * **Validates: Requirements 8.1, 8.2, 8.3**
   * - 8.1: Uses Result type pattern for operations that can fail
   * - 8.2: Returns { ok: true, value: T } on success
   * - 8.3: Returns { ok: false, error: Error } on failure
   */
  async save(): Promise<Result<void>> {
    return await this.storage.save();
  }

  // ============ 模板操作 ============

  /**
   * 获取卡片模板
   * 
   * @param id - 模板 ID
   * @returns CardTemplate 对象，如果不存在返回 undefined
   * 
   * @example
   * ```typescript
   * const template = service.getTemplate('basic');
   * if (template) {
   *   console.log('Fields:', template.fields);
   * }
   * ```
   */
  getTemplate(id: string): ICardTemplate | undefined {
    return this.storage.getTemplate(id);
  }

  /**
   * 获取所有卡片模板
   * 
   * @returns CardTemplate 数组
   * 
   * @example
   * ```typescript
   * const templates = service.getAllTemplates();
   * templates.forEach(t => console.log(t.name));
   * ```
   */
  getAllTemplates(): ICardTemplate[] {
    return this.storage.getAllTemplates();
  }

  /**
   * 创建卡片模板
   * 
   * @param template - CardTemplate 数据
   * 
   * @example
   * ```typescript
   * service.createTemplate({
   *   id: 'vocabulary',
   *   name: '词汇卡片',
   *   fields: [
   *     { name: 'word', description: '单词' },
   *     { name: 'translation', description: '翻译' }
   *   ],
   *   cardRules: [
   *     { typeMarker: 'en-zh', frontFields: ['word'], backFields: ['translation'] }
   *   ]
   * });
   * ```
   */
  createTemplate(template: ICardTemplate): void {
    this.storage.createTemplate(template);
  }

  // ============ 核心业务：从块创建 Xiuyuan ============

  /**
   * 从选中的块创建 Xiuyuan 和卡片
   * 
   * @param blockIDs - 源块 ID 列表（第一个块作为问题，第二个块作为答案）
   * @param templateID - 模板 ID
   * @param fieldMapping - 字段映射（字段名 -> 块 ID）
   * @param deckID - 卡包 ID，默认为内置卡包
   * @returns Result，成功时包含创建的 Xiuyuan 和 CardMapping 数组，失败时包含错误信息
   * 
   * @description
   * **实现策略**：
   * - 基础问答模板：第一个块作为闪卡（包含问题+答案的关系）
   * - 思源 Riff 系统：一个块只能对应一张闪卡
   * - 所以只生成 1 张卡片，使用第一个块的 ID
   * 
   * **执行步骤**：
   * 1. 验证模板存在
   * 2. 构建字段映射
   * 3. 创建 Xiuyuan
   * 4. 创建 CardMapping
   * 5. 调用思源 Riff API 创建闪卡
   * 6. 创建 FSRSCard 并存入 StorageManager
   * 7. 标记块属性
   * 8. 持久化数据
   * 
   * **错误处理**：
   * - 如果模板不存在，返回错误
   * - 如果模板没有卡片规则，返回错误
   * - Riff API 失败会记录警告但不影响整体流程
   * - 标记块属性失败会记录警告但不影响整体流程
   * 
   * **最佳实践**：
   * - 确保 blockIDs 至少包含一个块
   * - 如果有两个块，第二个块会作为答案块存储在 FSRSCard.meta.answerBlockID
   * - 创建后记得调用 save() 持久化数据
   * 
   * @example
   * ```typescript
   * // 创建基础问答卡片
   * const result = await service.createFromBlocks(
   *   ['20230101120000-question', '20230101120001-answer'],
   *   'basic',
   *   {
   *     question: '20230101120000-question',
   *     answer: '20230101120001-answer'
   *   },
   *   'default-deck'
   * );
   * 
   * if (result.ok) {
   *   console.log('Created Xiuyuan:', result.value.xiuyuan.id);
   *   console.log('Created cards:', result.value.cards.length);
   *   
   *   // 查询创建的卡片
   *   const fsrsCard = storageManager.getCard(result.value.cards[0].cardID);
   *   console.log('Answer block:', fsrsCard?.meta?.answerBlockID);
   * } else {
   *   console.error('Failed to create:', result.error.message);
   * }
   * ```
   * 
   * **Validates: Requirements 8.1, 8.2, 8.3**
   * - 8.1: Uses Result type pattern for operations that can fail
   * - 8.2: Returns { ok: true, value: T } on success
   * - 8.3: Returns { ok: false, error: Error } on failure
   */
  /**
     * 从选中的块创建 Xiuyuan 和卡片
     * 
     * @param blockIDs - 源块 ID 列表
     * @param templateID - 模板 ID
     * @param fieldMapping - 字段映射（字段名 → 块 ID）
     * @param deckID - 卡包 ID，默认为内置卡包
     * @returns Result，成功时包含创建的 Xiuyuan 和 CardMapping 数组，失败时包含错误信息
     * 
     * @description
     * **新实现（Phase 1）**：
     * - 根据 template.cardRules 创建多张 FSRSCard
     * - 每张卡片有独立的 ID（不依赖块 ID）
     * - 在 meta 中存储字段映射和渲染信息
     * 
     * **执行步骤**：
     * 1. 验证模板存在
     * 2. 构建字段映射
     * 3. 创建 Xiuyuan
     * 4. 为每个 cardRule 创建一张 FSRSCard
     * 5. 持久化数据
     * 
     * @example
     * ```typescript
     * // 创建列表模版卡（1个 Xiuyuan → 3张 FSRSCard）
     * const result = await service.createFromBlocks(
     *   ['parent-id', 'child1-id', 'child2-id', 'child3-id'],
     *   'builtin-list-item',
     *   {
     *     question: 'parent-id',
     *     answer: 'child1-id'  // 第一张卡片的答案
     *   }
     * );
     * ```
     */
    async createFromBlocks(
      blockIDs: string[],
      templateID: string,
      fieldMapping: Record<string, string>,
      deckID: string = riffAPI.BUILTIN_DECK_ID
    ): Promise<Result<{ xiuyuan: IXiuyuan; cards: ICardMapping[] }>> {
      try {
        const template = this.storage.getTemplate(templateID);
        if (!template) {
          return err(new Error(`Template not found: ${templateID}`));
        }

        if (!template.cardRules || template.cardRules.length === 0) {
          return err(new Error('Template has no card rules'));
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

        console.log('[Xiuyuan] Created Xiuyuan:', xiuyuan.id);

        // 3. 为每个 cardRule 创建 FSRSCard
        const cards: ICardMapping[] = [];
        const now = Date.now();

        for (let ruleIndex = 0; ruleIndex < template.cardRules.length; ruleIndex++) {
          const rule = template.cardRules[ruleIndex];

          // 生成独立的卡片 ID
          const cardID = generateXiuyuanCardID(xiuyuan.id, ruleIndex);

          // 计算渲染信息
          const { frontBlockIDs, backBlockIDs } = calculateRenderBlockIDs(
            rule.frontFields,
            rule.backFields,
            fieldMapping
          );

          // 确定主块 ID（用于卡片浏览器显示）
          // 优先使用背面的第一个块，如果没有则使用正面的第一个块
          const mainBlockID = backBlockIDs[0] || frontBlockIDs[0] || blockIDs[0];

          console.log('[Xiuyuan] Creating card:', {
            cardID,
            ruleIndex,
            typeMarker: rule.typeMarker,
            frontFields: rule.frontFields,
            backFields: rule.backFields,
            frontBlockIDs,
            backBlockIDs,
            mainBlockID,
          });

          // 创建 CardMapping
          const mapping: ICardMapping = {
            xiuyuanID: xiuyuan.id,
            cardID,
            frontFields: rule.frontFields,
            backFields: rule.backFields,
            typeMarker: rule.typeMarker,
          };
          this.storage.createMapping(mapping);
          cards.push(mapping);

          // 创建 FSRSCard
          const meta: XiuyuanCardMeta = {
            xiuyuanID: xiuyuan.id,
            templateID,
            ruleIndex,
            frontFields: rule.frontFields,
            backFields: rule.backFields,
            fieldMapping,
            frontBlockIDs,
            backBlockIDs,
          };

          const fsrsCard: FSRSCard = {
            id: cardID,
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
            meta,
          };

          this.storageManager.setCard(fsrsCard);
          console.log('[Xiuyuan] Created FSRSCard:', cardID);
        }

        // 4. 持久化
        const saveResult = await this.save();
        if (!saveResult.ok) {
          console.warn('[Xiuyuan] Save failed:', saveResult.error);
        }
        await this.storageManager.saveCards();

        console.log('[Xiuyuan] Created:', { 
          xiuyuanID: xiuyuan.id, 
          cardCount: cards.length 
        });

        return ok({ xiuyuan, cards });
      } catch (error) {
        console.error('[Xiuyuan] createFromBlocks failed:', error);
        return err(error as Error);
      }
    }


  // ============ 查询 ============

  /**
   * 根据 ID 获取 Xiuyuan
   * 
   * @param id - Xiuyuan ID
   * @returns Xiuyuan 对象，如果不存在返回 undefined
   * 
   * @example
   * ```typescript
   * const xiuyuan = service.getXiuyuan('xy_123');
   * if (xiuyuan) {
   *   console.log('Template:', xiuyuan.templateID);
   *   console.log('Fields:', xiuyuan.fields);
   * }
   * ```
   */
  getXiuyuan(id: string): IXiuyuan | undefined {
    return this.storage.getXiuyuan(id);
  }

  /**
   * 根据块 ID 查询关联的所有 Xiuyuan
   * 
   * @param blockID - 块 ID
   * @returns Xiuyuan 数组
   * 
   * @description
   * 一个块可能属于多个 Xiuyuan（例如共享的答案块）。
   * 
   * @example
   * ```typescript
   * const xiuyuans = service.getXiuyuansByBlockID('20230101120000-abc123');
   * xiuyuans.forEach(x => {
   *   console.log('Xiuyuan:', x.id);
   *   console.log('Template:', x.templateID);
   * });
   * ```
   */
  getXiuyuansByBlockID(blockID: string): IXiuyuan[] {
    return this.storage.getXiuyuansByBlockID(blockID);
  }

  /**
   * 根据卡片 ID 获取 CardMapping
   * 
   * @param cardID - 卡片 ID（思源 Riff 卡片 ID）
   * @returns CardMapping 对象，如果不存在返回 undefined
   * 
   * @description
   * 用于在复习界面根据卡片 ID 获取渲染数据。
   * 
   * @example
   * ```typescript
   * // 在复习界面
   * const mapping = service.getMappingByCardID(currentCard.id);
   * if (mapping) {
   *   const xiuyuan = service.getXiuyuan(mapping.xiuyuanID);
   *   // 渲染多字段卡片
   *   renderMultiFieldCard(xiuyuan, mapping);
   * }
   * ```
   */
  getMappingByCardID(cardID: string): ICardMapping | undefined {
    return this.storage.getMappingByCardID(cardID);
  }

  /**
   * 根据 Xiuyuan ID 获取所有关联的 CardMapping
   * 
   * @param xiuyuanID - Xiuyuan ID
   * @returns CardMapping 数组
   * 
   * @description
   * 一个 Xiuyuan 可以生成多张卡片（如英-中、中-英）。
   * 
   * @example
   * ```typescript
   * const mappings = service.getMappingsByXiuyuanID('xy_123');
   * console.log(`Generated ${mappings.length} cards`);
   * mappings.forEach(m => {
   *   console.log('Type:', m.typeMarker);
   *   console.log('Front:', m.frontFields);
   *   console.log('Back:', m.backFields);
   * });
   * ```
   */
  getMappingsByXiuyuanID(xiuyuanID: string): ICardMapping[] {
    return this.storage.getMappingsByXiuyuanID(xiuyuanID);
  }

  /**
   * 获取所有 Xiuyuan
   * 
   * @returns Xiuyuan 数组
   * 
   * @example
   * ```typescript
   * const all = service.getAllXiuyuans();
   * console.log(`Total Xiuyuans: ${all.length}`);
   * ```
   */
  getAllXiuyuans(): IXiuyuan[] {
    return this.storage.getAllXiuyuans();
  }

  // ============ 删除 ============

  /**
   * 删除 Xiuyuan 及其所有关联卡片
   * 
   * @param id - Xiuyuan ID
   * @returns Result<boolean>，成功时返回 true（删除成功）或 false（ID 不存在），失败时返回错误信息
   * 
   * @description
   * 删除 Xiuyuan 时会：
   * 1. 删除所有关联的 CardMapping
   * 2. 从 StorageManager 中删除关联的 FSRSCard
   * 3. 持久化数据
   * 
   * **注意**：不会删除思源 Riff 卡片，需要用户手动删除或通过其他方式清理。
   * 
   * **错误处理**：
   * - 如果 Xiuyuan 不存在，返回 ok(false)
   * - 如果删除过程中发生错误，返回 err(Error)
   * 
   * @example
   * ```typescript
   * const result = await service.deleteXiuyuan('xy_123');
   * if (result.ok) {
   *   if (result.value) {
   *     console.log('Xiuyuan and all related cards deleted');
   *   } else {
   *     console.log('Xiuyuan not found');
   *   }
   * } else {
   *   console.error('Delete failed:', result.error.message);
   * }
   * ```
   * 
   * **Validates: Requirements 8.1, 8.2, 8.3**
   * - 8.1: Uses Result type pattern for operations that can fail
   * - 8.2: Returns { ok: true, value: T } on success
   * - 8.3: Returns { ok: false, error: Error } on failure
   */
  async deleteXiuyuan(id: string): Promise<Result<boolean>> {
    try {
      const xiuyuan = this.storage.getXiuyuan(id);
      if (!xiuyuan) {
        return ok(false);
      }

      // 删除关联的 FSRSCard
      const mappings = this.storage.getMappingsByXiuyuanID(id);
      for (const mapping of mappings) {
        this.storageManager.removeCard(mapping.cardID);
      }

      const result = this.storage.deleteXiuyuan(id);
      if (result) {
        const saveResult = await this.save();
        if (!saveResult.ok) {
          console.warn('[Xiuyuan] Save failed after delete:', saveResult.error);
          // Continue anyway - data is deleted in memory
        }
        await this.storageManager.saveCards();
      }
      return ok(result);
    } catch (error) {
      console.error('[Xiuyuan] deleteXiuyuan failed:', error);
      return err(error as Error);
    }
  }

  // ============ 统计 ============

  /**
   * 获取 Xiuyuan 统计信息
   * 
   * @returns 包含 Xiuyuan、Mapping 和 Template 数量的统计对象
   * 
   * @example
   * ```typescript
   * const stats = service.getStats();
   * console.log(`Xiuyuans: ${stats.xiuyuanCount}`);
   * console.log(`Mappings: ${stats.mappingCount}`);
   * console.log(`Templates: ${stats.templateCount}`);
   * ```
   */
  getStats() {
    return this.storage.getStats();
  }
}

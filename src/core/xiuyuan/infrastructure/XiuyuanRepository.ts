/**
 * XiuyuanRepository - 修缘仓储实现
 * 
 * @description
 * 实现 IXiuyuanRepository 接口，协调 msgpack、块属性、Riff 三个数据源。
 * 
 * **职责**：
 * - 领域模型与持久化模型的转换
 * - 协调多个数据源（msgpack, block attributes, Riff）
 * - 发布领域事件
 * - 统一错误处理
 * 
 * **数据源协调**：
 * ```
 * save(xiuyuan)
 *   ├─> msgpack: 保存 Xiuyuan 数据
 *   ├─> block attributes: 写入块属性
 *   ├─> Riff: 同步卡片
 *   └─> events: 发布领域事件
 * 
 * delete(xiuyuan)
 *   ├─> msgpack: 删除 Xiuyuan 数据
 *   ├─> block attributes: 清除块属性
 *   ├─> Riff: 删除卡片
 *   └─> events: 发布领域事件
 * ```
 */

import { Result, ok, err } from '../../../types/result';
import { IXiuyuanRepository } from '../domain/repositories/IXiuyuanRepository';
import { Xiuyuan, XiuyuanProps } from '../domain/Xiuyuan';
import { XiuyuanId } from '../domain/XiuyuanId';
import { BlockId } from '../domain/BlockId';
import { TemplateId } from '../domain/TemplateId';
import { CardFace } from '../domain/CardFace';
import { Priority } from '../domain/Priority';
import { Card } from '../domain/Card';
import { CardId } from '../domain/CardId';
import { ScheduleInfo } from '../domain/ScheduleInfo';
import { IXiuyuan } from '../types';
import { CardState } from '../../../types/card';
import { UnifiedStorageManager } from '../../storage/UnifiedStorageManager';
import { setBlockAttrs } from '../../siyuan/api';
import { TemplateRegistry } from '../templates/TemplateRegistry';

/**
 * XiuyuanRepository 实现
 * 
 * @class XiuyuanRepository
 * @implements {IXiuyuanRepository}
 */
export class XiuyuanRepository implements IXiuyuanRepository {
  private templateRegistry: TemplateRegistry;
  // 🚀 性能优化：卡片ID到XiuyuanID的索引映射
  private cardToXiuyuanIndex: Map<string, string> = new Map();

  constructor(
    private readonly storage: UnifiedStorageManager,
    private readonly cardTypeDetectionService?: any  // 可选依赖，用于检测卡片类型
  ) {
    this.templateRegistry = new TemplateRegistry();
  }

  /**
   * 🚀 快速查找：通过卡片ID获取XiuyuanID
   * 时间复杂度：O(1)
   */
  getXiuyuanIdByCardId(cardId: string): string | undefined {
    return this.cardToXiuyuanIndex.get(cardId);
  }

  /**
   * 保存 Xiuyuan 聚合根
   * 
   * @param xiuyuan - Xiuyuan 聚合根
   * @returns Result<void>
   */
  async save(xiuyuan: Xiuyuan): Promise<Result<void>> {
    try {
      const xiuyuanId = xiuyuan.getId().getValue();
      
      // 1. 转换为持久化模型
      const persistenceModel = this.toPersistenceWithId(xiuyuan);
      
      // 2. 检查是否已存在
      const existing = this.storage.getXiuYuan(xiuyuanId);
      
      if (existing) {
        // 更新现有 XiuYuan - 直接更新 Map 中的数据
        (this.storage as any).xiuyuans.set(xiuyuanId, persistenceModel);
      } else {
        // 创建新 XiuYuan - 添加到 Map
        (this.storage as any).xiuyuans.set(xiuyuanId, persistenceModel);
      }

      // 3. 同步卡片状态：保存现有卡片，删除已移除的卡片
      const cards = xiuyuan.getCards();
      const currentCardIds = new Set(cards.map(card => card.getId().getValue()));
      
      // 3.1 查找需要删除的卡片（存在于 storage 但不在 xiuyuan 中）
      const allStorageCards = this.storage.getAllCards();
      const cardsToDelete = allStorageCards.filter(
        storageCard => storageCard.meta?.xiuyuanID === xiuyuanId && !currentCardIds.has(storageCard.id)
      );
      
      // 3.2 删除已移除的卡片
      for (const cardToDelete of cardsToDelete) {
        await this.storage.deleteCard(cardToDelete.id);
      }
      
      // 3.3 保存/更新当前卡片
      for (const card of cards) {
        const fsrsCard = await this.cardToFSRSCard(card, xiuyuan);  // ✅ 添加 await
        const existingCard = this.storage.getCard(card.getId().getValue());
        
        if (existingCard) {
          // 更新现有卡片
          await this.storage.updateCard(fsrsCard);
        } else {
          // 创建新卡片
          await this.storage.createCard(persistenceModel, fsrsCard);
        }
      }
      
      // 🚀 更新索引：重建该Xiuyuan的所有卡片索引
      // 先清理该Xiuyuan的所有旧索引
      for (const [cardId, indexedXiuyuanId] of this.cardToXiuyuanIndex.entries()) {
        if (indexedXiuyuanId === xiuyuanId) {
          this.cardToXiuyuanIndex.delete(cardId);
        }
      }
      // 再添加当前的卡片索引
      for (const card of cards) {
        this.cardToXiuyuanIndex.set(card.getId().getValue(), xiuyuanId);
      }
      
      // 🚀 清理索引：删除已移除卡片的索引（额外保险）
      for (const cardToDelete of cardsToDelete) {
        this.cardToXiuyuanIndex.delete(cardToDelete.id);
      }

      // 4. 🔧 立即保存（删除操作需要立即持久化，避免被后续操作覆盖）
      if (cardsToDelete.length > 0) {
        console.log(`[XiuyuanRepository] Deleted ${cardsToDelete.length} cards, forcing immediate save`);
        const saveResult = await this.storage.save();
        if (!saveResult.ok) {
          const error = (saveResult as any).error || new Error('Failed to save after deletion');
          console.error('[XiuyuanRepository] Failed to save after deletion:', error);
          return err(error);
        }
      }

      // 5. 写入块属性
      const blockIDs = xiuyuan.getBlockIDs();
      const meta = xiuyuan.getMeta();
      
      // 5.1 确定卡片类型
      let cardType: 'item' | 'topic' | 'concept' | 'descriptor' | 'cloze' = 'item';
      
      // 🆕 优先使用 meta 中明确指定的 cardType
      if (meta.cardType) {
        cardType = meta.cardType as 'item' | 'topic' | 'concept' | 'descriptor' | 'cloze';
        console.log(`[XiuyuanRepository] Using explicit cardType from meta: ${cardType}`);
      } else {
        const templateID = xiuyuan.getTemplateID().getValue();
        const template = this.templateRegistry.get(templateID);
        
        if (template && template.category === 'basic') {
          // ✅ 基础类模板：默认为 item
          cardType = 'item';
          console.log(`[XiuyuanRepository] Template ${templateID} is basic category, using cardType: item`);
        } else if (meta.listTemplate && typeof meta.listTemplate === 'object' && Array.isArray((meta.listTemplate as any).childrenData)) {
          // 列表模版卡：强制为 item
          cardType = 'item';
          console.log(`[XiuyuanRepository] List template detected, using cardType: item`);
        } else if (this.cardTypeDetectionService && blockIDs.length > 0) {
          // 其他情况：检测类型
          try {
            cardType = await this.cardTypeDetectionService.detectCardType(blockIDs[0].getValue());
            console.log(`[XiuyuanRepository] Detected cardType: ${cardType} for block ${blockIDs[0].getValue()}`);
          } catch (error) {
            console.warn('[XiuyuanRepository] Failed to detect cardType, using default "item":', error);
          }
        }
      }
      
      // 5.2 写入块属性
      // 🆕 对于 concept-descriptor 模板，需要分别设置两个块的类型
      const templateID = xiuyuan.getTemplateID().getValue();
      
      // ✅ 使用 Xiuyuan 实体方法获取代表性块 ID（Domain 层逻辑）
      const representativeBlockId = xiuyuan.getRepresentativeBlockId();
      const isDescriptorTemplate = representativeBlockId !== blockIDs[0]?.getValue();
      
      if (isDescriptorTemplate && blockIDs.length >= 2) {
        // 概念-描述符卡：第一个块是概念卡，第二个块是描述符卡
        // ⚠️ 注意：概念卡可能已经有自己的 Xiuyuan（作为独立的概念卡）
        // 因此，我们只设置描述符块的属性，不修改概念卡的属性
        const descriptorBlockId = blockIDs[1].getValue();
        
        try {
          // 只设置描述符卡属性
          await setBlockAttrs(descriptorBlockId, {
            'custom-xiuyuan-id': xiuyuan.getId().getValue(),
            'custom-xiuyuan-template': templateID,
            'custom-fsrs-card-type': 'descriptor',  // 描述符卡设置为 descriptor 类型
          });
          
          console.log(`[XiuyuanRepository] Set descriptor attributes: descriptor=${descriptorBlockId}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (!errorMsg.includes('未找到') && !errorMsg.includes('not found')) {
            console.warn('[XiuyuanRepository] Failed to write descriptor attributes:', error);
          }
        }
      } else if (blockIDs.length > 0) {
        // 其他模板：只设置代表块（第一个块）
        const representativeBlockId = blockIDs[0].getValue();
        try {
          await setBlockAttrs(representativeBlockId, {
            'custom-xiuyuan-id': xiuyuan.getId().getValue(),
            'custom-xiuyuan-template': templateID,
            'custom-fsrs-card-type': cardType,  // ✅ 使用 fsrs-card-type 存储卡片类型
          });
        } catch (error) {
          // 块属性写入失败不应该阻止保存
          // 常见原因：块已被删除、移动或不存在
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (errorMsg.includes('未找到') || errorMsg.includes('not found')) {
            // 块不存在，这是正常情况（用户可能删除了块）
            console.debug(`[XiuyuanRepository] Block ${representativeBlockId} not found, skipping attribute write`);
          } else {
            // 其他错误，记录警告
            console.warn('[XiuyuanRepository] Failed to write block attributes:', error);
          }
        }
      }
      
      // 5.3 列表模版卡：为所有子块设置 item 类型
      if (meta.listTemplate && typeof meta.listTemplate === 'object' && Array.isArray((meta.listTemplate as any).childrenData)) {
        const childrenData = (meta.listTemplate as any).childrenData as Array<{ id: string; cue: string; answer: string; index: number }>;
        for (const child of childrenData) {
          try {
            await setBlockAttrs(child.id, {
              'custom-fsrs-card-type': 'item',  // ✅ 子块设置为 item
            });
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (!errorMsg.includes('未找到') && !errorMsg.includes('not found')) {
              console.warn(`[XiuyuanRepository] Failed to write attributes for child block ${child.id}:`, error);
            }
          }
        }
      }

      // 6. 发布领域事件
      await this.publishDomainEvents(xiuyuan);

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 根据 ID 查找 Xiuyuan
   * 
   * @param id - Xiuyuan ID
   * @returns Result<Xiuyuan | null>
   */
  async findById(id: XiuyuanId): Promise<Result<Xiuyuan | null>> {
    try {
      const data = this.storage.getXiuYuan(id.getValue());
      if (!data) {
        return ok(null);
      }

      return this.toDomain(data);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 根据块 ID 查找 Xiuyuan
   * 
   * @param blockId - 块 ID
   * @returns Result<Xiuyuan[]>
   */
  async findByBlockId(blockId: BlockId): Promise<Result<Xiuyuan[]>> {
    try {
      // 通过 UnifiedStorageManager 查询所有 XiuYuans
      const allXiuyuans = this.storage.getAllXiuYuans();
      const xiuyuans: Xiuyuan[] = [];

      // 过滤包含指定 blockID 的 XiuYuans
      for (const data of allXiuyuans) {
        if (data.blockIDs.includes(blockId.getValue())) {
          const result = this.toDomain(data);
          if (result.ok && result.value) {
            xiuyuans.push(result.value);
          }
        }
      }

      return ok(xiuyuans);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 查找所有 Xiuyuan
   * 
   * @returns Result<Xiuyuan[]>
   */
  async findAll(): Promise<Result<Xiuyuan[]>> {
    try {
      const dataList = this.storage.getAllXiuYuans();
      const xiuyuans: Xiuyuan[] = [];

      for (const data of dataList) {
        const result = this.toDomain(data);
        if (result.ok && result.value) {
          xiuyuans.push(result.value);
          
          // 🚀 初始化索引：构建卡片ID -> XiuyuanID映射
          const xiuyuan = result.value;
          const xiuyuanId = xiuyuan.getId().getValue();
          for (const card of xiuyuan.getCards()) {
            this.cardToXiuyuanIndex.set(card.getId().getValue(), xiuyuanId);
          }
        }
      }

      return ok(xiuyuans);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 删除 Xiuyuan
   * 
   * @param xiuyuan - Xiuyuan 聚合根
   * @returns Result<void>
   */
  async delete(xiuyuan: Xiuyuan): Promise<Result<void>> {
    try {
      const xiuyuanId = xiuyuan.getId().getValue();
      
      // 🚀 清理索引：删除所有关联卡片的索引
      const cards = xiuyuan.getCards();
      for (const card of cards) {
        this.cardToXiuyuanIndex.delete(card.getId().getValue());
      }
      
      // 1. 使用 UnifiedStorageManager 删除 XiuYuan（会级联删除所有关联卡片）
      const deleteResult = await this.storage.deleteXiuYuan(xiuyuanId);
      if (!deleteResult.ok) {
        return deleteResult;
      }

      // 2. 删除块属性
      const blockIDs = xiuyuan.getBlockIDs();
      if (blockIDs.length > 0) {
        const representativeBlockId = blockIDs[0].getValue();
        try {
          await setBlockAttrs(representativeBlockId, {
            'custom-xiuyuan-id': '',
            'custom-xiuyuan-template': '',
          });
        } catch (error) {
          console.warn('Failed to clear block attributes:', error);
        }
      }

      // 3. 从 Riff 删除
      if (cards.length > 0) {
        try {
          // Note: 实际的 Riff 删除需要根据项目的 API 实现
          // const cardBlockIds = cards.map(card => card.getId().getValue());
          // await this.plugin.removeRiffCards(cardBlockIds);
        } catch (error) {
          console.warn('Failed to remove from Riff:', error);
        }
      }

      // 4. 发布领域事件
      await this.publishDomainEvents(xiuyuan);

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 批量保存 Xiuyuan
   * 
   * @param xiuyuans - Xiuyuan 列表
   * @returns Result<void>
   */
  async saveMany(xiuyuans: Xiuyuan[]): Promise<Result<void>> {
    try {
      for (const xiuyuan of xiuyuans) {
        const result = await this.save(xiuyuan);
        if (!result.ok) {
          return result;
        }
      }
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 批量删除 Xiuyuan
   * 
   * @param xiuyuans - Xiuyuan 列表
   * @returns Result<void>
   */
  async deleteMany(xiuyuans: Xiuyuan[]): Promise<Result<void>> {
    try {
      for (const xiuyuan of xiuyuans) {
        const result = await this.delete(xiuyuan);
        if (!result.ok) {
          return result;
        }
      }
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============ 私有方法 ============

  /**
   * 将 Card 领域实体转换为 FSRSCard
   * 
   * @param card - Card 领域实体
   * @param xiuyuan - 关联的 Xiuyuan 聚合根
   * @returns FSRSCard
   * @private
   */
  private async cardToFSRSCard(card: Card, xiuyuan: Xiuyuan): Promise<any> {
    const scheduleInfo = card.getScheduleInfo();
    const meta = xiuyuan.getMeta();
    const faceIndex = card.getFaceIndex();
    
    // Get schedulerType from meta, default to 'fsrs-v6' (Requirement 5.5)
    const schedulerType = (meta.schedulerType as 'fsrs-v6' | 'a-factor' | 'sm2') || 'fsrs-v6';
    
    // ✅ 确定卡片类型（使用与块属性相同的逻辑）
    let cardType: 'item' | 'topic' | 'concept' | 'descriptor' | 'cloze' = 'item';  // 默认为 item
    
    // 🆕 获取模板（在外层声明，供后续使用）
    const templateID = xiuyuan.getTemplateID().getValue();
    const template = this.templateRegistry.get(templateID);
    
    // ✅ 使用 Xiuyuan 实体方法获取代表性块 ID（Domain 层逻辑）
    const blockId = xiuyuan.getRepresentativeBlockId();
    console.log(`[XiuyuanRepository] Using representative blockId: ${blockId}`);
    
    // 🆕 优先使用 meta 中明确指定的 cardType
    console.log(`[XiuyuanRepository] Checking meta.cardType:`, meta.cardType, 'for blockId:', blockId);
    if (meta.cardType) {
      cardType = meta.cardType as 'item' | 'topic' | 'concept' | 'descriptor' | 'cloze';
      console.log(`[XiuyuanRepository] Using explicit cardType from meta: ${cardType}`);
    } else {
      if (template && template.category === 'basic') {
        // ✅ 基础类模板：默认为 item
        cardType = 'item';
        console.log(`[XiuyuanRepository] Template ${templateID} is basic category, card type: item`);
      } else if (meta.listTemplate && typeof meta.listTemplate === 'object' && Array.isArray((meta.listTemplate as any).childrenData)) {
        // 列表模版卡：所有子卡片都是 item 类型
        cardType = 'item';
        console.log(`[XiuyuanRepository] List template card detected, forcing cardType to 'item'`);
      } else if (this.cardTypeDetectionService && blockId) {
        // 其他情况：使用 CardTypeDetectionService 检测
        try {
          cardType = await this.cardTypeDetectionService.detectCardType(blockId);
          console.log(`[XiuyuanRepository] Detected cardType for ${blockId}: ${cardType}`);
        } catch (error) {
          console.warn(`[XiuyuanRepository] Failed to detect cardType for ${blockId}, using default 'item':`, error);
        }
      }
    }
    
    // 🆕 列表模版卡：提取当前卡片的 cue、answer 和 allChildren
    const listTemplateMeta: any = {};
    if (meta.listTemplate && typeof meta.listTemplate === 'object' && Array.isArray((meta.listTemplate as any).childrenData)) {
      const childrenData = (meta.listTemplate as any).childrenData as Array<{ id: string; cue: string; answer: string; index: number }>;
      const currentChild = childrenData[faceIndex];
      
      if (currentChild) {
        listTemplateMeta.cue = currentChild.cue;
        listTemplateMeta.answer = currentChild.answer;
        listTemplateMeta.currentIndex = faceIndex;
        listTemplateMeta.allChildren = childrenData.map((child: any) => ({
          id: child.id,
          cue: child.cue,
          answer: child.answer,
          index: child.index
        }));
      }
    }
    
    // 🆕 提取 typeMarker（用于双向卡片识别正反面）
    let typeMarker: string | undefined;
    if (template && template.cardRules && template.cardRules[faceIndex]) {
      typeMarker = template.cardRules[faceIndex].typeMarker;
      console.log(`[XiuyuanRepository] Extracted typeMarker for faceIndex ${faceIndex}: ${typeMarker}`);
    }
    
    return {
      id: card.getId().getValue(),
      xiuyuanID: card.getXiuyuanId().getValue(),
      blockId,
      
      // FSRS 核心字段
      due: scheduleInfo.due.getTime(),
      stability: scheduleInfo.stability,
      difficulty: scheduleInfo.difficulty,
      reps: scheduleInfo.reps,
      lapses: scheduleInfo.lapses,
      state: scheduleInfo.state,
      lastReview: scheduleInfo.lastReview.getTime(),
      elapsedDays: scheduleInfo.elapsedDays,
      scheduledDays: scheduleInfo.scheduledDays,
      learning_step: scheduleInfo.learning_step,
      
      // 类型和模板
      type: cardType,  // ✅ 使用检测结果
      templateID: xiuyuan.getTemplateID().getValue(),
      schedulerType: schedulerType, // Use schedulerType from meta (Requirement 5.5)
      
      // 优先级
      priority: xiuyuan.getPriority().getValue(),
      
      // 🔧 修复：A-Factor（从 Xiuyuan.meta 复制到 FSRSCard）
      aFactor: meta.aFactor,
      
      // 扩展功能
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      
      // 元数据
      meta: {
        xiuyuanID: card.getXiuyuanId().getValue(),
        templateID: xiuyuan.getTemplateID().getValue(),
        faceIndex: faceIndex,
        // ✅ 使用 Xiuyuan 实体方法获取 blockIDs（Domain 层逻辑）
        frontBlockIDs: xiuyuan.getFrontBlockIDs(faceIndex),
        backBlockIDs: xiuyuan.getBackBlockIDs(faceIndex),
        // 🆕 添加 faces 信息，用于多挖空卡渲染
        faces: xiuyuan.getFaces().map(face => ({
          question: face.question,
          answer: face.answer,
          questionBlockId: face.questionBlockId,
          answerBlockId: face.answerBlockId,
        })),
        // 🆕 添加 typeMarker，用于双向卡片识别正反面
        typeMarker,
        // 🆕 列表模版卡专用字段
        ...listTemplateMeta,
      },
      
      // 时间戳
      createdAt: card.getCreatedAt().getTime(),
      updatedAt: card.getUpdatedAt().getTime(),
    };
  }
  
  /**
   * 将领域模型转换为持久化模型（不包含 ID 和时间戳）
   * 
   * @param xiuyuan - Xiuyuan 聚合根
   * @returns 持久化模型
   * @private
   */
  private toPersistence(xiuyuan: Xiuyuan): Omit<IXiuyuan, 'id' | 'createdAt' | 'updatedAt'> {
    const faces = xiuyuan.getFaces();
    const cards = xiuyuan.getCards();
    const cardIds = cards.map(card => card.getId().getValue());
    
    console.log(`[XiuyuanRepository] toPersistence: Xiuyuan ${xiuyuan.getId().getValue()} has ${cards.length} cards, cardIds:`, cardIds);
    
    return {
      blockIDs: xiuyuan.getBlockIDs().map(b => b.getValue()),
      fields: faces.map((face, index) => ({
        name: `face-${index}`,
        blockID: face.questionBlockId || xiuyuan.getBlockIDs()[0]?.getValue() || '',
        marker: 'question'
      })),
      templateID: xiuyuan.getTemplateID().getValue(),
      meta: {
        ...xiuyuan.getMeta(),
        priority: xiuyuan.getPriority().getValue(),
        faces: faces.map(face => ({
          question: face.question,
          answer: face.answer,
          questionBlockId: face.questionBlockId,
          answerBlockId: face.answerBlockId
        })),
        // ✅ 只存储 Card ID 引用，不存储完整的 Card 数据
        cardIds
      }
    };
  }

  /**
   * 将领域模型转换为完整的持久化模型（包含 ID 和时间戳）
   * 
   * @param xiuyuan - Xiuyuan 聚合根
   * @returns 完整的持久化模型
   * @private
   */
  private toPersistenceWithId(xiuyuan: Xiuyuan): IXiuyuan {
    return {
      ...this.toPersistence(xiuyuan),
      id: xiuyuan.getId().getValue(),
      createdAt: xiuyuan.getCreatedAt().getTime(),
      updatedAt: xiuyuan.getUpdatedAt().getTime()
    };
  }

  /**
   * 从 CardPersistenceDTO 重建 Card 领域实体
   * 
   * @param dto - Card 持久化 DTO
   * @param xiuyuanId - Xiuyuan ID
   * @returns Result<Card>
   * @private
   */
  private cardFromDTO(dto: any, xiuyuanId: XiuyuanId): Result<Card> {
    try {
      const cardIdResult = CardId.create(dto.id);
      if (!cardIdResult.ok) return err(new Error(`Invalid CardId: ${dto.id}`));

      const scheduleInfoResult = ScheduleInfo.create({
        due: new Date(dto.due),
        stability: dto.stability,
        difficulty: dto.difficulty,
        reps: dto.reps,
        lapses: dto.lapses,
        state: dto.state as CardState,
        lastReview: new Date(dto.lastReview),
        elapsedDays: dto.elapsedDays,
        scheduledDays: dto.scheduledDays,
        learning_step: dto.learning_step
      });
      if (!scheduleInfoResult.ok) return err(new Error('Invalid ScheduleInfo'));

      const cardResult = Card.create({
        id: cardIdResult.value,
        xiuyuanId: xiuyuanId,
        faceIndex: dto.meta?.faceIndex ?? dto.meta?.ruleIndex ?? 0, // 兼容旧数据
        scheduleInfo: scheduleInfoResult.value,
        createdAt: new Date(dto.createdAt),
        updatedAt: new Date(dto.updatedAt)
      });

      return cardResult;
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 将持久化模型转换为领域模型
   * 
   * @param data - 持久化模型
   * @returns Result<Xiuyuan | null>
   * @private
   */
  private toDomain(data: IXiuyuan): Result<Xiuyuan | null> {
    try {
      // 1. 转换 ID
      const idResult = XiuyuanId.create(data.id);
      if (!idResult.ok) return err(new Error(`Invalid XiuyuanId: ${data.id}`));

      // 2. 转换 BlockIDs
      const blockIDResults = data.blockIDs.map(id => BlockId.create(id));
      const failedBlockId = blockIDResults.find(r => !r.ok);
      if (failedBlockId) return err(new Error(`Invalid BlockId in blockIDs`));
      const blockIDs = blockIDResults.map(r => r.ok ? r.value : null).filter((v): v is BlockId => v !== null);

      // 3. 转换 TemplateID
      const templateIDResult = TemplateId.create(data.templateID);
      if (!templateIDResult.ok) return err(new Error(`Invalid TemplateId: ${data.templateID}`));

      // 4. 转换 Faces（从 meta 中恢复）
      const facesData = (data.meta?.faces as any[]) || [];
      const faceResults = facesData.map(f => CardFace.create({
        question: f.question,
        answer: f.answer,
        questionBlockId: f.questionBlockId,
        answerBlockId: f.answerBlockId
      }));
      const failedFace = faceResults.find(r => !r.ok);
      if (failedFace) return err(new Error(`Invalid CardFace in faces`));
      const faces = faceResults.map(r => r.ok ? r.value : null).filter((v): v is CardFace => v !== null);

      // 5. 转换 Priority
      const priorityValue = (data.meta?.priority as number) || 0;
      const priorityResult = Priority.create(priorityValue);
      if (!priorityResult.ok) {
        // 如果优先级无效，使用默认值
        console.warn('Invalid priority value, using default:', priorityValue);
      }
      const priority = priorityResult.ok ? priorityResult.value : Priority.createDefault();

      // 6. 转换 Cards（从 cardIds 加载）
      const cardsMap = new Map<CardId, Card>();
      const cardIds = (data.meta?.cardIds as string[]) || [];
      
      console.log(`[XiuyuanRepository] toDomain: Xiuyuan ${data.id} has ${cardIds.length} cardIds in meta`);
      
      for (const cardId of cardIds) {
        const cardDTO = this.storage.getCardDTO(cardId);
        if (!cardDTO) {
          console.warn(`[XiuyuanRepository] Card DTO not found: ${cardId}`);
          continue;
        }
        
        const cardResult = this.cardFromDTO(cardDTO, idResult.value);
        if (cardResult.ok) {
          const cardIdObj = CardId.create(cardId);
          if (cardIdObj.ok) {
            cardsMap.set(cardIdObj.value, cardResult.value);
          }
        }
      }
      
      console.log(`[XiuyuanRepository] toDomain: Loaded ${cardsMap.size} cards for Xiuyuan ${data.id}`);

      // 7. 重建 Xiuyuan
      const xiuyuanProps: XiuyuanProps = {
        id: idResult.value,
        blockIDs,
        templateID: templateIDResult.value,
        faces,
        priority,
        cards: cardsMap,
        meta: data.meta || {},
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt)
      };

      return Xiuyuan.reconstitute(xiuyuanProps);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 发布领域事件
   * 
   * @param xiuyuan - Xiuyuan 聚合根
   * @private
   */
  private async publishDomainEvents(xiuyuan: Xiuyuan): Promise<void> {
    const events = xiuyuan.getDomainEvents();
    
    // ✅ 只记录事件，不清除
    // 事件的发布和清除由 UseCase 负责
    for (const event of events) {
      console.log('[XiuyuanRepository] Domain event:', event.getEventName());
    }
  }
}

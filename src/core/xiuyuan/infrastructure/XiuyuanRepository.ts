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
import { XiuyuanStorage } from '../storage';
import { IXiuyuan } from '../types';
import type SiyuanMemoPlugin from '../../../index';
import { CardState } from '../../../types/card';

/**
 * XiuyuanRepository 实现
 * 
 * @class XiuyuanRepository
 * @implements {IXiuyuanRepository}
 */
export class XiuyuanRepository implements IXiuyuanRepository {
  constructor(
    private readonly storage: XiuyuanStorage,
    private readonly plugin: SiyuanMemoPlugin
  ) {}

  /**
   * 保存 Xiuyuan 聚合根
   * 
   * @param xiuyuan - Xiuyuan 聚合根
   * @returns Result<void>
   */
  async save(xiuyuan: Xiuyuan): Promise<Result<void>> {
    try {
      const xiuyuanId = xiuyuan.getId().getValue();
      
      // 1. 检查是否已存在
      const existing = this.storage.getXiuyuan(xiuyuanId);
      
      if (existing) {
        // 更新现有 Xiuyuan
        const updates = this.toPersistence(xiuyuan);
        this.storage.updateXiuyuan(xiuyuanId, updates);
      } else {
        // 创建新 Xiuyuan - 使用完整的持久化模型
        const persistenceModel = this.toPersistenceWithId(xiuyuan);
        // 直接插入到 storage 的内部数据结构
        (this.storage as any).data.xiuyuans[xiuyuanId] = persistenceModel;
        (this.storage as any).dirty = true;
        
        // 更新索引
        for (const blockID of persistenceModel.blockIDs) {
          const list = (this.storage as any).indexByBlockID.get(blockID) || [];
          list.push(xiuyuanId);
          (this.storage as any).indexByBlockID.set(blockID, list);
        }
      }

      // 2. 保存到 msgpack
      const saveResult = await this.storage.save();
      if (!saveResult.ok) {
        return err(new Error(`Failed to save to storage: ${saveResult.error.message}`));
      }

      // 3. 写入块属性（使用第一个块作为代表块）
      const blockIDs = xiuyuan.getBlockIDs();
      if (blockIDs.length > 0) {
        const representativeBlockId = blockIDs[0].getValue();
        try {
          await this.plugin.setBlockAttrs(representativeBlockId, {
            'custom-xiuyuan-id': xiuyuan.getId().getValue(),
            'custom-xiuyuan-template': xiuyuan.getTemplateID().getValue(),
          });
        } catch (error) {
          // 块属性写入失败不应该阻止保存
          console.warn('Failed to write block attributes:', error);
        }
      }

      // 4. 同步到 Riff（为每个卡片添加到 Riff）
      const cards = xiuyuan.getCards();
      if (cards.length > 0) {
        try {
          const cardBlockIds = cards.map(card => {
            // 使用卡片 ID 作为 Riff 卡片 ID
            return card.getId().getValue();
          });
          // Note: 实际的 Riff 同步需要根据项目的 API 实现
          // 这里假设有 addRiffCards 方法
          // await this.plugin.addRiffCards(cardBlockIds);
        } catch (error) {
          // Riff 同步失败不应该阻止保存
          console.warn('Failed to sync to Riff:', error);
        }
      }

      // 5. 发布领域事件
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
      const data = this.storage.getXiuyuan(id.getValue());
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
      const dataList = this.storage.getXiuyuansByBlockID(blockId.getValue());
      const xiuyuans: Xiuyuan[] = [];

      for (const data of dataList) {
        const result = this.toDomain(data);
        if (result.ok && result.value) {
          xiuyuans.push(result.value);
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
      const dataList = this.storage.getAllXiuyuans();
      const xiuyuans: Xiuyuan[] = [];

      for (const data of dataList) {
        const result = this.toDomain(data);
        if (result.ok && result.value) {
          xiuyuans.push(result.value);
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
      // 1. 从 msgpack 存储删除
      const deleted = this.storage.deleteXiuyuan(xiuyuan.getId().getValue());
      if (!deleted) {
        return err(new Error(`Xiuyuan not found: ${xiuyuan.getId().getValue()}`));
      }

      const saveResult = await this.storage.save();
      if (!saveResult.ok) {
        return err(new Error(`Failed to save after delete: ${saveResult.error.message}`));
      }

      // 2. 删除块属性
      const blockIDs = xiuyuan.getBlockIDs();
      if (blockIDs.length > 0) {
        const representativeBlockId = blockIDs[0].getValue();
        try {
          await this.plugin.setBlockAttrs(representativeBlockId, {
            'custom-xiuyuan-id': '',
            'custom-xiuyuan-template': '',
          });
        } catch (error) {
          console.warn('Failed to clear block attributes:', error);
        }
      }

      // 3. 从 Riff 删除
      const cards = xiuyuan.getCards();
      if (cards.length > 0) {
        try {
          const cardBlockIds = cards.map(card => card.getId().getValue());
          // Note: 实际的 Riff 删除需要根据项目的 API 实现
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
   * 将领域模型转换为持久化模型（不包含 ID 和时间戳）
   * 
   * @param xiuyuan - Xiuyuan 聚合根
   * @returns 持久化模型
   * @private
   */
  private toPersistence(xiuyuan: Xiuyuan): Omit<IXiuyuan, 'id' | 'createdAt' | 'updatedAt'> {
    const faces = xiuyuan.getFaces();
    
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
        cards: xiuyuan.getCards().map(card => ({
          id: card.getId().getValue(),
          xiuyuanId: card.getXiuyuanId().getValue(),
          faceIndex: card.getFaceIndex(),
          scheduleInfo: {
            due: card.getScheduleInfo().due.getTime(),
            stability: card.getScheduleInfo().stability,
            difficulty: card.getScheduleInfo().difficulty,
            reps: card.getScheduleInfo().reps,
            lapses: card.getScheduleInfo().lapses,
            state: card.getScheduleInfo().state,
            lastReview: card.getScheduleInfo().lastReview.getTime(),
            elapsedDays: card.getScheduleInfo().elapsedDays,
            scheduledDays: card.getScheduleInfo().scheduledDays,
            learning_step: card.getScheduleInfo().learning_step
          },
          createdAt: card.getCreatedAt().getTime(),
          updatedAt: card.getUpdatedAt().getTime()
        }))
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
      if (!idResult.ok) return err(idResult.error);

      // 2. 转换 BlockIDs
      const blockIDResults = data.blockIDs.map(id => BlockId.create(id));
      const failedBlockId = blockIDResults.find(r => !r.ok);
      if (failedBlockId && !failedBlockId.ok) return err(failedBlockId.error);
      const blockIDs = blockIDResults.map(r => r.ok ? r.value : null).filter((v): v is BlockId => v !== null);

      // 3. 转换 TemplateID
      const templateIDResult = TemplateId.create(data.templateID);
      if (!templateIDResult.ok) return err(templateIDResult.error);

      // 4. 转换 Faces（从 meta 中恢复）
      const facesData = (data.meta?.faces as any[]) || [];
      const faceResults = facesData.map(f => CardFace.create({
        question: f.question,
        answer: f.answer,
        questionBlockId: f.questionBlockId,
        answerBlockId: f.answerBlockId
      }));
      const failedFace = faceResults.find(r => !r.ok);
      if (failedFace && !failedFace.ok) return err(failedFace.error);
      const faces = faceResults.map(r => r.ok ? r.value : null).filter((v): v is CardFace => v !== null);

      // 5. 转换 Priority
      const priorityValue = (data.meta?.priority as number) || 0;
      const priorityResult = Priority.create(priorityValue);
      if (!priorityResult.ok) {
        // 如果优先级无效，使用默认值
        console.warn('Invalid priority value, using default:', priorityValue);
      }
      const priority = priorityResult.ok ? priorityResult.value : Priority.createDefault();

      // 6. 转换 Cards（从 meta 中恢复）
      const cardsData = (data.meta?.cards as any[]) || [];
      const cardsMap = new Map<CardId, Card>();
      
      for (const cardData of cardsData) {
        const cardIdResult = CardId.create(cardData.id);
        if (!cardIdResult.ok) continue;

        const xiuyuanIdResult = XiuyuanId.create(cardData.xiuyuanId);
        if (!xiuyuanIdResult.ok) continue;

        const scheduleInfoResult = ScheduleInfo.create({
          due: new Date(cardData.scheduleInfo.due),
          stability: cardData.scheduleInfo.stability,
          difficulty: cardData.scheduleInfo.difficulty,
          reps: cardData.scheduleInfo.reps,
          lapses: cardData.scheduleInfo.lapses,
          state: cardData.scheduleInfo.state as CardState,
          lastReview: new Date(cardData.scheduleInfo.lastReview),
          elapsedDays: cardData.scheduleInfo.elapsedDays,
          scheduledDays: cardData.scheduleInfo.scheduledDays,
          learning_step: cardData.scheduleInfo.learning_step
        });
        if (!scheduleInfoResult.ok) continue;

        const cardResult = Card.create({
          id: cardIdResult.value,
          xiuyuanId: xiuyuanIdResult.value,
          faceIndex: cardData.faceIndex,
          scheduleInfo: scheduleInfoResult.value,
          createdAt: new Date(cardData.createdAt),
          updatedAt: new Date(cardData.updatedAt)
        });
        if (cardResult.ok) {
          cardsMap.set(cardIdResult.value, cardResult.value);
        }
      }

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
    
    // TODO: 实现事件总线
    // 目前只是清除事件，避免重复发布
    // 未来可以集成事件总线来处理事件
    
    for (const event of events) {
      console.log('Domain event:', event);
    }
    
    xiuyuan.clearDomainEvents();
  }
}

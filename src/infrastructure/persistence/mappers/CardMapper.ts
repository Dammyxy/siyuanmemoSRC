/**
 * CardMapper - 卡片映射器
 * 
 * @module CardMapper
 * @description
 * 负责在领域模型（Card Entity）和持久化模型（CardPersistenceDTO）之间转换。
 * 
 * **核心职责**：
 * 1. 领域模型 → 持久化模型：提取 Xiuyuan 字段到顶层
 * 2. 持久化模型 → 领域模型：重建 Card Entity
 * 3. 数据验证和清洗
 * 
 * **设计原则**：
 * - 单向依赖：Mapper 依赖 DTO 和领域模型，反之不依赖
 * - 纯函数：无副作用，便于测试
 * - 防御性编程：处理 null/undefined
 * - 数据保真度：保持负零、undefined/null 的区分
 * 
 * @see CardPersistenceDTO
 * @see Card - 领域实体
 * @see FSRSCard - 数据传输对象（向后兼容）
 */

import type { FSRSCard } from '../../../types/card';
import type { CardPersistenceDTO } from '../dto/CardPersistenceDTO';
import { Card } from '../../../domain/entities/Card';
import type { Result } from '../../../types/result';
import { ok, err, isErr } from '../../../types/result';

/**
 * 深拷贝函数，保持特殊值（负零、undefined、null）
 * 
 * @param obj 要拷贝的对象
 * @returns 深拷贝后的对象
 */
function deepClone<T>(obj: T): T {
  // 处理基本类型和 null
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // 处理数组
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as any;
  }

  // 处理对象
  const cloned: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      // 特殊处理数字类型以保持负零
      if (typeof value === 'number' && Object.is(value, -0)) {
        cloned[key] = -0;
      } else {
        cloned[key] = deepClone(value);
      }
    }
  }
  
  return cloned;
}

/**
 * 卡片映射器
 */
export class CardMapper {
  /**
   * 领域模型 → 持久化模型
   * 
   * 优化策略：
   * 1. 提取 Xiuyuan 相关字段到顶层（xiuyuanID, templateID, etc.）
   * 2. 清理 meta 字段，移除已提取的字段
   * 3. 保留其他扩展字段在 meta 中
   * 4. 使用深拷贝确保不修改原始数据
   * 
   * @param card 领域模型
   * @returns 持久化模型
   */
  static toPersistence(card: FSRSCard): CardPersistenceDTO {
    // 提取 meta 中的 Xiuyuan 字段
    const xiuyuanID = card.meta?.xiuyuanID as string | undefined;
    const templateID = card.meta?.templateID as string | undefined;
    const frontBlockIDs = card.meta?.frontBlockIDs as string[] | undefined;
    const backBlockIDs = card.meta?.backBlockIDs as string[] | undefined;
    const fieldMapping = card.meta?.fieldMapping as Record<string, string> | undefined;
    const xiuyuanPriority = card.meta?.priority as number | undefined;

    // 清理 meta：移除已提取的字段（使用深拷贝避免修改原始数据）
    const cleanedMeta = card.meta ? deepClone(card.meta) : undefined;
    if (cleanedMeta) {
      delete cleanedMeta.xiuyuanID;
      delete cleanedMeta.templateID;
      delete cleanedMeta.frontBlockIDs;
      delete cleanedMeta.backBlockIDs;
      delete cleanedMeta.fieldMapping;
      delete cleanedMeta.priority;
    }

    // 构建持久化 DTO
    const dto: CardPersistenceDTO = {
      // 标识
      id: card.id,
      blockId: card.blockId,

      // FSRS 核心
      due: card.due,
      stability: card.stability,
      difficulty: card.difficulty,
      reps: card.reps,
      lapses: card.lapses,
      state: card.state,
      lastReview: card.lastReview,
      elapsedDays: card.elapsedDays,
      scheduledDays: card.scheduledDays,
      learning_step: card.learning_step,

      // 扩展功能
      priority: card.priority,
      type: card.type,
      tags: card.tags || [],
      cardTypeMarker: card.cardTypeMarker,
      neuralRoamSeed: card.neuralRoamSeed,

      // 难点攻克
      leechCount: card.leechCount,
      isLeech: card.isLeech,

      // 跳过/留言
      skipped: card.skipped,
      skipNote: card.skipNote,
      skipUntil: card.skipUntil,

      // 增量阅读
      sourceUrl: card.sourceUrl,
      extractedFrom: card.extractedFrom,

      // 元数据
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,

      // Topic/Item
      aFactor: card.aFactor,

      // 调度器
      schedulerType: card.schedulerType,
      syncToRiff: card.syncToRiff,
      riffCardId: card.riffCardId,
      schedulerMeta: card.schedulerMeta,

      // 重新调度
      postponeCount: card.postponeCount,
      lastPostponeDate: card.lastPostponeDate,
      rescheduleHistory: card.rescheduleHistory,

      // 🆕 Xiuyuan 字段（提取到顶层）
      xiuyuanID,
      templateID,
      frontBlockIDs,
      backBlockIDs,
      fieldMapping,
      xiuyuanPriority,

      // 清理后的 meta
      meta: cleanedMeta && Object.keys(cleanedMeta).length > 0 ? cleanedMeta : undefined,
    };

    return dto;
  }

  /**
   * 持久化模型 → 领域模型
   * 
   * 重建策略：
   * 1. 将顶层的 Xiuyuan 字段合并回 meta
   * 2. 保留 meta 中的其他扩展字段
   * 3. 处理向后兼容（旧数据可能没有顶层字段）
   * 
   * @param dto 持久化模型
   * @returns 领域模型
   */
  static toDomain(dto: CardPersistenceDTO): FSRSCard {
    // 重建 meta 字段
    const meta: Record<string, any> = {
      ...(dto.meta || {}),
    };

    // 将顶层 Xiuyuan 字段合并回 meta
    if (dto.xiuyuanID !== undefined) {
      meta.xiuyuanID = dto.xiuyuanID;
    }
    if (dto.templateID !== undefined) {
      meta.templateID = dto.templateID;
    }
    if (dto.frontBlockIDs !== undefined) {
      meta.frontBlockIDs = dto.frontBlockIDs;
    }
    if (dto.backBlockIDs !== undefined) {
      meta.backBlockIDs = dto.backBlockIDs;
    }
    if (dto.fieldMapping !== undefined) {
      meta.fieldMapping = dto.fieldMapping;
    }
    if (dto.xiuyuanPriority !== undefined) {
      meta.priority = dto.xiuyuanPriority;
    }

    // 构建领域模型
    const card: FSRSCard = {
      // 标识
      id: dto.id,
      blockId: dto.blockId,

      // FSRS 核心
      due: dto.due,
      stability: dto.stability,
      difficulty: dto.difficulty,
      reps: dto.reps,
      lapses: dto.lapses,
      state: dto.state,
      lastReview: dto.lastReview,
      elapsedDays: dto.elapsedDays,
      scheduledDays: dto.scheduledDays,
      learning_step: dto.learning_step,

      // 扩展功能
      priority: dto.priority,
      type: dto.type,
      tags: dto.tags || [],
      cardTypeMarker: dto.cardTypeMarker,
      neuralRoamSeed: dto.neuralRoamSeed,

      // 难点攻克
      leechCount: dto.leechCount,
      isLeech: dto.isLeech,

      // 跳过/留言
      skipped: dto.skipped,
      skipNote: dto.skipNote,
      skipUntil: dto.skipUntil,

      // 增量阅读
      sourceUrl: dto.sourceUrl,
      extractedFrom: dto.extractedFrom,

      // 元数据
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,

      // Topic/Item
      aFactor: dto.aFactor,

      // 调度器
      schedulerType: dto.schedulerType,
      syncToRiff: dto.syncToRiff,
      riffCardId: dto.riffCardId,
      schedulerMeta: dto.schedulerMeta,

      // 重新调度
      postponeCount: dto.postponeCount,
      lastPostponeDate: dto.lastPostponeDate,
      rescheduleHistory: dto.rescheduleHistory as any,

      // 重建的 meta
      meta: Object.keys(meta).length > 0 ? meta : undefined,
    };

    return card;
  }

  /**
   * 批量转换：领域模型 → 持久化模型
   * 
   * @param cards 领域模型数组
   * @returns 持久化模型数组
   */
  static toPersistenceBatch(cards: FSRSCard[]): CardPersistenceDTO[] {
    return cards.map(card => this.toPersistence(card));
  }

  /**
   * 批量转换：持久化模型 → 领域模型
   * 
   * @param dtos 持久化模型数组
   * @returns 领域模型数组
   */
  static toDomainBatch(dtos: CardPersistenceDTO[]): FSRSCard[] {
    return dtos.map(dto => this.toDomain(dto));
  }

  /**
   * 验证持久化 DTO 的完整性
   * 
   * @param dto 持久化模型
   * @returns 验证结果
   */
  static validate(dto: CardPersistenceDTO): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 必需字段检查
    if (!dto.id) errors.push('Missing required field: id');
    if (!dto.blockId) errors.push('Missing required field: blockId');
    if (dto.due === undefined) errors.push('Missing required field: due');
    if (dto.stability === undefined) errors.push('Missing required field: stability');
    if (dto.difficulty === undefined) errors.push('Missing required field: difficulty');

    // 范围检查
    if (dto.stability < 0) errors.push('Invalid stability: must be non-negative');
    if (dto.difficulty < 1 || dto.difficulty > 10) {
      errors.push('Invalid difficulty: must be between 1 and 10');
    }
    if (dto.priority < 0 || dto.priority > 100) {
      errors.push('Invalid priority: must be between 0 and 100');
    }

    // Xiuyuan 一致性检查
    if (dto.xiuyuanID) {
      // 如果有 xiuyuanID，应该有 templateID
      if (!dto.templateID) {
        errors.push('Xiuyuan card missing templateID');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Card Entity → 持久化模型
   * 
   * @param card Card Entity
   * @returns 持久化模型
   */
  static fromEntity(card: Card): CardPersistenceDTO {
    const props = card.toObject();
    
    // 提取 Xiuyuan 字段
    const xiuyuanMetadata = props.xiuyuanMetadata;
    
    return {
      id: props.id,
      blockId: props.blockId,
      due: props.due,
      stability: props.stability,
      difficulty: props.difficulty,
      reps: props.reps,
      lapses: props.lapses,
      state: props.state,
      lastReview: props.lastReview,
      elapsedDays: props.elapsedDays,
      scheduledDays: props.scheduledDays,
      learning_step: props.learning_step,
      priority: props.priority,
      type: props.type,
      tags: props.tags || [],
      cardTypeMarker: props.cardTypeMarker,
      neuralRoamSeed: props.neuralRoamSeed,
      leechCount: props.leechCount,
      isLeech: props.isLeech,
      skipped: props.skipped,
      skipNote: props.skipNote,
      skipUntil: props.skipUntil,
      sourceUrl: props.sourceUrl,
      extractedFrom: props.extractedFrom,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
      aFactor: props.aFactor,
      schedulerType: props.schedulerType,
      syncToRiff: props.syncToRiff,
      riffCardId: props.riffCardId,
      schedulerMeta: props.schedulerMeta,
      postponeCount: props.postponeCount,
      lastPostponeDate: props.lastPostponeDate,
      rescheduleHistory: props.rescheduleHistory,
      
      // Xiuyuan 字段提取到顶层
      xiuyuanID: xiuyuanMetadata?.xiuyuanID,
      templateID: xiuyuanMetadata?.templateID,
      frontBlockIDs: xiuyuanMetadata?.frontBlockIDs,
      backBlockIDs: xiuyuanMetadata?.backBlockIDs,
      fieldMapping: xiuyuanMetadata?.fieldMapping,
      xiuyuanPriority: xiuyuanMetadata?.priority,
      
      // 扩展数据
      meta: props.extensionData,
    };
  }

  /**
   * 持久化模型 → Card Entity
   * 
   * @param dto 持久化模型
   * @returns Card Entity
   */
  static toEntity(dto: CardPersistenceDTO): Result<Card> {
    // 重建 Xiuyuan 元数据
    const xiuyuanMetadata = dto.xiuyuanID ? {
      xiuyuanID: dto.xiuyuanID,
      templateID: dto.templateID!,
      frontBlockIDs: dto.frontBlockIDs || [],
      backBlockIDs: dto.backBlockIDs || [],
      fieldMapping: dto.fieldMapping,
      priority: dto.xiuyuanPriority,
    } : undefined;
    
    return Card.create({
      id: dto.id,
      blockId: dto.blockId,
      due: dto.due,
      stability: dto.stability,
      difficulty: dto.difficulty,
      reps: dto.reps,
      lapses: dto.lapses,
      state: dto.state,
      lastReview: dto.lastReview,
      elapsedDays: dto.elapsedDays,
      scheduledDays: dto.scheduledDays,
      learning_step: dto.learning_step,
      priority: dto.priority,
      type: dto.type,
      tags: dto.tags,
      cardTypeMarker: dto.cardTypeMarker,
      neuralRoamSeed: dto.neuralRoamSeed,
      leechCount: dto.leechCount,
      isLeech: dto.isLeech,
      skipped: dto.skipped,
      skipNote: dto.skipNote,
      skipUntil: dto.skipUntil,
      sourceUrl: dto.sourceUrl,
      extractedFrom: dto.extractedFrom,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
      aFactor: dto.aFactor,
      schedulerType: dto.schedulerType,
      syncToRiff: dto.syncToRiff,
      riffCardId: dto.riffCardId,
      schedulerMeta: dto.schedulerMeta,
      postponeCount: dto.postponeCount,
      lastPostponeDate: dto.lastPostponeDate,
      rescheduleHistory: dto.rescheduleHistory as any[],
      xiuyuanMetadata,
      extensionData: dto.meta,
    });
  }

  /**
   * 批量转换：Card Entity → 持久化模型
   */
  static fromEntityBatch(cards: Card[]): CardPersistenceDTO[] {
    return cards.map(card => this.fromEntity(card));
  }

  /**
   * 批量转换：持久化模型 → Card Entity
   */
  static toEntityBatch(dtos: CardPersistenceDTO[]): Result<Card[]> {
    const cards: Card[] = [];
    const errors: Error[] = [];
    
    for (const dto of dtos) {
      const result = this.toEntity(dto);
      if (isErr(result)) {
        errors.push(result.error);
      } else {
        cards.push(result.value);
      }
    }
    
    if (errors.length > 0) {
      return err(new Error(`Failed to convert ${errors.length} cards: ${errors.map(e => e.message).join(', ')}`));
    }
    
    return ok(cards);
  }
}

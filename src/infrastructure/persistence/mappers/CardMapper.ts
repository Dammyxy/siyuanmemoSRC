/**
 * CardMapper - 卡片映射器
 * 
 * @module CardMapper
 * @description
 * 负责在 FSRSCard 运行时 DTO 和持久化模型（CardPersistenceDTO）之间转换。
 * 
 * **核心职责**：
 * 1. FSRSCard → 持久化模型：提取 Xiuyuan 字段到顶层
 * 2. 持久化模型 → FSRSCard：重建运行时卡片 DTO
 * 3. 数据验证和清洗
 * 
 * **设计原则**：
 * - 单向依赖：Mapper 依赖 FSRSCard DTO 和持久化 DTO，反之不依赖
 * - 纯函数：无副作用，便于测试
 * - 防御性编程：处理 null/undefined
 * - 数据保真度：保持负零、undefined/null 的区分
 * 
 * @see CardPersistenceDTO
 * @see FSRSCard - 数据传输对象（向后兼容）
 */

import type { CardFaceKey, FSRSCard } from '../../../types/card';
import type { CardPersistenceDTO } from '../dto/CardPersistenceDTO';
import { canonicalizeSchedulingState } from '../../../core/scheduler/schedulingStateCleanliness';
import { resolveEffectiveSchedulerTypeForCard } from '../../../core/scheduler/schedulerPolicy';

const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

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
    return obj.map(item => deepClone(item)) as unknown as T;
  }

  // 处理对象
  const cloned: Record<string, unknown> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (UNSAFE_OBJECT_KEYS.has(key)) {
        continue;
      }
      const value = obj[key];
      // 特殊处理数字类型以保持负零
      if (typeof value === 'number' && Object.is(value, -0)) {
        cloned[key] = -0;
      } else {
        cloned[key] = deepClone(value);
      }
    }
  }
  
  return cloned as T;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    return undefined;
  }
  return value;
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }
  const entries = Object.entries(value);
  if (entries.some(([, entryValue]) => typeof entryValue !== 'string')) {
    return undefined;
  }
  return value as Record<string, string>;
}

function asCardFaceKey(value: unknown): CardFaceKey | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }
  const ruleId = asString(value.ruleId)?.trim();
  if (!ruleId) {
    return undefined;
  }
  const faceIndex = asNumber(value.faceIndex);
  return Number.isInteger(faceIndex) && faceIndex >= 0
    ? { ruleId, faceIndex }
    : { ruleId };
}

function isReviewLikeState(state: unknown): boolean {
  return state === 2 || state === 3;
}

function usesFsrsScheduling(dto: Pick<CardPersistenceDTO, 'id' | 'type' | 'schedulerType'>): boolean {
  return resolveEffectiveSchedulerTypeForCard({
    id: dto.id,
    type: dto.type,
    schedulerType: dto.schedulerType,
  }) === 'fsrs-v6';
}

function isValidEmptySchedulingMemory(dto: Pick<CardPersistenceDTO, 'state' | 'stability' | 'difficulty' | 'reps' | 'lastReview'>): boolean {
  return !isReviewLikeState(dto.state)
    && dto.stability === 0
    && dto.difficulty === 0
    && dto.reps === 0
    && dto.lastReview === 0;
}

function resolveCardFaceKey(card: FSRSCard, meta?: Record<string, unknown>): CardFaceKey | undefined {
  const explicit = asCardFaceKey(card.faceKey) || asCardFaceKey(meta?.faceKey);
  if (explicit) {
    return explicit;
  }

  const legacyRuleId = asString(meta?.ruleId)?.trim()
    || asString(meta?.cardRuleId)?.trim()
    || asString(meta?.typeMarker)?.trim();
  const legacyFaceIndex = asNumber(meta?.faceIndex);
  if (!legacyRuleId && !(Number.isInteger(legacyFaceIndex) && legacyFaceIndex >= 0)) {
    return undefined;
  }

  return {
    ruleId: legacyRuleId || `face-${legacyFaceIndex}`,
    ...(Number.isInteger(legacyFaceIndex) && legacyFaceIndex >= 0 ? { faceIndex: legacyFaceIndex } : {}),
  };
}

/**
 * 卡片映射器
 */
export class CardMapper {
  /**
   * FSRSCard 运行时 DTO → 持久化模型
   * 
   * 优化策略：
   * 1. 提取 Xiuyuan 相关字段到顶层（xiuyuanID, templateID, etc.）
   * 2. 清理 meta 字段，移除已提取的字段
   * 3. 保留其他扩展字段在 meta 中
   * 4. 使用深拷贝确保不修改原始数据
   * 
   * @param card FSRSCard 运行时 DTO
   * @returns 持久化模型
   */
  static toPersistence(card: FSRSCard): CardPersistenceDTO {
    card = canonicalizeSchedulingState(card, {
      source: 'card-mapper',
      mode: 'repair-external',
    }).card;
    const cardMeta = isObjectRecord(card.meta) ? card.meta : undefined;

    // 提取 meta 中的 Xiuyuan 字段
    const xiuyuanID = asString(card.xiuyuanID) || asString(cardMeta?.xiuyuanID);
    const faceKey = resolveCardFaceKey(card, cardMeta);
    const templateID = asString(cardMeta?.templateID);
    const frontBlockIDs = asStringArray(cardMeta?.frontBlockIDs);
    const backBlockIDs = asStringArray(cardMeta?.backBlockIDs);
    const fieldMapping = asStringRecord(cardMeta?.fieldMapping);
    const xiuyuanPriority = asNumber(cardMeta?.priority);

    // 清理 meta：移除已提取的字段（使用深拷贝避免修改原始数据）
    const cleanedMeta = cardMeta ? deepClone(cardMeta) : undefined;
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
      riffCardId: card.riffCardId,
      schedulerMeta: card.schedulerMeta,

      // 重新调度
      postponeCount: card.postponeCount,
      lastPostponeDate: card.lastPostponeDate,
      rescheduleHistory: card.rescheduleHistory,

      // 🆕 Xiuyuan 字段（提取到顶层）
      xiuyuanID,
      faceKey,
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
   * 持久化模型 → FSRSCard 运行时 DTO
   * 
   * 重建策略：
   * 1. 将顶层的 Xiuyuan 字段合并回 meta
   * 2. 保留 meta 中的其他扩展字段
   * 3. 处理向后兼容（旧数据可能没有顶层字段）
   * 
   * @param dto 持久化模型
   * @returns FSRSCard 运行时 DTO
   */
  static toDomain(dto: CardPersistenceDTO): FSRSCard {
    // 重建 meta 字段
    const meta: Record<string, unknown> = {
      ...(dto.meta || {}),
    };

    // 将顶层 Xiuyuan 字段合并回 meta
    if (dto.xiuyuanID !== undefined) {
      meta.xiuyuanID = dto.xiuyuanID;
    }
    const faceKey = asCardFaceKey(dto.faceKey) || asCardFaceKey(meta.faceKey);
    if (faceKey !== undefined) {
      meta.faceKey = faceKey;
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

    // 构建 FSRSCard 运行时 DTO
    const card: FSRSCard = {
      // 标识
      id: dto.id,
      xiuyuanID: dto.xiuyuanID || asString(meta.xiuyuanID) || '', // 🆕 从 DTO 或 meta 中获取
      blockId: dto.blockId,
      faceKey,

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
      riffCardId: dto.riffCardId,
      schedulerMeta: dto.schedulerMeta,

      // 重新调度
      postponeCount: dto.postponeCount,
      lastPostponeDate: dto.lastPostponeDate,
      rescheduleHistory: dto.rescheduleHistory,

      // 重建的 meta
      meta: Object.keys(meta).length > 0 ? meta : undefined,
    };

    return canonicalizeSchedulingState(card, {
      source: 'card-mapper',
      mode: 'repair-external',
    }).card;
  }

  /**
   * 批量转换：FSRSCard 运行时 DTO → 持久化模型
   * 
   * @param cards FSRSCard 运行时 DTO 数组
   * @returns 持久化模型数组
   */
  static toPersistenceBatch(cards: FSRSCard[]): CardPersistenceDTO[] {
    return cards.map(card => this.toPersistence(card));
  }

  /**
   * 批量转换：持久化模型 → FSRSCard 运行时 DTO
   * 
   * @param dtos 持久化模型数组
   * @returns FSRSCard 运行时 DTO 数组
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
    const isFsrsScheduling = usesFsrsScheduling(dto);
    if (dto.stability < 0) errors.push('Invalid stability: must be non-negative');
    if (isFsrsScheduling && isReviewLikeState(dto.state) && dto.stability <= 0) {
      errors.push('Invalid stability: review memory must be positive');
    }
    if (dto.difficulty < 0 || dto.difficulty > 10) {
      errors.push('Invalid difficulty: must be between 0 and 10');
    } else if (isFsrsScheduling && dto.difficulty === 0 && !isValidEmptySchedulingMemory(dto)) {
      errors.push(isReviewLikeState(dto.state)
        ? 'Invalid difficulty: review memory must be between 1 and 10'
        : 'Invalid difficulty: empty memory requires unreviewed card state');
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

}

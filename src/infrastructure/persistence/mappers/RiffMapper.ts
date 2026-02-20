/**
 * RiffMapper - Riff 数据映射器
 * 
 * @module RiffMapper
 * @description
 * 负责将 Riff 系统的数据（RiffBlock）转换为领域模型（FSRSCard）。
 * 
 * **职责**：
 * - Riff 数据 → FSRSCard
 * - 处理 Riff 特有的字段映射
 * - 提取块属性（custom-card-type, custom-fsrs-a-factor, etc.）
 * 
 * @see RiffBlock
 * @see FSRSCard
 */

import type { FSRSCard, CardType, CardState } from '../../../types/card';
import type { RiffBlock } from '../../../core/siyuan/riff';

/**
 * Riff 映射器
 */
export class RiffMapper {
  /**
   * Riff 数据 → 领域模型
   * 
   * 映射规则：
   * 1. 基础字段：id, due, stability, difficulty, etc.
   * 2. 块属性：custom-card-type, custom-fsrs-a-factor, etc.
   * 3. 优先级：从块属性或默认值
   * 4. 类型检测：concept/descriptor/topic/item
   * 
   * @param riffBlock Riff 数据
   * @returns 领域模型
   */
  static toDomain(riffBlock: RiffBlock): FSRSCard {
    // 1. 提取块属性
    const ial = riffBlock.ial || {};
    const cardTypeAttr = ial['custom-card-type'];
    const cardTypeMarkerAttr = ial['custom-fsrs-card-type'];
    const aFactorAttr = ial['custom-fsrs-a-factor'];
    const priorityAttr = ial['custom-riff-priority'];

    // 2. 确定卡片类型
    let type: CardType = 'item'; // 默认
    let cardTypeMarker: 'concept' | 'descriptor' | undefined;

    if (cardTypeMarkerAttr === 'concept' || cardTypeMarkerAttr === 'descriptor') {
      // 用户手动标记的类型（优先级最高）
      cardTypeMarker = cardTypeMarkerAttr;
      type = cardTypeMarkerAttr as CardType;
    } else if (cardTypeAttr === 'topic' || cardTypeAttr === 'item' || 
               cardTypeAttr === 'concept' || cardTypeAttr === 'descriptor') {
      // 自动检测的类型
      type = cardTypeAttr as CardType;
    }

    // 3. 提取优先级
    const priority = priorityAttr ? parseInt(priorityAttr, 10) : 50;

    // 4. 提取 A-Factor（仅 Topic 卡片）
    const aFactor = type === 'topic' && aFactorAttr 
      ? parseFloat(aFactorAttr) 
      : undefined;

    // 5. 构建 FSRSCard
    const card: FSRSCard = {
      // 标识
      id: riffBlock.id,
      blockId: riffBlock.id,

      // FSRS 核心（从 Riff 数据提取）
      due: riffBlock.due || Date.now(),
      stability: riffBlock.stability || 0,
      difficulty: riffBlock.difficulty || 0,
      reps: riffBlock.reps || 0,
      lapses: riffBlock.lapses || 0,
      state: (riffBlock.state as CardState) || 0,
      lastReview: riffBlock.lastReview || 0,
      elapsedDays: riffBlock.elapsedDays || 0,
      scheduledDays: riffBlock.scheduledDays || 0,

      // 扩展功能
      priority,
      type,
      tags: [],
      cardTypeMarker,

      // 难点攻克
      leechCount: 0,
      isLeech: false,

      // 跳过/留言
      skipped: false,

      // 元数据
      createdAt: Date.now(),
      updatedAt: Date.now(),

      // Topic/Item
      aFactor,

      // 调度器
      schedulerType: type === 'topic' ? 'a-factor' : 'fsrs-v6',
      syncToRiff: true,
      riffCardId: riffBlock.id,

      // meta（保留原始 Riff 数据）
      meta: {
        riffBlock: riffBlock,
      },
    };

    return card;
  }

  /**
   * 批量转换：Riff 数据 → 领域模型
   * 
   * @param riffBlocks Riff 数据数组
   * @returns 领域模型数组
   */
  static toDomainBatch(riffBlocks: RiffBlock[]): FSRSCard[] {
    return riffBlocks.map(block => this.toDomain(block));
  }

  /**
   * 提取 Xiuyuan 相关属性
   * 
   * 从 Riff 块属性中提取 Xiuyuan 相关信息
   * 
   * @param riffBlock Riff 数据
   * @returns Xiuyuan 相关属性
   */
  static extractXiuyuanAttributes(riffBlock: RiffBlock): {
    xiuyuanID?: string;
    templateID?: string;
  } {
    const ial = riffBlock.ial || {};
    
    return {
      xiuyuanID: ial['custom-fsrs-xiuyuan-id'],
      templateID: ial['custom-fsrs-template-id'],
    };
  }

  /**
   * 判断是否为 Xiuyuan 卡片
   * 
   * @param riffBlock Riff 数据
   * @returns 是否为 Xiuyuan 卡片
   */
  static isXiuyuanCard(riffBlock: RiffBlock): boolean {
    const attrs = this.extractXiuyuanAttributes(riffBlock);
    return !!attrs.xiuyuanID;
  }
}

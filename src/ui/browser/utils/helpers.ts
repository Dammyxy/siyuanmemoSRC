/**
 * 浏览器辅助工具函数
 * 
 * 提供各种实用的帮助函数
 */

import type { BrowserCard } from '../types';

type BlockIdCarrier = {
  blockID?: unknown;
  blockId?: unknown;
  block_id?: unknown;
};

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 获取卡片的显示名称
 */
export function getCardDisplayName(card: BrowserCard): string {
  return card.content || card.blockId || card.id || 'Unknown';
}

/**
 * 检查卡片是否到期
 */
export function isCardDue(card: BrowserCard, now: Date = new Date()): boolean {
  return card.due <= now;
}

/**
 * 检查卡片是否逾期
 */
export function isCardOverdue(card: BrowserCard, now: Date = new Date()): boolean {
  return card.due < now && card.state !== 0; // 新卡不算逾期
}

/**
 * 按优先级分组卡片
 */
export function groupCardsByPriority(cards: BrowserCard[]): Record<string, BrowserCard[]> {
  const groups: Record<string, BrowserCard[]> = {
    high: [],    // 80-100
    medium: [],  // 40-79
    low: [],     // 0-39
  };

  for (const card of cards) {
    const priority = card.priority ?? 50;
    if (priority >= 80) {
      groups.high.push(card);
    } else if (priority >= 40) {
      groups.medium.push(card);
    } else {
      groups.low.push(card);
    }
  }

  return groups;
}

/**
 * 按状态分组卡片
 */
export function groupCardsByState(cards: BrowserCard[]): Record<string, BrowserCard[]> {
  const groups: Record<string, BrowserCard[]> = {
    new: [],
    learning: [],
    review: [],
    relearning: [],
  };

  for (const card of cards) {
    switch (card.state) {
      case 0:
        groups.new.push(card);
        break;
      case 1:
        groups.learning.push(card);
        break;
      case 2:
        groups.review.push(card);
        break;
      case 3:
        groups.relearning.push(card);
        break;
    }
  }

  return groups;
}

/**
 * 按卡片类型分组
 */
export function groupCardsByType(cards: BrowserCard[]): Record<string, BrowserCard[]> {
  const groups: Record<string, BrowserCard[]> = {
    topic: [],
    item: [],
    unknown: [],
  };

  for (const card of cards) {
    if (card.cardType === 'topic') {
      groups.topic.push(card);
    } else if (card.cardType === 'item') {
      groups.item.push(card);
    } else if (card.cardType === 'concept') {
      groups.concept = groups.concept || [];
      groups.concept.push(card);
    } else if (card.cardType === 'descriptor') {
      groups.descriptor = groups.descriptor || [];
      groups.descriptor.push(card);
    } else {
      groups.unknown.push(card);
    }
  }

  return groups;
}

/**
 * 计算卡片统计信息
 */
export interface CardStats {
  total: number;
  new: number;
  learning: number;
  review: number;
  relearning: number;
  due: number;
  overdue: number;
  suspended: number;
  avgInterval: number;
  avgDifficulty: number;
  avgRetrievability: number;
}

export function calculateCardStats(cards: BrowserCard[]): CardStats {
  const now = new Date();
  const stats: CardStats = {
    total: cards.length,
    new: 0,
    learning: 0,
    review: 0,
    relearning: 0,
    due: 0,
    overdue: 0,
    suspended: 0,
    avgInterval: 0,
    avgDifficulty: 0,
    avgRetrievability: 0,
  };

  if (cards.length === 0) return stats;

  let totalInterval = 0;
  let totalDifficulty = 0;
  let totalRetrievability = 0;
  let countInterval = 0;
  let countDifficulty = 0;
  let countRetrievability = 0;

  for (const card of cards) {
    // 状态统计
    switch (card.state) {
      case 0: stats.new++; break;
      case 1: stats.learning++; break;
      case 2: stats.review++; break;
      case 3: stats.relearning++; break;
    }

    // 到期统计
    if (isCardDue(card, now)) {
      stats.due++;
    }
    if (isCardOverdue(card, now)) {
      stats.overdue++;
    }

    // 暂停统计
    if (card.suspended) {
      stats.suspended++;
    }

    // 累加指标
    if (card.interval > 0) {
      totalInterval += card.interval;
      countInterval++;
    }
    if (typeof card.difficulty === 'number' && card.difficulty > 0) {
      totalDifficulty += card.difficulty;
      countDifficulty++;
    }
    if (typeof card.retrievability === 'number' && card.retrievability > 0) {
      totalRetrievability += card.retrievability;
      countRetrievability++;
    }
  }

  // 计算平均值
  stats.avgInterval = countInterval > 0 ? Math.round(totalInterval / countInterval) : 0;
  stats.avgDifficulty = countDifficulty > 0 ? Number((totalDifficulty / countDifficulty).toFixed(2)) : 0;
  stats.avgRetrievability = countRetrievability > 0 ? Number((totalRetrievability / countRetrievability).toFixed(2)) : 0;

  return stats;
}

/**
 * 排序卡片（多字段）
 */
export type SortField = 'priority' | 'due' | 'interval' | 'difficulty' | 'retrievability' | 'reps' | 'lapses';
export type SortOrder = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  order: SortOrder;
}

export function sortCards(cards: BrowserCard[], config: SortConfig): BrowserCard[] {
  const { field, order } = config;
  const multiplier = order === 'asc' ? 1 : -1;

  return [...cards].sort((a, b) => {
    let aVal = 0;
    let bVal = 0;

    switch (field) {
      case 'priority':
        aVal = a.priority ?? 50;
        bVal = b.priority ?? 50;
        break;
      case 'due':
        aVal = a.due.getTime();
        bVal = b.due.getTime();
        break;
      case 'interval':
        aVal = a.interval ?? 0;
        bVal = b.interval ?? 0;
        break;
      case 'difficulty':
        aVal = a.difficulty ?? 0;
        bVal = b.difficulty ?? 0;
        break;
      case 'retrievability':
        aVal = a.retrievability ?? 0;
        bVal = b.retrievability ?? 0;
        break;
      case 'reps':
        aVal = a.reps ?? 0;
        bVal = b.reps ?? 0;
        break;
      case 'lapses':
        aVal = a.lapses ?? 0;
        bVal = b.lapses ?? 0;
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return -1 * multiplier;
    if (aVal > bVal) return 1 * multiplier;
    return 0;
  });
}

/**
 * 过滤难点卡片（高遗忘率）
 */
export function filterLeechCards(cards: BrowserCard[], threshold: number = 8): BrowserCard[] {
  return cards.filter(card => (card.lapses ?? 0) >= threshold);
}

/**
 * 过滤暂停的卡片
 */
export function filterSuspendedCards(cards: BrowserCard[]): BrowserCard[] {
  return cards.filter(card => card.suspended);
}

/**
 * 过滤活跃的卡片（未暂停）
 */
export function filterActiveCards(cards: BrowserCard[]): BrowserCard[] {
  return cards.filter(card => !card.suspended);
}

/**
 * 批量更新卡片属性
 */
export function batchUpdateCards(
  cards: BrowserCard[],
  updates: Partial<BrowserCard>
): BrowserCard[] {
  return cards.map(card => ({ ...card, ...updates }));
}

/**
 * 去重卡片（按 ID）
 */
export function deduplicateCards(cards: BrowserCard[]): BrowserCard[] {
  const seen = new Set<string>();
  const result: BrowserCard[] = [];

  for (const card of cards) {
    const id = card.id || card.fsrsCardId || card.blockId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(card);
  }

  return result;
}

/**
 * 提取 blockId（兼容多种字段名）
 */
export function extractBlockId(item: unknown): string {
  if (!isObjectLike(item)) {
    return '';
  }
  const candidate = item as BlockIdCarrier;
  return String(candidate.blockID || candidate.blockId || candidate.block_id || '');
}

/**
 * 批量提取 blockIds
 */
export function extractBlockIds(items: unknown[]): string[] {
  return items.map(extractBlockId).filter(Boolean);
}

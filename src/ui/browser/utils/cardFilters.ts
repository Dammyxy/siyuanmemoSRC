/**
 * 卡片筛选工具函数
 * 
 * 提供卡片筛选相关的纯函数
 */

import type { BrowserCard, CardTypeFilter } from '@/types/browser';
export type { NumberCondition } from '@/types/browser';
export { checkNumberCondition, matchesParsedQuery } from '@/types/browser';

/**
 * 提取 SQL 语句（如果输入是 SQL 模式）
 * 
 * @param input - 输入字符串
 * @returns SQL 语句或 null
 */
export function extractSqlStatement(input: string): string | null {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;
  
  const lowerInput = trimmed.toLowerCase();
  
  // 检查是否以 SQL 关键字开头
  if (
    lowerInput.startsWith('select ') ||
    lowerInput.startsWith('with ')
  ) {
    return trimmed;
  }
  
  return null;
}

/**
 * 筛选预设类型
 */
export type PresetType = 'all' | 'due' | 'overdue' | 'leech' | 'new' | 'learning' | 'suspended';

/**
 * 应用预设筛选
 * 
 * @param cards - 卡片数组
 * @param preset - 预设类型
 * @returns 筛选后的卡片数组
 */
export function applyPresetFilter(cards: BrowserCard[], preset: PresetType): BrowserCard[] {
  switch (preset) {
    case 'all':
      return cards;
    
    case 'due': {
      const now = Date.now();
      return cards.filter(card => card.due.getTime() <= now);
    }
    
    case 'overdue': {
      const now = Date.now();
      return cards.filter(card => card.due.getTime() < now && card.state !== 0);
    }
    
    case 'leech':
      return cards.filter(card => (card.lapses ?? 0) >= 8);
    
    case 'new':
      return cards.filter(card => card.state === 0);
    
    case 'learning':
      return cards.filter(card => card.state === 1);
    
    case 'suspended':
      return cards.filter(card => card.suspended);
    
    default:
      return cards;
  }
}

/**
 * 应用卡片类型筛选
 * 
 * @param cards - 卡片数组
 * @param cardType - 卡片类型筛选
 * @returns 筛选后的卡片数组
 */
export function applyCardTypeFilter(cards: BrowserCard[], cardType: CardTypeFilter): BrowserCard[] {
  switch (cardType) {
    case 'all':
      return cards;
    
    case 'topic-only':
      // 只显示明确标记为 topic 的卡片
      return cards.filter(card => card.cardType === 'topic');
    
    case 'item-only':
      // 显示 item 卡片，缺失 cardType 的卡片默认为 item
      return cards.filter(card => card.cardType === 'item' || !card.cardType);
    
    case 'concept-only':
      // 只显示概念卡
      return cards.filter(card => card.cardType === 'concept');
    
    case 'descriptor-only':
      // 只显示描述符卡
      return cards.filter(card => card.cardType === 'descriptor');

    case 'missing-block-only':
      // 只显示块已不存在的卡片（由 DataAccessFacade 标记）
      return cards.filter(card => (card.meta as { blockType?: unknown } | undefined)?.blockType === 'missing');
    
    default:
      return cards;
  }
}

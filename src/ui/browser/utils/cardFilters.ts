/**
 * 卡片筛选工具函数
 * 
 * 提供卡片筛选相关的纯函数
 */

import type { BrowserCard, CardState } from '../types';
import type { ParsedBrowserQuery } from '../browserService';

/**
 * 数值条件接口
 */
export interface NumberCondition {
  operator: '<' | '>' | '<=' | '>=' | '=' | '!=';
  value: number;
}

/**
 * 检查数值是否满足条件
 * 
 * @param actualValue - 实际值
 * @param conditions - 条件数组
 * @returns 是否满足所有条件
 */
export function checkNumberCondition(actualValue: number, conditions: NumberCondition[]): boolean {
  if (!conditions || conditions.length === 0) return true;

  return conditions.every((cond) => {
    switch (cond.operator) {
      case '<': return actualValue < cond.value;
      case '>': return actualValue > cond.value;
      case '<=': return actualValue <= cond.value;
      case '>=': return actualValue >= cond.value;
      case '=': return actualValue === cond.value;
      case '!=': return actualValue !== cond.value;
      default: return true;
    }
  });
}

/**
 * 检查卡片是否匹配查询条件
 * 
 * @param card - 卡片数据
 * @param parsed - 解析后的查询条件
 * @returns 是否匹配
 */
export function matchesParsedQuery(card: BrowserCard, parsed: ParsedBrowserQuery): boolean {
  // Deck 筛选
  if (parsed.decks.length && !parsed.decks.includes(card.deckId)) {
    return false;
  }

  // 状态筛选
  if (parsed.states.length && !parsed.states.includes(card.state as CardState)) {
    return false;
  }

  // 文档筛选
  if (parsed.docs.length && (!card.rootId || !parsed.docs.includes(card.rootId))) {
    return false;
  }

  // 标签筛选
  if (parsed.tags.length) {
    const tags = card.tags || [];
    for (const t of parsed.tags) {
      if (!tags.includes(t)) {
        return false;
      }
    }
  }

  // 文本搜索
  if (parsed.text) {
    const q = parsed.text.toLowerCase();
    const hay = (card.fullContent || card.content || '').toLowerCase();
    if (!hay.includes(q)) {
      return false;
    }
  }

  // FSRS 参数数值比较筛选
  const conds = parsed.conditions || {};
  
  if (conds.priority && !checkNumberCondition(card.priority ?? 50, conds.priority)) {
    return false;
  }
  
  if (conds.interval && !checkNumberCondition(card.interval ?? 0, conds.interval)) {
    return false;
  }
  
  if (conds.reps && !checkNumberCondition(card.reps ?? 0, conds.reps)) {
    return false;
  }
  
  if (conds.lapses && !checkNumberCondition(card.lapses ?? 0, conds.lapses)) {
    return false;
  }
  
  if (conds.difficulty && card.difficulty !== undefined && !checkNumberCondition(card.difficulty, conds.difficulty)) {
    return false;
  }
  
  if (conds.retrievability && card.retrievability !== undefined && !checkNumberCondition(card.retrievability, conds.retrievability)) {
    return false;
  }
  
  if (conds.stability && card.stability !== undefined && !checkNumberCondition(card.stability, conds.stability)) {
    return false;
  }

  return true;
}

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
 * 卡片类型筛选
 */
export type CardTypeFilter = 'all' | 'topic-only' | 'item-only';

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
      return cards.filter(card => card.cardType === 'topic');
    
    case 'item-only':
      return cards.filter(card => card.cardType === 'item');
    
    default:
      return cards;
  }
}

/**
 * CardFilterService - 卡片过滤领域服务
 * 
 * 职责：
 * - 按状态过滤卡片
 * - 按卡片类型过滤卡片
 * - 按搜索文本过滤卡片
 * - 按标签过滤卡片
 * - 统计卡片数量
 * 
 * 设计原则：
 * - 单一职责：只负责卡片过滤相关的业务逻辑
 * - 无状态：所有方法都是纯函数
 * - 领域层：不依赖基础设施层
 * 
 * @see .kiro/specs/ddd-refactoring/browser-ddd-migration.md - Phase 1
 */

import type { Card } from '@/services/StorageManager';
import { CardState } from './CardScheduleService';

/**
 * CardFilterService 类
 * 
 * 提供卡片过滤相关的业务逻辑。
 * 
 * 使用示例：
 * ```typescript
 * const service = new CardFilterService();
 * 
 * // 按状态过滤
 * const newCards = service.filterByStates(allCards, [CardState.New]);
 * 
 * // 按卡片类型过滤
 * const conceptCards = service.filterByCardTypes(allCards, ['concept']);
 * 
 * // 按搜索文本过滤
 * const searchResults = service.filterBySearchText(allCards, 'DDD');
 * 
 * // 统计指定状态的卡片数量
 * const newCount = service.countByState(allCards, CardState.New);
 * ```
 */
export class CardFilterService {
  /**
   * 按状态过滤卡片
   * 
   * @param cards - 卡片列表
   * @param states - 要过滤的状态列表
   * @returns 匹配指定状态的卡片列表
   */
  filterByStates(cards: Card[], states: CardState[]): Card[] {
    if (!states || states.length === 0) {
      return cards;
    }
    
    const stateSet = new Set(states);
    return cards.filter(card => stateSet.has(card.state as CardState));
  }
  
  /**
   * 按卡片类型过滤
   * 
   * @param cards - 卡片列表
   * @param cardTypes - 要过滤的卡片类型列表
   * @returns 匹配指定类型的卡片列表
   */
  filterByCardTypes(cards: Card[], cardTypes: string[]): Card[] {
    if (!cardTypes || cardTypes.length === 0) {
      return cards;
    }
    
    const typeSet = new Set(cardTypes);
    return cards.filter(card => {
      const cardType = card.type || '';
      return typeSet.has(cardType);
    });
  }
  
  /**
   * 按搜索文本过滤
   * 
   * 搜索范围：
   * - 卡片内容（meta.content）
   * - 块 ID
   * 
   * @param cards - 卡片列表
   * @param searchText - 搜索文本
   * @returns 匹配搜索文本的卡片列表
   */
  filterBySearchText(cards: Card[], searchText: string): Card[] {
    if (!searchText || searchText.trim() === '') {
      return cards;
    }
    
    const lowerSearch = searchText.toLowerCase().trim();
    
    return cards.filter(card => {
      // 搜索内容
      const content = (card.meta?.content as string || '').toLowerCase();
      if (content.includes(lowerSearch)) {
        return true;
      }
      
      // 搜索块 ID
      const blockId = card.blockId.toLowerCase();
      if (blockId.includes(lowerSearch)) {
        return true;
      }
      
      return false;
    });
  }
  
  /**
   * 按标签过滤
   * 
   * @param cards - 卡片列表
   * @param tags - 要过滤的标签列表
   * @param matchAll - 是否需要匹配所有标签（默认为 false，匹配任意一个即可）
   * @returns 匹配指定标签的卡片列表
   */
  filterByTags(cards: Card[], tags: string[], matchAll: boolean = false): Card[] {
    if (!tags || tags.length === 0) {
      return cards;
    }
    
    const tagSet = new Set(tags);
    
    return cards.filter(card => {
      const cardTags = (card.meta?.tags as string[]) || [];
      
      if (matchAll) {
        // 需要匹配所有标签
        return tags.every(tag => cardTags.includes(tag));
      } else {
        // 匹配任意一个标签即可
        return cardTags.some(tag => tagSet.has(tag));
      }
    });
  }
  
  /**
   * 按 Deck ID 过滤
   * 
   * @param cards - 卡片列表
   * @param deckIds - 要过滤的 Deck ID 列表
   * @returns 匹配指定 Deck 的卡片列表
   */
  filterByDeckIds(cards: Card[], deckIds: string[]): Card[] {
    if (!deckIds || deckIds.length === 0) {
      return cards;
    }
    
    const deckIdSet = new Set(deckIds);
    return cards.filter(card => {
      const deckId = (card.meta?.deckId as string) || '';
      return deckIdSet.has(deckId);
    });
  }
  
  /**
   * 统计指定状态的卡片数量
   * 
   * @param cards - 卡片列表
   * @param state - 卡片状态
   * @returns 指定状态的卡片数量
   */
  countByState(cards: Card[], state: CardState): number {
    return cards.filter(card => card.state === state).length;
  }
  
  /**
   * 统计指定类型的卡片数量
   * 
   * @param cards - 卡片列表
   * @param cardType - 卡片类型
   * @returns 指定类型的卡片数量
   */
  countByCardType(cards: Card[], cardType: string): number {
    return cards.filter(card => card.type === cardType).length;
  }
  
  /**
   * 组合过滤器
   * 
   * 按照指定的条件组合过滤卡片。
   * 
   * @param cards - 卡片列表
   * @param filters - 过滤条件
   * @returns 过滤后的卡片列表
   */
  applyFilters(
    cards: Card[],
    filters: {
      states?: CardState[];
      cardTypes?: string[];
      searchText?: string;
      tags?: string[];
      deckIds?: string[];
    }
  ): Card[] {
    let result = cards;
    
    if (filters.states) {
      result = this.filterByStates(result, filters.states);
    }
    
    if (filters.cardTypes) {
      result = this.filterByCardTypes(result, filters.cardTypes);
    }
    
    if (filters.searchText) {
      result = this.filterBySearchText(result, filters.searchText);
    }
    
    if (filters.tags) {
      result = this.filterByTags(result, filters.tags);
    }
    
    if (filters.deckIds) {
      result = this.filterByDeckIds(result, filters.deckIds);
    }
    
    return result;
  }
}

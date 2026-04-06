/**
 * CardFilterService - 卡片过滤领域服务
 * 
 * 职责:
 * - 按状态过滤卡片
 * - 按卡片类型过滤卡片
 * - 按搜索文本过滤卡片
 * - 按标签过滤卡片
 * - 统计卡片数量
 * - 高级过滤(用于 DataAccessFacade)
 * 
 * 设计原则:
 * - 单一职责:只负责卡片过滤相关的业务逻辑
 * - 无状态:所有方法都是纯函数
 * - 领域层:不依赖基础设施层
 * 
 * @see .kiro/specs/ddd-refactoring/browser-ddd-migration.md - Phase 1
 */

import type { FSRSCard } from '@/types/card';
import { CardState } from './CardScheduleService';
import { createLogger } from '@/utils/logger';

const logger = createLogger('CardFilterService');

// 为了向后兼容,创建 Card 类型别名
type Card = FSRSCard;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readMetaString(card: Card, key: string): string {
  if (!isRecord(card.meta)) {
    return '';
  }
  const value = card.meta[key];
  return typeof value === 'string' ? value : '';
}

/**
 * CardFilterService 类
 * 
 * 提供卡片过滤相关的业务逻辑。
 */
export class CardFilterService {
  /**
   * 按状态过滤卡片
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
   */
  filterByCardTypes(cards: Card[], cardTypes: string[]): Card[] {
    if (!cardTypes || cardTypes.length === 0) {
      return cards;
    }
    
    // 统计所有卡片的类型分布
    const typeDistribution = new Map<string, number>();
    cards.forEach(c => {
      const type = c.type || '(empty)';
      typeDistribution.set(type, (typeDistribution.get(type) || 0) + 1);
    });
    
    logger.debug('filterByCardTypes called', {
      inputCount: cards.length,
      requestedTypes: cardTypes,
      typeDistribution: Object.fromEntries(typeDistribution),
      sampleCards: cards.slice(0, 3).map(c => ({ 
        blockId: c.blockId, 
        type: c.type,
        meta: c.meta ? { cardType: readMetaString(c, 'cardType') } : null
      })),
    });
    
    const typeSet = new Set(cardTypes);
    const filtered = cards.filter(card => {
      // ✅ 修复：同时检查 Card.type 和 Card.meta.cardType
      // 原因：卡片类型可能存储在 meta.cardType 中
      const cardType = card.type || '';
      if (typeSet.has(cardType)) {
        return true;
      }
      
      // 检查 meta.cardType
      const metaCardType = readMetaString(card, 'cardType');
      return typeSet.has(metaCardType);
    });
    
    logger.debug('filterByCardTypes result', {
      outputCount: filtered.length,
      matchedTypes: [...new Set(filtered.map(c => c.type || readMetaString(c, 'cardType')))],
    });
    
    return filtered;
  }
  
  /**
   * 按搜索文本过滤
   */
  filterBySearchText(cards: Card[], searchText: string): Card[] {
    if (!searchText || searchText.trim() === '') {
      return cards;
    }
    
    const lowerSearch = searchText.toLowerCase().trim();
    
    return cards.filter(card => {
      const content = (card.meta?.content as string || '').toLowerCase();
      if (content.includes(lowerSearch)) {
        return true;
      }
      
      const blockId = card.blockId.toLowerCase();
      if (blockId.includes(lowerSearch)) {
        return true;
      }
      
      return false;
    });
  }
  
  /**
   * 按标签过滤
   */
  filterByTags(cards: Card[], tags: string[], matchAll: boolean = false): Card[] {
    if (!tags || tags.length === 0) {
      return cards;
    }
    
    const tagSet = new Set(tags);
    
    return cards.filter(card => {
      const cardTags = (card.meta?.tags as string[]) || [];
      
      if (matchAll) {
        return tags.every(tag => cardTags.includes(tag));
      } else {
        return cardTags.some(tag => tagSet.has(tag));
      }
    });
  }
  
  /**
   * 按 Deck ID 过滤
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
   */
  countByState(cards: Card[], state: CardState): number {
    return cards.filter(card => card.state === state).length;
  }
  
  /**
   * 统计指定类型的卡片数量
   */
  countByCardType(cards: Card[], cardType: string): number {
    return cards.filter(card => card.type === cardType).length;
  }
  
  /**
   * 组合过滤器
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
  
  // ========================================================================
  // 高级过滤方法(用于 DataAccessFacade)
  // ========================================================================
  
  /**
   * 按块 ID 过滤
   */
  filterByBlockIds(cards: Card[], blockIds: string[]): Card[] {
    if (!blockIds || blockIds.length === 0) {
      return cards;
    }
    
    const blockIdSet = new Set(blockIds);
    return cards.filter(card => blockIdSet.has(card.blockId));
  }

  /**
   * 按文档 rootId 过滤
   */
  filterByDocIds(cards: Card[], docIds: string[]): Card[] {
    if (!docIds || docIds.length === 0) {
      return cards;
    }

    const docIdSet = new Set(
      docIds
        .map((docId) => String(docId || '').trim())
        .filter((docId) => docId.length > 0)
    );

    if (docIdSet.size === 0) {
      return cards;
    }

    return cards.filter((card) => {
      const rootId = readMetaString(card, 'rootId')
        || readMetaString(card, 'rootID')
        || readMetaString(card, 'root_id');
      return rootId.length > 0 && docIdSet.has(rootId);
    });
  }
  
  /**
   * 按到期日期过滤
   */
  filterByDueDate(
    cards: Card[],
    dueDate: { lte?: Date; gte?: Date },
    dayEnd?: number
  ): Card[] {
    return cards.filter(card => {
      const cardDueDate = new Date(card.due);
      
      if (dueDate.lte) {
        const endTime = dayEnd || dueDate.lte.getTime();
        if (card.due > endTime) {
          return false;
        }
      }
      
      if (dueDate.gte) {
        const filterGteOnly = new Date(dueDate.gte);
        filterGteOnly.setHours(0, 0, 0, 0);
        
        if (cardDueDate < filterGteOnly) {
          return false;
        }
      }
      
      return true;
    });
  }
  
  /**
   * 按优先级过滤
   */
  filterByPriority(cards: Card[], priority: { min?: number; max?: number }): Card[] {
    return cards.filter(card => {
      const cardPriority = card.priority;
      
      if (priority.min !== undefined && cardPriority < priority.min) {
        return false;
      }
      
      if (priority.max !== undefined && cardPriority > priority.max) {
        return false;
      }
      
      return true;
    });
  }
  
  /**
   * 按复习次数过滤
   */
  filterByRepetitions(cards: Card[], repetitions: { min?: number; max?: number }): Card[] {
    return cards.filter(card => {
      const reps = card.reps;
      
      if (repetitions.min !== undefined && reps < repetitions.min) {
        return false;
      }
      
      if (repetitions.max !== undefined && reps > repetitions.max) {
        return false;
      }
      
      return true;
    });
  }
  
  /**
   * 按遗忘次数过滤
   */
  filterByLapses(cards: Card[], lapses: { min?: number; max?: number }): Card[] {
    return cards.filter(card => {
      const cardLapses = card.lapses;
      
      if (lapses.min !== undefined && cardLapses < lapses.min) {
        return false;
      }
      
      if (lapses.max !== undefined && cardLapses > lapses.max) {
        return false;
      }
      
      return true;
    });
  }
  
  /**
   * 按间隔天数过滤
   */
  filterByInterval(cards: Card[], interval: { min?: number; max?: number }): Card[] {
    const now = new Date();
    
    return cards.filter(card => {
      const dueDate = new Date(card.due);
      const intervalDays = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      if (interval.min !== undefined && intervalDays < interval.min) {
        return false;
      }
      
      if (interval.max !== undefined && intervalDays > interval.max) {
        return false;
      }
      
      return true;
    });
  }
  
  /**
   * 按上次复习日期过滤
   */
  filterByLastReview(cards: Card[], lastReview: { lte?: Date; gte?: Date }): Card[] {
    return cards.filter(card => {
      const lastReviewDate = new Date(card.updatedAt);
      
      if (lastReview.lte && lastReviewDate > lastReview.lte) {
        return false;
      }
      
      if (lastReview.gte && lastReviewDate < lastReview.gte) {
        return false;
      }
      
      return true;
    });
  }
  
  /**
   * 按难度过滤
   */
  filterByDifficulty(cards: Card[], difficulty: { min?: number; max?: number }): Card[] {
    return cards.filter(card => {
      const cardDifficulty = card.difficulty;
      
      if (difficulty.min !== undefined && cardDifficulty < difficulty.min) {
        return false;
      }
      
      if (difficulty.max !== undefined && cardDifficulty > difficulty.max) {
        return false;
      }
      
      return true;
    });
  }
  
  /**
   * 按稳定性过滤
   */
  filterByStability(cards: Card[], stability: { min?: number; max?: number }): Card[] {
    return cards.filter(card => {
      const cardStability = card.stability;
      
      if (stability.min !== undefined && cardStability < stability.min) {
        return false;
      }
      
      if (stability.max !== undefined && cardStability > stability.max) {
        return false;
      }
      
      return true;
    });
  }
  
  /**
   * 按可提取性过滤
   */
  filterByRetrievability(cards: Card[], retrievability: { min?: number; max?: number }): Card[] {
    const now = new Date();
    
    return cards.filter(card => {
      const lastReview = new Date(card.updatedAt);
      const elapsedDays = (now.getTime() - lastReview.getTime()) / (1000 * 60 * 60 * 24);
      const cardRetrievability = Math.exp(-elapsedDays / card.stability);
      
      if (retrievability.min !== undefined && cardRetrievability < retrievability.min) {
        return false;
      }
      
      if (retrievability.max !== undefined && cardRetrievability > retrievability.max) {
        return false;
      }
      
      return true;
    });
  }
  
  /**
   * 按卡片状态过滤
   */
  filterByCardStatus(cards: Card[], cardStatus: Array<'new' | 'learning' | 'review' | 'relearning'>): Card[] {
    if (!cardStatus || cardStatus.length === 0) {
      return cards;
    }
    
    return cards.filter(card => {
      let status: 'new' | 'learning' | 'review' | 'relearning';
      
      switch (card.state) {
        case 0:
          status = 'new';
          break;
        case 1:
          status = 'learning';
          break;
        case 2:
          status = 'review';
          break;
        case 3:
          status = 'relearning';
          break;
        default:
          status = 'new';
      }
      
      return cardStatus.includes(status);
    });
  }
  
  /**
   * 按关键词过滤(搜索卡片内容)
   */
  filterByKeyword(cards: Card[], keyword: string): Card[] {
    if (!keyword || keyword.trim() === '') {
      return cards;
    }
    
    const lowerKeyword = keyword.trim().toLowerCase();
    
    return cards.filter(card => {
      const content = (card.meta?.content as string || '').toLowerCase();
      if (content.includes(lowerKeyword)) {
        return true;
      }
      
      const title = (card.meta?.title as string || '').toLowerCase();
      if (title.includes(lowerKeyword)) {
        return true;
      }
      
      const blockId = card.blockId || '';
      if (blockId.includes(lowerKeyword)) {
        return true;
      }
      
      return false;
    });
  }
  
  /**
   * 过滤无效的块 ID
   */
  filterValidBlockIds(cards: Card[]): Card[] {
    return cards.filter(card => 
      card.blockId && 
      card.blockId !== 'undefined' && 
      card.blockId !== ''
    );
  }


    /**
     * 按文档 ID 过滤（根文档 ID）
     *
     * @param cards - 卡片列表
     * @param docId - 文档 ID（根文档 ID）
     * @returns 过滤后的卡片列表
     */
    filterByDocId(cards: Card[], docId: string): Card[] {
      if (!docId) {
        return cards;
      }

      logger.debug('filterByDocId called', {
        inputCount: cards.length,
        docId,
        sampleCards: cards.slice(0, 3).map(c => ({
          blockId: c.blockId,
          rootId: readMetaString(c, 'rootId')
        })),
      });

      const filtered = cards.filter(card => {
        const cardRootId = readMetaString(card, 'rootId');
        return cardRootId === docId;
      });

      logger.debug('filterByDocId result', {
        outputCount: filtered.length,
        matchedRootIds: [...new Set(filtered.map(c => readMetaString(c, 'rootId')))],
      });

      return filtered;
    }

}

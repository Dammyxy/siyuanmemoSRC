/**
 * GetBrowserCardsQueryHandler - 获取浏览器卡片查询处理器
 * 
 * 职责：
 * - 执行获取浏览器卡片的查询
 * - 使用领域服务进行过滤和排序
 * - 转换数据格式为 BrowserCard
 * - 计算统计信息
 * 
 * 设计原则：
 * - 应用层：协调领域服务和基础设施层
 * - 不包含业务逻辑：委托给领域服务
 * - 数据转换：将领域对象转换为 DTO
 * 
 * @see .kiro/specs/ddd-refactoring/browser-ddd-migration.md - Phase 2
 */

import type { StorageManager } from '@/core/storage/manager';
import { CardScheduleService, CardState } from '@/core/card/domain/services/CardScheduleService';
import { CardFilterService } from '@/core/card/domain/services/CardFilterService';
import { CardSortService } from '@/core/card/domain/services/CardSortService';
import type { FSRSCard } from '@/types';
import type {
  GetBrowserCardsQuery,
  GetBrowserCardsQueryResult,
  BrowserCard,
  BrowserStats,
  PresetFilter,
} from './GetBrowserCardsQuery';
import { sql } from '@/core/siyuan/api';
import {
  ATTR_PRIORITY,
  ATTR_SUSPENDED,
  ATTR_CARD_TYPE,
  ATTR_A_FACTOR,
} from '@/core/siyuan/block';
import {
  calculateRetrievability,
  formatDueDate,
  formatHistoryDate,
  truncateContent,
  STATE_LABELS,
} from '@/ui/browser/types';

/**
 * GetBrowserCardsQueryHandler 类
 * 
 * 处理获取浏览器卡片的查询请求。
 * 
 * 使用示例：
 * ```typescript
 * const handler = new GetBrowserCardsQueryHandler(
 *   storageManager,
 *   cardScheduleService,
 *   cardFilterService,
 *   cardSortService
 * );
 * 
 * const result = await handler.execute({
 *   searchText: 'DDD',
 *   preset: 'due',
 *   sortBy: 'due',
 *   sortOrder: 'asc',
 *   page: 1,
 *   pageSize: 100,
 * });
 * ```
 */
export class GetBrowserCardsQueryHandler {
  constructor(
    private readonly storageManager: StorageManager,
    private readonly cardScheduleService: CardScheduleService,
    private readonly cardFilterService: CardFilterService,
    private readonly cardSortService: CardSortService
  ) {}
  
  /**
   * 执行查询
   * 
   * @param query - 查询对象
   * @returns 查询结果
   */
  async execute(query: GetBrowserCardsQuery): Promise<GetBrowserCardsQueryResult> {
    // 1. 获取所有卡片（使用新架构 UnifiedStorageManager）
    // ✅ 修复：UnifiedStorageManager 实现了 StorageManager 接口
    // getAllCards() 返回内存中的最新数据（已经通过 updateCard 更新）
    const allCards = this.storageManager.getAllCards();
    
    console.log('[GetBrowserCardsQueryHandler] getAllCards returned:', {
      totalCards: allCards.length,
      sampleCard: allCards[0] ? {
        id: allCards[0].id,
        priority: allCards[0].priority,
      } : null,
    });
    
    // 🔍 调试：打印查询参数
    console.log('[GetBrowserCardsQueryHandler] 🔍 Query parameters:', {
      preset: query.preset,
      cardTypes: query.cardTypes,
      searchText: query.searchText,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    
    // 2. 计算统计信息（基于所有卡片）
    const stats = this.calculateStats(allCards);
    
    // 3. 应用预设过滤器（领域层）
    let filteredCards = this.applyPresetFilter(allCards, query.preset);
    console.log('[GetBrowserCardsQueryHandler] 🔍 After preset filter:', filteredCards.length);
    
    // 4. 应用自定义过滤器（领域层）
    console.log('[GetBrowserCardsQueryHandler] 🔍 Applying custom filters:', {
      states: query.states,
      cardTypes: query.cardTypes,
      searchText: query.searchText,
      tags: query.tags,
      deckIds: query.deckIds,
      docId: query.docId,
    });
    filteredCards = this.cardFilterService.applyFilters(filteredCards, {
      states: query.states,
      cardTypes: query.cardTypes,
      searchText: query.searchText,
      tags: query.tags,
      deckIds: query.deckIds,
    });
    console.log('[GetBrowserCardsQueryHandler] 🔍 After custom filters:', filteredCards.length);
    
    // 5. 应用文档过滤（领域层）
    // ⚠️ 重要：文档筛选需要 rootId，必须先填充
    if (query.docId) {
      console.log('[GetBrowserCardsQueryHandler] 🔍 Applying document filter:', query.docId);
      
      // 🔧 先填充 rootId（批量查询）
      const cardsNeedingRootId = filteredCards.filter(c => !(c.meta as any)?.rootId);
      if (cardsNeedingRootId.length > 0) {
        console.log('[GetBrowserCardsQueryHandler] 🔧 Filling rootId for', cardsNeedingRootId.length, 'cards before document filter');
        await this.fillRootIds(cardsNeedingRootId);
      }
      
      // 然后应用文档筛选
      filteredCards = this.cardFilterService.filterByDocId(filteredCards, query.docId);
      console.log('[GetBrowserCardsQueryHandler] 🔍 After document filter:', filteredCards.length);
    }
    
    // 6. 排序（领域层）
    const sortedCards = this.cardSortService.sort(
      filteredCards,
      query.sortBy || 'due',
      query.sortOrder || 'asc'
    );
    
    // 7. 分页
    const page = query.page || 1;
    const pageSize = query.pageSize || 100;
    const startIndex = (page - 1) * pageSize;
    const paginatedCards = sortedCards.slice(startIndex, startIndex + pageSize);
    
    // 8. 转换为 BrowserCard 格式
    const browserCards = await this.transformToBrowserCards(paginatedCards);
    
    return {
      cards: browserCards,
      total: sortedCards.length,
      page,
      pageSize,
      stats,
    };
  }
  
  /**
   * 应用预设过滤器
   * 
   * @param cards - 卡片列表
   * @param preset - 预设过滤器
   * @returns 过滤后的卡片列表
   */
  private applyPresetFilter(cards: FSRSCard[], preset?: PresetFilter): FSRSCard[] {
    if (!preset || preset === 'all') {
      return cards;
    }
    
    switch (preset) {
      case 'due':
        return this.cardScheduleService.filterDueCards(cards);
        
      case 'new':
        return this.cardFilterService.filterByStates(cards, [CardState.New]);
        
      case 'learning':
        return this.cardFilterService.filterByStates(cards, [CardState.Learning]);
        
      case 'review':
        return this.cardFilterService.filterByStates(cards, [CardState.Review]);
        
      case 'suspended':
        // 暂停状态需要从块属性中获取
        return cards.filter(card => {
          // 这里简化处理，实际应该从块属性中读取
          // 在 transformToBrowserCards 中会正确处理
          return card.state === CardState.Suspended;
        });
        
      default:
        return cards;
    }
  }
  
  /**
   * 计算统计信息
   * 
   * @param cards - 所有卡片
   * @returns 统计信息
   */
  private calculateStats(cards: FSRSCard[]): BrowserStats {
    return {
      totalCards: cards.length,
      dueCards: this.cardScheduleService.countDueCards(cards),
      newCards: this.cardFilterService.countByState(cards, CardState.New),
      learningCards: this.cardFilterService.countByState(cards, CardState.Learning),
      reviewCards: this.cardFilterService.countByState(cards, CardState.Review),
      suspendedCards: this.cardFilterService.countByState(cards, CardState.Suspended),
    };
  }
  
  /**
   * 填充卡片的 rootId（用于文档筛选）
   * 
   * @param cards - 需要填充 rootId 的卡片列表
   */
  private async fillRootIds(cards: FSRSCard[]): Promise<void> {
    if (cards.length === 0) {
      return;
    }
    
    const blockIds = cards.map(c => c.blockId);
    
    try {
      // 批量查询 rootId
      const BATCH_SIZE = 500;
      for (let i = 0; i < blockIds.length; i += BATCH_SIZE) {
        const batchIds = blockIds.slice(i, i + BATCH_SIZE);
        const idsStr = batchIds.map(id => `'${id}'`).join(',');
        
        const query = `
          SELECT id, root_id
          FROM blocks
          WHERE id IN (${idsStr})
        `;
        
        const result = await sql(query);
        
        // 创建 blockId -> rootId 的映射
        const rootIdMap = new Map<string, string>();
        for (const row of result) {
          rootIdMap.set(row.id, row.root_id || '');
        }
        
        // 填充到卡片的 meta.rootId
        for (const card of cards) {
          const rootId = rootIdMap.get(card.blockId);
          if (rootId) {
            if (!card.meta) {
              card.meta = {};
            }
            (card.meta as any).rootId = rootId;
          }
        }
      }
      
      console.log('[GetBrowserCardsQueryHandler] ✅ Filled rootId for', cards.length, 'cards');
    } catch (error) {
      console.error('[GetBrowserCardsQueryHandler] Failed to fill rootIds:', error);
    }
  }
  
  /**
   * 转换为 BrowserCard 格式
   * 
   * @param cards - FSRS 卡片列表
   * @returns BrowserCard 列表
   */
  private async transformToBrowserCards(cards: FSRSCard[]): Promise<BrowserCard[]> {
    if (cards.length === 0) {
      return [];
    }
    
    // 批量获取块属性
    const blockIds = cards.map(c => c.blockId);
    const { attrsMap, rootIdMap, tagsMap, contentMap } = await this.fetchBlockInfoBatched(blockIds);
    
    // 转换为 BrowserCard
    return cards.map(card => {
      const customAttrs = attrsMap.get(card.blockId) || {};
      const browserCard = this.transformFSRSCard(card, customAttrs);
      browserCard.rootId = rootIdMap.get(card.blockId) || '';
      browserCard.tags = tagsMap.get(card.blockId) || [];
      
      // 处理文档块内容
      const currentContent = (browserCard.fullContent || '').replace(/[\s\u200B]/g, '');
      const dbContent = contentMap.get(card.blockId);
      if (!currentContent && dbContent) {
        browserCard.fullContent = dbContent;
        browserCard.content = truncateContent(dbContent, 100);
      }
      
      return browserCard;
    });
  }
  
  /**
   * 将 FSRSCard 转换为 BrowserCard
   * 
   * @param card - FSRS 卡片
   * @param customAttrs - 自定义属性
   * @returns BrowserCard
   */
  private transformFSRSCard(card: FSRSCard, customAttrs: Record<string, string>): BrowserCard {
    const now = Date.now();
    const MS_PER_DAY = 86400000;
    
    const elapsedDays = card.lastReview 
      ? Math.floor((now - card.lastReview) / MS_PER_DAY)
      : 0;
    
    const retrievability = calculateRetrievability(card.stability, elapsedDays);
    const state = card.state as CardState;
    
    const dueDate = new Date(card.due);
    const lastReviewDate = card.lastReview ? new Date(card.lastReview) : null;
    
    const dueFormatted = formatDueDate(dueDate);
    const lastReviewFormatted = lastReviewDate ? formatHistoryDate(lastReviewDate) : '';
    const firstReviewFormatted = lastReviewDate ? formatHistoryDate(lastReviewDate) : '';
    
    const fullContent = (card.meta?.content as string) || '';
    const content = truncateContent(fullContent, 100);
    
    const deckId = (card.meta?.deckId as string) || '';
    const rootId = (card.meta?.rootId as string) || '';
    
    const cardType = card.type as 'topic' | 'item' | 'concept' | 'descriptor' | 'incremental' | 'webpage' | undefined;
    const finalCardType = (customAttrs[ATTR_CARD_TYPE] as any) || cardType;
    
    return {
      id: card.id,
      fsrsCardId: card.id,
      blockId: card.blockId,
      deckId,
      rootId,
      content,
      fullContent,
      
      state,
      stateLabel: STATE_LABELS[state] || '未知',
      due: dueDate,
      dueFormatted,
      stability: card.stability,
      difficulty: card.difficulty,
      retrievability,
      reps: card.reps,
      lapses: card.lapses,
      elapsedDays,
      scheduledDays: card.scheduledDays || 0,
      lastReview: lastReviewDate,
      lastReviewFormatted,
      
      interval: card.scheduledDays || 0,
      firstReview: lastReviewDate,
      firstReviewFormatted,
      
      priority: parseInt(customAttrs[ATTR_PRIORITY] || '50') || 50,
      suspended: customAttrs[ATTR_SUSPENDED] === 'true',
      
      cardType: finalCardType,
      aFactor: parseFloat(customAttrs[ATTR_A_FACTOR] || '') || undefined,
      
      tags: [],
      meta: card.meta,
    };
  }
  
  /**
   * 批量获取块信息
   * 
   * @param blockIds - 块 ID 列表
   * @returns 块信息映射
   */
  private async fetchBlockInfoBatched(
    blockIds: string[]
  ): Promise<{
    attrsMap: Map<string, Record<string, string>>;
    rootIdMap: Map<string, string>;
    tagsMap: Map<string, string[]>;
    contentMap: Map<string, string>;
  }> {
    if (blockIds.length === 0) {
      return {
        attrsMap: new Map(),
        rootIdMap: new Map(),
        tagsMap: new Map(),
        contentMap: new Map(),
      };
    }
    
    const attrsMap = new Map<string, Record<string, string>>();
    const rootIdMap = new Map<string, string>();
    const tagsMap = new Map<string, string[]>();
    const contentMap = new Map<string, string>();
    
    try {
      // 批量查询块信息
      const BATCH_SIZE = 500;
      for (let i = 0; i < blockIds.length; i += BATCH_SIZE) {
        const batchIds = blockIds.slice(i, i + BATCH_SIZE);
        const idsStr = batchIds.map(id => `'${id}'`).join(',');
        
        const query = `
          SELECT 
            b.id,
            b.root_id,
            b.content,
            GROUP_CONCAT(a.name || '=' || a.value, '|||') as attrs
          FROM blocks b
          LEFT JOIN attributes a ON b.id = a.block_id
          WHERE b.id IN (${idsStr})
          GROUP BY b.id
        `;
        
        const result = await sql(query);
        
        for (const row of result) {
          const blockId = row.id;
          rootIdMap.set(blockId, row.root_id || '');
          contentMap.set(blockId, row.content || '');
          
          // 解析属性
          const attrs: Record<string, string> = {};
          if (row.attrs) {
            const attrPairs = row.attrs.split('|||');
            for (const pair of attrPairs) {
              const [name, value] = pair.split('=');
              if (name && value !== undefined) {
                attrs[name] = value;
              }
            }
          }
          attrsMap.set(blockId, attrs);
          
          // 解析标签（从 content 中提取 #tag）
          const tags: string[] = [];
          const tagRegex = /#([^\s#]+)/g;
          let match;
          while ((match = tagRegex.exec(row.content || '')) !== null) {
            tags.push(match[1]);
          }
          tagsMap.set(blockId, tags);
        }
      }
    } catch (error) {
      console.error('[GetBrowserCardsQueryHandler] Failed to fetch block info:', error);
    }
    
    return { attrsMap, rootIdMap, tagsMap, contentMap };
  }
}

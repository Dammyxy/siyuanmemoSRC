/**
 * Riff API Data Source
 *
 * Retrieves queue items from SiYuan's built-in Riff flashcard system.
 * This data source integrates with the Riff API to fetch due cards and provides
 * automatic cache invalidation through the Observer pattern.
 * 
 * @deprecated Old architecture data source. Use RiffDataSource from src/data-sources/ instead.
 * This class is part of the legacy queue architecture and will be removed in a future version.
 * New code should use the unified data source architecture with UnifiedDataSourceManager.
 * 
 * ## Features
 * - Fetches due cards from Riff API
 * - Merges local storage data with Riff data (local data takes priority)
 * - Filters out Topic cards automatically
 * - Supports blacklist filtering
 * - Implements Observer pattern for automatic cache invalidation
 * - Provides error recovery through caching
 * 
 * ## Error Handling Strategy
 * The data source implements a multi-layer error handling approach:
 * 1. **Primary**: Fetch from Riff API
 * 2. **Fallback**: Return cached data if available
 * 3. **Final**: Return empty array and log error
 * 
 * ## Degradation Mechanisms
 * - If local storage is unavailable, falls back to Riff API data only
 * - If card type filtering fails, returns all cards (backward compatible)
 * - If nextDues merge fails, returns original Riff data
 * - If SchedulerRouter preview fails, uses current due time as fallback
 * 
 * @example
 * ```typescript
 * const dataSource = new RiffDataSource({
 *   deckId: 'my-deck',
 *   notebook: 'my-notebook',
 *   storage: storageManager,
 *   schedulerRouter: router,
 *   blacklistProvider: () => new Set(['blocked-id-1', 'blocked-id-2'])
 * });
 * 
 * // Fetch all due cards
 * const cards = await dataSource.getAll();
 * 
 * // Register observer for automatic cache invalidation
 * sequencer.addObserver(dataSource);
 * ```
 * 
 * @see ObservableDataSource
 * @see ADR-002: Observer Pattern for Cache Invalidation
 * 
 * 🆕 Phase 1.2-1.3: 优先使用本地 nextDues
 * 🆕 Phase 1.3: 继承 ObservableDataSource 实现自动缓存失效
 */

import { ObservableDataSource } from './ObservableDataSource';
import type { DataSourceOptions } from './IDataSource';
import type { QueueItem } from '../types';
import type { UnifiedStorageManager } from '../../storage/UnifiedStorageManager';  // ✅ 使用 UnifiedStorageManager
import type { SchedulerRouter } from '../../scheduler/SchedulerRouter';
import type { FSRSCard } from '@/types';
import { getRiffDueCards, reviewRiffCard, skipReviewRiffCard } from '../../siyuan/riff';
import { sql } from '../../siyuan/api';
import type { IErrorReporter } from '@/utils/errorReporter';
import { formatUserError } from '@/utils/errorReporter';
import { ok, err, type Result } from '@/types/result';

/**
 * Show a message to the user
 * This is a wrapper around the siyuan showMessage function to make it easier to mock in tests
 */
function showUserMessage(text: string, timeout: number = 3000, type: 'info' | 'error' = 'info'): void {
  // In test environment, this will be mocked
  // In production, this will use the actual siyuan showMessage
  if (typeof window !== 'undefined' && (window as any).siyuan) {
    (window as any).siyuan.showMessage(text, timeout, type);
  } else {
    // Fallback for test environment or when siyuan is not available
    console.log(`[${type.toUpperCase()}] ${text}`);
  }
}

/**
 * Riff API interface for dependency injection
 * 
 * Allows mocking the Riff API in tests while maintaining type safety.
 * 
 * @property getRiffDueCards - Fetches due cards from Riff API
 * @property reviewRiffCard - Optional: Reviews a card in Riff system
 * @property skipReviewRiffCard - Optional: Skips a card review in Riff system
 */
export type RiffApi = {
  getRiffDueCards: typeof getRiffDueCards;
  reviewRiffCard?: typeof reviewRiffCard;
  skipReviewRiffCard?: typeof skipReviewRiffCard;
};

/**
 * Configuration options for RiffDataSource
 * 
 * @property deckId - Required: The deck ID to fetch cards from
 * @property notebook - Optional: Filter cards by notebook
 * @property rootID - Optional: Filter cards by root block ID
 * @property blacklistProvider - Optional: Function that returns a set of blocked card IDs
 * @property storage - Optional: Storage manager for merging local data (recommended for better accuracy)
 * @property schedulerRouter - Optional: Scheduler for predicting next review times (recommended for accurate nextDues)
 * @property api - Optional: Custom Riff API implementation (primarily for testing)
 * @property filter - Optional: Custom filter function for queue items
 * @property limit - Optional: Maximum number of items to return
 * @property errorReporter - Optional: Error reporter for tracking errors (defaults to console logging)
 */
export type RiffDataSourceOptions = DataSourceOptions<QueueItem> & {
  deckId: string;
  notebook?: string;
  rootID?: string;
  blacklistProvider?: () => Set<string>;
  storage?: UnifiedStorageManager;  // ✅ 使用 UnifiedStorageManager
  schedulerRouter?: SchedulerRouter;  // 🆕 添加 schedulerRouter 参数
  api?: RiffApi;  // 🆕 添加 api 参数（可选，用于测试）
  errorReporter?: IErrorReporter;  // 🆕 Phase 1.6: 添加 errorReporter 参数
  hybridSyncService?: any;  // 🆕 添加 hybridSyncService 参数（用于监听同步事件）
};

/**
 * Data source that reads from Riff API
 * 
 * Extends ObservableDataSource to support automatic cache invalidation.
 * When data is modified (via add/remove operations), all registered observers
 * (typically Sequencers) are automatically notified and invalidate their caches.
 * 
 * @see ObservableDataSource
 * @see ADR-002: Observer Pattern for Cache Invalidation
 */
export class RiffDataSource extends ObservableDataSource<QueueItem> {
  private readonly deckId: string;
  private readonly notebook?: string;
  private readonly rootID?: string;
  private readonly filterFn?: (item: QueueItem) => boolean;
  private readonly limit?: number;
  private readonly blacklistProvider?: () => Set<string>;
  private readonly storage?: UnifiedStorageManager;  // ✅ 使用 UnifiedStorageManager
  private readonly schedulerRouter?: SchedulerRouter;  // 🆕 添加 schedulerRouter 属性
  private readonly api: RiffApi;  // 🆕 添加 api 属性
  private readonly errorReporter?: IErrorReporter;  // 🆕 Phase 1.6: 添加 errorReporter 属性
  private readonly hybridSyncService?: any;  // 🆕 添加 hybridSyncService 属性
  private cachedCards: QueueItem[] = [];  // 🆕 Phase 1.6: 重命名为 cachedCards 以符合规范

  /**
   * Creates a new RiffDataSource instance
   * 
   * Initializes the data source with the provided configuration options.
   * The data source will automatically register with the ObservableDataSource
   * base class to support observer notifications.
   * 
   * @param options - Configuration options for the data source
   * 
   * @example
   * ```typescript
   * const dataSource = new RiffDataSource({
   *   deckId: '20230101120000-abc123',
   *   notebook: 'My Notebook',
   *   storage: storageManager,
   *   schedulerRouter: schedulerRouter,
   *   blacklistProvider: () => blacklistSet,
   *   errorReporter: errorReporter,
   *   filter: (item) => item.priority > 30,
   *   limit: 100
   * });
   * ```
   */
  constructor(options: RiffDataSourceOptions) {
    super(); // Initialize ObservableDataSource
    this.deckId = options.deckId;
    this.notebook = options.notebook;
    this.rootID = options.rootID;
    this.filterFn = options.filter;
    this.limit = options.limit;
    this.blacklistProvider = options.blacklistProvider;
    this.storage = options.storage;  // 🆕 保存 storage
    this.schedulerRouter = options.schedulerRouter;  // 🆕 保存 schedulerRouter
    this.hybridSyncService = options.hybridSyncService;  // 🆕 保存 hybridSyncService
    // 🆕 使用传入的 api 或默认的 getRiffDueCards
    this.api = options.api || { getRiffDueCards };
    this.errorReporter = options.errorReporter;  // 🆕 Phase 1.6: 保存 errorReporter
    
    // 🆕 监听同步成功事件，自动刷新缓存
    if (this.hybridSyncService) {
      this.hybridSyncService.on('syncSuccess', (event: any) => {
        console.log('[RiffDataSource] Sync completed:', event.type);
        // 清空缓存，强制下次重新获取
        this.cachedCards = [];
        // 通知所有观察者（Sequencer）刷新
        this.notifyObservers();
      });
    }
  }

  /**
   * Filters out Topic cards from the result set
   * 
   * Topic cards are identified by the 'custom-fsrs-card-type' attribute with value 'topic'.
   * This method queries the database in batches to efficiently check card types.
   * 
   * ## Error Handling
   * If the query fails, returns all cards unchanged (backward compatible behavior).
   * This ensures that a database error doesn't prevent users from reviewing cards.
   * 
   * ## Degradation Strategy
   * - Cards without the 'custom-fsrs-card-type' attribute are treated as Item cards (not filtered)
   * - This maintains backward compatibility with cards created before the type system
   * 
   * @param items - Queue items to filter
   * @returns Filtered items with Topic cards removed
   * 
   * @private
   * @internal
   */
  private async filterTopicCards(items: QueueItem[]): Promise<QueueItem[]> {
    if (items.length === 0) return items;

    try {
      const blockIds = items.map(item => item.blockID);
      const cardTypes = await this.batchGetCardTypes(blockIds);

      // 🆕 详细日志：显示每个块 ID 的卡片类型
      console.log('[RiffDataSource] Card types query result:', {
        totalBlocks: blockIds.length,
        foundTypes: cardTypes.size,
        typeBreakdown: Array.from(cardTypes.entries()).reduce((acc, [blockId, type]) => {
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      });

      const filtered = items.filter(item => {
        const cardType = cardTypes.get(item.blockID);
        // 未找到类型属性的卡片默认为 Item（向后兼容）
        return cardType !== 'topic';
      });

      console.log('[RiffDataSource] Topic filter result:', {
        total: items.length,
        filtered: filtered.length,
        topicCount: items.length - filtered.length,
      });

      return filtered;
    } catch (error) {
      console.error('[RiffDataSource] Failed to filter topic cards:', error);
      // Fallback: return all cards
      return items;
    }
  }

  /**
   * Batch queries card types from block attributes
   * 
   * Efficiently retrieves card types for multiple blocks using batched SQL queries.
   * Each batch processes up to 200 block IDs to balance performance and query size.
   * 
   * ## Performance Optimization
   * - Processes blocks in batches of 200 to avoid query size limits
   * - Uses SQL IN clause for efficient batch querying
   * - Returns a Map for O(1) lookup performance
   * 
   * ## Error Handling
   * If the query fails, returns an empty Map. The caller will treat all cards
   * as Item cards (not Topic), maintaining backward compatibility.
   * 
   * @param blockIds - Array of block IDs to query
   * @returns Map of block ID to card type ('topic' or 'item')
   * 
   * @private
   * @internal
   */
  private async batchGetCardTypes(blockIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (blockIds.length === 0) return result;

    try {
      // Batch query (200 per batch)
      for (let i = 0; i < blockIds.length; i += 200) {
        const batch = blockIds.slice(i, i + 200);
        const inList = batch.map(id => `'${this.escapeSQL(id)}'`).join(',');
        const stmt = `
          SELECT block_id, value
          FROM attributes
          WHERE name = 'custom-fsrs-card-type'
          AND block_id IN (${inList})
        `;

        const rows = await sql(stmt);

        for (const row of rows as any[]) {
          const blockId = String(row?.block_id || row?.blockId || '');
          const cardType = String(row?.value || '');
          if (blockId && cardType) {
            result.set(blockId, cardType);
          }
        }
      }

      return result;
    } catch (error) {
      console.error('[RiffDataSource] Failed to batch get card types:', error);
      return result;
    }
  }

  /**
   * Escapes SQL string values to prevent SQL injection
   * 
   * Replaces single quotes with double single quotes, following SQL standard escaping.
   * This is a critical security measure when building dynamic SQL queries.
   * 
   * @param value - String value to escape
   * @returns Escaped string safe for SQL queries
   * 
   * @example
   * ```typescript
   * escapeSQL("O'Brien") // Returns "O''Brien"
   * escapeSQL("Normal text") // Returns "Normal text"
   * ```
   * 
   * @private
   * @internal
   */
  private escapeSQL(value: string): string {
    return String(value || '').replace(/'/g, "''");
  }

  /**
   * Merges local storage data with Riff API data
   * 
   * This method prioritizes local storage data over Riff API data for better accuracy.
   * Local storage contains the most up-to-date scheduling information, including
   * predicted next review times for all four rating options.
   * 
   * ## Priority Order
   * 1. **Local nextDues** (from SchedulerRouter.preview) - Most accurate
   * 2. **Local due time** - Fallback if preview fails
   * 3. **Riff API data** - Used when local data is unavailable
   * 
   * ## Merged Fields
   * - `nextDues`: Predicted review times for ratings 1-4
   * - `state`: Current card state (New, Learning, Review, Relearning)
   * - `lapses`: Number of times the card was forgotten
   * - `reps`: Total number of reviews
   * - `lastReview`: Timestamp of last review
   * - `priority`: Card priority (local value preferred)
   * 
   * ## Error Handling
   * If merging fails, returns the original Riff data unchanged.
   * This ensures that a local storage error doesn't prevent card review.
   * 
   * @param items - Queue items from Riff API
   * @returns Items with merged local data
   * 
   * @private
   * @internal
   */
  private async mergeLocalNextDues(items: QueueItem[]): Promise<QueueItem[]> {
    if (!this.storage || items.length === 0) return items;

    try {
      // 批量查询本地卡片
      const cardIds = items.map(item => item.cardID);
      const localCards = new Map<string, FSRSCard>();

      for (const cardId of cardIds) {
        const card = this.storage.getCard(cardId);
        if (card) {
          localCards.set(cardId, card);
        }
      }

      console.log('[RiffDataSource] Merge local nextDues:', {
        total: items.length,
        localFound: localCards.size,
      });

      // 合并数据
      let mergedCount = 0;
      const result = items.map(item => {
        const localCard = localCards.get(item.cardID);
        if (!localCard) return item;

        // 🆕 优先使用本地的 nextDues
        const localNextDues = this.extractNextDues(localCard);
        if (localNextDues) {
          mergedCount++;
          return {
            ...item,
            nextDues: localNextDues,
            // 同时更新其他字段
            state: localCard.state,
            lapses: localCard.lapses,
            reps: localCard.reps,
            // 🆕 修复：lastReview 可能是 number 或 Date，统一转换为 number
            lastReview: typeof localCard.lastReview === 'number' 
              ? localCard.lastReview 
              : localCard.lastReview?.getTime?.() || undefined,
            // 🆕 合并 priority 字段
            priority: localCard.priority ?? item.priority,
          };
        }

        return item;
      });

      if (mergedCount > 0) {
        console.log('[RiffDataSource] ✅ Merged', mergedCount, 'cards with local nextDues');
      }

      return result;
    } catch (error) {
      console.error('[RiffDataSource] Failed to merge local nextDues:', error);
      return items;
    }
  }

  /**
   * Extracts nextDues from a local FSRSCard
   * 
   * Converts FSRSCard scheduling data into the nextDues format required by QueueItem.
   * Uses SchedulerRouter to predict future review times for all four rating options.
   * 
   * ## Prediction Strategy
   * 1. **With SchedulerRouter**: Uses preview() to predict accurate times for each rating
   * 2. **Without SchedulerRouter**: Uses current due time for all ratings (fallback)
   * 3. **No due time**: Returns null (card will use Riff API data)
   * 
   * ## nextDues Format
   * ```typescript
   * {
   *   1: "2024-01-15T10:30:00.000Z",  // Again - earliest review
   *   2: "2024-01-16T10:30:00.000Z",  // Hard - short interval
   *   3: "2024-01-20T10:30:00.000Z",  // Good - normal interval
   *   4: "2024-01-25T10:30:00.000Z"   // Easy - longest interval
   * }
   * ```
   * 
   * ## Error Handling
   * If preview fails, falls back to using the current due time for all ratings.
   * If no due time exists, returns null (caller will use Riff data).
   * 
   * @param card - FSRSCard from local storage
   * @returns nextDues object or null if unavailable
   * 
   * @private
   * @internal
   */
  private extractNextDues(card: FSRSCard): Record<1 | 2 | 3 | 4, string> | null {
    // 🆕 如果有 SchedulerRouter，使用它来预测四个选项的时间
    if (this.schedulerRouter) {
      try {
        const previews = this.schedulerRouter.preview(card);
        
        // previews 是 Map<Rating, FSRSCard>
        // FSRSCard.due 是 number (时间戳)
        const againCard = previews.get(1);
        const hardCard = previews.get(2);
        const goodCard = previews.get(3);
        const easyCard = previews.get(4);
        
        return {
          1: againCard ? new Date(againCard.due).toISOString() : new Date().toISOString(),  // Again
          2: hardCard ? new Date(hardCard.due).toISOString() : new Date().toISOString(),    // Hard
          3: goodCard ? new Date(goodCard.due).toISOString() : new Date().toISOString(),    // Good
          4: easyCard ? new Date(easyCard.due).toISOString() : new Date().toISOString(),    // Easy
        };
      } catch (error) {
        console.error('[RiffDataSource] Failed to preview card:', error);
        // 降级到使用当前 due 时间
      }
    }

    // 后备方案：如果卡片有 due 时间，使用当前 due
    if (card.due) {
      const dueISO = new Date(card.due).toISOString();
      
      return {
        1: dueISO,  // Again
        2: dueISO,  // Hard
        3: dueISO,  // Good
        4: dueISO,  // Easy
      };
    }

    return null;
  }

  /**
   * Fetches all due cards from the Riff API
   * 
   * This is the primary method for retrieving cards from the data source.
   * It orchestrates multiple operations to provide accurate, filtered card data:
   * 
   * ## Processing Pipeline
   * 1. **Fetch from Riff API**: Get due cards for the specified deck
   * 2. **Merge local data**: Enhance with local storage data (if available)
   * 3. **Filter Topic cards**: Remove cards marked as 'topic' type
   * 4. **Apply blacklist**: Remove blocked cards (if blacklist provider exists)
   * 5. **Apply custom filter**: Run user-defined filter function (if provided)
   * 6. **Apply limit**: Truncate to maximum number of items (if limit set)
   * 7. **Cache results**: Store for potential error recovery
   * 
   * ## Three-Layer Error Handling Strategy (Requirement 7.1-7.4)
   * 
   * When the Riff API call fails, the system implements a three-layer degradation strategy:
   * 
   * ### Layer 1: Normal Database Query
   * - Attempts to fetch cards from the Riff API
   * - Updates cache on success
   * - Returns fresh data
   * 
   * ### Layer 2: Use Cached Data (Requirement 7.1, 7.2)
   * - If API fails and cached data is available
   * - Returns cached data to maintain user workflow
   * - Displays user notification: "使用缓存数据（数据库暂时不可用）"
   * - Allows users to continue reviewing with slightly stale data
   * 
   * ### Layer 3: Return Empty Array and Report Error (Requirement 7.3, 7.4)
   * - If API fails and no cached data exists
   * - Reports error to error tracking system (if errorReporter configured)
   * - Displays user-friendly error message: "加载卡片失败，请稍后重试"
   * - Returns empty array (graceful degradation, prevents UI crashes)
   * 
   * ## Degradation Mechanisms
   * Each processing step has its own error handling:
   * - **Local merge fails**: Uses Riff data only
   * - **Topic filter fails**: Returns all cards
   * - **Blacklist fails**: Skips blacklist filtering
   * - **Custom filter fails**: Returns unfiltered cards
   * 
   * ## Performance Considerations
   * - Batches database queries (200 items per batch)
   * - Caches results for error recovery
   * - Filters are applied in order of efficiency (cheapest first)
   * 
   * @returns Array of queue items ready for review
   * 
   * @example
   * ```typescript
   * const dataSource = new RiffDataSource({ 
   *   deckId: 'my-deck',
   *   errorReporter: myErrorReporter 
   * });
   * const cards = await dataSource.getAll();
   * console.log(`Found ${cards.length} cards to review`);
   * ```
   * 
   * @public
   */
  async getAll(): Promise<QueueItem[]> {
    try {
      // Layer 1: Normal database query
      // 🆕 使用 this.api 而不是直接调用 getRiffDueCards
      const data = await this.api.getRiffDueCards(this.deckId, this.notebook, this.rootID);

      if (!data || !data.cards || data.cards.length === 0) {
        return [];
      }

      let items: QueueItem[] = data.cards.map(card => ({
        cardID: card.cardID,
        blockID: card.blockID,
        deckID: card.deckID,
        priority: 50, // Default priority for Riff cards
        nextDues: card.nextDues as any,
        state: card.state,
        lapses: card.lapses,
        reps: card.reps,
        lastReview: card.lastReview ? new Date(card.lastReview).getTime() : undefined,
      }));

      // 🆕 Phase 1.3: 批量查询本地数据库，优先使用本地 nextDues
      if (this.storage) {
        items = await this.mergeLocalNextDues(items);
      }

      // Filter Topic cards
      items = await this.filterTopicCards(items);

      // Filter blacklist cards
      if (this.blacklistProvider) {
        const blacklist = this.blacklistProvider();
        const beforeCount = items.length;
        items = items.filter(item => !blacklist.has(item.blockID));
        const afterCount = items.length;
        if (beforeCount !== afterCount) {
          console.log('[RiffDataSource] Blacklist filter result:', {
            before: beforeCount,
            after: afterCount,
            filtered: beforeCount - afterCount,
          });
        }
      }

      // Apply custom filter
      if (this.filterFn) {
        items = items.filter(this.filterFn);
      }

      // Apply limit
      if (this.limit && items.length > this.limit) {
        items = items.slice(0, this.limit);
      }

      // 🆕 Phase 1.6: 成功查询后更新缓存
      this.cachedCards = items;
      return items;
    } catch (error) {
      console.error('[RiffDataSource] Failed to load cards:', error);
      
      // Layer 2: Use cached data and notify user (Requirement 7.1, 7.2)
      if (this.cachedCards.length > 0) {
        console.log('[RiffDataSource] Using cached data as fallback');
        showUserMessage('使用缓存数据（数据库暂时不可用）', 3000, 'info');
        return this.cachedCards;
      }
      
      // Layer 3: Return empty array and report error (Requirement 7.3, 7.4, 7.5)
      if (this.errorReporter) {
        this.errorReporter.report(error as Error, {
          operation: 'getAll',
          component: 'RiffDataSource',
          deckId: this.deckId,
          notebook: this.notebook,
          rootID: this.rootID,
        });
      }
      
      // 🆕 Phase 1.6.4: Use formatUserError to convert technical error to user-friendly message
      const userMessage = formatUserError(error as Error, {
        operation: 'getAll',
        component: 'RiffDataSource',
      });
      showUserMessage(userMessage, 3000, 'error');
      return [];
    }
  }

  /**
   * Adds items to the data source
   * 
   * **Note**: The Riff API does not support adding cards through the queue interface.
   * Cards should be added using the `addRiffCards` API directly.
   * 
   * ## Current Behavior
   * - Logs a warning message
   * - Returns success with 0 items added
   * - Does NOT throw an error (graceful degradation)
   * 
   * ## Future Implementation
   * If this method is implemented in the future, it MUST call `this.notifyObservers()`
   * after successfully adding items to trigger cache invalidation in all registered
   * Sequencers.
   * 
   * ## Error Handling
   * This method never fails - it simply logs a warning and returns success with 0.
   * This prevents errors when code attempts to add items through the queue interface.
   * 
   * @param items - Items to add (currently ignored)
   * @returns Result containing the number of items successfully added (always ok(0))
   * 
   * @override
   * @public
   * 
   * @example
   * ```typescript
   * // This will log a warning and return ok(0)
   * const result = await dataSource.add([newCard]);
   * if (result.ok) {
   *   console.log(result.value); // 0
   * }
   * 
   * // Instead, use the Riff API directly:
   * await addRiffCards(deckId, [newCard]);
   * ```
   */
  async add(items: QueueItem[]): Promise<Result<number>> {
    // Riff API doesn't support adding cards through queue interface
    // Cards should be added via addRiffCards API
    console.warn('[RiffDataSource] Adding cards not supported, use addRiffCards API');
    // Note: If this is implemented in the future, call this.notifyObservers() after successful addition
    return ok(0);
  }

  /**
   * Removes items from the data source
   * 
   * **Note**: The Riff API does not support removing cards through the queue interface.
   * Cards are automatically removed from the queue after they are reviewed or skipped
   * using the `reviewRiffCard` or `skipReviewRiffCard` APIs.
   * 
   * ## Current Behavior
   * - Logs a warning message
   * - Returns success with 0 items removed
   * - Does NOT throw an error (graceful degradation)
   * 
   * ## Future Implementation
   * If this method is implemented in the future, it MUST call `this.notifyObservers()`
   * after successfully removing items to trigger cache invalidation in all registered
   * Sequencers.
   * 
   * ## Error Handling
   * This method never fails - it simply logs a warning and returns success with 0.
   * This prevents errors when code attempts to remove items through the queue interface.
   * 
   * ## Recommended Approach
   * Cards are removed from the queue automatically when:
   * - User reviews the card (calls `reviewRiffCard`)
   * - User skips the card (calls `skipReviewRiffCard`)
   * - Card is no longer due (scheduling algorithm)
   * 
   * @param items - Items to remove (currently ignored)
   * @returns Result containing the number of items successfully removed (always ok(0))
   * 
   * @override
   * @public
   * 
   * @example
   * ```typescript
   * // This will log a warning and return ok(0)
   * const result = await dataSource.remove([card]);
   * if (result.ok) {
   *   console.log(result.value); // 0
   * }
   * 
   * // Instead, review or skip the card:
   * await reviewRiffCard(deckId, cardId, rating);
   * // or
   * await skipReviewRiffCard(deckId, cardId);
   * ```
   */
  async remove(items: QueueItem[]): Promise<Result<number>> {
    // Riff API doesn't support removing cards from queue
    // Cards are removed after review/skip
    console.warn('[RiffDataSource] Removing cards not supported via queue interface');
    // Note: If this is implemented in the future, call this.notifyObservers() after successful removal
    return ok(0);
  }
}

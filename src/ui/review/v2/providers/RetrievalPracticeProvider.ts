/**
 * 检索练习队列 Provider
 *
 * 实现 Extensions Layer 的 QueueProvider 接口
 * 封装 RetrievalPracticeQueue 为外部提供标准 API
 */

import type { QueueProvider } from '@/core/extensions';
import type { BrowserCard } from '@/ui/browser/browserService';
import { RetrievalPracticeQueue } from '@/core/queue/strategies/RetrievalPracticeQueue';
import type { StorageManager } from '@/core/storage/StorageManager';
import type { SchedulerEngineAdapter } from '@/core/scheduler/types';
import { SessionManager } from './utils/SessionManager';

/**
 * 检索练习队列 Provider
 *
 * 提供统一的队列访问接口，支持：
 * - 获取到期卡片（Riff + 本地）
 * - 提交复习评分
 * - 跳过卡片
 * - 获取统计信息
 * - 手动添加卡片
 * 
 * 🆕 使用 SessionManager 管理会话状态：
 * - 支持 SM-15 风格的优先级排序
 * - 支持 Lapse Tracking（失败次数追踪）
 * - 难卡片优先复习
 */
export class RetrievalPracticeProvider implements QueueProvider<BrowserCard> {
  readonly id = 'retrieval';
  readonly displayName = '提取练习';
  private readonly queue: RetrievalPracticeQueue;
  private readonly deckId: string;
  private readonly storage?: StorageManager;
  private reviewedCount = 0;
  
  // 🆕 使用 SessionManager 管理会话状态
  private readonly session: SessionManager<BrowserCard>;

  /**
   * Private constructor - use create() factory method instead
   */
  private constructor(
    queue: RetrievalPracticeQueue,
    options?: {
      deckId?: string;
      storage?: StorageManager;
    }
  ) {
    this.deckId = options?.deckId || '';
    this.storage = options?.storage;
    this.queue = queue;
    
    // 🆕 初始化 SessionManager
    this.session = new SessionManager<BrowserCard>({
      getDueMs: (card) => {
        // 使用 due 字段作为排序键
        // 评分 1-2 的卡片会设置未来的 due 时间，自然排在末尾
        return (card as any).due || Date.now();
      },
      // 不使用 priority 排序，只按 dueTime 排序
      // 这样评分 1-2 的卡片（due 时间在未来）会排在末尾
    });
  }

  /**
   * Factory method to create RetrievalPracticeProvider
   */
  static async create(options?: {
    deckId?: string;
    storage?: StorageManager;
    scheduler?: SchedulerEngineAdapter;
  }): Promise<RetrievalPracticeProvider> {
    const queue = await RetrievalPracticeQueue.create({
      deckID: options?.deckId,
      storage: options?.storage,
      localScheduler: options?.scheduler,
    });

    return new RetrievalPracticeProvider(queue, {
      deckId: options?.deckId,
      storage: options?.storage,
    });
  }

  /**
   * 获取到期卡片
   *
   * 🆕 改进：使用 SessionManager 管理卡片列表
   * - 只在第一次加载时从 Queue 获取卡片
   * - 之后使用 SessionManager 维护的状态
   * - 保留原始的 dueTime，维持优先级信息
   * 
   * SM-15 风格：
   * - 队列中可以有不同的 dueTime（过去、现在、未来）
   * - 只返回到期的卡片（dueTime <= now）
   * - 失败的卡片设置 due = now，通过二分插入找到正确位置
   *
   * @param options 可选参数
   * @returns 到期卡片列表
   */
  async getDueCards(options?: {
    limit?: number;
    deckId?: string;
    forceReload?: boolean;  // 🆕 强制重新加载
  }): Promise<BrowserCard[]> {
    console.log('[RetrievalPracticeProvider] getDueCards START', {
      deckId: this.deckId,
      options,
      loaded: this.session.isLoaded(),
      cardsCount: this.session.size(),
    });

    // 只在第一次或强制重载时从 Queue 加载
    if (!this.session.isLoaded() || options?.forceReload) {
      console.log('[RetrievalPracticeProvider] Loading cards from queue...');
      const cards = await this.queue.getAllCards() as any;
      
      // 🔑 保留原始的 dueTime，不统一
      // 这样可以保持"越早到期 = 越优先"的语义
      
      this.session.load(cards);
      console.log('[RetrievalPracticeProvider] Loaded cards:', this.session.size());
    }

    // 返回当前列表（可能已经被 reviewCard 修改过）
    const allCards = this.session.getAll();
    const result = options?.limit 
      ? allCards.slice(0, options.limit) 
      : [...allCards];

    console.log('[RetrievalPracticeProvider] getDueCards DONE:', {
      options,
      count: result.length,
    });

    return result;
  }

  /**
   * 提交复习评分
   *
   * 🆕 改进：使用 SessionManager 管理卡片状态
   * - 评分 < 3：设置 due = now，通过二分插入重新排序
   * - 评分 >= 3：从队列中移除
   * 
   * SM-15 风格的失败处理：
   * - 失败的卡片设置 dueDate = now（当前时间）
   * - 使用二分插入找到正确位置
   * - 排在过去到期的卡片之后，未来到期的卡片之前
   * - 增加 lapse 计数（失败次数追踪）
   *
   * @param cardId 卡片 ID
   * @param rating 评分（1=重来, 2=困难, 3=一般, 4=简单）
   * @param reviewedCards 可选的已复习卡片列表
   * @returns 是否成功
   */
  async reviewCard(
    cardId: string,
    rating: 1 | 2 | 3 | 4,
    reviewedCards?: BrowserCard[]
  ): Promise<boolean> {
    console.log('[RetrievalPracticeProvider] reviewCard called:', {
      cardId,
      rating,
      hasStorage: !!this.storage,
      cardsCount: this.session.size(),
    });

    try {
      // 找到卡片
      const card = this.session.find(
        c => (c as any).cardID === cardId || (c as any).cardId === cardId
      );

      if (!card) {
        console.error('[RetrievalPracticeProvider] Card not found in session:', cardId);
        return false;
      }

      console.log('[RetrievalPracticeProvider] Card found');

      // 从 session 中移除
      const removed = this.session.remove(
        c => (c as any).cardID === cardId || (c as any).cardId === cardId
      );

      if (!removed) {
        console.error('[RetrievalPracticeProvider] Failed to remove card from session');
        return false;
      }

      // 根据评分修改列表
      if (rating < 3) {
        // 评分 1-2：重新插入队列（SM-15 风格）
        console.log('[RetrievalPracticeProvider] Rating < 3, rotating with SM-15 style:', cardId);
        
        // 增加失败次数
        (card as any).lapses = ((card as any).lapses || 0) + 1;
        
        // 🔑 SM-15 风格：设置 due = now（当前时间）
        // 这样会通过二分插入找到正确的位置：
        // - 排在过去到期的卡片之后
        // - 排在未来到期的卡片之前
        const now = Date.now();
        (card as any).due = now;
        
        console.log('[RetrievalPracticeProvider] Set due to now (SM-15 style):', {
          cardId,
          lapses: (card as any).lapses,
          due: now,
          dueTimeISO: new Date(now).toISOString(),
        });
        
        // 重新插入（会根据 dueTime 二分查找插入位置）
        this.session.rotate(card);
        
        // 打印统计信息
        const stats = this.session.getStats();
        console.log('[RetrievalPracticeProvider] Session stats:', stats);
      } else {
        // 评分 3-4：删除（已从 session 中移除，不重新插入）
        console.log('[RetrievalPracticeProvider] Rating >= 3, removing:', cardId);
      }

      console.log('[RetrievalPracticeProvider] Cards remaining:', this.session.size());

      // 记录复习时间
      const reviewTime = Date.now();

      // 同步到底层 Queue（用于持久化和 Riff API）
      await this.queue.onFeedback(card as any, {
        action: 'rate',
        rating,
      });

      console.log('[RetrievalPracticeProvider] Feedback submitted, now recording log...');

      // 记录复习日志
      if (this.storage) {
        try {
          const logData = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            cardId: cardId,
            rating: rating as 1 | 2 | 3 | 4,
            state: (card as any)?.state || 0,
            scheduledDays: (card as any)?.scheduledDays || 0,
            elapsedDays: (card as any)?.elapsedDays || 0,
            review: reviewTime,
            reviewTime: 0,
            isDrill: false,
            stability: (card as any)?.stability || 0,
            difficulty: (card as any)?.difficulty || 0,
          };
          console.log('[RetrievalPracticeProvider] Adding review log:', logData);
          await this.storage.addReviewLog(logData);
          console.log('[RetrievalPracticeProvider] Review log added successfully');
        } catch (error) {
          console.error('[RetrievalPracticeProvider] Failed to add review log:', error);
        }
      } else {
        console.warn('[RetrievalPracticeProvider] No storage available, cannot record log');
      }

      console.log('[RetrievalPracticeProvider] Card reviewed:', {
        cardId,
        rating,
      });

      this.reviewedCount++;
      return true;
    } catch (err) {
      console.error('[RetrievalPracticeProvider] Review failed:', err);
      return false;
    }
  }

  /**
   * 跳过卡片
   *
   * 🆕 改进：使用 SessionManager 的 rotate() 方法
   *
   * @param cardId 卡片 ID
   * @returns 是否成功
   */
  async skipReviewCard(cardId: string): Promise<boolean> {
    try {
      // 找到卡片
      const card = this.session.find(
        c => (c as any).cardID === cardId || (c as any).cardId === cardId
      );

      if (!card) {
        console.error('[RetrievalPracticeProvider] Card not found:', cardId);
        return false;
      }

      // 从 session 中移除
      const removed = this.session.remove(
        c => (c as any).cardID === cardId || (c as any).cardId === cardId
      );

      if (!removed) {
        return false;
      }

      // 跳过：重新插入（移到末尾）
      console.log('[RetrievalPracticeProvider] Skipping card, rotating:', cardId);
      this.session.rotate(card);

      // 同步到底层 Queue
      await this.queue.onFeedback(card as any, {
        action: 'skip',
      });

      console.log('[RetrievalPracticeProvider] Card skipped:', cardId);
      return true;
    } catch (err) {
      console.error('[RetrievalPracticeProvider] Skip failed:', err);
      return false;
    }
  }

  /**
   * 获取统计信息
   *
   * @returns 队列统计
   */
  async getStats(): Promise<{
    total: number;
    due: number;
    new: number;
    reviewed: number;
    learning: number;
  }> {
    const stats = await this.queue.getStats();

    return {
      total: stats.total || 0,
      due: stats.remaining || 0,
      new: stats.new ?? 0,
      reviewed: stats.reviewed || 0,
      learning: stats.learning ?? 0,
    };
  }
}

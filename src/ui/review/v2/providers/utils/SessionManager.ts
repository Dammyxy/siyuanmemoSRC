/**
 * SessionManager - 管理复习会话的卡片列表
 * 
 * 使用 SortedSequencer 维护有序队列，支持：
 * - 按 dueTime 排序（主键）
 * - 按 priority/lapses 排序（次键）
 * - 高效的插入和删除（O(log n) 二分查找）
 * - Lapse tracking（失败次数追踪）
 * 
 * 设计目标：
 * - 让 Provider 专注于业务逻辑
 * - 让排序逻辑独立且可复用
 * - 支持 SM-15 风格的优先级排序
 */

import { SortedSequencer } from '@/core/queue/sequencers/SortedSequencer';

export interface SessionManagerOptions<TCard> {
  /**
   * 获取卡片的到期时间（毫秒）
   * 用作主排序键
   */
  getDueMs: (card: TCard) => number;
  
  /**
   * 获取卡片的优先级
   * 用作次排序键（当到期时间相同时）
   * 
   * 建议：
   * - 使用 lapses（失败次数）作为优先级
   * - 失败次数越多，优先级越高（数值越小，因为是升序排序）
   * - 例如：lapses=3 → priority=-30，lapses=1 → priority=-10
   */
  getPriority?: (card: TCard) => number;
  
  /**
   * 初始卡片列表
   */
  initialCards?: TCard[];
}

export interface SessionStats {
  /** 总卡片数 */
  total: number;
  /** 平均失败次数 */
  avgLapses: number;
  /** 最大失败次数 */
  maxLapses: number;
  /** 有失败记录的卡片数 */
  cardsWithLapses: number;
}

/**
 * SessionManager - 会话管理器
 * 
 * 封装 SortedSequencer，提供更高级的会话管理功能：
 * - 卡片加载和清空
 * - 卡片旋转（重新插入）
 * - Lapse tracking（失败次数追踪）
 * - 统计信息
 */
export class SessionManager<TCard> {
  private readonly sequencer: SortedSequencer<TCard>;
  private loaded = false;
  
  constructor(options: SessionManagerOptions<TCard>) {
    this.sequencer = new SortedSequencer<TCard>({
      getDueMs: options.getDueMs,
      getPriority: options.getPriority,
      initialItems: options.initialCards || [],
    });
    
    if (options.initialCards && options.initialCards.length > 0) {
      this.loaded = true;
    }
  }
  
  /**
   * 加载卡片到会话
   * 
   * @param cards - 要加载的卡片列表
   */
  load(cards: TCard[]): void {
    this.sequencer.clear();
    this.sequencer.insertMany(cards);
    this.loaded = true;
    
    console.log('[SessionManager] Loaded', cards.length, 'cards');
  }
  
  /**
   * 获取所有卡片
   * 
   * @returns 按排序顺序返回的卡片列表
   */
  getAll(): TCard[] {
    return this.sequencer.getAll();
  }
  
  /**
   * 获取下一张卡片（并从队列中移除）
   * 
   * @returns 下一张卡片，如果队列为空则返回 null
   */
  async next(): Promise<TCard | null> {
    return await this.sequencer.next();
  }
  
  /**
   * 移除卡片
   * 
   * @param predicate - 用于识别要移除的卡片的函数
   * @returns 是否成功移除
   */
  remove(predicate: (card: TCard) => boolean): boolean {
    const removed = this.sequencer.remove(predicate);
    
    if (removed) {
      console.log('[SessionManager] Removed card');
    }
    
    return removed;
  }
  
  /**
   * 旋转卡片到队列中（重新插入，保持排序）
   * 
   * 使用场景：
   * - 评分 < 3：卡片需要继续练习
   * - 跳过卡片：移到队列末尾
   * 
   * @param card - 要旋转的卡片
   */
  rotate(card: TCard): void {
    this.sequencer.insert(card);
    
    console.log('[SessionManager] Rotated card');
  }
  
  /**
   * 旋转卡片并增加失败次数
   * 
   * 这是 SM-15 风格的失败处理：
   * - 增加 lapse 计数
   * - 重新插入队列（会根据新的 lapses 重新排序）
   * - 失败次数越多的卡片会排在前面（优先复习）
   * 
   * @param card - 要旋转的卡片
   */
  rotateWithLapse(card: TCard): void {
    // 增加失败次数
    const cardAny = card as any;
    cardAny.lapses = (cardAny.lapses || 0) + 1;
    
    // 重新插入（会根据新的 lapses 重新排序）
    this.sequencer.insert(card);
    
    console.log('[SessionManager] Rotated card with lapses:', cardAny.lapses);
  }
  
  /**
   * 获取队列大小
   * 
   * @returns 当前队列中的卡片数量
   */
  size(): number {
    return this.sequencer.size();
  }
  
  /**
   * 检查队列是否为空
   * 
   * @returns 队列是否为空
   */
  isEmpty(): boolean {
    return this.sequencer.isEmpty();
  }
  
  /**
   * 检查是否已加载
   * 
   * @returns 是否已加载卡片
   */
  isLoaded(): boolean {
    return this.loaded;
  }
  
  /**
   * 清空会话
   */
  clear(): void {
    this.sequencer.clear();
    this.loaded = false;
    
    console.log('[SessionManager] Cleared session');
  }
  
  /**
   * 获取统计信息
   * 
   * @returns 会话统计信息
   */
  getStats(): SessionStats {
    const cards = this.sequencer.getAll();
    const lapses = cards.map(c => (c as any).lapses || 0);
    const cardsWithLapses = lapses.filter(l => l > 0).length;
    
    return {
      total: cards.length,
      avgLapses: cards.length > 0 
        ? lapses.reduce((a, b) => a + b, 0) / cards.length 
        : 0,
      maxLapses: cards.length > 0 ? Math.max(...lapses) : 0,
      cardsWithLapses,
    };
  }
  
  /**
   * 查找卡片
   * 
   * @param predicate - 用于识别卡片的函数
   * @returns 找到的卡片，如果没找到则返回 null
   */
  find(predicate: (card: TCard) => boolean): TCard | null {
    const cards = this.sequencer.getAll();
    return cards.find(predicate) || null;
  }
}

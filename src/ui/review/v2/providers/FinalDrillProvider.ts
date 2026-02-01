import type { QueueItem } from '../../../../core/queue/types.ts';
import type { QueueProvider } from '../../../../core/extensions/QueueProvider.ts';
import type { QueueStats } from '../../../../core/extensions/types.ts';
import { FinalDrillV2Session } from '../sessions/FinalDrillV2Session.ts';

type FinalDrillQueueLike = ConstructorParameters<typeof FinalDrillV2Session>[0]['queue'];
type StorageLike = ConstructorParameters<typeof FinalDrillV2Session>[0]['storage'];

export class FinalDrillProvider implements QueueProvider<QueueItem> {
  readonly id = 'final-drill';
  readonly displayName: string;
  readonly skipBehavior = 'rotate';

  private readonly session: FinalDrillV2Session;
  
  // 🆕 Provider 自己管理会话状态
  private cards: QueueItem[] = [];  // 当前会话的卡片列表
  private loaded = false;            // 是否已加载

  constructor(options: { queue: FinalDrillQueueLike; storage?: StorageLike; i18n?: Record<string, string> }) {
    this.displayName = options.i18n?.queueDeliberate || '最终冲刺';
    this.session = new FinalDrillV2Session({
      queue: options.queue,
      storage: options.storage as any,
      i18n: options.i18n,
    });
  }

  async init(): Promise<void> {
    await this.session.init();
    // 🆕 初始化后加载卡片
    this.cards = this.session.getAllItems();
    this.loaded = true;
    console.log('[FinalDrillProvider] Initialized with', this.cards.length, 'cards');
  }

  getStrategy(): FinalDrillV2Session {
    return this.session;
  }

  async getDueCards(options?: {
    forceReload?: boolean;
  }): Promise<QueueItem[]> {
    console.log('[FinalDrillProvider] getDueCards START', {
      loaded: this.loaded,
      cardsCount: this.cards.length,
      forceReload: options?.forceReload,
    });

    // 如果需要强制重新加载，清空状态
    if (options?.forceReload) {
      console.log('[FinalDrillProvider] Force reload requested');
      this.loaded = false;
      this.cards = [];
    }

    // 只在第一次或强制重载时加载
    if (!this.loaded) {
      console.log('[FinalDrillProvider] Loading cards from session...');
      this.cards = this.session.getAllItems();
      this.loaded = true;
      console.log('[FinalDrillProvider] Loaded cards:', this.cards.length);
    }

    console.log('[FinalDrillProvider] getDueCards DONE:', this.cards.length);
    return [...this.cards];
  }

  async reviewCard(cardId: string, rating: number): Promise<void> {
    console.log('[FinalDrillProvider] reviewCard called:', {
      cardId,
      rating,
      cardsCount: this.cards.length,
    });

    // 找到卡片在列表中的位置
    const index = this.cards.findIndex(
      c => String(c.cardID) === String(cardId)
    );

    if (index === -1) {
      console.error('[FinalDrillProvider] Card not found in list:', cardId);
      return;
    }

    const item = this.cards[index];
    console.log('[FinalDrillProvider] Card found at index:', index);

    // 🎯 FinalDrill 特殊逻辑：
    // - 评分 < 4：旋转到队尾（继续练习）
    // - 评分 = 4：移除队列（掌握了）
    const normalizedRating = Math.max(1, Math.min(4, Math.floor(rating))) as 1 | 2 | 3 | 4;
    
    if (normalizedRating < 4) {
      // 评分 1-3：移到末尾（继续练习）
      console.log('[FinalDrillProvider] Rating < 4, rotating to end:', cardId);
      this.cards.splice(index, 1);
      this.cards.push(item);
    } else {
      // 评分 4：删除（掌握了）
      console.log('[FinalDrillProvider] Rating = 4, removing:', cardId);
      this.cards.splice(index, 1);
    }

    console.log('[FinalDrillProvider] Cards remaining:', this.cards.length);

    // 同步到底层 Session
    await this.session.onFeedback(item, { action: 'rate', rating: normalizedRating });
  }

  async skipReviewCard(cardId: string): Promise<void> {
    console.log('[FinalDrillProvider] skipReviewCard called:', cardId);

    // 找到卡片在列表中的位置
    const index = this.cards.findIndex(
      c => String(c.cardID) === String(cardId)
    );

    if (index === -1) {
      console.error('[FinalDrillProvider] Card not found in list:', cardId);
      return;
    }

    const item = this.cards[index];

    // 跳过：移到末尾
    console.log('[FinalDrillProvider] Skipping card, moving to end:', cardId);
    this.cards.splice(index, 1);
    this.cards.push(item);

    // 同步到底层 Session
    await this.session.onFeedback(item, { action: 'skip' });
  }

  async onCustomAction(actionId: string): Promise<boolean | void> {
    const id = String(actionId || '');
    if (!id) return;
    await this.session.onFeedback(null, { action: 'custom', customActionId: id } as any);
    return false;
  }

  async getStats(_options?: Record<string, unknown>): Promise<QueueStats> {
    const p = this.session.getProgress();
    const remaining = Math.max(0, this.cards.length);  // 🆕 使用 Provider 的 cards 数组
    const total = Math.max(0, Number(p.total) || 0);
    const answered = Math.max(0, Number(p.answered) || 0);
    const s = await this.session.getStats();
    return {
      current: answered,
      total: total || Math.max(0, Number(s.size) || 0),
      remaining,
      label: String(s.label || ''),
    };
  }

  getProgress(): { answered: number; correct: number; total: number; durationMs: number } {
    return this.session.getProgress();
  }

  getResumePrompt(): { message: string; data: unknown } | null {
    return this.session.getResumePrompt();
  }

  // 🆕 保留 findItemByCardId 用于 onCustomAction
  private findItemByCardId(cardId: string): QueueItem | null {
    const id = String(cardId || '');
    if (!id) return null;
    return this.cards.find((x) => String(x.cardID) === id) || null;
  }
}

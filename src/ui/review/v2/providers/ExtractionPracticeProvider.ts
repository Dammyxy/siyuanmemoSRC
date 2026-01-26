import type { QueueItem } from '../../../../core/queue/types.ts';
import type { QueueProvider } from '../../../../core/extensions/QueueProvider.ts';
import type { QueueStats } from '../../../../core/extensions/types.ts';

type ExtractionQueueLike = {
  getAllItems?: () => QueueItem[];
  getNextItem?: () => Promise<QueueItem | null>;
  removeItem?: (item: QueueItem) => Promise<boolean> | boolean;
  onFeedback?: (item: QueueItem | null, feedback: any) => Promise<void>;
};

export class ExtractionPracticeProvider implements QueueProvider<QueueItem> {
  readonly id = 'extraction';
  readonly displayName: string;
  readonly skipBehavior = 'rotate' as const;

  private readonly queue: ExtractionQueueLike;
  private readonly i18n?: Record<string, string>;
  private reviewedCount = 0;
  private initialTotal = 0;

  constructor(options: { queue: ExtractionQueueLike; i18n?: Record<string, string> }) {
    this.queue = options.queue;
    this.i18n = options.i18n;
    this.displayName = this.i18n?.queueExtract || '提取练习';
  }

  async init(): Promise<void> {
    // 初始化统计
    const items = this.queue?.getAllItems?.() || [];
    this.initialTotal = items.length;
    this.reviewedCount = 0;
  }

  async getDueCards(_options: Record<string, unknown>): Promise<QueueItem[]> {
    return this.queue?.getAllItems?.() || [];
  }

  async reviewCard(cardId: string, rating: number): Promise<void> {
    const items = this.queue?.getAllItems?.() || [];
    const item = items.find((x) => String((x as any)?.cardID) === cardId);
    if (!item) return;

    // 调用队列的反馈处理
    await this.queue?.onFeedback?.(item, { action: 'rate', rating });

    // 从队列中移除已评分的卡片
    await Promise.resolve(this.queue?.removeItem?.(item));

    this.reviewedCount++;
  }

  async skipReviewCard(cardId: string): Promise<void> {
    const items = this.queue?.getAllItems?.() || [];
    const item = items.find((x) => String((x as any)?.cardID) === cardId);
    if (!item) return;

    // 调用队列的反馈处理
    await this.queue?.onFeedback?.(item, { action: 'skip' });

    // 从队列中移除已跳过的卡片
    await Promise.resolve(this.queue?.removeItem?.(item));
  }

  async onCustomAction(_actionId: string): Promise<boolean | void> {
    return false;
  }

  async getStats(_options?: Record<string, unknown>): Promise<QueueStats> {
    const items = this.queue?.getAllItems?.() || [];
    const remaining = items.length;
    const total = Math.max(this.initialTotal, remaining + this.reviewedCount);
    return {
      total,
      remaining,
      reviewed: this.reviewedCount,
      current: this.reviewedCount + 1,
      label: `${remaining}`,
    };
  }

  getProgress(): { answered: number; correct: number; total: number; durationMs: number } {
    const items = this.queue?.getAllItems?.() || [];
    return {
      answered: this.reviewedCount,
      correct: this.reviewedCount,
      total: Math.max(this.initialTotal, items.length + this.reviewedCount),
      durationMs: 0,
    };
  }

  getResumePrompt(): { message: string; data: unknown } | null {
    return null;
  }
}

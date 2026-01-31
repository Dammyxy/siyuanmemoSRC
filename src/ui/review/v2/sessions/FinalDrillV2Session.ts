import type { StorageManager } from '../../../../core/storage/manager.ts';
import { pushErrMsg } from '../../../../core/siyuan/api.ts';
import * as riff from '../../../../core/siyuan/riff.ts';
import { StorageFileJsonAdapter } from '../../../../core/queue/adapters/storageFile.ts';
import type { QueueItem, QueueUIConfig } from '../../../../core/queue/types.ts';
import type { IQueueStrategy, QueueFeedback } from '../../../../core/queue/abstraction/Strategy.ts';

type FinalDrillQueueLike = {
  getAllItems: () => QueueItem[];
  getRemovableTrait?: () => { removeItems: (items: QueueItem[]) => Promise<number> };
  getMutableTrait?: () => { insertAt: (items: QueueItem[], index: number) => Promise<void> };
};

type ProgressSnapshot = {
  inProgress: boolean;
  answered: number;
  correct: number;
  startedAt: number;
  durationMs: number;
  updatedAt: number;
  initialTotal: number;  // ✅ 新增：记录初始队列大小
};

export class FinalDrillV2Session implements IQueueStrategy<QueueItem> {
  private readonly queue: FinalDrillQueueLike;
  private readonly i18n?: Record<string, string>;
  private readonly api: {
    reviewRiffCard: typeof riff.reviewRiffCard;
    skipReviewRiffCard: typeof riff.skipReviewRiffCard;
  };
  private readonly storage?: StorageManager;
  private readonly progressAdapter: StorageFileJsonAdapter<ProgressSnapshot> | null;

  private progress: ProgressSnapshot = {
    inProgress: false,
    answered: 0,
    correct: 0,
    startedAt: 0,
    durationMs: 0,
    updatedAt: 0,
    initialTotal: 0,  // ✅ 新增
  };

  private resumePromptVisible = false;
  private lastTickAt = 0;

  constructor(options: {
    queue: FinalDrillQueueLike;
    storage?: StorageManager;
    i18n?: Record<string, string>;
    api?: Partial<FinalDrillV2Session['api']>;
  }) {
    this.queue = options.queue;
    this.storage = options.storage;
    this.i18n = options.i18n;
    this.api = {
      reviewRiffCard: options.api?.reviewRiffCard || riff.reviewRiffCard,
      skipReviewRiffCard: options.api?.skipReviewRiffCard || riff.skipReviewRiffCard,
    };
    this.progressAdapter = options.storage ? new StorageFileJsonAdapter<ProgressSnapshot>(options.storage, 'review-v2-final-drill.json') : null;
  }

  async init(): Promise<void> {
    if (!this.progressAdapter) return;
    const snap = await this.progressAdapter.load();
    if (!snap) return;
    const inProgress = Boolean((snap as any).inProgress);
    const answered = Math.max(0, Math.floor(Number((snap as any).answered) || 0));
    const correct = Math.max(0, Math.floor(Number((snap as any).correct) || 0));
    const startedAt = Math.max(0, Math.floor(Number((snap as any).startedAt) || 0));
    const durationMs = Math.max(0, Math.floor(Number((snap as any).durationMs) || 0));
    const updatedAt = Math.max(0, Math.floor(Number((snap as any).updatedAt) || 0));
    const initialTotal = Math.max(0, Math.floor(Number((snap as any).initialTotal) || 0));  // ✅ 新增
    this.progress = { inProgress, answered, correct, startedAt, durationMs, updatedAt, initialTotal };
    if (inProgress && this.queue.getAllItems().length > 0) {
      this.resumePromptVisible = true;
    }
  }

  getAllItems(): QueueItem[] {
    return this.queue.getAllItems();
  }

  getResumePrompt(): { message: string; data: unknown } | null {
    if (!this.resumePromptVisible) return null;
    return { message: this.t('resumeFinalDrillDesc', '检测到未完成的最终冲刺，是否继续？'), data: { updatedAt: this.progress.updatedAt } };
  }

  getProgress(): { answered: number; correct: number; total: number; durationMs: number } {
    const remaining = this.queue.getAllItems().length;
    // ✅ 修复：使用 initialTotal 作为总数
    // 刻意练习中，评分 < 4 的卡片会旋转到队尾，所以 total 应该是初始队列大小
    const total = this.progress.initialTotal || (this.progress.answered + remaining);
    return { answered: this.progress.answered, correct: this.progress.correct, total, durationMs: this.progress.durationMs };
  }

  getUIConfig(_currentItem: QueueItem | null) {
    const cfg: QueueUIConfig = { statsType: 'queue-size', showRatingButtons: true, allowSkip: true };
    return cfg;
  }

  async next(): Promise<QueueItem | null> {
    const items = this.queue.getAllItems();
    const head = items[0];
    return head || null;
  }

  async onFeedback(currentItem: QueueItem | null, feedback: QueueFeedback): Promise<void> {
    const action = feedback.action;
    if (action === 'custom') {
      const id = String(feedback.customActionId || '');
      if (id === 'resume-continue') {
        this.resumePromptVisible = false;
        this.ensureStarted();
        this.progress.inProgress = true;
        // ✅ 如果 initialTotal 为 0，说明是第一次开始，记录初始队列大小
        if (this.progress.initialTotal === 0) {
          this.progress.initialTotal = this.progress.answered + this.queue.getAllItems().length;
        }
        await this.saveProgress();
        return;
      }
      if (id === 'resume-start-over') {
        this.resumePromptVisible = false;
        const currentQueueSize = this.queue.getAllItems().length;
        this.progress = {
          inProgress: true,
          answered: 0,
          correct: 0,
          startedAt: Date.now(),
          durationMs: 0,
          updatedAt: Date.now(),
          initialTotal: currentQueueSize,  // ✅ 记录初始队列大小
        };
        this.lastTickAt = Date.now();
        await this.saveProgress();
        return;
      }
      return;
    }

    if (!currentItem) return;
    if (this.resumePromptVisible) return;

    this.tickDuration();

    if (action === 'skip') {
      const cardID = String((currentItem as any)?.cardID || '');
      const deckID = String((currentItem as any)?.deckID || '');
      if (cardID && deckID) {
        await this.api.skipReviewRiffCard(deckID, cardID).catch(async () => {
          await pushErrMsg(this.t('drillFailed', '机械练习启动失败'));
        });
      }
      await this.rotateToEnd(currentItem);
      await this.saveProgress();
      return;
    }

    if (action === 'rate') {
      const rating = feedback.rating;
      if (!rating) return;

      const cardID = String((currentItem as any)?.cardID || '');
      const deckID = String((currentItem as any)?.deckID || '');
      if (!cardID || !deckID) return;

      this.ensureStarted();
      this.progress.inProgress = true;

      // ✅ 如果 initialTotal 为 0，说明是第一次开始，记录初始队列大小
      if (this.progress.initialTotal === 0) {
        this.progress.initialTotal = this.progress.answered + this.queue.getAllItems().length;
      }

      await this.api.reviewRiffCard(deckID, cardID, rating).catch(async () => {
        await pushErrMsg(this.t('drillFailed', '机械练习启动失败'));
      });

      this.progress.answered += 1;
      if (rating >= 3) this.progress.correct += 1;

      // BUG 3 FIX: 只在评分 >= 4 时移除队列，评分 < 4 时旋转到队尾
      if (rating >= 4) {
        await this.removeFromQueue(currentItem);
      } else {
        await this.rotateToEnd(currentItem);
      }

      if (this.queue.getAllItems().length === 0) {
        this.progress.inProgress = false;
      }
      await this.saveProgress();
    }
  }

  async getStats(): Promise<{ size: number; label?: string; extra?: string }> {
    const p = this.getProgress();
    const remaining = this.queue.getAllItems().length;
    const size = remaining;
    const label = p.total > 0 ? `${p.answered}/${p.total}` : '';
    return { size, label };
  }

  private async rotateToEnd(item: QueueItem): Promise<void> {
    console.log('[FinalDrillV2Session] rotateToEnd called:', {
      cardID: (item as any)?.cardID,
      currentQueueSize: this.queue.getAllItems().length,
    });

    const trait = this.queue.getMutableTrait?.();
    const removable = this.queue.getRemovableTrait?.();

    console.log('[FinalDrillV2Session] Traits:', {
      hasMutableTrait: !!trait,
      hasRemovableTrait: !!removable,
    });

    if (!trait || !removable) {
      console.error('[FinalDrillV2Session] Missing traits!');
      return;
    }

    const removed = await removable.removeItems([item]);
    console.log('[FinalDrillV2Session] Removed from queue:', {
      removed,
      queueSizeAfterRemove: this.queue.getAllItems().length,
    });

    if (removed <= 0) {
      console.error('[FinalDrillV2Session] Failed to remove item');
      return;
    }

    const end = this.queue.getAllItems().length;
    console.log('[FinalDrillV2Session] Inserting at end:', {
      insertIndex: end,
      cardID: (item as any)?.cardID,
    });

    await trait.insertAt([item], end);

    console.log('[FinalDrillV2Session] After insertAt:', {
      queueSize: this.queue.getAllItems().length,
    });
  }

  private async removeFromQueue(item: QueueItem): Promise<void> {
    const removable = this.queue.getRemovableTrait?.();
    if (!removable) return;
    await removable.removeItems([item]);
  }

  private ensureStarted(): void {
    if (this.progress.startedAt > 0) return;
    const now = Date.now();
    this.progress.startedAt = now;
    this.lastTickAt = now;
  }

  private tickDuration(): void {
    const now = Date.now();
    if (!this.progress.startedAt) {
      this.lastTickAt = now;
      return;
    }
    if (!this.lastTickAt) {
      this.lastTickAt = now;
      return;
    }
    const delta = Math.max(0, now - this.lastTickAt);
    this.progress.durationMs += delta;
    this.lastTickAt = now;
  }

  private async saveProgress(): Promise<void> {
    this.progress.updatedAt = Date.now();
    if (!this.progressAdapter) return;
    await this.progressAdapter.save(this.progress);
  }

  private t(key: string, fallback: string): string {
    return this.i18n?.[key] || fallback;
  }
}

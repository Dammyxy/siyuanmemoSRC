import type { PluginFilePort } from '../../../../core/storage/ports.ts';
import { pushErrMsg } from '../../../../core/siyuan/api.ts';
import * as riff from '../../../../core/siyuan/riff.ts';
import { StorageFileJsonAdapter } from '../../../../core/queue/adapters/storageFile.ts';
import type { QueueItem, QueueUIConfig } from '../../../../core/queue/types.ts';
import type { IQueueStrategy, QueueFeedback } from '../../../../core/queue/abstraction/Strategy.ts';
import { createLogger } from '../../../../utils/logger.ts';

const logger = createLogger('FinalDrillV2Session');

type FinalDrillQueueLike = {
  getAllCards?: () => Promise<QueueItem[]>;
  getAllItems?: () => QueueItem[];
  getRemovableTrait?: () => { remove: (items: QueueItem[]) => Promise<number> };
  getMutableTrait?: () => { insertAt: (items: QueueItem[], index: number) => Promise<void> };
};

type ProgressSnapshot = {
  inProgress: boolean;
  answered: number;
  correct: number;
  startedAt: number;
  durationMs: number;
  updatedAt: number;
  initialTotal: number;
};

export class FinalDrillV2Session implements IQueueStrategy<QueueItem> {
  private readonly queue: FinalDrillQueueLike;
  private readonly i18n?: Record<string, string>;
  private readonly api: {
    reviewRiffCard: typeof riff.reviewRiffCard;
    skipReviewRiffCard: typeof riff.skipReviewRiffCard;
  };
  private readonly progressAdapter: StorageFileJsonAdapter<ProgressSnapshot> | null;
  private cachedItems: QueueItem[] = [];

  private progress: ProgressSnapshot = {
    inProgress: false,
    answered: 0,
    correct: 0,
    startedAt: 0,
    durationMs: 0,
    updatedAt: 0,
    initialTotal: 0,
  };

  private resumePromptVisible = false;
  private lastTickAt = 0;

  constructor(options: {
    queue: FinalDrillQueueLike;
    storage?: PluginFilePort;
    i18n?: Record<string, string>;
    api?: Partial<FinalDrillV2Session['api']>;
  }) {
    this.queue = options.queue;
    this.i18n = options.i18n;
    this.api = {
      reviewRiffCard: options.api?.reviewRiffCard || riff.reviewRiffCard,
      skipReviewRiffCard: options.api?.skipReviewRiffCard || riff.skipReviewRiffCard,
    };
    this.progressAdapter = options.storage
      ? new StorageFileJsonAdapter<ProgressSnapshot>(options.storage, 'review-v2-final-drill.json')
      : null;
  }

  async init(): Promise<void> {
    if (!this.progressAdapter) {
      await this.refreshItems();
      return;
    }

    const snap = await this.progressAdapter.load();
    await this.refreshItems();
    if (!snap) return;

    const inProgress = Boolean((snap as any).inProgress);
    const answered = Math.max(0, Math.floor(Number((snap as any).answered) || 0));
    const correct = Math.max(0, Math.floor(Number((snap as any).correct) || 0));
    const startedAt = Math.max(0, Math.floor(Number((snap as any).startedAt) || 0));
    const durationMs = Math.max(0, Math.floor(Number((snap as any).durationMs) || 0));
    const updatedAt = Math.max(0, Math.floor(Number((snap as any).updatedAt) || 0));
    const initialTotal = Math.max(0, Math.floor(Number((snap as any).initialTotal) || 0));
    this.progress = { inProgress, answered, correct, startedAt, durationMs, updatedAt, initialTotal };

    if (inProgress && this.cachedItems.length > 0) {
      this.resumePromptVisible = true;
    }
  }

  getAllItems(): QueueItem[] {
    return [...this.cachedItems];
  }

  getResumePrompt(): { message: string; data: unknown } | null {
    if (!this.resumePromptVisible) return null;
    return {
      message: this.t('resumeFinalDrillDesc', '检测到未完成的最终冲刺，是否继续？'),
      data: { updatedAt: this.progress.updatedAt },
    };
  }

  getProgress(): { answered: number; correct: number; total: number; durationMs: number } {
    const remaining = this.cachedItems.length;
    const total = this.progress.initialTotal || (this.progress.answered + remaining);
    return {
      answered: this.progress.answered,
      correct: this.progress.correct,
      total,
      durationMs: this.progress.durationMs,
    };
  }

  getUIConfig(_currentItem: QueueItem | null): QueueUIConfig {
    const cfg: QueueUIConfig = { statsType: 'queue-size', showRatingButtons: true, allowSkip: true };
    return cfg;
  }

  async next(): Promise<QueueItem | null> {
    const items = await this.refreshItems();
    return items[0] || null;
  }

  async onFeedback(currentItem: QueueItem | null, feedback: QueueFeedback): Promise<void> {
    const action = feedback.action;
    if (action === 'custom') {
      const id = String(feedback.customActionId || '');
      if (id === 'resume-continue') {
        this.resumePromptVisible = false;
        this.ensureStarted();
        this.progress.inProgress = true;
        await this.refreshItems();
        if (this.progress.initialTotal === 0) {
          this.progress.initialTotal = this.progress.answered + this.cachedItems.length;
        }
        await this.saveProgress();
        return;
      }
      if (id === 'resume-start-over') {
        this.resumePromptVisible = false;
        const currentQueueSize = (await this.refreshItems()).length;
        this.progress = {
          inProgress: true,
          answered: 0,
          correct: 0,
          startedAt: Date.now(),
          durationMs: 0,
          updatedAt: Date.now(),
          initialTotal: currentQueueSize,
        };
        this.lastTickAt = Date.now();
        await this.saveProgress();
        return;
      }
      return;
    }

    if (!currentItem || this.resumePromptVisible) return;

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

    if (action !== 'rate') return;

    const rating = feedback.rating;
    if (!rating) return;

    const cardID = String((currentItem as any)?.cardID || '');
    const deckID = String((currentItem as any)?.deckID || '');
    if (!cardID || !deckID) return;

    this.ensureStarted();
    this.progress.inProgress = true;
    await this.refreshItems();
    if (this.progress.initialTotal === 0) {
      this.progress.initialTotal = this.progress.answered + this.cachedItems.length;
    }

    await this.api.reviewRiffCard(deckID, cardID, rating).catch(async () => {
      await pushErrMsg(this.t('drillFailed', '机械练习启动失败'));
    });

    this.progress.answered += 1;
    if (rating >= 3) this.progress.correct += 1;

    if (rating >= 4) {
      await this.removeFromQueue(currentItem);
    } else {
      await this.rotateToEnd(currentItem);
    }

    await this.refreshItems();
    if (this.cachedItems.length === 0) {
      this.progress.inProgress = false;
    }
    await this.saveProgress();
  }

  async getStats(): Promise<{ size: number; label?: string; extra?: string }> {
    await this.refreshItems();
    const p = this.getProgress();
    const size = this.cachedItems.length;
    const label = p.total > 0 ? `${p.answered}/${p.total}` : '';
    return { size, label };
  }

  private async rotateToEnd(item: QueueItem): Promise<void> {
    const trait = this.queue.getMutableTrait?.();
    const removable = this.queue.getRemovableTrait?.();

    if (!trait || !removable) {
      logger.error('Missing mutable/removable traits');
      return;
    }

    const removed = await removable.remove([item]);
    if (removed <= 0) {
      logger.error('Failed to remove item before rotate');
      return;
    }

    await this.refreshItems();
    const end = this.cachedItems.length;
    await trait.insertAt([item], end);
    await this.refreshItems();
  }

  private async removeFromQueue(item: QueueItem): Promise<void> {
    const removable = this.queue.getRemovableTrait?.();
    if (!removable) return;
    await removable.remove([item]);
    await this.refreshItems();
  }

  private async refreshItems(): Promise<QueueItem[]> {
    if (typeof this.queue.getAllCards === 'function') {
      const cards = await this.queue.getAllCards();
      this.cachedItems = Array.isArray(cards) ? cards : [];
      return this.cachedItems;
    }

    if (typeof this.queue.getAllItems === 'function') {
      logger.warn('Using legacy getAllItems() fallback in FinalDrillV2Session');
      const items = this.queue.getAllItems();
      this.cachedItems = Array.isArray(items) ? items : [];
      return this.cachedItems;
    }

    this.cachedItems = [];
    return this.cachedItems;
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

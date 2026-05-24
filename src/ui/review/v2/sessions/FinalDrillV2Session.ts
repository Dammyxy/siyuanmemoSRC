import type { PluginFilePort } from '../../../../core/storage/ports.ts';
import { StorageFileJsonAdapter } from '../../../../core/queue/adapters/storageFile.ts';
import type { QueueItem, QueueUIConfig } from '../../../../core/queue/types.ts';
import type { IQueueStrategy, QueueFeedback } from '../../../../core/queue/abstraction/Strategy.ts';
import type { ReviewSiyuanPort } from '@/application/ports/ReviewSiyuanPort';
import type { ReviewApplicationService } from '@/application/services/ReviewApplicationService';
import { createLogger } from '../../../../utils/logger.ts';

const logger = createLogger('FinalDrillV2Session');

type FinalDrillQueueLike = {
  getAllCards: () => Promise<QueueItem[]>;
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

type QueueItemWithLegacyIds = QueueItem & {
  cardID?: unknown;
  cardId?: unknown;
  deckID?: unknown;
  deckId?: unknown;
  id?: unknown;
};

type PluginLike = {
  getContext?: () => {
    getReviewService?: () => Pick<ReviewApplicationService, 'executeFinalDrillRiffFeedback' | 'getSiyuanApi'>;
  };
};

type FinalDrillReviewService = Pick<ReviewApplicationService, 'executeFinalDrillRiffFeedback' | 'getSiyuanApi'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toNonNegativeInt(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function parseProgressSnapshot(input: unknown): ProgressSnapshot {
  const snap = isRecord(input) ? input : {};
  return {
    inProgress: Boolean(snap.inProgress),
    answered: toNonNegativeInt(snap.answered),
    correct: toNonNegativeInt(snap.correct),
    startedAt: toNonNegativeInt(snap.startedAt),
    durationMs: toNonNegativeInt(snap.durationMs),
    updatedAt: toNonNegativeInt(snap.updatedAt),
    initialTotal: toNonNegativeInt(snap.initialTotal),
  };
}

function resolveCardID(item: QueueItem): string {
  const candidate = item as QueueItemWithLegacyIds;
  const raw = candidate.cardID ?? candidate.cardId ?? candidate.id;
  return raw == null ? '' : String(raw);
}

function resolveDeckID(item: QueueItem): string {
  const candidate = item as QueueItemWithLegacyIds;
  const raw = candidate.deckID ?? candidate.deckId;
  return raw == null ? '' : String(raw);
}

export class FinalDrillV2Session implements IQueueStrategy<QueueItem> {
  private readonly queue: FinalDrillQueueLike;
  private readonly i18n?: Record<string, string>;
  private readonly reviewService: FinalDrillReviewService;
  private readonly siyuanApi: Pick<ReviewSiyuanPort, 'pushErrMsg'>;
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
    plugin?: unknown;
    reviewService?: FinalDrillReviewService;
    siyuanApi?: Pick<ReviewSiyuanPort, 'pushErrMsg'>;
  }) {
    this.queue = options.queue;
    this.i18n = options.i18n;

    const contextReviewService = (options.plugin as PluginLike | undefined)
      ?.getContext?.()
      ?.getReviewService?.();

    this.reviewService = options.reviewService || contextReviewService;
    this.siyuanApi = options.siyuanApi || this.reviewService?.getSiyuanApi?.();
    if (!this.reviewService) {
      throw new Error('FinalDrillV2Session requires review application service');
    }
    if (!this.siyuanApi) {
      throw new Error('FinalDrillV2Session requires review siyuan api');
    }

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

    this.progress = parseProgressSnapshot(snap);
    if (this.progress.inProgress && this.cachedItems.length > 0) {
      this.resumePromptVisible = true;
    }
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
    return { statsType: 'queue-size', showRatingButtons: true, allowSkip: true };
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
      const cardID = resolveCardID(currentItem);
      const deckID = resolveDeckID(currentItem);
      if (cardID && deckID) {
        const ok = await this.executeRiffFeedback({
          action: 'skip',
          deckId: deckID,
          riffCardId: cardID,
        });
        if (!ok) {
          await this.siyuanApi.pushErrMsg(this.t('drillFailed', '最终冲刺操作失败'));
          return;
        }
      }
      await this.rotateToEnd(currentItem);
      await this.saveProgress();
      return;
    }

    if (action !== 'rate') return;
    const rating = feedback.rating;
    if (!rating) return;

    const cardID = resolveCardID(currentItem);
    const deckID = resolveDeckID(currentItem);
    if (!cardID || !deckID) return;

    this.ensureStarted();
    this.progress.inProgress = true;
    await this.refreshItems();
    if (this.progress.initialTotal === 0) {
      this.progress.initialTotal = this.progress.answered + this.cachedItems.length;
    }

    const ok = await this.executeRiffFeedback({
      action: 'rate',
      deckId: deckID,
      riffCardId: cardID,
      rating,
    });
    if (!ok) {
      await this.siyuanApi.pushErrMsg(this.t('drillFailed', '最终冲刺操作失败'));
      return;
    }

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
    const cards = await this.queue.getAllCards();
    this.cachedItems = Array.isArray(cards) ? cards : [];
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

  private async executeRiffFeedback(input: {
    action: 'rate' | 'skip';
    deckId: string;
    riffCardId: string;
    rating?: number;
  }): Promise<boolean> {
    const now = Date.now();
    const commandId = `final-drill:${input.action}:${input.deckId}:${input.riffCardId}:${now}`;
    try {
      const result = await this.reviewService.executeFinalDrillRiffFeedback({
        commandId,
        idempotencyKey: commandId,
        sessionId: 'final-drill',
        action: input.action,
        deckId: input.deckId,
        riffCardId: input.riffCardId,
        rating: input.rating ?? null,
      });
      return result.status === 'completed' || result.status === 'duplicate';
    } catch (error) {
      logger.error('FinalDrill backend Riff feedback failed', error);
      return false;
    }
  }
}

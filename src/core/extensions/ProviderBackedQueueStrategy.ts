import type { IQueueStrategy, QueueFeedback } from '../queue/abstraction/Strategy.ts';
import type { QueueStats, QueueUIConfig } from '../queue/types.ts';
import type { QueueProvider } from './QueueProvider.ts';

type Options<TItem> = {
  providerOptions?: Record<string, unknown>;
  uiConfig?: QueueUIConfig;
  getCardId?: (item: TItem) => string;
  includeReviewedCards?: boolean;
  statsLabel?: string;
  skipBehavior?: 'drop' | 'rotate';
  getProgress?: () => unknown;
  getResumePrompt?: () => { message: string; data: unknown } | null;
};

export class ProviderBackedQueueStrategy<TItem = any> implements IQueueStrategy<TItem> {
  private readonly provider: QueueProvider<TItem>;
  private readonly providerOptions: Record<string, unknown>;
  private readonly uiConfig: QueueUIConfig;
  private readonly getCardId: (item: TItem) => string;
  private readonly includeReviewedCards: boolean;
  private readonly statsLabel: string;
  private readonly skipBehavior: 'drop' | 'rotate';
  private readonly getProgressFn?: () => unknown;
  private readonly getResumePromptFn?: () => { message: string; data: unknown } | null;

  private loaded = false;
  private buffer: TItem[] = [];
  private current: TItem | null = null;
  private keepCurrentOnNext = false;

  constructor(provider: QueueProvider<TItem>, options?: Options<TItem>) {
    this.provider = provider;
    this.providerOptions = options?.providerOptions || {};
    this.uiConfig = options?.uiConfig || { statsType: 'queue-size', showRatingButtons: true, allowSkip: true };
    this.getCardId = options?.getCardId || ((it: any) => String(it?.cardID || it?.cardId || it?.id || ''));
    this.includeReviewedCards = options?.includeReviewedCards ?? true;
    this.statsLabel = String(options?.statsLabel || provider.displayName || provider.id || '');
    this.skipBehavior = options?.skipBehavior || 'drop';
    this.getProgressFn = options?.getProgress;
    this.getResumePromptFn = options?.getResumePrompt;
  }

  getUIConfig(_currentItem: TItem | null): QueueUIConfig {
    return this.uiConfig;
  }

  getProgress(): unknown {
    return this.getProgressFn?.();
  }

  getResumePrompt(): { message: string; data: unknown } | null {
    return this.getResumePromptFn?.() || null;
  }

  async getStats(): Promise<QueueStats> {
    console.log('[ProviderBackedQueueStrategy] getStats called');
    await this.ensureLoaded();
    console.log('[ProviderBackedQueueStrategy] getStats: after ensureLoaded', {
      bufferLength: this.buffer.length,
      hasGetStats: typeof (this.provider as any)?.getStats === 'function',
    });
    if (typeof (this.provider as any)?.getStats === 'function') {
      const s = await (this.provider as any).getStats(this.providerOptions).catch(() => null);
      console.log('[ProviderBackedQueueStrategy] getStats: provider stats result', s);
      const remaining = Number.isFinite(Number(s?.remaining))
        ? Math.max(0, Number(s?.remaining) || 0)
        : Number.isFinite(Number(s?.total)) && Number.isFinite(Number(s?.current))
          ? Math.max(0, (Number(s?.total) || 0) - (Number(s?.current) || 0))
          : undefined;
      const size = Number.isFinite(Number(remaining)) ? (remaining as number) : this.buffer.length;
      const label = String(s?.label || this.statsLabel || '');
      const extra = String(s?.extra || '');
      return extra ? { size, label, extra } : { size, label };
    }
    return { size: this.buffer.length, label: this.statsLabel };
  }

  async next(): Promise<TItem | null> {
    console.log('[ProviderBackedQueueStrategy] next called');
    await this.ensureLoaded();
    console.log('[ProviderBackedQueueStrategy] next: buffer length', this.buffer.length);
    if (this.keepCurrentOnNext && this.current) {
      this.keepCurrentOnNext = false;
      return this.current;
    }
    const next = this.buffer.shift() || null;
    this.current = next;
    console.log('[ProviderBackedQueueStrategy] next: returning item', {
      hasItem: !!next,
      itemId: next ? this.getCardId(next) : null,
      remainingBuffer: this.buffer.length,
    });
    return next;
  }

  async onFeedback(currentItem: TItem | null, feedback: QueueFeedback): Promise<void> {
    const item = currentItem || this.current;
    if (feedback.action === 'custom') {
      const actionId = String(feedback.customActionId || '');
      if (!actionId) return;
      const fn = (this.provider as any)?.onCustomAction;
      if (typeof fn === 'function') {
        const res = await fn.call(this.provider, actionId, item, this.buffer, this.providerOptions);
        if (res === false) {
          this.keepCurrentOnNext = true;
        }
      }
      return;
    }

    if (!item) return;
    const cardId = this.getCardId(item);
    if (!cardId) return;

    if (feedback.action === 'skip') {
      await this.provider.skipReviewCard(cardId);
      if (this.skipBehavior === 'rotate') {
        this.buffer.push(item);
      }
      this.current = null;
      return;
    }

    if (feedback.action === 'rate') {
      const rating = feedback.rating;
      if (!rating) return;
      const reviewed = this.includeReviewedCards ? [item, ...this.buffer] : undefined;
      await this.provider.reviewCard(cardId, rating, reviewed);
      this.current = null;

      // 🔧 FIX: Reload buffer after review to sync with underlying queue changes
      // This is needed when the provider's underlying queue modifies items (e.g., FinalDrill rotateToEnd)
      console.log('[ProviderBackedQueueStrategy] Reloading buffer after review');
      this.loaded = false;
      await this.ensureLoaded();
      console.log('[ProviderBackedQueueStrategy] Buffer reloaded:', {
        newBufferLength: this.buffer.length,
      });
      return;
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    console.log('[ProviderBackedQueueStrategy] Loading cards from provider:', {
      providerId: (this.provider as any)?.id || (this.provider as any)?.displayName,
      providerOptions: this.providerOptions,
    });
    const items = await this.provider.getDueCards(this.providerOptions);
    console.log('[ProviderBackedQueueStrategy] Cards loaded:', {
      count: Array.isArray(items) ? items.length : 0,
      items: Array.isArray(items) ? items.slice(0, 5) : items,
    });
    this.buffer = Array.isArray(items) ? [...items] : [];
  }
}

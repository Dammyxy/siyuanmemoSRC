/**
 * Provider-backed Queue Strategy
 * 
 * @deprecated 旧架构适配器层，用于包装 Provider。
 * 新架构请直接使用 BaseReviewQueue，不需要 Provider 层。
 * 
 * 参考：
 * - 新架构：src/core/queue/domain/BaseReviewQueue.ts
 * - 迁移示例：src/index.ts 中的 TAB 恢复逻辑
 */

import type { IQueueStrategy, QueueFeedback } from '../queue/abstraction/Strategy.ts';
import type { QueueStats, QueueUIConfig } from '../queue/types.ts';
import type { QueueProvider } from './QueueProvider.ts';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ProviderBackedQueueStrategy');

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

type CardIdShape = {
  cardID?: unknown;
  cardId?: unknown;
  id?: unknown;
};

function defaultGetCardId(item: unknown): string {
  if (typeof item !== 'object' || item === null) {
    return '';
  }
  const shaped = item as CardIdShape;
  const raw = shaped.cardID ?? shaped.cardId ?? shaped.id;
  return raw == null ? '' : String(raw);
}

export class ProviderBackedQueueStrategy<TItem = unknown> implements IQueueStrategy<TItem> {
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
    this.getCardId = options?.getCardId || ((it: TItem) => defaultGetCardId(it));
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
    logger.debug('getStats called');
    await this.ensureLoaded();
    logger.debug('getStats: after ensureLoaded', {
      bufferLength: this.buffer.length,
      hasGetStats: typeof this.provider.getStats === 'function',
    });
    if (typeof this.provider.getStats === 'function') {
      const s = await this.provider.getStats(this.providerOptions).catch(() => null);
      logger.debug('getStats: provider stats result', s);
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
    logger.debug('next called');
    await this.ensureLoaded();
    logger.debug('next: buffer length', this.buffer.length);
    if (this.keepCurrentOnNext && this.current) {
      this.keepCurrentOnNext = false;
      return this.current;
    }
    const next = this.buffer.shift() || null;
    this.current = next;
    logger.debug('next: returning item', {
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
      const fn = this.provider.onCustomAction;
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

      // 🔧 Reload buffer after review to sync with provider's state
      // For retrieval practice, this will get the updated SessionManager state
      // For other providers, this will reload from the underlying queue
      logger.debug('Reloading buffer after review');
      this.loaded = false;
      await this.ensureLoaded();
      logger.debug('Buffer reloaded:', {
        newBufferLength: this.buffer.length,
      });
      return;
    }
  }

  /**
   * 插入卡片到指定位置
   * 
   * @param cardId 卡片 ID
   * @param position 位置 (1-based)
   */
  async insertAt(cardId: string, position: number): Promise<void> {
    logger.debug('insertAt called:', { cardId, position });
    
    if (typeof this.provider.insertAt !== 'function') {
      throw new Error(`Provider ${this.provider.id} does not support insertAt`);
    }

    await this.provider.insertAt(cardId, position);
    this.loaded = false;
    await this.ensureLoaded();
  }

  /**
   * 获取剩余卡片数量
   */
  async getRemainingSize(): Promise<number> {
    await this.ensureLoaded();
    return this.buffer.length;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    logger.debug('Loading cards from provider:', {
      providerId: this.provider.id || this.provider.displayName,
      providerOptions: this.providerOptions,
    });
    const items = await this.provider.getDueCards(this.providerOptions);
    logger.debug('Cards loaded:', {
      count: Array.isArray(items) ? items.length : 0,
      items: Array.isArray(items) ? items.slice(0, 5) : items,
    });
    this.buffer = Array.isArray(items) ? [...items] : [];
  }
}

import { AsyncMutex } from './AsyncMutex.ts';
import type { DismissType, IQueueStrategy, InsertOptions, QueueEvent, QueueId, QueueInterface, QueueState, QueueStats, QueueUIConfig, RescheduleOptions, ReviewFeedback } from './types';
import type { QueueMonitor } from './monitors.ts';

export class QueueContext<TItem> implements QueueInterface<TItem> {
  private readonly mutex = new AsyncMutex();
  private readonly strategies = new Map<QueueId, IQueueStrategy<TItem>>();
  private readonly monitors: QueueMonitor[];
  private currentId: QueueId;

  constructor(options: { initial: QueueId; monitors?: QueueMonitor[] }) {
    this.currentId = options.initial;
    this.monitors = options.monitors || [];
  }

  register(queueId: QueueId, strategy: IQueueStrategy<TItem>): void {
    this.strategies.set(queueId, strategy);
  }

  setStrategy(queueId: QueueId): void {
    this.currentId = queueId;
  }

  getStrategyId(): QueueId {
    return this.currentId;
  }

  async getState(): Promise<QueueState> {
    const s = this.getStrategy();
    const size = await Promise.resolve(s.size());
    const empty = await Promise.resolve(s.isEmpty());
    return { queueId: this.currentId, size, empty };
  }

  addItem(item: TItem): Promise<void> {
    return this.withMetrics('add', async () => {
      const s = this.getStrategy();
      await Promise.resolve(s.addItem(item));
    }, item);
  }

  getNextItem(): Promise<TItem | null> {
    return this.withMetrics('next', async () => {
      const s = this.getStrategy();
      return await Promise.resolve(s.getNextItem());
    });
  }

  next(): Promise<TItem | null> {
    return this.withMetrics('next', async () => {
      const s = this.getStrategy();
      if (typeof (s as any).next === 'function') {
        return await Promise.resolve((s as any).next());
      }
      return await Promise.resolve(s.getNextItem());
    });
  }

  removeItem(item: TItem): Promise<boolean> {
    return this.withMetrics('remove', async () => {
      const s = this.getStrategy();
      return await Promise.resolve(s.removeItem(item));
    }, item);
  }

  size(): Promise<number> {
    return this.withMetrics('size', async () => {
      const s = this.getStrategy();
      return await Promise.resolve(s.size());
    });
  }

  isEmpty(): Promise<boolean> {
    return this.withMetrics('isEmpty', async () => {
      const s = this.getStrategy();
      return await Promise.resolve(s.isEmpty());
    });
  }

  async onFeedback(item: TItem | null, feedback: ReviewFeedback): Promise<void> {
    await this.withMetrics('feedback', async () => {
      const s = this.getStrategy();
      const fn = (s as any).onFeedback;
      if (typeof fn !== 'function') {
        throw new Error(`Queue strategy does not implement onFeedback: ${this.currentId}`);
      }
      await fn.call(s, item, feedback);
    }, { item, feedback });
  }

  getUIConfig(currentItem: TItem | null): QueueUIConfig {
    const s = this.getStrategy();
    const fn = (s as any).getUIConfig;
    if (typeof fn === 'function') {
      return fn.call(s, currentItem);
    }
    return { statsType: 'queue-size', showRatingButtons: true, allowSkip: true };
  }

  async getStats(): Promise<QueueStats> {
    return this.withMetrics('stats', async () => {
      const s = this.getStrategy();
      const fn = (s as any).getStats;
      if (typeof fn === 'function') {
        return await Promise.resolve(fn.call(s));
      }
      const size = await Promise.resolve(s.size());
      return { size };
    });
  }

  async reschedule(item: TItem, options: RescheduleOptions): Promise<void> {
    await this.withMetrics('feedback', async () => {
      const s = this.getStrategy();
      const fn = (s as any).reschedule;
      if (typeof fn !== 'function') {
        throw new Error(`Queue strategy does not implement reschedule: ${this.currentId}`);
      }
      await fn.call(s, item, options);
    }, { item, options });
  }

  async insert(item: TItem, options: InsertOptions): Promise<void> {
    await this.withMetrics('add', async () => {
      const s = this.getStrategy();
      const fn = (s as any).insert;
      if (typeof fn !== 'function') {
        throw new Error(`Queue strategy does not implement insert: ${this.currentId}`);
      }
      await fn.call(s, item, options);
    }, { item, options });
  }

  async dismiss(item: TItem, type: DismissType): Promise<void> {
    await this.withMetrics('remove', async () => {
      const s = this.getStrategy();
      const fn = (s as any).dismiss;
      if (typeof fn !== 'function') {
        throw new Error(`Queue strategy does not implement dismiss: ${this.currentId}`);
      }
      await fn.call(s, item, type);
    }, { item, type });
  }

  private getStrategy(): IQueueStrategy<TItem> {
    const s = this.strategies.get(this.currentId);
    if (!s) {
      throw new Error(`Queue strategy not registered: ${this.currentId}`);
    }
    return s;
  }

  private async withMetrics<TResult>(
    op: QueueEvent['op'],
    fn: () => Promise<TResult>,
    payload?: unknown,
  ): Promise<TResult> {
    return this.mutex.runExclusive(async () => {
      const s = this.getStrategy();
      const start = performance.now();
      const sizeBefore = await Promise.resolve(s.size()).catch(() => undefined);
      try {
        const result = await fn();
        const durationMs = performance.now() - start;
        const sizeAfter = await Promise.resolve(s.size()).catch(() => undefined);
        this.emit({ op, queueId: this.currentId, durationMs, sizeBefore, sizeAfter, ok: true, payload });
        return result;
      } catch (error) {
        const durationMs = performance.now() - start;
        const sizeAfter = await Promise.resolve(s.size()).catch(() => undefined);
        this.emit({ op, queueId: this.currentId, durationMs, sizeBefore, sizeAfter, ok: false, error, payload });
        throw error;
      }
    });
  }

  private emit(event: QueueEvent): void {
    for (const m of this.monitors) {
      try {
        m.onEvent(event);
      } catch {}
    }
  }
}


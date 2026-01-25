import { AsyncMutex } from './AsyncMutex.ts';
import type { QueueEvent, QueueId, QueueInterface, QueueState } from './types';
import type { QueueMonitor } from './monitors.ts';

export class QueueContext<TItem> implements QueueInterface<TItem> {
  private readonly mutex = new AsyncMutex();
  private readonly strategies = new Map<QueueId, QueueInterface<TItem>>();
  private readonly monitors: QueueMonitor[];
  private currentId: QueueId;

  constructor(options: { initial: QueueId; monitors?: QueueMonitor[] }) {
    this.currentId = options.initial;
    this.monitors = options.monitors || [];
  }

  register(queueId: QueueId, strategy: QueueInterface<TItem>): void {
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

  private getStrategy(): QueueInterface<TItem> {
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
      } catch { }
    }
  }
}


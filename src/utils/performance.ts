import { createLogger } from '@/utils/logger';

const logger = createLogger('PerformanceMonitor');

type MemoryInfo = {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
};

export class PerformanceMonitor {
  private static readonly TIMINGS: Map<string, number[]> = new Map();
  private static readonly COUNTERS: Map<string, number> = new Map();
  private static enabled = process.env.NODE_ENV === 'development';

  static measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (!this.enabled) return fn();

    const start = performance.now();
    return fn()
      .then((result) => {
        const duration = performance.now() - start;
        this.recordTiming(name, duration);
        return result;
      })
      .catch((error) => {
        const duration = performance.now() - start;
        this.recordTiming(name, duration);
        throw error;
      });
  }

  static measureSync<T>(name: string, fn: () => T): T {
    if (!this.enabled) return fn();

    const start = performance.now();
    try {
      return fn();
    } finally {
      const duration = performance.now() - start;
      this.recordTiming(name, duration);
    }
  }

  static mark(name: string): void {
    if (this.enabled && performance.mark) {
      performance.mark(name);
    }
  }

  static measureBetween(name: string, startMark: string, endMark: string): void {
    if (!this.enabled || !performance.measure) return;

    try {
      performance.measure(name, startMark, endMark);
      const measure = performance.getEntriesByName(name)[0];
      if (measure) {
        logger.info(`[PERF] ${name}: ${measure.duration.toFixed(2)}ms`);
        this.recordTiming(name, measure.duration);
      }
    } catch {
      // Ignore missing marks
    }
  }

  static async measureAsync<T>(
    name: string,
    fn: () => Promise<T>,
    threshold = 100
  ): Promise<T> {
    if (!this.enabled) return fn();

    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = performance.now() - start;
      this.recordTiming(name, duration);

      if (duration > threshold) {
        logger.warn(
          `[PERF] ${name} took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`
        );
      }
    }
  }

  private static recordTiming(name: string, duration: number): void {
    if (!this.TIMINGS.has(name)) {
      this.TIMINGS.set(name, []);
    }
    const timings = this.TIMINGS.get(name)!;
    timings.push(duration);

    if (timings.length > 100) {
      timings.shift();
    }
  }

  private static percentile(values: number[], ratio: number): number {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
    return sorted[index];
  }

  static getStats(name: string): {
    avg: number;
    min: number;
    max: number;
    count: number;
    p50: number;
    p95: number;
  } {
    const timings = this.TIMINGS.get(name) || [];
    if (timings.length === 0) {
      return { avg: 0, min: 0, max: 0, count: 0, p50: 0, p95: 0 };
    }

    const sum = timings.reduce((a, b) => a + b, 0);
    return {
      avg: sum / timings.length,
      min: Math.min(...timings),
      max: Math.max(...timings),
      count: timings.length,
      p50: this.percentile(timings, 0.5),
      p95: this.percentile(timings, 0.95),
    };
  }

  static getAllStats(): Map<
    string,
    { avg: number; min: number; max: number; count: number; p50: number; p95: number }
  > {
    const allStats = new Map();
    for (const [name] of this.TIMINGS) {
      allStats.set(name, this.getStats(name));
    }
    return allStats;
  }

  static clearStats(): void {
    this.TIMINGS.clear();
    this.COUNTERS.clear();
  }

  static incrementCounter(name: string, delta = 1): void {
    const current = this.COUNTERS.get(name) || 0;
    this.COUNTERS.set(name, current + Math.max(0, Math.floor(delta)));
  }

  static getCounter(name: string): number {
    return this.COUNTERS.get(name) || 0;
  }

  static getAllCounters(): Map<string, number> {
    return new Map(this.COUNTERS);
  }

  static printReport(): void {
    if (!this.enabled) return;

    const stats = Array.from(this.getAllStats().entries()).sort((a, b) => b[1].p95 - a[1].p95);
    logger.info('[PERF REPORT]');
    for (const [name, stat] of stats) {
      logger.info(
        `${name}: avg=${stat.avg.toFixed(2)}ms min=${stat.min.toFixed(2)}ms max=${stat.max.toFixed(2)}ms p50=${stat.p50.toFixed(2)}ms p95=${stat.p95.toFixed(2)}ms count=${stat.count}`
      );
    }

    const counters = Array.from(this.getAllCounters().entries()).sort((a, b) => b[1] - a[1]);
    if (counters.length > 0) {
      logger.info('[PERF COUNTERS]');
      for (const [name, value] of counters) {
        logger.info(`${name}: ${value}`);
      }
    }
  }

  static logMemoryUsage(): void {
    if (!this.enabled) return;

    const perf = performance as Performance & { memory?: MemoryInfo };
    if (perf.memory) {
      const memory = perf.memory;
      logger.info('[MEMORY]', {
        used: `${(memory.usedJSHeapSize / 1048576).toFixed(2)} MB`,
        total: `${(memory.totalJSHeapSize / 1048576).toFixed(2)} MB`,
        limit: `${(memory.jsHeapSizeLimit / 1048576).toFixed(2)} MB`,
        usage: `${((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(2)}%`,
      });
    }
  }

  static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  static isEnabled(): boolean {
    return this.enabled;
  }
}

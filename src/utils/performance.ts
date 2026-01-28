/**
 * 性能监控工具
 */

export class PerformanceMonitor {
    private static readonly TIMINGS: Map<string, number[]> = new Map();

    /**
     * 记录性能指标
     */
    static measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
        const start = performance.now();
        return fn().then(result => {
            const duration = performance.now() - start;
            this.recordTiming(name, duration);
            return result;
        });
    }

    /**
     * 记录同步函数的性能
     */
    static measureSync<T>(name: string, fn: () => T): T {
        const start = performance.now();
        const result = fn();
        const duration = performance.now() - start;
        this.recordTiming(name, duration);
        return result;
    }

    /**
     * 记录时间
     */
    private static recordTiming(name: string, duration: number): void {
        if (!this.TIMINGS.has(name)) {
            this.TIMINGS.set(name, []);
        }
        const timings = this.TIMINGS.get(name)!;
        timings.push(duration);
        
        // 限制历史记录数量，避免内存泄漏
        if (timings.length > 100) {
            timings.shift();
        }
    }

    /**
     * 获取统计信息
     */
    static getStats(name: string): { avg: number; min: number; max: number; count: number } {
        const timings = this.TIMINGS.get(name) || [];
        if (timings.length === 0) {
            return { avg: 0, min: 0, max: 0, count: 0 };
        }

        const sum = timings.reduce((a, b) => a + b, 0);
        return {
            avg: sum / timings.length,
            min: Math.min(...timings),
            max: Math.max(...timings),
            count: timings.length
        };
    }

    /**
     * 获取所有统计信息
     */
    static getAllStats(): Map<string, { avg: number; min: number; max: number; count: number }> {
        const allStats = new Map();
        for (const [name] of this.TIMINGS) {
            allStats.set(name, this.getStats(name));
        }
        return allStats;
    }

    /**
     * 清除统计信息
     */
    static clearStats(): void {
        this.TIMINGS.clear();
    }

    /**
     * 输出性能报告
     */
    static printReport(): void {
        console.group('📊 性能监控报告');
        for (const [name, stats] of this.getAllStats()) {
            console.log(`${name}:`, stats);
        }
        console.groupEnd();
    }
}
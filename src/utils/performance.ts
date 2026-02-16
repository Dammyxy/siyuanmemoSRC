/**
 * 性能监控工具
 */

export class PerformanceMonitor {
    private static readonly TIMINGS: Map<string, number[]> = new Map();
    private static enabled = process.env.NODE_ENV === 'development';

    /**
     * 记录性能指标
     */
    static measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
        if (!this.enabled) return fn();
        
        const start = performance.now();
        return fn().then(result => {
            const duration = performance.now() - start;
            this.recordTiming(name, duration);
            return result;
        }).catch(error => {
            const duration = performance.now() - start;
            this.recordTiming(name, duration);
            throw error;
        });
    }

    /**
     * 记录同步函数的性能
     */
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

    /**
     * 添加性能标记
     */
    static mark(name: string): void {
        if (this.enabled && performance.mark) {
            performance.mark(name);
        }
    }

    /**
     * 测量两个标记之间的时间
     */
    static measureBetween(name: string, startMark: string, endMark: string): void {
        if (!this.enabled || !performance.measure) return;

        try {
            performance.measure(name, startMark, endMark);
            const measure = performance.getEntriesByName(name)[0];
            if (measure) {
                console.log(`[PERF] ${name}: ${measure.duration.toFixed(2)}ms`);
                this.recordTiming(name, measure.duration);
            }
        } catch (e) {
            // 标记不存在，忽略
        }
    }

    /**
     * 监控异步函数执行时间（带阈值）
     */
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
                console.warn(
                    `[PERF] ${name} took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`
                );
            }
        }
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
        if (!this.enabled) return;
        
        console.group('📊 性能监控报告');
        const stats = Array.from(this.getAllStats().entries())
            .sort((a, b) => b[1].avg - a[1].avg); // 按平均时间降序
        
        for (const [name, stat] of stats) {
            console.log(
                `${name}:`,
                `avg=${stat.avg.toFixed(2)}ms`,
                `min=${stat.min.toFixed(2)}ms`,
                `max=${stat.max.toFixed(2)}ms`,
                `count=${stat.count}`
            );
        }
        console.groupEnd();
    }

    /**
     * 内存使用监控
     */
    static logMemoryUsage(): void {
        if (!this.enabled) return;
        
        if ((performance as any).memory) {
            const memory = (performance as any).memory;
            console.log('[MEMORY]', {
                used: `${(memory.usedJSHeapSize / 1048576).toFixed(2)} MB`,
                total: `${(memory.totalJSHeapSize / 1048576).toFixed(2)} MB`,
                limit: `${(memory.jsHeapSizeLimit / 1048576).toFixed(2)} MB`,
                usage: `${((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(2)}%`
            });
        }
    }

    /**
     * 启用/禁用性能监控
     */
    static setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /**
     * 检查是否启用
     */
    static isEnabled(): boolean {
        return this.enabled;
    }
}
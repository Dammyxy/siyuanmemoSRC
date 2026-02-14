/**
 * Deprecation warnings tests
 */

import { describe, it, expect, vi } from 'vitest';
import { BaseCompositeQueue } from '../../core/queue/composite/BaseCompositeQueue';
import type { QueueItem } from '../../core/queue/types';

describe('Deprecated queue warnings', () => {
    /**
     * Feature: queue-architecture-diagnosis, Property 19: 弃用警告存在性
     *
     * 对于标记为弃用的旧架构代码，应存在运行时警告。
     */
    it('Feature: queue-architecture-diagnosis, Property 19: should warn on deprecated queue usage', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const queue = new BaseCompositeQueue<QueueItem>({
            sequencer: { next: async () => null },
            dataSource: {
                getAll: async () => [],
            },
        });

        expect(queue).toBeDefined();
        expect(warnSpy).toHaveBeenCalled();

        warnSpy.mockRestore();
    });
});


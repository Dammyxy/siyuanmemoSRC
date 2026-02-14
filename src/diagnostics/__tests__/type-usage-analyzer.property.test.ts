/**
 * Feature: queue-architecture-diagnosis, Property 2: Code analysis accuracy
 *
 * 对于任何包含 QueueItem、FSRSCard 类型使用或队列类实例化的代码，
 * 分析器应识别这些使用点并记录正确的文件路径、行号和代码片段。
 */

import { describe, it, expect } from 'vitest';
import { ImportAnalyzer } from '../scanners/ImportAnalyzer';
import { TypeUsageAnalyzer } from '../scanners/TypeUsageAnalyzer';
import { fc, PROPERTY_TEST_CONFIG } from './setup';

describe('TypeUsageAnalyzer Properties', () => {
    it('Property 2: Code analysis accuracy', () => {
        fc.assert(
            fc.property(
                fc.record({
                    useQueueItem: fc.boolean(),
                    useFsrsCard: fc.boolean(),
                    instantiateOldQueue: fc.boolean(),
                    instantiateNewQueue: fc.boolean(),
                }),
                ({ useQueueItem, useFsrsCard, instantiateOldQueue, instantiateNewQueue }) => {
                    const lines: string[] = [];

                    if (useQueueItem) {
                        lines.push('import type { QueueItem } from "src/core/queue/strategies/types";');
                        lines.push('const item: QueueItem | null = null;');
                    }

                    if (useFsrsCard) {
                        lines.push('import type { FSRSCard } from "src/queues/types";');
                        lines.push('const card: FSRSCard | null = null;');
                    }

                    if (instantiateOldQueue) {
                        lines.push('import { RetrievalPracticeQueue } from "src/core/queue/strategies/RetrievalPracticeQueue";');
                        lines.push('const oldQueue = new RetrievalPracticeQueue();');
                    }

                    if (instantiateNewQueue) {
                        lines.push('import { RetrievalPracticeQueue as NewRetrievalPracticeQueue } from "src/queues/RetrievalPracticeQueue";');
                        lines.push('const newQueue = new NewRetrievalPracticeQueue();');
                    }

                    lines.push('export {};');

                    const code = lines.join('\n');
                    const importAnalyzer = new ImportAnalyzer();
                    const importResult = importAnalyzer.analyzeImports(code, '/test/file.ts');

                    const analyzer = new TypeUsageAnalyzer();
                    const usages = analyzer.analyze(code, '/test/file.ts', importResult.importMap);

                    const hasQueueItemUsage = usages.some(u => u.usageType === 'type-annotation' && u.architecture === 'old');
                    const hasFsrsCardUsage = usages.some(u => u.usageType === 'type-annotation' && u.architecture === 'new');
                    const hasOldInstantiation = usages.some(u => u.usageType === 'instantiation' && u.architecture === 'old');
                    const hasNewInstantiation = usages.some(u => u.usageType === 'instantiation' && u.architecture === 'new');

                    expect(hasQueueItemUsage).toBe(useQueueItem);
                    expect(hasFsrsCardUsage).toBe(useFsrsCard);
                    expect(hasOldInstantiation).toBe(instantiateOldQueue);
                    expect(hasNewInstantiation).toBe(instantiateNewQueue);
                }
            ),
            PROPERTY_TEST_CONFIG
        );
    });
});

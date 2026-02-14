/**
 * Feature: queue-architecture-diagnosis, Property 1: Import identification completeness
 *
 * 对于任何 TypeScript 文件，如果它包含来自 src/core/queue/strategies/ 或 src/queues/
 * 的导入语句，扫描器应识别该导入并正确分类为旧架构或新架构。
 */

import { describe, it, expect } from 'vitest';
import { ImportAnalyzer } from '../scanners/ImportAnalyzer';
import { fc, PROPERTY_TEST_CONFIG } from './setup';

describe('ImportAnalyzer Properties', () => {
    it('Property 1: Import identification completeness', () => {
        fc.assert(
            fc.property(
                fc.record({
                    hasOldImport: fc.boolean(),
                    hasNewImport: fc.boolean(),
                }),
                ({ hasOldImport, hasNewImport }) => {
                    const lines: string[] = [];
                    if (hasOldImport) {
                        lines.push('import { QueueItem } from "src/core/queue/strategies/types";');
                    }
                    if (hasNewImport) {
                        lines.push('import { FSRSCard } from "src/queues/types";');
                    }
                    lines.push('const value = 1;');

                    const code = lines.join('\n');
                    const analyzer = new ImportAnalyzer();
                    const result = analyzer.analyzeImports(code, '/test/file.ts');

                    const hasOldResult = result.usages.some(u => u.architecture === 'old');
                    const hasNewResult = result.usages.some(u => u.architecture === 'new');

                    expect(hasOldResult).toBe(hasOldImport);
                    expect(hasNewResult).toBe(hasNewImport);
                }
            ),
            PROPERTY_TEST_CONFIG
        );
    });
});

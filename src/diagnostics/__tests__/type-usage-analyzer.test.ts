/**
 * TypeUsageAnalyzer tests
 */

import { describe, it, expect } from 'vitest';
import { TypeUsageAnalyzer } from '../scanners/TypeUsageAnalyzer';

describe('TypeUsageAnalyzer', () => {
    it('should detect QueueItem/FSRSCard type annotations', () => {
        const analyzer = new TypeUsageAnalyzer();
        const content = `
            import { QueueItem } from "src/core/queue/types";
            import { FSRSCard } from "src/types/card";
            const items: QueueItem[] = [];
            const cards: FSRSCard[] = [];
        `;
        const importMap = new Map<string, 'old' | 'new'>([
            ['QueueItem', 'old'],
            ['FSRSCard', 'new'],
        ]);

        const usages = analyzer.analyze(content, 'src/feature/Test.ts', importMap);
        const oldUsages = usages.filter(u => u.architecture === 'old' && u.usageType === 'type-annotation');
        const newUsages = usages.filter(u => u.architecture === 'new' && u.usageType === 'type-annotation');

        expect(oldUsages.length).toBeGreaterThan(0);
        expect(newUsages.length).toBeGreaterThan(0);
    });

    it('should detect queue instantiations', () => {
        const analyzer = new TypeUsageAnalyzer();
        const content = `
            import { RetrievalPracticeQueue } from "src/queues/RetrievalPracticeQueue";
            const queue = new RetrievalPracticeQueue(manager);
        `;
        const importMap = new Map<string, 'old' | 'new'>([
            ['RetrievalPracticeQueue', 'new'],
        ]);

        const usages = analyzer.analyze(content, 'src/feature/Test.ts', importMap);
        const instantiation = usages.find(u => u.usageType === 'instantiation');

        expect(instantiation).toBeDefined();
        expect(instantiation?.queueType).toBe('RetrievalPracticeQueue');
        expect(instantiation?.architecture).toBe('new');
    });
});


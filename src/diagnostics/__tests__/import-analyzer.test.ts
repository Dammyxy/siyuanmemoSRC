/**
 * ImportAnalyzer tests
 */

import { describe, it, expect } from 'vitest';
import { ImportAnalyzer } from '../scanners/ImportAnalyzer';

describe('ImportAnalyzer', () => {
    it('should detect old and new architecture imports', () => {
        const analyzer = new ImportAnalyzer();
        const content = `
            import { RetrievalPracticeQueue } from "src/core/queue/strategies/RetrievalPracticeQueue";
            import { FilterGroupQueue } from "src/queues/FilterGroupQueue";
        `;
        const result = analyzer.analyzeImports(content, 'src/feature/Test.ts');

        const oldUsages = result.usages.filter(u => u.architecture === 'old');
        const newUsages = result.usages.filter(u => u.architecture === 'new');

        expect(oldUsages.length).toBe(1);
        expect(newUsages.length).toBe(1);
        expect(result.importMap.get('RetrievalPracticeQueue')).toBe('old');
        expect(result.importMap.get('FilterGroupQueue')).toBe('new');
    });

    it('should ignore non-queue imports', () => {
        const analyzer = new ImportAnalyzer();
        const content = `import { foo } from "src/utils/foo";`;
        const result = analyzer.analyzeImports(content, 'src/feature/Test.ts');

        expect(result.usages.length).toBe(0);
        expect(result.importMap.size).toBe(0);
    });
});


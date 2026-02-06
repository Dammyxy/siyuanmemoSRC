/**
 * ArchitectureScanner tests
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ArchitectureScanner } from '../scanners/ArchitectureScanner';

const writeFile = (filePath: string, content: string) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
};

describe('ArchitectureScanner', () => {
    it('should classify old/new/mixed usages in a small temp project', async () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'diag-scan-'));

        writeFile(
            path.join(tempRoot, 'src', 'feature', 'old.ts'),
            `import { RetrievalPracticeQueue } from "src/core/queue/strategies/RetrievalPracticeQueue";
             const q = new RetrievalPracticeQueue();`
        );

        writeFile(
            path.join(tempRoot, 'src', 'feature', 'new.ts'),
            `import { FilterGroupQueue } from "src/queues/FilterGroupQueue";
             const q = new FilterGroupQueue();`
        );

        writeFile(
            path.join(tempRoot, 'src', 'feature', 'mixed.ts'),
            `import { RetrievalPracticeQueue } from "src/core/queue/strategies/RetrievalPracticeQueue";
             import { FilterGroupQueue } from "src/queues/FilterGroupQueue";
             const a = new RetrievalPracticeQueue();
             const b = new FilterGroupQueue();`
        );

        const scanner = new ArchitectureScanner();
        const result = await scanner.scan(tempRoot);

        expect(result.summary.totalFiles).toBe(3);
        expect(result.oldArchitectureUsages.length).toBeGreaterThan(0);
        expect(result.newArchitectureUsages.length).toBeGreaterThan(0);
        expect(result.mixedUsages.length).toBeGreaterThan(0);
    });
});


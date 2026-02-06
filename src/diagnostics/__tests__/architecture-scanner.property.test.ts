/**
 * Feature: queue-architecture-diagnosis, Property 3: Architecture classification consistency
 *
 * 对于任何使用点，如果它只使用旧架构或新架构，应该被正确分类；
 * 如果同时使用两者，应归类为混合使用。
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ArchitectureScanner } from '../scanners/ArchitectureScanner';
import { fc, PROPERTY_TEST_CONFIG } from './setup';

describe('ArchitectureScanner Properties', () => {
    it('Property 3: Architecture classification consistency', () => {
        fc.assert(
            fc.asyncProperty(
                fc.record({
                    hasOldImport: fc.boolean(),
                    hasNewImport: fc.boolean(),
                }),
                async ({ hasOldImport, hasNewImport }) => {
                    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-scan-'));
                    const srcDir = path.join(tempDir, 'src');
                    fs.mkdirSync(srcDir, { recursive: true });

                    const lines: string[] = [];
                    if (hasOldImport) {
                        lines.push('import { QueueItem } from "src/core/queue/strategies/types";');
                    }
                    if (hasNewImport) {
                        lines.push('import { FSRSCard } from "src/queues/types";');
                    }
                    lines.push('const value = 1;');

                    const filePath = path.join(srcDir, 'example.ts');
                    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');

                    const scanner = new ArchitectureScanner();
                    const scanResult = await scanner.scan(tempDir);

                    const allUsages = [
                        ...scanResult.oldArchitectureUsages,
                        ...scanResult.newArchitectureUsages,
                        ...scanResult.mixedUsages,
                    ];

                    if (hasOldImport && hasNewImport) {
                        expect(scanResult.mixedUsages.length).toBeGreaterThan(0);
                        expect(scanResult.oldArchitectureUsages.length).toBe(0);
                        expect(scanResult.newArchitectureUsages.length).toBe(0);
                    } else if (hasOldImport) {
                        expect(scanResult.oldArchitectureUsages.length).toBeGreaterThan(0);
                        expect(scanResult.newArchitectureUsages.length).toBe(0);
                    } else if (hasNewImport) {
                        expect(scanResult.newArchitectureUsages.length).toBeGreaterThan(0);
                        expect(scanResult.oldArchitectureUsages.length).toBe(0);
                    } else {
                        expect(allUsages.length).toBe(0);
                    }

                    allUsages.forEach(usage => {
                        expect(usage.filePath).toBe(filePath);
                        expect(usage.lineNumber).toBeGreaterThan(0);
                        expect(usage.codeSnippet.length).toBeGreaterThan(0);
                    });

                    fs.rmSync(tempDir, { recursive: true, force: true });
                }
            ),
            PROPERTY_TEST_CONFIG
        );
    });
});

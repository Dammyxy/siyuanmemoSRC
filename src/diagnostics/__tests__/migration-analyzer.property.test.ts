/**
 * Feature: queue-architecture-diagnosis, Property 13-16: Migration analysis
 *
 * Property 13: 迁移安全性分类
 * Property 14: 迁移优先级排序
 * Property 15: 依赖识别完整性
 * Property 16: 迁移计划有序性
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MigrationAnalyzer } from '../analyzers/MigrationAnalyzer';
import { ArchitectureScanResult, UsagePoint } from '../types';
import { fc, PROPERTY_TEST_CONFIG } from './setup';

const createTempFile = (relativePath: string, content: string): string => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-analyzer-'));
    const filePath = path.join(tempDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
};

describe('MigrationAnalyzer Properties', () => {
    it('Property 13: Migration safety classification', async () => {
        const usage: UsagePoint = {
            filePath: 'src/core/queue/strategies/SubsetPracticeStrategy.ts',
            lineNumber: 1,
            codeSnippet: 'new SubsetPracticeStrategy()',
            usageType: 'instantiation',
            architecture: 'old',
            queueType: 'SubsetPracticeStrategy',
        };

        const scanResult: ArchitectureScanResult = {
            oldArchitectureUsages: [usage],
            newArchitectureUsages: [],
            mixedUsages: [],
            summary: {
                totalFiles: 1,
                oldArchitectureFiles: 1,
                newArchitectureFiles: 0,
                mixedFiles: 0,
            },
        };

        const analyzer = new MigrationAnalyzer();
        const plan = await analyzer.analyzeMigrationPath(scanResult);
        expect(plan.mustRemain.length).toBe(1);
        expect(plan.safeMigrations.length).toBe(0);
    });

    it('Property 14: Migration priority ordering', async () => {
        const lowRiskHighImpact: UsagePoint = {
            filePath: 'src/queues/HighImpact.ts',
            lineNumber: 1,
            codeSnippet: 'new HighImpact()',
            usageType: 'instantiation',
            architecture: 'new',
            queueType: 'HighImpact',
        };
        const highRiskLowImpact: UsagePoint = {
            filePath: 'src/core/queue/strategies/LowImpact.ts',
            lineNumber: 1,
            codeSnippet: 'type QueueItem',
            usageType: 'type-annotation',
            architecture: 'mixed',
            queueType: 'LowImpact',
        };

        const scanResult: ArchitectureScanResult = {
            oldArchitectureUsages: [highRiskLowImpact],
            newArchitectureUsages: [lowRiskHighImpact],
            mixedUsages: [],
            summary: {
                totalFiles: 2,
                oldArchitectureFiles: 1,
                newArchitectureFiles: 1,
                mixedFiles: 0,
            },
        };

        const analyzer = new MigrationAnalyzer();
        const plan = await analyzer.analyzeMigrationPath(scanResult);
        expect(plan.safeMigrations[0].priority).toBeGreaterThanOrEqual(plan.safeMigrations[1].priority);
    });

    it('Property 15: Dependency identification completeness', async () => {
        const sharedDependency = 'shared-lib';
        const oldFile = createTempFile('src/core/queue/strategies/OldQueue.ts', `import "${sharedDependency}";`);
        const newFile = createTempFile('src/queues/NewQueue.ts', `import "${sharedDependency}";`);

        const scanResult: ArchitectureScanResult = {
            oldArchitectureUsages: [{
                filePath: oldFile,
                lineNumber: 1,
                codeSnippet: 'import shared-lib',
                usageType: 'import',
                architecture: 'old',
            }],
            newArchitectureUsages: [{
                filePath: newFile,
                lineNumber: 1,
                codeSnippet: 'import shared-lib',
                usageType: 'import',
                architecture: 'new',
            }],
            mixedUsages: [],
            summary: {
                totalFiles: 2,
                oldArchitectureFiles: 1,
                newArchitectureFiles: 1,
                mixedFiles: 0,
            },
        };

        const analyzer = new MigrationAnalyzer();
        const plan = await analyzer.analyzeMigrationPath(scanResult);
        expect(plan.sharedDependencies.some(dep => dep.to === sharedDependency)).toBe(true);
    });

    it('Property 16: Migration plan ordering', () => {
        fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 1, max: 5 }),
                async (count) => {
                    const usages: UsagePoint[] = [];
                    for (let i = 0; i < count; i++) {
                        usages.push({
                            filePath: `src/queues/Queue${i}.ts`,
                            lineNumber: 1,
                            codeSnippet: `new Queue${i}()`,
                            usageType: 'instantiation',
                            architecture: 'new',
                            queueType: `Queue${i}`,
                        });
                    }

                    const scanResult: ArchitectureScanResult = {
                        oldArchitectureUsages: [],
                        newArchitectureUsages: usages,
                        mixedUsages: [],
                        summary: {
                            totalFiles: count,
                            oldArchitectureFiles: 0,
                            newArchitectureFiles: count,
                            mixedFiles: 0,
                        },
                    };

                    const analyzer = new MigrationAnalyzer();
                    const plan = await analyzer.analyzeMigrationPath(scanResult);
                    const orders = plan.migrationSteps.map(step => step.order);
                    const sorted = [...orders].sort((a, b) => a - b);
                    expect(orders).toEqual(sorted);
                }
            ),
            PROPERTY_TEST_CONFIG
        );
    });
});

/**
 * ReportGenerator tests
 */

import { describe, it, expect } from 'vitest';
import { ReportGenerator } from '../reporters/ReportGenerator';
import type { ArchitectureScanResult, MigrationPlan, ValidationResult, UsagePoint } from '../types';

const buildScanResult = (): ArchitectureScanResult => {
    const usage: UsagePoint = {
        filePath: 'src/foo.ts',
        lineNumber: 1,
        codeSnippet: 'import { Foo } from "src/queues/Foo";',
        usageType: 'import',
        architecture: 'new',
        queueType: 'FooQueue',
    };

    return {
        oldArchitectureUsages: [],
        newArchitectureUsages: [usage],
        mixedUsages: [],
        summary: {
            totalFiles: 1,
            oldArchitectureFiles: 0,
            newArchitectureFiles: 1,
            mixedFiles: 0,
        },
    };
};

const buildValidationResult = (): ValidationResult => ({
    isValid: true,
    errors: [],
    warnings: [],
});

const buildMigrationPlan = (): MigrationPlan => ({
    safeMigrations: [],
    mustRemain: [],
    sharedDependencies: [],
    migrationSteps: [],
});

describe('ReportGenerator', () => {
    it('should generate diagnostic report with summary', () => {
        const generator = new ReportGenerator();
        const report = generator.generateDiagnosticReport(
            buildScanResult(),
            buildValidationResult(),
            buildMigrationPlan()
        );

        expect(report).toContain('# 队列架构诊断报告');
        expect(report).toContain('## 摘要');
        expect(report).toContain('| 总文件数 | 1 |');
    });

    it('should generate architecture doc with migration steps', () => {
        const generator = new ReportGenerator();
        const doc = generator.generateArchitectureDoc(buildScanResult(), buildMigrationPlan());

        expect(doc).toContain('# 队列架构说明');
        expect(doc).toContain('## 旧架构');
        expect(doc).toContain('## 新架构');
    });
});


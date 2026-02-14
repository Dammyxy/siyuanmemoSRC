/**
 * Safety Analyzer
 * 安全性分析器
 *
 * 识别可安全迁移的使用点和必须保留的旧架构代码。
 *
 * @see .kiro/specs/queue-architecture-diagnosis/design.md
 * @see 任务 8.1
 */

import * as fs from 'fs';
import * as ts from 'typescript';
import { UsagePoint, RiskLevel, CodeLocation } from '../types';

export interface SafetyAnalysisResult {
    safeUsages: UsagePoint[];
    mustRemain: CodeLocation[];
}

export class SafetyAnalyzer {
    analyze(usages: UsagePoint[]): SafetyAnalysisResult {
        const safeUsages: UsagePoint[] = [];
        const mustRemain: CodeLocation[] = [];

        for (const usage of usages) {
            const isTemporaryQueue = usage.filePath.includes('SubsetPractice') || usage.filePath.includes('Leech');

            if (isTemporaryQueue) {
                mustRemain.push({
                    filePath: usage.filePath,
                    component: usage.queueType ?? 'TemporaryQueue',
                    rationale: 'Temporary queue must remain during migration window',
                });
                continue;
            }

            safeUsages.push(usage);
        }

        return { safeUsages, mustRemain };
    }

    analyzeExternalDependencies(filePath: string): string[] {
        if (!fs.existsSync(filePath)) {
            return [];
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const sourceFile = ts.createSourceFile(
            filePath,
            content,
            ts.ScriptTarget.Latest,
            true
        );

        const externals: string[] = [];
        sourceFile.forEachChild(node => {
            if (ts.isImportDeclaration(node)) {
                const moduleSpecifier = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
                if (!moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('src/')) {
                    externals.push(moduleSpecifier);
                }
            }
        });

        return externals;
    }

    calculateRisk(usage: UsagePoint, externalDeps: string[]): RiskLevel {
        if (externalDeps.length > 0) {
            return 'high';
        }
        if (usage.architecture === 'mixed') {
            return 'high';
        }
        return usage.architecture === 'old' ? 'medium' : 'low';
    }
}

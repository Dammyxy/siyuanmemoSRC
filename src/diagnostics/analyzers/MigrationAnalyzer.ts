/**
 * Migration Analyzer
 * 迁移分析器
 *
 * 分析迁移路径和优先级。
 *
 * @see .kiro/specs/queue-architecture-diagnosis/design.md
 * @see 任务 8.4
 */

import { ArchitectureScanResult, MigrationPlan, MigrationOpportunity, Dependency, MigrationStep } from '../types';
import { SafetyAnalyzer } from './SafetyAnalyzer';
import { PriorityCalculator } from './PriorityCalculator';
import { DependencyAnalyzer } from './DependencyAnalyzer';
import { diagnosticsOutput } from '../utils/output';

export class MigrationAnalyzer {
    private safetyAnalyzer = new SafetyAnalyzer();
    private priorityCalculator = new PriorityCalculator();
    private dependencyAnalyzer = new DependencyAnalyzer();

    async analyzeMigrationPath(
        scanResult: ArchitectureScanResult
    ): Promise<MigrationPlan> {
        diagnosticsOutput.info('[MigrationAnalyzer] Starting migration analysis');

        const allUsages = [
            ...scanResult.oldArchitectureUsages,
            ...scanResult.newArchitectureUsages,
            ...scanResult.mixedUsages,
        ];

        const { safeUsages, mustRemain } = this.safetyAnalyzer.analyze(allUsages);

        const safeMigrations: MigrationOpportunity[] = safeUsages.map(usage => {
            const externalDeps = this.safetyAnalyzer.analyzeExternalDependencies(usage.filePath);
            const risk = this.safetyAnalyzer.calculateRisk(usage, externalDeps);
            const impact = this.priorityCalculator.calculateImpact(usage);
            const priority = this.priorityCalculator.calculatePriority(risk, impact);

            return {
                filePath: usage.filePath,
                component: usage.queueType ?? pathBaseName(usage.filePath),
                risk,
                impact,
                priority,
                estimatedEffort: risk === 'high' ? '3-5 days' : risk === 'medium' ? '1-2 days' : '0.5-1 day',
                dependencies: externalDeps,
                rationale: externalDeps.length > 0
                    ? `External dependencies detected: ${externalDeps.join(', ')}`
                    : `Usage type ${usage.usageType} in ${usage.architecture} architecture`,
            };
        });

        safeMigrations.sort((a, b) => b.priority - a.priority);

        const sharedDependencies = this.identifySharedDependencies(scanResult);
        const migrationSteps = this.buildMigrationSteps(safeMigrations);

        diagnosticsOutput.info('[MigrationAnalyzer] Migration analysis complete');

        return {
            safeMigrations,
            mustRemain,
            sharedDependencies,
            migrationSteps,
        };
    }

    private identifySharedDependencies(scanResult: ArchitectureScanResult): Dependency[] {
        const oldFiles = new Set(scanResult.oldArchitectureUsages.map(u => u.filePath));
        const newFiles = new Set(scanResult.newArchitectureUsages.map(u => u.filePath));

        const dependencyMap = new Map<string, Set<string>>();

        for (const filePath of new Set([...oldFiles, ...newFiles])) {
            const deps = this.dependencyAnalyzer.analyzeFileDependencies(filePath);
            deps.forEach(dep => {
                if (!dependencyMap.has(dep.to)) {
                    dependencyMap.set(dep.to, new Set());
                }
                dependencyMap.get(dep.to)?.add(filePath);
            });
        }

        const shared: Dependency[] = [];
        dependencyMap.forEach((files, dep) => {
            const hasOld = Array.from(files).some(file => oldFiles.has(file));
            const hasNew = Array.from(files).some(file => newFiles.has(file));
            if (hasOld && hasNew) {
                shared.push({ from: 'shared', to: dep, type: 'import' });
            }
        });

        return shared;
    }

    private buildMigrationSteps(safeMigrations: MigrationOpportunity[]): MigrationStep[] {
        return safeMigrations.map((migration, index) => ({
            order: index + 1,
            description: `Migrate ${migration.component}`,
            files: [migration.filePath, ...migration.dependencies],
            testStrategy: 'Run unit tests and integration tests for affected queues',
            estimatedTime: migration.estimatedEffort,
        }));
    }
}

function pathBaseName(filePath: string): string {
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || filePath;
}

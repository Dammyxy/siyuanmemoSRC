/**
 * Report Generator
 * 报告生成器
 *
 * 生成诊断报告和架构文档。
 *
 * @see .kiro/specs/queue-architecture-diagnosis/design.md
 * @see 任务 9.1, 9.2
 */

import * as fs from 'fs';
import * as path from 'path';
import { DiagnosticReport, ArchitectureScanResult, ValidationResult, MigrationPlan, UsagePoint, MigrationStep } from '../types';
import { diagnosticsOutput } from '../utils/output';

export class ReportGenerator {
    generateDiagnosticReport(
        scanResult: ArchitectureScanResult,
        validationResult: ValidationResult,
        migrationPlan: MigrationPlan
    ): string {
        const report: DiagnosticReport = {
            timestamp: new Date(),
            summary: {
                totalFiles: scanResult.summary.totalFiles,
                oldArchitectureFiles: scanResult.summary.oldArchitectureFiles,
                newArchitectureFiles: scanResult.summary.newArchitectureFiles,
                mixedFiles: scanResult.summary.mixedFiles,
                validationErrors: validationResult.errors.length,
                validationWarnings: validationResult.warnings.length,
            },
            architectureUsage: {
                oldArchitecture: scanResult.oldArchitectureUsages,
                newArchitecture: scanResult.newArchitectureUsages,
                mixedUsage: scanResult.mixedUsages,
            },
            validationResults: {
                errors: validationResult.errors,
                warnings: validationResult.warnings,
            },
            migrationPlan,
            recommendations: this.generateRecommendations(scanResult, validationResult, migrationPlan),
        };

        const lines: string[] = [];
        lines.push('# 队列架构诊断报告');
        lines.push('');
        lines.push(`**生成时间**: ${report.timestamp.toISOString()}`);
        lines.push('');

        lines.push('## 摘要');
        lines.push('');
        lines.push('| 指标 | 数量 |');
        lines.push('|------|------|');
        lines.push(`| 总文件数 | ${report.summary.totalFiles} |`);
        lines.push(`| 旧架构文件 | ${report.summary.oldArchitectureFiles} |`);
        lines.push(`| 新架构文件 | ${report.summary.newArchitectureFiles} |`);
        lines.push(`| 混合使用文件 | ${report.summary.mixedFiles} |`);
        lines.push(`| 验证错误 | ${report.summary.validationErrors} |`);
        lines.push(`| 验证警告 | ${report.summary.validationWarnings} |`);
        lines.push('');

        lines.push('## 架构使用情况');
        lines.push('');
        lines.push('### 旧架构');
        lines.push(this.formatUsageTable(report.architectureUsage.oldArchitecture));
        lines.push('### 新架构');
        lines.push(this.formatUsageTable(report.architectureUsage.newArchitecture));
        lines.push('### 混合使用');
        lines.push(this.formatUsageTable(report.architectureUsage.mixedUsage));

        lines.push('## 接口验证结果');
        lines.push('');
        lines.push(this.formatValidationErrors(report.validationResults.errors));
        lines.push(this.formatValidationWarnings(report.validationResults.warnings));

        lines.push('## 迁移计划');
        lines.push('');
        lines.push(this.formatMigrationSteps(report.migrationPlan.migrationSteps));

        lines.push('## 建议');
        lines.push('');
        report.recommendations.forEach(item => lines.push(`- ${item}`));
        lines.push('');

        return lines.join('\n');
    }

    generateArchitectureDoc(
        scanResult: ArchitectureScanResult,
        migrationPlan: MigrationPlan
    ): string {
        const lines: string[] = [];
        lines.push('# 队列架构说明');
        lines.push('');
        lines.push('## 旧架构（Old Architecture）');
        lines.push('- 目录：`src/core/queue/strategies/`');
        lines.push('- 状态：已物理移除，不再参与运行时路径');
        lines.push('- 迁移遗留：仅保留在诊断报告历史记录中');
        lines.push('');

        lines.push('## 新架构（New Architecture）');
        lines.push('- 队列目录：`src/core/queue/domain/`');
        lines.push('- 应用入口：`src/application/services/UnifiedDataSourceManager.ts`');
        lines.push('- 队列接口：`IReviewQueue`（`src/types/unified-data-source.ts`）');
        lines.push('- 适配层：`UnifiedQueueStrategy`（`src/application/adapters/UnifiedQueueStrategy.ts`）');
        lines.push('- 已注册队列：RetrievalPractice, IncrementalLearning, FilterGroup, FinalDrill, NeuralRoam, Leech');
        lines.push('');

        lines.push('## 类型差异（QueueItem vs FSRSCard）');
        lines.push('- `QueueItem`：更轻量，适用于旧队列策略，字段不全且松散');
        lines.push('- `FSRSCard`：字段完整，包含调度信息、状态与扩展元数据');
        lines.push('');

        lines.push('## 迁移指南');
        lines.push('1. 所有新行为统一落在 `core/queue/domain` + `UnifiedDataSourceManager` 主链路');
        lines.push('2. 禁止新增旧策略目录或并行队列实现');
        lines.push('3. UI 通过 DialogManager/ReviewAdapter 访问队列，避免跨层直接依赖');
        lines.push('4. 使用 `queue.getAllCards()` 获取卡片列表');
        lines.push('5. 跑通单元与集成测试再删除旧代码');
        lines.push('');

        lines.push('## 推荐迁移步骤');
        migrationPlan.migrationSteps.forEach(step => {
            lines.push(`- Step ${step.order}: ${step.description}`);
        });
        lines.push('');

        lines.push('## 新代码应使用的架构');
        lines.push('- 新功能与修复应优先使用新架构（`src/core/queue/domain/`）');
        lines.push('');

        lines.push('## 弃用策略');
        lines.push('- 在旧架构入口标注 `@deprecated`');
        lines.push('- 在开发环境打印迁移提醒');
        lines.push('- 按迁移计划逐步移除旧架构实现');
        lines.push('');

        lines.push('## 代码示例');
        lines.push('```ts');
        lines.push('import { RetrievalPracticeQueue } from "src/core/queue/domain/RetrievalPracticeQueue";');
        lines.push('const queue = new RetrievalPracticeQueue(manager);');
        lines.push('const cards = await queue.getAllCards();');
        lines.push('```');
        lines.push('');
        lines.push('```ts');
        lines.push('import { QueueItem } from "src/core/queue/types";');
        lines.push('// TODO: migrate QueueItem usages to FSRSCard');
        lines.push('```');
        lines.push('');

        lines.push('## 扫描摘要');
        lines.push(`- 旧架构使用点：${scanResult.oldArchitectureUsages.length}`);
        lines.push(`- 新架构使用点：${scanResult.newArchitectureUsages.length}`);
        lines.push(`- 混合使用点：${scanResult.mixedUsages.length}`);
        lines.push('');

        return lines.join('\n');
    }

    saveReport(report: string, outputPath: string): void {
        fs.writeFileSync(outputPath, report, 'utf-8');
        diagnosticsOutput.info(`[ReportGenerator] Report saved to: ${outputPath}`);
    }

    saveArchitectureDoc(doc: string, rootDir: string): string {
        const outputPath = path.join(rootDir, 'QUEUE_ARCHITECTURE.md');
        fs.writeFileSync(outputPath, doc, 'utf-8');
        diagnosticsOutput.info(`[ReportGenerator] Architecture doc saved to: ${outputPath}`);
        return outputPath;
    }

    private formatUsageTable(usages: UsagePoint[]): string {
        if (usages.length === 0) {
            return '_无使用点_';
        }

        const lines: string[] = [];
        lines.push('| 文件 | 行号 | 类型 | 架构 | 代码片段 |');
        lines.push('|------|------|------|------|----------|');

        for (const usage of usages) {
            const snippet = usage.codeSnippet.replace(/\|/g, '\\|').substring(0, 80);
            lines.push(`| ${usage.filePath} | ${usage.lineNumber} | ${usage.usageType} | ${usage.architecture} | ${snippet} |`);
        }

        lines.push('');
        return lines.join('\n');
    }

    private formatValidationErrors(errors: ValidationResult['errors']): string {
        if (errors.length === 0) {
            return '_无错误_';
        }

        const lines: string[] = [];
        lines.push('### 错误');
        lines.push('');
        for (const error of errors) {
            lines.push(`- **${error.className}.${error.methodName}**: ${error.issue} (${error.filePath ?? 'unknown'}:${error.lineNumber ?? '-'})`);
        }
        lines.push('');
        return lines.join('\n');
    }

    private formatValidationWarnings(warnings: ValidationResult['warnings']): string {
        if (warnings.length === 0) {
            return '_无警告_';
        }

        const lines: string[] = [];
        lines.push('### 警告');
        lines.push('');
        for (const warning of warnings) {
            lines.push(`- **${warning.className}**: ${warning.message}`);
        }
        lines.push('');
        return lines.join('\n');
    }

    private formatMigrationSteps(steps: MigrationStep[]): string {
        if (steps.length === 0) {
            return '_无迁移步骤_';
        }

        const lines: string[] = [];
        for (const step of steps) {
            lines.push(`### 步骤 ${step.order}: ${step.description}`);
            lines.push('');
            lines.push(`**预计时间**: ${step.estimatedTime}`);
            lines.push('');
            lines.push('**涉及文件**:');
            step.files.forEach(file => lines.push(`- ${file}`));
            lines.push('');
            lines.push('**测试策略**:');
            lines.push(step.testStrategy);
            lines.push('');
        }

        return lines.join('\n');
    }

    private generateRecommendations(
        scanResult: ArchitectureScanResult,
        validationResult: ValidationResult,
        migrationPlan: MigrationPlan
    ): string[] {
        const recommendations: string[] = [];

        if (scanResult.mixedUsages.length > 0) {
            recommendations.push('优先处理混合使用的文件，避免类型混用导致运行时错误');
        }

        if (validationResult.errors.length > 0) {
            recommendations.push('修复接口验证错误，确保所有队列实现 IReviewQueue');
        }

        if (migrationPlan.safeMigrations.length > 0) {
            recommendations.push('从高优先级迁移项开始逐步迁移到新架构');
        }

        if (migrationPlan.mustRemain.length > 0) {
            recommendations.push('保留临时队列，待迁移窗口关闭后再逐步移除');
        }

        return recommendations;
    }
}

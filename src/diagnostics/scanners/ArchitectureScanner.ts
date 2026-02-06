/**
 * Architecture Scanner
 * 架构扫描器
 *
 * 负责扫描代码库，识别所有使用旧架构和新架构的位置。
 *
 * @see .kiro/specs/queue-architecture-diagnosis/design.md
 * @see 任务 2.5
 */

import * as fs from 'fs';
import * as path from 'path';
import { UsagePoint, ArchitectureScanResult, ArchitectureType } from '../types';
import { ImportAnalyzer } from './ImportAnalyzer';
import { TypeUsageAnalyzer } from './TypeUsageAnalyzer';

/**
 * 架构扫描器
 *
 * 扫描代码库识别所有架构使用点。
 */
export class ArchitectureScanner {
    private readonly importAnalyzer = new ImportAnalyzer();
    private readonly typeUsageAnalyzer = new TypeUsageAnalyzer();

    /**
     * 扫描代码库
     *
     * @param rootDir 项目根目录
     * @returns 扫描结果
     */
    async scan(rootDir: string): Promise<ArchitectureScanResult> {
        console.log(`[ArchitectureScanner] Starting scan from: ${rootDir}`);

        const oldArchitectureUsages: UsagePoint[] = [];
        const newArchitectureUsages: UsagePoint[] = [];
        const mixedUsages: UsagePoint[] = [];

        // 遍历所有 TypeScript 文件
        const tsFiles = this.findAllTypeScriptFiles(rootDir);

        for (const filePath of tsFiles) {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const usages = this.analyzeFile(fileContent, filePath);

            const hasOld = usages.some(u => u.architecture === 'old');
            const hasNew = usages.some(u => u.architecture === 'new');
            const finalArchitecture: ArchitectureType = hasOld && hasNew
                ? 'mixed'
                : hasOld
                    ? 'old'
                    : hasNew
                        ? 'new'
                        : 'mixed';

            for (const usage of usages) {
                usage.architecture = finalArchitecture;
            }

            for (const usage of usages) {
                switch (usage.architecture) {
                    case 'old':
                        oldArchitectureUsages.push(usage);
                        break;
                    case 'new':
                        newArchitectureUsages.push(usage);
                        break;
                    case 'mixed':
                        mixedUsages.push(usage);
                        break;
                }
            }
        }

        const summary = this.generateSummary(tsFiles, oldArchitectureUsages, newArchitectureUsages, mixedUsages);

        console.log(`[ArchitectureScanner] Scan complete:`, {
            totalFiles: tsFiles.length,
            oldArchitectureFiles: oldArchitectureUsages.length,
            newArchitectureFiles: newArchitectureUsages.length,
            mixedFiles: mixedUsages.length,
        });

        return {
            oldArchitectureUsages,
            newArchitectureUsages,
            mixedUsages,
            summary,
        };
    }

    /**
     * 查找所有 TypeScript 文件
     */
    private findAllTypeScriptFiles(rootDir: string): string[] {
        const files: string[] = [];

        const walkDir = (dir: string) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === '.git') {
                    continue;
                }

                if (entry.isDirectory()) {
                    walkDir(fullPath);
                } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
                    files.push(fullPath);
                }
            }
        };

        walkDir(rootDir);
        return files;
    }

    /**
     * 分析单个文件
     */
    private analyzeFile(fileContent: string, filePath: string): UsagePoint[] {
        const usages: UsagePoint[] = [];

        try {
            const importResult = this.importAnalyzer.analyzeImports(fileContent, filePath);
            const typeUsages = this.typeUsageAnalyzer.analyze(
                fileContent,
                filePath,
                importResult.importMap
            );

            usages.push(...importResult.usages, ...typeUsages);
        } catch (error) {
            console.warn(`[ArchitectureScanner] Failed to analyze file: ${filePath}`, error);
        }

        return usages;
    }

    /**
     * 生成摘要统计
     */
    private generateSummary(
        allFiles: string[],
        oldUsages: UsagePoint[],
        newUsages: UsagePoint[],
        mixedUsages: UsagePoint[]
    ) {
        const oldFiles = new Set(oldUsages.map(u => u.filePath));
        const newFiles = new Set(newUsages.map(u => u.filePath));
        const mixedFiles = new Set(mixedUsages.map(u => u.filePath));

        return {
            totalFiles: allFiles.length,
            oldArchitectureFiles: oldFiles.size,
            newArchitectureFiles: newFiles.size,
            mixedFiles: mixedFiles.size,
        };
    }
}

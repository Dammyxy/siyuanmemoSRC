/**
 * Static Code Analyzer
 * 静态代码分析工具
 * 
 * 扫描代码库以检测旧架构的使用情况。
 * 
 * @see .kiro/specs/queue-architecture-migration/requirements.md
 * @see .kiro/specs/queue-architecture-migration/design.md
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * 分析结果
 */
export interface AnalysisResult {
    /** 扫描的文件总数 */
    totalFiles: number;
    
    /** 包含旧架构导入的文件 */
    oldArchitectureImports: string[];
    
    /** 包含 QueueItem 引用的文件 */
    queueItemReferences: string[];
    
    /** 包含 BaseCompositeQueue 引用的文件 */
    baseCompositeQueueReferences: string[];
    
    /** 混合使用新旧架构的文件 */
    mixedUsageFiles: string[];
    
    /** 分析时间戳 */
    timestamp: number;
}

/**
 * 静态代码分析器
 * 
 * 扫描代码库以检测：
 * 1. 旧架构导入（src/core/queue/strategies/）
 * 2. QueueItem 类型引用
 * 3. BaseCompositeQueue 引用
 * 4. 混合使用新旧架构的文件
 * 
 * @see 需求 1.1, 1.2, 1.3, 1.4
 */
export class StaticCodeAnalyzer {
    private srcDir: string;
    private excludeDirs: string[] = ['node_modules', 'dist', 'coverage', '__tests__'];
    
    constructor(srcDir: string = 'src') {
        this.srcDir = srcDir;
    }
    
    /**
     * 执行完整分析
     * 
     * @returns 分析结果
     */
    async analyze(): Promise<AnalysisResult> {
        console.log('[StaticCodeAnalyzer] Starting analysis...');
        
        const files = this.getAllTypeScriptFiles(this.srcDir);
        
        const result: AnalysisResult = {
            totalFiles: files.length,
            oldArchitectureImports: [],
            queueItemReferences: [],
            baseCompositeQueueReferences: [],
            mixedUsageFiles: [],
            timestamp: Date.now(),
        };
        
        for (const file of files) {
            const content = fs.readFileSync(file, 'utf-8');
            
            // 检查旧架构导入
            if (this.hasOldArchitectureImport(content)) {
                result.oldArchitectureImports.push(file);
            }
            
            // 检查 QueueItem 引用
            if (this.hasQueueItemReference(content)) {
                result.queueItemReferences.push(file);
            }
            
            // 检查 BaseCompositeQueue 引用
            if (this.hasBaseCompositeQueueReference(content)) {
                result.baseCompositeQueueReferences.push(file);
            }
            
            // 检查混合使用
            if (this.hasMixedUsage(content)) {
                result.mixedUsageFiles.push(file);
            }
        }
        
        console.log('[StaticCodeAnalyzer] Analysis complete');
        this.printSummary(result);
        
        return result;
    }
    
    /**
     * 获取所有 TypeScript 文件
     * 
     * @param dir 目录路径
     * @returns 文件路径数组
     */
    private getAllTypeScriptFiles(dir: string): string[] {
        const files: string[] = [];
        
        const scan = (currentDir: string) => {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                
                if (entry.isDirectory()) {
                    // 跳过排除的目录
                    if (!this.excludeDirs.includes(entry.name)) {
                        scan(fullPath);
                    }
                } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
                    files.push(fullPath);
                }
            }
        };
        
        scan(dir);
        return files;
    }
    
    /**
     * 检查是否有旧架构导入
     * 
     * 检测模式：
     * - import ... from '../core/queue/strategies/...'
     * - import ... from './strategies/...'
     * 
     * @param content 文件内容
     * @returns true 表示有旧架构导入
     */
    private hasOldArchitectureImport(content: string): boolean {
        const patterns = [
            /from\s+['"].*\/core\/queue\/strategies\//,
            /from\s+['"].*\/strategies\/.*Queue['"]/,
            /from\s+['"].*BaseCompositeQueue['"]/,
        ];
        
        return patterns.some(pattern => pattern.test(content));
    }
    
    /**
     * 检查是否有 QueueItem 引用
     * 
     * 检测模式：
     * - QueueItem 类型注解
     * - QueueItem 导入
     * 
     * 注意：排除类型定义文件和迁移相关文件
     * 
     * @param content 文件内容
     * @returns true 表示有 QueueItem 引用
     */
    private hasQueueItemReference(content: string): boolean {
        // 排除类型定义文件和迁移相关文件
        if (content.includes('export interface QueueItem') ||
            content.includes('migration/')) {
            return false;
        }
        
        const patterns = [
            /:\s*QueueItem\b/,
            /<QueueItem>/,
            /\bQueueItem\[\]/,
            /import\s+.*\bQueueItem\b/,
        ];
        
        return patterns.some(pattern => pattern.test(content));
    }
    
    /**
     * 检查是否有 BaseCompositeQueue 引用
     * 
     * @param content 文件内容
     * @returns true 表示有 BaseCompositeQueue 引用
     */
    private hasBaseCompositeQueueReference(content: string): boolean {
        const patterns = [
            /\bBaseCompositeQueue\b/,
            /extends\s+BaseCompositeQueue/,
            /import\s+.*BaseCompositeQueue/,
        ];
        
        return patterns.some(pattern => pattern.test(content));
    }
    
    /**
     * 检查是否混合使用新旧架构
     * 
     * 混合使用的标志：
     * - 同时导入旧架构和新架构
     * - 同时使用 QueueItem 和 FSRSCard
     * 
     * @param content 文件内容
     * @returns true 表示混合使用
     */
    private hasMixedUsage(content: string): boolean {
        const hasOldImport = this.hasOldArchitectureImport(content);
        const hasNewImport = /from\s+['"].*\/queues\//.test(content) ||
                            /from\s+['"].*\/types\/unified-data-source/.test(content);
        
        const hasQueueItem = this.hasQueueItemReference(content);
        const hasFSRSCard = /:\s*FSRSCard\b/.test(content) ||
                           /<FSRSCard>/.test(content) ||
                           /\bFSRSCard\[\]/.test(content);
        
        return (hasOldImport && hasNewImport) || (hasQueueItem && hasFSRSCard);
    }
    
    /**
     * 打印分析摘要
     * 
     * @param result 分析结果
     */
    private printSummary(result: AnalysisResult): void {
        console.log('\n=== Static Code Analysis Summary ===');
        console.log(`Total files scanned: ${result.totalFiles}`);
        console.log(`Old architecture imports: ${result.oldArchitectureImports.length}`);
        console.log(`QueueItem references: ${result.queueItemReferences.length}`);
        console.log(`BaseCompositeQueue references: ${result.baseCompositeQueueReferences.length}`);
        console.log(`Mixed usage files: ${result.mixedUsageFiles.length}`);
        
        if (result.oldArchitectureImports.length > 0) {
            console.log('\nFiles with old architecture imports:');
            result.oldArchitectureImports.forEach(file => console.log(`  - ${file}`));
        }
        
        if (result.mixedUsageFiles.length > 0) {
            console.log('\nFiles with mixed usage:');
            result.mixedUsageFiles.forEach(file => console.log(`  - ${file}`));
        }
        
        console.log('=====================================\n');
    }
    
    /**
     * 生成 Markdown 报告
     * 
     * @param result 分析结果
     * @returns Markdown 格式的报告
     */
    generateReport(result: AnalysisResult): string {
        const date = new Date(result.timestamp).toISOString();
        
        let report = `# Static Code Analysis Report\n\n`;
        report += `**Generated**: ${date}\n\n`;
        report += `## Summary\n\n`;
        report += `- **Total files scanned**: ${result.totalFiles}\n`;
        report += `- **Old architecture imports**: ${result.oldArchitectureImports.length}\n`;
        report += `- **QueueItem references**: ${result.queueItemReferences.length}\n`;
        report += `- **BaseCompositeQueue references**: ${result.baseCompositeQueueReferences.length}\n`;
        report += `- **Mixed usage files**: ${result.mixedUsageFiles.length}\n\n`;
        
        if (result.oldArchitectureImports.length > 0) {
            report += `## Files with Old Architecture Imports\n\n`;
            result.oldArchitectureImports.forEach(file => {
                report += `- \`${file}\`\n`;
            });
            report += `\n`;
        }
        
        if (result.queueItemReferences.length > 0) {
            report += `## Files with QueueItem References\n\n`;
            result.queueItemReferences.forEach(file => {
                report += `- \`${file}\`\n`;
            });
            report += `\n`;
        }
        
        if (result.baseCompositeQueueReferences.length > 0) {
            report += `## Files with BaseCompositeQueue References\n\n`;
            result.baseCompositeQueueReferences.forEach(file => {
                report += `- \`${file}\`\n`;
            });
            report += `\n`;
        }
        
        if (result.mixedUsageFiles.length > 0) {
            report += `## Files with Mixed Usage\n\n`;
            result.mixedUsageFiles.forEach(file => {
                report += `- \`${file}\`\n`;
            });
            report += `\n`;
        }
        
        report += `## Migration Status\n\n`;
        if (result.oldArchitectureImports.length === 0 &&
            result.queueItemReferences.length === 0 &&
            result.baseCompositeQueueReferences.length === 0 &&
            result.mixedUsageFiles.length === 0) {
            report += `✅ **Migration complete**: No old architecture usage detected.\n`;
        } else {
            report += `⚠️ **Migration in progress**: Old architecture usage detected.\n`;
        }
        
        return report;
    }
}

#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * 静态代码分析脚本
 * 扫描代码库中的旧架构使用情况
 */

const OLD_ARCHITECTURE_PATTERNS = {
    imports: [
        /from\s+['"].*\/core\/queue\/strategies\//,
        /from\s+['"].*\/core\/queue\/composite\//,
        /from\s+['"].*\/core\/queue\/datasource\/(?!.*UnifiedDataSource)/,
        /import.*BaseCompositeQueue/,
        /import.*RiffDataSource/,
        /import.*LocalStorageDataSource/,
        /import.*HybridDataSource/,
    ],
    types: [
        /:\s*QueueItem(?![a-zA-Z])/,
        /QueueItem\[\]/,
        /<QueueItem>/,
        /Promise<QueueItem/,
    ],
    classes: [
        /extends\s+BaseCompositeQueue/,
        /new\s+BaseCompositeQueue/,
    ],
};

function scanDirectory(dir, baseDir) {
    const results = {
        oldArchitectureImports: [],
        queueItemReferences: [],
        baseCompositeQueueReferences: [],
        mixedFiles: [],
    };

    function scan(currentDir) {
        const entries = readdirSync(currentDir);

        for (const entry of entries) {
            const fullPath = join(currentDir, entry);
            const stat = statSync(fullPath);

            if (stat.isDirectory()) {
                // 跳过 node_modules, dist, coverage 等目录
                if (!['node_modules', 'dist', 'coverage', '.git'].includes(entry)) {
                    scan(fullPath);
                }
            } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
                // 跳过测试文件和 .d.ts 文件
                if (entry.includes('.test.') || entry.includes('.spec.') || entry.endsWith('.d.ts')) {
                    continue;
                }

                const content = readFileSync(fullPath, 'utf-8');
                const relativePath = relative(baseDir, fullPath);

                let hasOldImport = false;
                let hasQueueItem = false;
                let hasBaseComposite = false;

                // 检查旧架构导入
                for (const pattern of OLD_ARCHITECTURE_PATTERNS.imports) {
                    if (pattern.test(content)) {
                        hasOldImport = true;
                        results.oldArchitectureImports.push(relativePath);
                        break;
                    }
                }

                // 检查 QueueItem 引用
                for (const pattern of OLD_ARCHITECTURE_PATTERNS.types) {
                    if (pattern.test(content)) {
                        hasQueueItem = true;
                        results.queueItemReferences.push(relativePath);
                        break;
                    }
                }

                // 检查 BaseCompositeQueue 引用
                for (const pattern of OLD_ARCHITECTURE_PATTERNS.classes) {
                    if (pattern.test(content)) {
                        hasBaseComposite = true;
                        results.baseCompositeQueueReferences.push(relativePath);
                        break;
                    }
                }

                // 检查混合使用
                if ((hasOldImport || hasQueueItem || hasBaseComposite) && 
                    (content.includes('IReviewQueue') || content.includes('FSRSCard'))) {
                    results.mixedFiles.push(relativePath);
                }
            }
        }
    }

    scan(dir);
    return results;
}

// 运行分析
const srcDir = join(process.cwd(), 'src');
const results = scanDirectory(srcDir, process.cwd());

// 输出结果
console.log('\n=== 静态代码分析结果 ===\n');

console.log(`📊 旧架构导入: ${results.oldArchitectureImports.length} 个文件`);
if (results.oldArchitectureImports.length > 0) {
    console.log('文件列表:');
    results.oldArchitectureImports.forEach(file => console.log(`  - ${file}`));
}

console.log(`\n📊 QueueItem 引用: ${results.queueItemReferences.length} 个文件`);
if (results.queueItemReferences.length > 0) {
    console.log('文件列表:');
    results.queueItemReferences.slice(0, 10).forEach(file => console.log(`  - ${file}`));
    if (results.queueItemReferences.length > 10) {
        console.log(`  ... 还有 ${results.queueItemReferences.length - 10} 个文件`);
    }
}

console.log(`\n📊 BaseCompositeQueue 引用: ${results.baseCompositeQueueReferences.length} 个文件`);
if (results.baseCompositeQueueReferences.length > 0) {
    console.log('文件列表:');
    results.baseCompositeQueueReferences.forEach(file => console.log(`  - ${file}`));
}

console.log(`\n📊 混合使用文件: ${results.mixedFiles.length} 个文件`);
if (results.mixedFiles.length > 0) {
    console.log('文件列表:');
    results.mixedFiles.slice(0, 10).forEach(file => console.log(`  - ${file}`));
    if (results.mixedFiles.length > 10) {
        console.log(`  ... 还有 ${results.mixedFiles.length - 10} 个文件`);
    }
}

console.log('\n=== 分析完成 ===\n');

// 返回退出码
const hasIssues = results.oldArchitectureImports.length > 0 ||
                  results.queueItemReferences.length > 0 ||
                  results.baseCompositeQueueReferences.length > 0;

if (hasIssues) {
    console.log('⚠️  发现旧架构使用，需要继续迁移');
    process.exit(1);
} else {
    console.log('✅ 未发现旧架构使用');
    process.exit(0);
}

/**
 * Diagnostics Test Setup
 * 诊断模块测试配置
 *
 * 配置 Jest 和 fast-check 测试框架。
 */

import fc from 'fast-check';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * 属性测试配置
 */
export const PROPERTY_TEST_CONFIG = {
    /** 每个属性测试的最小迭代次数 */
    numRuns: 100,
    /** 超时时间（毫秒） */
    timeout: 10000,
};

/**
 * 诊断测试工具
 */
export class DiagnosticsTestUtils {
    /**
     * 创建测试用例的文件路径
     */
    static createTestFilePath(fileName: string): string {
        return `/test/${fileName}`;
    }

    /**
     * 创建测试用的代码片段
     */
    static createTestCodeSnippet(snippet: string): string {
        return snippet.trim();
    }

    /**
     * 生成随机导入语句
     */
    static generateRandomImport(): string {
        const imports = [
            'import { QueueItem } from "../../core/queue/types";',
            'import { FSRSCard } from "../../types/card";',
            'import { RetrievalPracticeQueue } from "../../queues/RetrievalPracticeQueue";',
            'import { BaseCompositeQueue } from "../../core/queue/composite/BaseCompositeQueue";',
        ];
        return imports[Math.floor(Math.random() * imports.length)];
    }
}

/**
 * 导出 fast-check 实例
 */
export { fc };

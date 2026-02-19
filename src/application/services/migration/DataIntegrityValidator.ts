/**
 * Data Integrity Validator
 * 数据完整性验证工具
 * 
 * 验证迁移后的数据完整性。
 * 
 * @see .kiro/specs/queue-architecture-migration/requirements.md
 * @see .kiro/specs/queue-architecture-migration/design.md
 */

import { FSRSCard } from '../../../types/card';
import { QueueType } from '../../../types/unified-data-source';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';

/**
 * 验证结果
 */
export interface ValidationResult {
    /** 是否通过验证 */
    passed: boolean;
    
    /** 验证的卡片总数 */
    totalCards: number;
    
    /** 验证的队列数 */
    totalQueues: number;
    
    /** 卡片验证错误 */
    cardErrors: CardValidationError[];
    
    /** 队列验证错误 */
    queueErrors: QueueValidationError[];
    
    /** 验证时间戳 */
    timestamp: number;
}

/**
 * 卡片验证错误
 */
export interface CardValidationError {
    /** 卡片 ID */
    cardId: string;
    
    /** 错误类型 */
    errorType: 'missing_field' | 'invalid_value' | 'type_mismatch' | 'data_corruption';
    
    /** 字段名 */
    field?: string;
    
    /** 错误消息 */
    message: string;
    
    /** 期望值 */
    expected?: any;
    
    /** 实际值 */
    actual?: any;
}

/**
 * 队列验证错误
 */
export interface QueueValidationError {
    /** 队列类型 */
    queueType: QueueType;
    
    /** 错误类型 */
    errorType: 'state_inconsistent' | 'data_missing' | 'duplicate_cards';
    
    /** 错误消息 */
    message: string;
    
    /** 相关卡片 ID */
    cardIds?: string[];
}

/**
 * 数据完整性验证器
 * 
 * 验证：
 * 1. 卡片数据完整性（必需字段、字段类型、值范围）
 * 2. 队列状态完整性（队列大小、卡片引用、重复检测）
 * 3. 调度信息一致性（due、stability、difficulty 等）
 * 
 * @see 需求 10.1, 10.2, 10.3, 10.5
 */
export class DataIntegrityValidator {
    private manager: UnifiedDataSourceManager;
    
    constructor(manager: UnifiedDataSourceManager) {
        this.manager = manager;
    }
    
    /**
     * 执行完整验证
     * 
     * @returns 验证结果
     */
    async validate(): Promise<ValidationResult> {
        console.log('[DataIntegrityValidator] Starting validation...');
        
        const result: ValidationResult = {
            passed: true,
            totalCards: 0,
            totalQueues: 0,
            cardErrors: [],
            queueErrors: [],
            timestamp: Date.now(),
        };
        
        // 获取所有队列类型
        const queueTypes = [
            QueueType.RetrievalPractice,
            QueueType.FinalDrill,
            QueueType.IncrementalLearning,
            QueueType.FilterGroup,
            QueueType.NeuralRoam,
        ];
        
        // 验证每个队列
        for (const queueType of queueTypes) {
            try {
                const queue = this.manager.getQueue(queueType);
                const cards = await queue.getAllCards();
                
                result.totalQueues++;
                result.totalCards += cards.length;
                
                // 验证卡片数据
                for (const card of cards) {
                    const cardErrors = this.validateCard(card);
                    result.cardErrors.push(...cardErrors);
                }
                
                // 验证队列状态
                const queueErrors = this.validateQueueState(queueType, cards);
                result.queueErrors.push(...queueErrors);
                
            } catch (error) {
                console.error(`[DataIntegrityValidator] Failed to validate queue ${queueType}:`, error);
                result.queueErrors.push({
                    queueType,
                    errorType: 'state_inconsistent',
                    message: `Failed to access queue: ${error}`,
                });
            }
        }
        
        result.passed = result.cardErrors.length === 0 && result.queueErrors.length === 0;
        
        console.log('[DataIntegrityValidator] Validation complete');
        this.printSummary(result);
        
        return result;
    }
    
    /**
     * 验证单个卡片
     * 
     * @param card 卡片数据
     * @returns 验证错误数组
     */
    private validateCard(card: FSRSCard): CardValidationError[] {
        const errors: CardValidationError[] = [];
        
        // 验证必需字段
        const requiredFields: (keyof FSRSCard)[] = [
            'id', 'blockId', 'due', 'stability', 'difficulty',
            'elapsedDays', 'scheduledDays', 'reps', 'lapses', 'state'
        ];
        
        for (const field of requiredFields) {
            if (card[field] === undefined || card[field] === null) {
                errors.push({
                    cardId: card.blockId || card.id,
                    errorType: 'missing_field',
                    field,
                    message: `Missing required field: ${field}`,
                });
            }
        }
        
        // 验证字段类型和值范围
        if (typeof card.due !== 'number' || card.due < 0) {
            errors.push({
                cardId: card.blockId,
                errorType: 'invalid_value',
                field: 'due',
                message: 'Invalid due timestamp',
                actual: card.due,
            });
        }
        
        if (typeof card.stability !== 'number' || card.stability < 0) {
            errors.push({
                cardId: card.blockId,
                errorType: 'invalid_value',
                field: 'stability',
                message: 'Invalid stability value',
                actual: card.stability,
            });
        }
        
        if (typeof card.difficulty !== 'number' || card.difficulty < 1 || card.difficulty > 10) {
            errors.push({
                cardId: card.blockId,
                errorType: 'invalid_value',
                field: 'difficulty',
                message: 'Difficulty must be between 1 and 10',
                expected: '1-10',
                actual: card.difficulty,
            });
        }
        
        if (typeof card.state !== 'number' || card.state < 0 || card.state > 3) {
            errors.push({
                cardId: card.blockId,
                errorType: 'invalid_value',
                field: 'state',
                message: 'State must be 0-3 (New, Learning, Review, Relearning)',
                expected: '0-3',
                actual: card.state,
            });
        }
        
        if (typeof card.reps !== 'number' || card.reps < 0) {
            errors.push({
                cardId: card.blockId,
                errorType: 'invalid_value',
                field: 'reps',
                message: 'Reps must be non-negative',
                actual: card.reps,
            });
        }
        
        if (typeof card.lapses !== 'number' || card.lapses < 0) {
            errors.push({
                cardId: card.blockId,
                errorType: 'invalid_value',
                field: 'lapses',
                message: 'Lapses must be non-negative',
                actual: card.lapses,
            });
        }
        
        return errors;
    }
    
    /**
     * 验证队列状态
     * 
     * @param queueType 队列类型
     * @param cards 队列中的卡片
     * @returns 验证错误数组
     */
    private validateQueueState(queueType: QueueType, cards: FSRSCard[]): QueueValidationError[] {
        const errors: QueueValidationError[] = [];
        
        // 检测重复卡片
        const cardIds = new Set<string>();
        const duplicates: string[] = [];
        
        for (const card of cards) {
            const id = card.blockId || card.id;
            if (cardIds.has(id)) {
                duplicates.push(id);
            } else {
                cardIds.add(id);
            }
        }
        
        if (duplicates.length > 0) {
            errors.push({
                queueType,
                errorType: 'duplicate_cards',
                message: `Found ${duplicates.length} duplicate cards`,
                cardIds: duplicates,
            });
        }
        
        // 验证队列特定规则
        if (queueType === QueueType.RetrievalPractice) {
            // 检索练习队列应该只包含项目卡片
            const topicCards = cards.filter(c => c.cardType === 'topic');
            if (topicCards.length > 0) {
                errors.push({
                    queueType,
                    errorType: 'state_inconsistent',
                    message: `Retrieval practice queue contains ${topicCards.length} topic cards`,
                    cardIds: topicCards.map(c => c.blockId),
                });
            }
        }
        
        return errors;
    }
    
    /**
     * 打印验证摘要
     * 
     * @param result 验证结果
     */
    private printSummary(result: ValidationResult): void {
        console.log('\n=== Data Integrity Validation Summary ===');
        console.log(`Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
        console.log(`Total cards validated: ${result.totalCards}`);
        console.log(`Total queues validated: ${result.totalQueues}`);
        console.log(`Card errors: ${result.cardErrors.length}`);
        console.log(`Queue errors: ${result.queueErrors.length}`);
        
        if (result.cardErrors.length > 0) {
            console.log('\nCard validation errors:');
            result.cardErrors.slice(0, 10).forEach(error => {
                console.log(`  - ${error.cardId}: ${error.message}`);
            });
            if (result.cardErrors.length > 10) {
                console.log(`  ... and ${result.cardErrors.length - 10} more`);
            }
        }
        
        if (result.queueErrors.length > 0) {
            console.log('\nQueue validation errors:');
            result.queueErrors.forEach(error => {
                console.log(`  - ${error.queueType}: ${error.message}`);
            });
        }
        
        console.log('==========================================\n');
    }
    
    /**
     * 生成 Markdown 报告
     * 
     * @param result 验证结果
     * @returns Markdown 格式的报告
     */
    generateReport(result: ValidationResult): string {
        const date = new Date(result.timestamp).toISOString();
        const status = result.passed ? '✅ PASSED' : '❌ FAILED';
        
        let report = `# Data Integrity Validation Report\n\n`;
        report += `**Generated**: ${date}\n`;
        report += `**Status**: ${status}\n\n`;
        
        report += `## Summary\n\n`;
        report += `- **Total cards validated**: ${result.totalCards}\n`;
        report += `- **Total queues validated**: ${result.totalQueues}\n`;
        report += `- **Card errors**: ${result.cardErrors.length}\n`;
        report += `- **Queue errors**: ${result.queueErrors.length}\n\n`;
        
        if (result.cardErrors.length > 0) {
            report += `## Card Validation Errors\n\n`;
            report += `Found ${result.cardErrors.length} card validation errors:\n\n`;
            
            // 按错误类型分组
            const errorsByType = new Map<string, CardValidationError[]>();
            for (const error of result.cardErrors) {
                const errors = errorsByType.get(error.errorType) || [];
                errors.push(error);
                errorsByType.set(error.errorType, errors);
            }
            
            for (const [errorType, errors] of errorsByType) {
                report += `### ${errorType} (${errors.length})\n\n`;
                errors.slice(0, 20).forEach(error => {
                    report += `- **${error.cardId}**: ${error.message}`;
                    if (error.field) report += ` (field: ${error.field})`;
                    report += `\n`;
                });
                if (errors.length > 20) {
                    report += `\n... and ${errors.length - 20} more\n`;
                }
                report += `\n`;
            }
        }
        
        if (result.queueErrors.length > 0) {
            report += `## Queue Validation Errors\n\n`;
            result.queueErrors.forEach(error => {
                report += `### ${error.queueType}\n\n`;
                report += `- **Type**: ${error.errorType}\n`;
                report += `- **Message**: ${error.message}\n`;
                if (error.cardIds && error.cardIds.length > 0) {
                    report += `- **Affected cards**: ${error.cardIds.length}\n`;
                }
                report += `\n`;
            });
        }
        
        if (result.passed) {
            report += `## Conclusion\n\n`;
            report += `✅ All data integrity checks passed. The migration is complete and data is consistent.\n`;
        } else {
            report += `## Recommendations\n\n`;
            report += `❌ Data integrity issues detected. Please review and fix the errors before proceeding.\n\n`;
            report += `1. Review card validation errors and fix invalid data\n`;
            report += `2. Review queue validation errors and resolve state inconsistencies\n`;
            report += `3. Re-run validation after fixes\n`;
        }
        
        return report;
    }
}

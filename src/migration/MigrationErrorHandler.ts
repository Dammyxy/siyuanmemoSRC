/**
 * Migration Error Handler
 * 迁移错误处理器
 * 
 * 处理迁移过程中的各种错误，提供错误恢复机制。
 * 
 * @see .kiro/specs/queue-architecture-migration/requirements.md
 * @see .kiro/specs/queue-architecture-migration/design.md
 */

import { FSRSCard } from '../types/card';
import type { QueueItem } from '../core/queue/types';
import { QueueType } from '../types/unified-data-source';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import { TypeConverter } from './TypeConverter';
import {
    TypeConversionError,
    APICompatibilityError,
    DataIntegrityError,
    QueueStateError,
} from './MigrationErrors';

/**
 * 迁移错误处理器
 * 
 * 提供统一的错误处理和恢复机制。
 * 
 * 错误处理策略：
 * 1. 自动重试：对于临时性错误（网络错误、并发冲突）
 * 2. 数据回滚：对于数据完整性错误
 * 3. 降级处理：对于非关键错误
 * 4. 用户通知：对于影响用户的错误
 * 
 * @see 需求 10.4, 11.1, 11.2, 11.3
 */
export class MigrationErrorHandler {
    /**
     * 处理类型转换错误
     * 
     * 策略：
     * 1. 记录警告日志
     * 2. 尝试使用默认值转换
     * 3. 如果失败，返回 null
     * 
     * @param error 错误对象
     * @param item 原始 QueueItem
     * @returns 转换后的 FSRSCard，或 null（如果无法转换）
     * @see 需求 11.1
     */
    static handleTypeConversionError(
        error: Error,
        item: QueueItem
    ): FSRSCard | null {
        console.warn(
            `[MigrationErrorHandler] Type conversion failed for item ${item.cardID}:`,
            error
        );
        
        try {
            // 尝试使用默认值转换
            const card = TypeConverter.queueItemToFSRSCard(item);
            console.log(
                `[MigrationErrorHandler] Fallback conversion succeeded for ${item.cardID}`
            );
            return card;
        } catch (fallbackError) {
            console.error(
                `[MigrationErrorHandler] Fallback conversion failed for ${item.cardID}:`,
                fallbackError
            );
            return null;
        }
    }

    /**
     * 处理 API 兼容性错误
     * 
     * 策略：
     * 1. 记录详细错误信息
     * 2. 抛出 APICompatibilityError
     * 
     * @param error 错误对象
     * @param methodName 方法名
     * @param args 方法参数
     * @throws APICompatibilityError
     * @see 需求 11.2
     */
    static handleAPICompatibilityError(
        error: Error,
        methodName: string,
        args: any[]
    ): never {
        console.error(
            `[MigrationErrorHandler] API compatibility error in ${methodName}:`,
            error
        );
        
        throw new APICompatibilityError(
            `Method ${methodName} is not compatible with new architecture`,
            {
                methodName,
                args,
                originalError: error,
            }
        );
    }

    /**
     * 处理数据完整性错误
     * 
     * 策略：
     * 1. 记录详细错误信息
     * 2. 抛出 DataIntegrityError
     * 3. 调用者应该回滚操作
     * 
     * @param error 错误对象
     * @param operation 操作名称
     * @param context 额外上下文信息
     * @throws DataIntegrityError
     * @see 需求 11.3
     */
    static handleDataIntegrityError(
        error: Error,
        operation: string,
        context?: {
            cardId?: string;
            queueType?: string;
            expectedValue?: any;
            actualValue?: any;
        }
    ): never {
        console.error(
            `[MigrationErrorHandler] Data integrity error during ${operation}:`,
            error,
            context
        );
        
        throw new DataIntegrityError(
            `Data integrity check failed during ${operation}`,
            {
                operation,
                ...context,
                originalError: error,
            }
        );
    }

    /**
     * 处理队列状态错误
     * 
     * 策略：
     * 1. 记录错误信息
     * 2. 尝试从持久化数据恢复
     * 3. 如果恢复失败，重新初始化队列
     * 
     * @param error 错误对象
     * @param queueType 队列类型
     * @param manager 数据源管理器
     * @see 需求 11.3
     */
    static async handleQueueStateError(
        error: Error,
        queueType: QueueType,
        manager: UnifiedDataSourceManager
    ): Promise<void> {
        console.error(
            `[MigrationErrorHandler] Queue state error for ${queueType}:`,
            error
        );
        
        try {
            // 尝试从持久化数据恢复
            console.log(`[MigrationErrorHandler] Attempting to restore queue state for ${queueType}`);
            
            // 获取队列实例
            const queue = manager.getQueue(queueType);
            
            // 刷新队列（重新加载数据）
            await queue.refresh();
            
            console.log(`[MigrationErrorHandler] Queue state restored for ${queueType}`);
        } catch (restoreError) {
            console.error(
                `[MigrationErrorHandler] Failed to restore queue state for ${queueType}:`,
                restoreError
            );
            
            // 重新初始化队列
            try {
                console.log(`[MigrationErrorHandler] Reinitializing queue ${queueType}`);
                
                const queue = manager.getQueue(queueType);
                await queue.clear();
                await queue.refresh();
                
                console.log(`[MigrationErrorHandler] Queue reinitialized for ${queueType}`);
            } catch (reinitError) {
                console.error(
                    `[MigrationErrorHandler] Failed to reinitialize queue ${queueType}:`,
                    reinitError
                );
                
                throw new QueueStateError(
                    `Failed to recover queue state for ${queueType}`,
                    {
                        queueType,
                        originalError: error,
                    }
                );
            }
        }
    }

    /**
     * 使用指数退避策略重试操作
     * 
     * 用于处理临时性错误（网络错误、并发冲突）。
     * 
     * @param operation 要重试的操作
     * @param maxRetries 最大重试次数（默认 3）
     * @param baseDelay 基础延迟（毫秒，默认 1000）
     * @returns 操作结果
     * @see 需求 11.5
     */
    static async retryWithExponentialBackoff<T>(
        operation: () => Promise<T>,
        maxRetries: number = 3,
        baseDelay: number = 1000
    ): Promise<T> {
        let lastError: Error | null = null;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;
                
                if (attempt < maxRetries) {
                    const delay = baseDelay * Math.pow(2, attempt);
                    console.warn(
                        `[MigrationErrorHandler] Operation failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`,
                        error
                    );
                    await this.sleep(delay);
                } else {
                    console.error(
                        `[MigrationErrorHandler] Operation failed after ${maxRetries + 1} attempts:`,
                        error
                    );
                }
            }
        }
        
        throw lastError!;
    }

    /**
     * 睡眠指定毫秒数
     * 
     * @param ms 毫秒数
     */
    private static sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

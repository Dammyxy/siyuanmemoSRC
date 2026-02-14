/**
 * Migration Error Types
 * 迁移错误类型
 * 
 * 定义迁移过程中可能遇到的各种错误类型。
 * 
 * @see .kiro/specs/queue-architecture-migration/requirements.md
 * @see .kiro/specs/queue-architecture-migration/design.md
 */

/**
 * 迁移错误基类
 * 
 * 所有迁移相关错误的基类。
 */
export class MigrationError extends Error {
    constructor(
        message: string,
        public code: string,
        public context?: Record<string, any>
    ) {
        super(message);
        this.name = 'MigrationError';
    }
}

/**
 * 类型转换错误
 * 
 * 当 QueueItem 和 FSRSCard 之间的转换失败时抛出。
 * 
 * 原因：
 * - QueueItem 字段类型不匹配
 * - 缺失关键字段
 * - 字段值无效
 * 
 * @see 需求 10.4, 11.1
 */
export class TypeConversionError extends MigrationError {
    constructor(
        message: string,
        context?: {
            item?: any;
            field?: string;
            expectedType?: string;
            actualType?: string;
            originalError?: Error;
        }
    ) {
        super(message, 'TYPE_CONVERSION_ERROR', context);
        this.name = 'TypeConversionError';
    }
}

/**
 * API 兼容性错误
 * 
 * 当调用了不存在的方法或参数不匹配时抛出。
 * 
 * 原因：
 * - 方法不存在
 * - 参数类型不匹配
 * - 参数数量不匹配
 * - 返回值类型不匹配
 * 
 * @see 需求 10.4, 11.2
 */
export class APICompatibilityError extends MigrationError {
    constructor(
        message: string,
        context?: {
            methodName?: string;
            args?: any[];
            expectedSignature?: string;
            actualSignature?: string;
            originalError?: Error;
        }
    ) {
        super(message, 'API_COMPATIBILITY_ERROR', context);
        this.name = 'APICompatibilityError';
    }
}

/**
 * 数据完整性错误
 * 
 * 当迁移后数据验证失败时抛出。
 * 
 * 原因：
 * - 数据丢失
 * - 数据损坏
 * - 数据不一致
 * - 验证规则失败
 * 
 * @see 需求 10.4, 11.3
 */
export class DataIntegrityError extends MigrationError {
    constructor(
        message: string,
        context?: {
            operation?: string;
            cardId?: string;
            queueType?: string;
            expectedValue?: any;
            actualValue?: any;
            originalError?: Error;
        }
    ) {
        super(message, 'DATA_INTEGRITY_ERROR', context);
        this.name = 'DataIntegrityError';
    }
}

/**
 * 队列状态错误
 * 
 * 当队列状态不一致或损坏时抛出。
 * 
 * 原因：
 * - 队列状态不一致
 * - 持久化数据损坏
 * - 并发操作冲突
 * - 状态恢复失败
 * 
 * @see 需求 10.4, 11.3
 */
export class QueueStateError extends MigrationError {
    constructor(
        message: string,
        context?: {
            queueType?: string;
            state?: any;
            expectedState?: any;
            originalError?: Error;
        }
    ) {
        super(message, 'QUEUE_STATE_ERROR', context);
        this.name = 'QueueStateError';
    }
}

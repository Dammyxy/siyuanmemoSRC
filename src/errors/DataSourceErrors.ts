/**
 * Data Source Errors
 * 数据源错误类
 * 
 * 定义统一数据源架构中使用的自定义错误类型。
 * 
 * 错误层次结构：
 * - DataSourceError（基类）
 *   - ModeError（模式切换错误）
 *   - QueueError（队列操作错误）
 *   - SyncError（同步错误）
 *   - StorageError（存储错误）
 *   - NetworkError（网络错误）
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 */

/**
 * DataSourceError 基类
 * 
 * 所有数据源相关错误的基类。
 * 提供错误代码和上下文信息。
 */
import { createLogger } from '@/utils/logger';

const logger = createLogger('DataSourceErrors');

export class DataSourceError extends Error {
    public static isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null;
    }

    /**
     * 错误代码
     * 
     * 用于程序化错误处理和国际化。
     */
    public readonly code: string;
    
    /**
     * 错误上下文
     * 
     * 包含额外的调试信息。
     */
    public readonly context?: Record<string, unknown>;
    
    /**
     * 构造函数
     * 
     * @param message 错误消息
     * @param code 错误代码
     * @param context 可选的错误上下文
     */
    constructor(message: string, code: string, context?: Record<string, unknown>) {
        super(message);
        this.name = 'DataSourceError';
        this.code = code;
        this.context = context;
        
        // 维护正确的原型链（TypeScript 继承 Error 的问题）
        Object.setPrototypeOf(this, DataSourceError.prototype);
    }
}

/**
 * ModeError 类
 * 
 * 模式切换相关的错误。
 * 
 * 使用场景：
 * - 模式切换失败
 * - 同步失败导致无法切换到高级模式
 * - 路由器未初始化
 */
export class ModeError extends DataSourceError {
    /**
     * 构造函数
     * 
     * @param message 错误消息
     * @param context 可选的错误上下文
     */
    constructor(message: string, context?: Record<string, unknown>) {
        super(message, 'MODE_ERROR', context);
        this.name = 'ModeError';
        Object.setPrototypeOf(this, ModeError.prototype);
    }
}

/**
 * QueueError 类
 * 
 * 队列操作相关的错误。
 * 
 * 使用场景：
 * - 添加卡片到队列失败
 * - 从队列移除卡片失败
 * - 队列持久化失败
 * - 未知的队列类型
 */
export class QueueError extends DataSourceError {
    /**
     * 构造函数
     * 
     * @param message 错误消息
     * @param context 可选的错误上下文
     */
    constructor(message: string, context?: Record<string, unknown>) {
        super(message, 'QUEUE_ERROR', context);
        this.name = 'QueueError';
        Object.setPrototypeOf(this, QueueError.prototype);
    }
}

/**
 * SyncError 类
 * 
 * 数据同步相关的错误。
 * 
 * 使用场景：
 * - 从 Riff API 同步到本地存储失败
 * - 从本地存储同步到 Riff API 失败
 * - 数据冲突无法解决
 */
export class SyncError extends DataSourceError {
    /**
     * 构造函数
     * 
     * @param message 错误消息
     * @param context 可选的错误上下文
     */
    constructor(message: string, context?: Record<string, unknown>) {
        super(message, 'SYNC_ERROR', context);
        this.name = 'SyncError';
        Object.setPrototypeOf(this, SyncError.prototype);
    }
}

/**
 * StorageError 类
 * 
 * 本地存储相关的错误。
 * 
 * 使用场景：
 * - 存储空间不足（QuotaExceededError）
 * - 持久化失败
 * - 读取持久化数据失败
 * - 存储权限问题
 */
export class StorageError extends DataSourceError {
    /**
     * 构造函数
     * 
     * @param message 错误消息
     * @param context 可选的错误上下文
     */
    constructor(message: string, context?: Record<string, unknown>) {
        super(message, 'STORAGE_ERROR', context);
        this.name = 'StorageError';
        Object.setPrototypeOf(this, StorageError.prototype);
    }
}

/**
 * NetworkError 类
 * 
 * 网络请求相关的错误。
 * 
 * 使用场景：
 * - Riff API 请求失败
 * - 网络连接中断
 * - 请求超时
 * - API 返回错误状态码
 */
export class NetworkError extends DataSourceError {
    /**
     * HTTP 状态码（如果适用）
     */
    public readonly statusCode?: number;
    
    /**
     * 构造函数
     * 
     * @param message 错误消息
     * @param statusCode 可选的 HTTP 状态码
     * @param context 可选的错误上下文
     */
    constructor(message: string, statusCode?: number, context?: Record<string, unknown>) {
        super(message, 'NETWORK_ERROR', context);
        this.name = 'NetworkError';
        this.statusCode = statusCode;
        Object.setPrototypeOf(this, NetworkError.prototype);
    }
}

/**
 * 错误工厂函数
 * 
 * 根据错误类型和上下文创建相应的错误实例。
 */
export class ErrorFactory {
    /**
     * 创建模式错误
     * 
     * @param message 错误消息
     * @param context 可选的错误上下文
     * @returns ModeError 实例
     */
    static createModeError(message: string, context?: Record<string, unknown>): ModeError {
        return new ModeError(message, context);
    }
    
    /**
     * 创建队列错误
     * 
     * @param message 错误消息
     * @param context 可选的错误上下文
     * @returns QueueError 实例
     */
    static createQueueError(message: string, context?: Record<string, unknown>): QueueError {
        return new QueueError(message, context);
    }
    
    /**
     * 创建同步错误
     * 
     * @param message 错误消息
     * @param context 可选的错误上下文
     * @returns SyncError 实例
     */
    static createSyncError(message: string, context?: Record<string, unknown>): SyncError {
        return new SyncError(message, context);
    }
    
    /**
     * 创建存储错误
     * 
     * @param message 错误消息
     * @param context 可选的错误上下文
     * @returns StorageError 实例
     */
    static createStorageError(message: string, context?: Record<string, unknown>): StorageError {
        return new StorageError(message, context);
    }
    
    /**
     * 创建网络错误
     * 
     * @param message 错误消息
     * @param statusCode 可选的 HTTP 状态码
     * @param context 可选的错误上下文
     * @returns NetworkError 实例
     */
    static createNetworkError(
        message: string,
        statusCode?: number,
        context?: Record<string, unknown>
    ): NetworkError {
        return new NetworkError(message, statusCode, context);
    }
    
    /**
     * 从原生错误创建数据源错误
     * 
     * 根据原生错误的类型和属性，创建相应的数据源错误。
     * 
     * @param error 原生错误
     * @param defaultMessage 默认错误消息
     * @returns DataSourceError 实例
     */
    static fromNativeError(error: unknown, defaultMessage: string = '操作失败'): DataSourceError {
        const message = error instanceof Error ? error.message : String(error);
        const errorName = error instanceof Error
            ? error.name
            : (DataSourceError.isRecord(error) && typeof error.name === 'string' ? error.name : '');
        const lowerMessage = String(message).toLowerCase();
        
        // 检查是否为存储配额错误
        if (errorName === 'QuotaExceededError') {
            return new StorageError('存储空间不足，请清理旧数据', {
                originalError: error,
            });
        }
        
        // 检查是否为网络错误
        if (errorName === 'NetworkError' || lowerMessage.includes('network')) {
            return new NetworkError('网络连接失败，请检查网络连接', undefined, {
                originalError: error,
            });
        }
        
        // 默认返回通用数据源错误
        return new DataSourceError(`${defaultMessage}: ${message}`, 'UNKNOWN_ERROR', {
            originalError: error,
        });
    }
}

/**
 * 错误处理辅助函数
 */
export class ErrorHandler {
    /**
     * 判断错误是否可重试
     * 
     * @param error 错误实例
     * @returns 是否可重试
     */
    static isRetryable(error: DataSourceError): boolean {
        // 网络错误和同步错误通常可重试
        return error instanceof NetworkError || error instanceof SyncError;
    }
    
    /**
     * 判断错误是否为致命错误
     * 
     * 致命错误需要用户干预，无法自动恢复。
     * 
     * @param error 错误实例
     * @returns 是否为致命错误
     */
    static isFatal(error: DataSourceError): boolean {
        // 存储配额错误是致命的，需要用户清理数据
        if (error instanceof StorageError && error.code === 'STORAGE_ERROR') {
            return true;
        }
        
        // 模式错误通常是致命的
        if (error instanceof ModeError) {
            return true;
        }
        
        return false;
    }
    
    /**
     * 获取用户友好的错误消息
     * 
     * @param error 错误实例
     * @returns 用户友好的错误消息
     */
    static getUserFriendlyMessage(error: DataSourceError): string {
        switch (error.code) {
            case 'MODE_ERROR':
                return '模式切换失败，请稍后重试';
            case 'QUEUE_ERROR':
                return '队列操作失败，请稍后重试';
            case 'SYNC_ERROR':
                return '数据同步失败，请检查网络连接';
            case 'STORAGE_ERROR':
                return '存储空间不足，请清理旧数据';
            case 'NETWORK_ERROR':
                return '网络连接失败，请检查网络连接';
            default:
                return '操作失败，请稍后重试';
        }
    }
    
    /**
     * 记录错误日志
     * 
     * @param error 错误实例
     * @param context 额外的上下文信息
     */
    static logError(error: DataSourceError, context?: Record<string, unknown>): void {
        const logContext = {
            ...error.context,
            ...context,
            code: error.code,
            name: error.name,
        };
        
        logger.error(`[${error.name}] ${error.message}`, logContext);
    }
}

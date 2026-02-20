/**
 * HybridSyncService 类型定义
 */

// ==================== 配置接口 ====================

/**
 * 混合同步服务配置
 */
export interface HybridSyncConfig {
    /** 卡包 ID */
    deckId: string;
    
    /** 存储管理器 */
    storage: any; // StorageManager
    
    /** Riff 黑名单服务 */
    riffBlacklistService?: any; // RiffBlacklistService (optional for backward compatibility)
    
    /** 增量同步配置 */
    incrementalSync: {
        /** 是否启用增量同步 */
        enabled: boolean;
        /** 触发时机 */
        triggers: Array<'plugin-start' | 'browser-open' | 'review-open'>;
        /** 是否使用黑名单过滤 */
        useBlacklist: boolean;
        /** 是否自动检测卡片类型（Topic/Item） */
        autoDetectCardType: boolean;
    };
    
    /** 全量同步配置 */
    fullSync: {
        /** 是否启用全量同步 */
        enabled: boolean;
        /** 同步间隔（毫秒） */
        interval: number;
        /** 是否清理黑名单 */
        cleanupBlacklist: boolean;
    };
    
    /** 删除同步配置 */
    deleteSync: {
        /** 是否启用删除同步 */
        enabled: boolean;
        /** 删除失败时是否使用黑名单作为后备 */
        useBlacklistFallback: boolean;
    };
    
    /** 重试配置 */
    retry?: {
        /** 最大重试次数 */
        maxRetries: number;
        /** 初始重试延迟（毫秒） */
        retryDelay: number;
        /** 退避倍数 */
        backoffMultiplier: number;
    };
}

// ==================== 同步结果 ====================

/**
 * 同步结果
 */
export interface SyncResult {
    /** 是否成功 */
    success: boolean;
    /** 新增卡片数量 */
    addedCount: number;
    /** 删除卡片数量 */
    deletedCount: number;
    /** 跳过卡片数量 */
    skippedCount: number;
    /** 清理黑名单数量 */
    blacklistCleanedCount?: number;
    /** 检测卡片类型数量 */
    detectedCount?: number;
    /** 错误消息 */
    errorMessage?: string;
}

/**
 * 同步状态
 */
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

/**
 * 同步类型
 */
export type SyncType = 'incremental' | 'full' | 'delete';

// ==================== 进度接口 ====================

/**
 * 同步阶段
 */
export type SyncPhase = 
    | 'fetching'      // 获取数据
    | 'filtering'     // 过滤黑名单
    | 'adding'        // 添加卡片
    | 'deleting'      // 删除卡片
    | 'detecting'     // 检测类型
    | 'saving'        // 保存数据
    | 'cleanup';      // 清理黑名单

/**
 * 同步进度
 */
export interface SyncProgress {
    /** 当前进度 */
    current: number;
    /** 总数 */
    total: number;
    /** 当前阶段 */
    phase: SyncPhase;
    /** 进度消息 */
    message?: string;
    /** 百分比 (0-100) */
    percentage?: number;
}

/**
 * 进度回调函数
 */
export type ProgressCallback = (progress: SyncProgress) => void;

// ==================== 事件接口 ====================

/**
 * 同步开始事件数据
 */
export interface SyncStartEvent {
    /** 同步类型 */
    type: SyncType;
    /** 时间戳 */
    timestamp: number;
}

/**
 * 同步成功事件数据
 */
export interface SyncSuccessEvent {
    /** 同步类型 */
    type: SyncType;
    /** 同步结果 */
    result: SyncResult;
    /** 时间戳 */
    timestamp: number;
    /** 耗时（毫秒） */
    duration: number;
}

/**
 * 同步错误事件数据
 */
export interface SyncErrorEvent {
    /** 同步类型 */
    type: SyncType;
    /** 错误对象 */
    error: Error;
    /** 时间戳 */
    timestamp: number;
    /** 是否会重试 */
    willRetry: boolean;
    /** 当前重试次数 */
    retryCount?: number;
}

/**
 * 同步进度事件数据
 */
export interface SyncProgressEvent {
    /** 同步类型 */
    type: SyncType;
    /** 进度信息 */
    progress: SyncProgress;
    /** 时间戳 */
    timestamp: number;
}

/**
 * WebSocket 同步事件数据
 */
export interface WsSyncEvent {
    /** 是否成功 */
    success: boolean;
    /** 同步结果（成功时） */
    result?: SyncResult;
    /** 错误对象（失败时） */
    error?: Error;
    /** 时间戳 */
    timestamp: number;
}

/**
 * HybridSyncService 事件映射
 */
export interface HybridSyncEvents {
    /** 同步开始 */
    syncStart: SyncStartEvent;
    /** 同步成功 */
    syncSuccess: SyncSuccessEvent;
    /** 同步错误 */
    syncError: SyncErrorEvent;
    /** 同步进度 */
    syncProgress: SyncProgressEvent;
    /** 🆕 WebSocket 触发的同步完成 */
    wsSync: WsSyncEvent;
}

// ==================== 错误类型 ====================

/**
 * 同步错误类型
 */
export enum SyncErrorType {
    /** 网络错误（应该重试） */
    NETWORK = 'network',
    /** 超时错误（应该重试） */
    TIMEOUT = 'timeout',
    /** 权限错误（不应该重试） */
    PERMISSION = 'permission',
    /** 未授权错误（不应该重试） */
    UNAUTHORIZED = 'unauthorized',
    /** 数据错误（不应该重试） */
    DATA = 'data',
    /** 未知错误（默认重试） */
    UNKNOWN = 'unknown'
}

/**
 * 同步错误类
 */
export class SyncError extends Error {
    constructor(
        message: string,
        public type: SyncErrorType,
        public originalError?: Error
    ) {
        super(message);
        this.name = 'SyncError';
    }
}

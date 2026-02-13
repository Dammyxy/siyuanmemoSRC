/**
 * 重新调度操作的错误代码枚举
 */
export enum RescheduleErrorCode {
    /** 配置参数无效 */
    INVALID_CONFIG = 'INVALID_CONFIG',
    /** 卡片未找到 */
    CARD_NOT_FOUND = 'CARD_NOT_FOUND',
    /** 存储错误 */
    STORAGE_ERROR = 'STORAGE_ERROR',
    /** 计算错误 */
    CALCULATION_ERROR = 'CALCULATION_ERROR',
    /** 批量更新失败 */
    BATCH_UPDATE_FAILED = 'BATCH_UPDATE_FAILED',
    /** 网络错误 */
    NETWORK_ERROR = 'NETWORK_ERROR',
    /** 未知错误 */
    UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * 重新调度错误接口
 */
export interface RescheduleError {
    /** 错误代码 */
    code: RescheduleErrorCode;
    /** 错误消息 */
    message: string;
    /** 相关的卡片 ID（如果适用） */
    cardId?: string;
    /** 额外的错误详情 */
    details?: any;
}

/**
 * 操作结果类型（成功或失败）
 */
export type Result<T, E = RescheduleError> =
    | { ok: true; value: T }
    | { ok: false; error: E };

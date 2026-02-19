/**
 * Unified Data Source Strategies
 * 统一数据源策略
 * 
 * 导出所有与统一数据源集成相关的策略和适配器。
 */

export { UnifiedQueueStrategy } from './UnifiedQueueStrategy';
export { UnifiedReviewAdapter } from './UnifiedReviewAdapter';
export { createUnifiedReviewDialog, getQueueDisplayName } from './createUnifiedReviewDialog';
export type { CreateUnifiedReviewDialogOptions } from './createUnifiedReviewDialog';

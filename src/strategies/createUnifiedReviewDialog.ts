/**
 * Create Unified Review Dialog
 * 创建使用统一数据源的复习对话框
 * 
 * 提供便捷函数，用于创建使用 UnifiedQueueStrategy 的复习对话框。
 * 
 * @see .kiro/specs/unified-data-source-ui-integration/requirements.md - 需求 4
 * @see .kiro/specs/unified-data-source-ui-integration/design.md - 复习界面集成
 */

import { createVueDialog } from '@/utils/dialog';
import ReviewView from '@/ui/review/v2/ReviewView.vue';
import { UnifiedQueueStrategy } from './UnifiedQueueStrategy';
import { UnifiedReviewAdapter } from './UnifiedReviewAdapter';
import type { QueueType } from '@/types/unified-data-source';

/**
 * 创建统一复习对话框的选项
 */
export interface CreateUnifiedReviewDialogOptions {
    /** 插件实例 */
    plugin: any;
    
    /** 队列类型 */
    queueType: QueueType;
    
    /** 对话框标题 */
    title: string;
    
    /** 关闭回调 */
    onClose?: () => void;
}

/**
 * 创建使用统一数据源的复习对话框
 * 
 * 这个函数创建一个复习对话框，内部使用 UnifiedQueueStrategy 和 UnifiedReviewAdapter，
 * 自动集成到统一数据源架构中。
 * 
 * 使用示例：
 * ```typescript
 * const dialog = createUnifiedReviewDialog({
 *     plugin: this.plugin,
 *     queueType: QueueType.RetrievalPractice,
 *     title: '提取练习',
 *     onClose: () => {
 *         this.plugin.reviewDialog = null;
 *     }
 * });
 * ```
 * 
 * @param options 创建选项
 * @returns 对话框实例
 */
export function createUnifiedReviewDialog(options: CreateUnifiedReviewDialogOptions) {
    const { plugin, queueType, title, onClose } = options;
    
    try {
        console.log(`[SiyuanMemo][createUnifiedReviewDialog] Creating dialog for queue: ${queueType}`);
        
        // 创建统一队列策略
        const queue = new UnifiedQueueStrategy(queueType);
        
        // 创建统一复习适配器
        const adapter = new UnifiedReviewAdapter({ i18n: plugin.i18n || {} });
        
        // 创建对话框
        const dialog = createVueDialog({
            hideTitle: true,  // 隐藏原生标题栏，使用 Vue 组件的头部
            component: ReviewView,
            dataKey: 'dialog-opencard',
            transparent: true,
            isReview: true,
            props: {
                app: plugin.app,
                i18n: plugin.i18n || {},
                title: title,
                queue: queue as any,
                adapter: adapter as any,
                plugin: plugin,  // 传递插件实例，用于访问 hybridSyncService
            },
            events: {
                close: () => {
                    dialog?.destroy();
                    onClose?.();
                },
            },
            width: 'min(860px, 96vw)',
            height: 'min(720px, 90vh)',
            onClose: async () => {
                // 🆕 对话框关闭时只同步数据，不刷新 UI
                // 因为增量更新已经实时更新了浏览器，这里只需要确保数据持久化
                if (plugin.reviewSyncManager) {
                    // 只调用同步，不触发观察者通知
                    const syncManager = plugin.reviewSyncManager;
                    if (syncManager.reviewCount > 0) {
                        try {
                            await plugin.hybridSyncService?.incrementalSync();
                            console.log('[SiyuanMemo][createUnifiedReviewDialog] Data synced on close');
                        } catch (err) {
                            console.error('[SiyuanMemo][createUnifiedReviewDialog] Sync failed on close:', err);
                        }
                    }
                }
                
                // 调用用户提供的关闭回调
                onClose?.();
            },
        });
        
        console.log(`[SiyuanMemo][createUnifiedReviewDialog] Dialog created successfully for queue: ${queueType}`);
        
        return dialog;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[SiyuanMemo][createUnifiedReviewDialog] Failed to create dialog:`, {
            queueType,
            error: errorMessage
        });
        throw error;
    }
}

/**
 * 获取队列类型的显示名称
 * 
 * @param queueType 队列类型
 * @param i18n 国际化对象
 * @returns 显示名称
 */
export function getQueueDisplayName(queueType: QueueType, i18n?: Record<string, string>): string {
    const names: Record<QueueType, string> = {
        'retrieval-practice': i18n?.retrievalPractice || '提取练习',
        'final-drill': i18n?.finalDrill || '最终训练',
        'incremental-learning': i18n?.incrementalLearning || '渐进学习',
        'filter-group': i18n?.filterGroup || '过滤组',
        'neural-roam': i18n?.neuralRoam || '神经漫游'
    };
    
    return names[queueType] || queueType;
}

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
import { UnifiedQueueStrategy } from '@/application/adapters/UnifiedQueueStrategy';
import { UnifiedReviewAdapter } from '@/application/adapters/UnifiedReviewAdapter';
import type { IReviewQueue, QueueType } from '@/types/unified-data-source';
import type { ReviewHeaderVariant } from '@/ui/review/v2/types';
import { UnifiedDataSourceManager } from '@/application/services/UnifiedDataSourceManager';
import type { EventBus } from '@/core/shared/domain/events/EventBus';
import type { ISchedulerRouter } from '@/application/interfaces/ISchedulerRouter';
import { createLogger } from '@/utils/logger';

const logger = createLogger('createUnifiedReviewDialog');

type ReviewDialogPluginLike = {
    app: unknown;
    isMobile?: boolean;
    i18n?: Record<string, string>;
    reviewSyncManager?: { reviewCount?: number };
    getContext?: () => {
        getSchedulerRouter: () => ISchedulerRouter;
        getHybridSyncService?: () => { incrementalSync: () => Promise<unknown> } | undefined;
    } | undefined;
};

/**
 * 创建统一复习对话框的选项
 */
export interface CreateUnifiedReviewDialogOptions {
    /** 插件实例 */
    plugin: ReviewDialogPluginLike;
    
    /** 队列类型 */
    queueType: QueueType;

    /** 可选：直接传入队列实例（用于临时/子集复习） */
    queueInstance?: IReviewQueue;
    
    /** 对话框标题 */
    title: string;

    /** 顶栏计数展示变体 */
    headerVariant: ReviewHeaderVariant;
    
    /** 事件总线（必需，用于依赖注入） */
    eventBus: EventBus;
    
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
    const { plugin, queueType, queueInstance, title, headerVariant, eventBus, onClose } = options;
    const isMobile = plugin.isMobile === true;
    
    try {
        logger.info(`Creating dialog for queue: ${queueType}`);
        
        // 获取依赖
        const manager = UnifiedDataSourceManager.getInstance();
        
        // ✅ 通过 Facade 获取 ApplicationContext（兼容旧字段）
        const context = plugin.getContext?.();
        if (!context) {
            throw new Error('ApplicationContext not found in plugin');
        }
        
        // 创建统一队列策略（使用依赖注入）
        const schedulerRouter = context.getSchedulerRouter();
        const queue = new UnifiedQueueStrategy(queueInstance ?? queueType, manager, eventBus, schedulerRouter);
        
        // 创建统一复习适配器
        const adapter = new UnifiedReviewAdapter({
            i18n: plugin.i18n || {},
            headerVariant,
            progressiveExcerptEnabled: context.getSettingsService().getSettings().progressiveReading?.altXExcerptEnabled === true,
        });
        
        // 创建对话框
        const dialog = createVueDialog({
            hideTitle: true,  // 隐藏原生标题栏，使用 Vue 组件的头部
            component: ReviewView,
            dataKey: 'dialog-opencard',
            transparent: true,
            isReview: true,
            isMobile,
            props: {
                app: plugin.app,
                i18n: plugin.i18n || {},
                title: title,
                headerVariant,
                queue,
                adapter,
                plugin: plugin,  // 传递插件实例，用于访问 hybridSyncService
                isMobile,
            },
            events: {
                close: () => {
                    dialog?.destroy();
                    onClose?.();
                },
            },
            width: isMobile ? '100vw' : 'min(860px, 96vw)',
            height: isMobile ? '100vh' : 'min(720px, 90vh)',
            onClose: async () => {
                // 🆕 对话框关闭时只同步数据，不刷新 UI
                // 因为增量更新已经实时更新了浏览器，这里只需要确保数据持久化
                if (plugin.reviewSyncManager) {
                    // 只调用同步，不触发观察者通知
                    const syncManager = plugin.reviewSyncManager;
                    if (syncManager.reviewCount > 0) {
                        try {
                            await context.getHybridSyncService?.()?.incrementalSync();
                            logger.info('Data synced on close');
                        } catch (err) {
                            logger.error('Sync failed on close:', err);
                        }
                    }
                }
                
                // 调用用户提供的关闭回调
                onClose?.();
            },
        });
        
        logger.info(`Dialog created successfully for queue: ${queueType}`);
        
        return dialog;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to create dialog:', {
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
        'neural-roam': i18n?.neuralRoam || '神经漫游',
        'leech': i18n?.startLeechPractice || '难点攻坚',
    };
    
    return names[queueType] || queueType;
}

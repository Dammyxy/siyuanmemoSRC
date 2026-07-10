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
import type {
    IReviewQueue,
    InitialReviewSessionState,
    QueueType,
    ReviewTabTransferState,
} from '@/types/unified-data-source';
import type { ReviewHeaderVariant } from '@/ui/review/v2/types';
import { UnifiedDataSourceManager } from '@/application/services/UnifiedDataSourceManager';
import type { EventBus } from '@/core/shared/domain/events/EventBus';
import { createLogger } from '@/utils/logger';
import type { ReviewAdmissionTicket } from '@/application/services/ReviewAdmissionModule';
import type { ReviewEntryTarget } from '@/application/services/ReviewEntryTargetResolver';
import type { ReviewRuntimeAccess } from '@/application/runtime-access';

const logger = createLogger('createUnifiedReviewDialog');

type ReviewDialogPluginLike = {
    app: unknown;
    isMobile?: boolean;
    i18n?: Record<string, string>;
};

/**
 * 创建统一复习对话框的选项
 */
export interface CreateUnifiedReviewDialogOptions {
    /** 插件实例 */
    plugin: ReviewDialogPluginLike;
    runtimeAccess: ReviewRuntimeAccess;
    
    /** 已解析的 Review 会话入口目标 */
    entryTarget: ReviewEntryTarget;
    reviewAdmissionTicket?: ReviewAdmissionTicket | null;

    /** 可选：直接传入队列实例（用于临时/子集复习） */
    queueInstance?: IReviewQueue;

    /** 可选：传入会话计数状态（用于 surface 间切换时延续统计） */
    initialSessionState?: InitialReviewSessionState;

    /** 可选：传入可序列化队列迁移状态（用于对话框再打开为 Tab 时保持精确子集） */
    transferState?: ReviewTabTransferState;

    /** 对话框标题 */
    title: string;

    /** 顶栏计数展示变体 */
    headerVariant: ReviewHeaderVariant;
    
    /** 事件总线（必需，用于依赖注入） */
    eventBus: EventBus;

    /** 对话框模式下是否默认进入全屏 */
    startFullscreen?: boolean;
    
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
 *     runtimeAccess: this.reviewRuntimeAccess,
 *     entryTarget: {
 *         kind: 'projection-queue',
 *         queueType: QueueType.RetrievalPractice,
 *         entrySurface: 'topbar:retrieval-practice',
 *         admission: { kind: 'required' },
 *     },
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
    const {
        plugin,
        runtimeAccess,
        entryTarget,
        queueInstance,
        initialSessionState,
        transferState,
        title,
        headerVariant,
        eventBus,
        startFullscreen,
        reviewAdmissionTicket,
        onClose,
    } = options;
    const queueType = entryTarget.queueType;
    const neuralRoamStartFromFocus = entryTarget.kind === 'neural-roam'
        ? entryTarget.launch.startFromFocus
        : null;
    const initialSemanticPinnedSessionId = entryTarget.kind === 'neural-roam'
        ? entryTarget.launch.semanticPinnedSessionId
        : null;
    const isMobile = plugin.isMobile === true;
    
    try {
        logger.info('[SiYuanMemo][ReviewEntryDiagnostic] creating review dialog', {
            queueType,
            headerVariant,
            entrySurface: entryTarget.entrySurface,
            hasQueueInstance: Boolean(queueInstance),
        });
        
        // 获取依赖
        const manager = UnifiedDataSourceManager.getInstance();
        
        // 创建统一队列策略（使用依赖注入）
        const schedulerRouter = runtimeAccess.scheduler;
        const reviewService = runtimeAccess.reviewService;
        const queue = new UnifiedQueueStrategy(queueInstance ?? queueType, manager, eventBus, schedulerRouter, reviewService
            ? { refreshCdfLiveRelationOnOpen: (card) => reviewService.refreshCdfLiveRelationOnOpen(card) }
            : null, entryTarget, reviewAdmissionTicket ?? null);
        queue.startNeuralRoamFromFocusOnNextAdvance(neuralRoamStartFromFocus);
        
        // 创建统一复习适配器
        const adapter = new UnifiedReviewAdapter({
            i18n: plugin.i18n || {},
            headerVariant,
            progressiveExcerptEnabled: runtimeAccess.settingsService.getSettings().progressiveReading?.altXExcerptEnabled === true,
        });

        let closeFinalized = false;
        const finalizeClose = async () => {
            if (closeFinalized) {
                return;
            }
            closeFinalized = true;

            try {
                const backendClient = runtimeAccess.backendClient;
                if (backendClient?.flushReviewTruthNow) {
                    await backendClient.flushReviewTruthNow('review-exit');
                } else {
                    backendClient?.requestReviewTruthFlush?.('review-exit');
                }
            } catch (error) {
                logger.warn('[SiYuanMemo][createUnifiedReviewDialog] Failed to request Review truth flush on close:', error);
            }

            // 调用用户提供的关闭回调
            onClose?.();
        };
        
        // 创建对话框
        const dialog = createVueDialog({
            title,
            hideTitle: isMobile,
            component: ReviewView,
            dataKey: 'dialog-opencard',
            scrimVariant: 'review-focus',
            isReview: true,
            isMobile,
            visualVariant: 'workspace',
            containerClass: 'siyuanmemo-review-shell-dialog',
            disableClose: isMobile,
            props: {
                app: plugin.app,
                i18n: plugin.i18n || {},
                mode: 'dialog',
                title: title,
                headerVariant,
                queue,
                adapter,
                plugin: plugin,  // 传递插件实例，用于访问 hybridSyncService
                isMobile,
                nativeDialogTitlebar: !isMobile,
                startFullscreen,
                initialSessionState,
                transferState,
                initialSemanticPinnedSessionId,
            },
            events: {
                close: async () => {
                    await finalizeClose();
                    dialog?.destroy();
                },
            },
            width: isMobile ? '100vw' : 'min(860px, 96vw)',
            height: isMobile ? '100vh' : 'min(720px, 90vh)',
            onClose: finalizeClose,
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

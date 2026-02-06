/**
 * Unified Review Adapter
 * 统一复习适配器
 * 
 * 将 FSRSCard 转换为 ReviewUIState，用于 useReviewSession。
 * 
 * @see .kiro/specs/unified-data-source-ui-integration/requirements.md - 需求 4
 * @see .kiro/specs/unified-data-source-ui-integration/design.md - 复习界面集成
 * 
 * 注意：使用 any 类型来简化适配层实现，因为 ReviewUIState 的类型定义非常复杂。
 * 这是一个适配层，主要目的是功能集成。
 */

import type { IAdapter, AdapterContext } from '@/ui/review/v2/types';
import type { FSRSCard } from '@/types/card';
import type { IQueueStrategy } from '@/core/queue/abstraction/Strategy';

/**
 * 统一复习适配器
 * 
 * 负责将 FSRSCard 转换为 ReviewUIState，提供 UI 所需的所有数据。
 * 
 * 验证需求：4.1
 */
export class UnifiedReviewAdapter implements IAdapter<any> {
    /**
     * 将卡片转换为 UI 状态
     * 
     * @param queue 队列策略
     * @param item 当前卡片
     * @param context 适配器上下文
     * @returns UI 状态
     */
    async toUIState(
        queue: IQueueStrategy<any>,
        item: any | null,
        context: AdapterContext
    ): Promise<any> {
        // 如果没有卡片，返回空状态
        if (!item) {
            return {
                header: {
                    title: '复习',
                    stats: { current: 0, total: 0, label: '', queueName: '' },
                    breadcrumbs: []
                },
                content: {
                    type: 'empty',
                    data: '',
                    id: ''
                },
                actions: {
                    showAnswer: false,
                    grades: [],
                    menu: [],
                    toolbar: []
                },
                meta: {
                    transition: 'fade',
                    hasHiddenContent: false
                },
                overlay: null
            };
        }
        
        // 获取队列统计
        const stats = await queue.getStats?.();
        
        // 获取 UI 配置
        const uiConfig = queue.getUIConfig(item);
        
        const card = item as FSRSCard;
        
        // 构建 UI 状态
        const state: any = {
            header: {
                title: '复习',
                stats: {
                    current: stats?.size || 0,
                    total: stats?.size || 0,
                    label: stats?.label || '',
                    queueName: '统一队列'
                },
                breadcrumbs: []
            },
            content: {
                type: 'protyle',
                data: card.blockId || card.id,
                id: card.blockId || card.id
            },
            actions: {
                showAnswer: !context.showAnswer,  // 🔧 修复：反转 context.showAnswer 的值
                grades: uiConfig.showRatingButtons ? [
                    { label: '1', value: 1, color: 'red', kb: '1' },
                    { label: '2', value: 2, color: 'orange', kb: '2' },
                    { label: '3', value: 3, color: 'green', kb: '3' },
                    { label: '4', value: 4, color: 'blue', kb: '4' }
                ] : [],
                menu: [],
                toolbar: [],
                cardMeta: {
                    blockID: card.blockId || card.id,
                    reps: card.reps,
                    lapses: card.lapses,
                    lastReview: card.lastReview,
                    isReviewCard: card.reps > 0
                }
            },
            meta: {
                transition: 'slide-left',
                hasHiddenContent: !context.showAnswer
            },
            overlay: null
        };
        
        return state;
    }
    
    /**
     * 获取辅助数据（可选）
     * 
     * 加载卡片的 HTML 内容。
     * 
     * @param item 当前卡片
     * @returns 部分 UI 状态（包含 HTML 内容）
     */
    async fetchAuxiliaryData(item: any | null): Promise<any> {
        if (!item) {
            return {};
        }
        
        // TODO: 从思源 API 加载块的 HTML 内容
        // 这里暂时返回空，实际应该调用 getBlockByID 等 API
        
        return {};
    }
    
    /**
     * 清理资源（可选）
     */
    cleanup(): void {
        // 无需清理
    }
}

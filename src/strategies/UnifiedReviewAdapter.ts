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
import { isXiuyuanCard } from '@/core/xiuyuan/cardMeta';

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
                    stats: { current: 0, total: 0, label: '', queueName: '', newCards: 0, reviewCards: 0 },
                    breadcrumbs: [],
                    toolbar: [
                        { icon: '#iconFullscreen', type: 'fullscreen', ariaLabel: '全屏' },
                        { icon: '#iconEdit', type: 'edit-srs', ariaLabel: '编辑SRS数据' },
                    ],
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

        // 🔧 兼容 QueueItem (blockID/cardID) 和 FSRSCard (blockId/id) 的属性命名
        const blockId = (item as any).blockID || card.blockId || (item as any).blockId || card.id || (item as any).cardID;
        const cardId = (item as any).cardID || card.id || (item as any).id;
        
        // 🔑 检查是否为神经漫游队列
        const isNeuralRoam = (queue as any).getType?.() === 'neural-roam';
        
        // 构建工具栏按钮
        const toolbar = [
            { icon: '#iconFullscreen', type: 'fullscreen', ariaLabel: '全屏' },
            { icon: '#iconEdit', type: 'edit-srs', ariaLabel: '编辑SRS数据' },
            { icon: '#iconOpen', type: 'sticktab', ariaLabel: '打开为' },
        ];
        
        // 🆕 仅神经漫游队列显示锁定种子按钮和菜单
        if (isNeuralRoam) {
            toolbar.push(
                { icon: '#iconGraph', type: 'open-graph', ariaLabel: '打开图谱 🗺️' },
                { icon: '#iconLock', type: 'lock-seed', ariaLabel: '锁定为种子块 🌱' },
                { icon: '#iconMenu', type: 'neural-menu', ariaLabel: '神经漫游菜单' }
            );
        }
        
        // 构建 UI 状态
        const state: any = {
            header: {
                title: '复习',
                stats: {
                    current: stats?.size || 0,
                    total: stats?.size || 0,
                    label: stats?.label || '',
                    queueName: '统一队列',
                    // 🆕 添加新卡和复习卡的统计
                    newCards: 0, // 统一队列不区分新卡和复习卡
                    reviewCards: stats?.size || 0, // 所有卡片都算作复习卡
                    currentNewCards: 0,
                    currentReviewCards: stats?.size || 0,
                },
                breadcrumbs: [],
                toolbar: toolbar,
            },
            content: {
                type: 'protyle',
                data: (() => {
                    // 🆕 Xiuyuan 卡片：data 也使用 frontBlockIDs 的第一个块
                    if (isXiuyuanCard(card) && card.meta.frontBlockIDs.length > 0) {
                        return card.meta.frontBlockIDs[0];
                    }
                    return blockId;
                })(),
                id: (() => {
                    // 🆕 Xiuyuan 卡片：使用 frontBlockIDs 的第一个块
                    if (isXiuyuanCard(card) && card.meta.frontBlockIDs.length > 0) {
                        return card.meta.frontBlockIDs[0];
                    }
                    return blockId;
                })(),
                answerBlockID: (() => {
                    // 🆕 Xiuyuan 卡片：使用 backBlockIDs 的第一个块
                    if (isXiuyuanCard(card) && card.meta.backBlockIDs.length > 0) {
                        return card.meta.backBlockIDs[0];
                    }
                    // 向后兼容：旧的 Xiuyuan 卡片
                    return String((card as any)?.meta?.answerBlockID || '');
                })(),
                card: card as any
            },
            actions: {
                showAnswer: !context.showAnswer,  // 🔧 修复：反转 context.showAnswer 的值
                grades: uiConfig.showRatingButtons ? [
                    { label: '重来', value: 1, color: 'var(--b3-theme-error)', kb: '1', emoji: '🙈', nextDue: '' },
                    { label: '困难', value: 2, color: 'var(--b3-theme-warning)', kb: '2', emoji: '😬', nextDue: '' },
                    { label: '良好', value: 3, color: 'var(--b3-theme-info)', kb: '3', emoji: '😊', nextDue: '' },
                    { label: '简单', value: 4, color: 'var(--b3-theme-success)', kb: '4', emoji: '🌈', nextDue: '' }
                ] : [],
                menu: [],
                cardMeta: {
                    blockID: blockId,
                    cardID: cardId,
                    deckID: (card as any).deckId || (item as any).deckID || '',
                    reps: card.reps,
                    lapses: card.lapses,
                    state: card.state,
                    lastReview: card.lastReview,
                    isReviewCard: card.reps > 0,
                    type: (card as any)?.type || 'item', // 🆕 卡片类型
                    cardType: (card as any)?.type || 'item', // 🆕 兼容字段
                }
            },
            meta: {
                transition: 'slide-left',
                hasHiddenContent: !context.showAnswer,
                remainingSize: stats?.size || 0, // 🆕 剩余卡片数量
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

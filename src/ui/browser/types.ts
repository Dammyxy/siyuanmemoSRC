/**
 * 卡片浏览器类型定义
 */

/** 卡片状态枚举 */
export enum CardState {
    New = 0,
    Learning = 1,
    Review = 2,
    Relearning = 3,
}

/** 状态标签映射 */
export const STATE_LABELS: Record<CardState, string> = {
    [CardState.New]: '新卡',
    [CardState.Learning]: '学习中',
    [CardState.Review]: '复习',
    [CardState.Relearning]: '重学',
};

/** 状态颜色映射 */
export const STATE_COLORS: Record<CardState, string> = {
    [CardState.New]: 'var(--b3-card-info-color)',
    [CardState.Learning]: 'var(--b3-card-warning-color)',
    [CardState.Review]: 'var(--b3-card-success-color)',
    [CardState.Relearning]: 'var(--b3-card-error-color)',
};

/** 浏览器卡片数据结构 */
export interface BrowserCard {
    id: string;              // Riff 卡片 ID
    fsrsCardId?: string;     // 块属性 custom-fsrs-card-id
    blockId: string;         // 块 ID
    deckId: string;          // 卡组 ID
    content: string;         // 截断内容 (100字)
    fullContent?: string;    // 完整内容
    rootId?: string;

    // FSRS 状态
    state: CardState;
    stateLabel: string;
    due: Date;
    dueFormatted: string;
    stability: number;
    difficulty: number;
    retrievability: number;  // 实时计算
    reps: number;
    lapses: number;
    elapsedDays: number;
    scheduledDays: number;
    lastReview: Date | null;
    lastReviewFormatted: string;

    // 新增字段
    interval: number;            // 间隔天数 (scheduledDays)
    firstReview: Date | null;    // 首次复习
    firstReviewFormatted: string;

    // 自定义属性
    priority: number;        // 0-100
    suspended: boolean;
    tags?: string[];
    note?: string;
    queueIndex?: number;

    // Topic/Item/Concept/Descriptor 区分
    cardType?: 'topic' | 'item' | 'concept' | 'descriptor' | 'incremental' | 'webpage';  // 卡片类型
    aFactor?: number;              // A-Factor (仅 Topic 卡片)
    
    // 🆕 Xiuyuan 卡片支持
    meta?: any;  // FSRSCard 的 meta 字段（包含 Xiuyuan 信息）
}

/** 筛选预设 */
export interface FilterPreset {
    key: string;
    label: string;
    i18nKey: string;
    icon?: string;
    description?: string;
}

/** 筛选预设列表 */
export const FILTER_PRESETS: FilterPreset[] = [
    { key: 'all',             i18nKey: 'filterPresetAll',             label: '全部卡片',   icon: 'iconRiffCard' },
    { key: 'due',             i18nKey: 'filterPresetDue',             label: '今日到期',   icon: 'iconToday' },
    { key: 'overdue',         i18nKey: 'filterPresetOverdue',         label: '已过期',     icon: 'iconClose' },
    { key: 'new',             i18nKey: 'filterPresetNew',             label: '新卡片',     icon: 'iconAdd' },
    { key: 'learning',        i18nKey: 'filterPresetLearning',        label: '学习中',     icon: 'iconPlay' },
    { key: 'leech',           i18nKey: 'filterPresetLeech',           label: '难点卡片',   icon: 'iconBug' },
    { key: 'suspended',       i18nKey: 'filterPresetSuspended',       label: '已暂停',     icon: 'iconPause' },
    { key: 'current-doc',     i18nKey: 'filterPresetCurrentDoc',      label: '当前文档',   icon: 'iconFile' },
    // Topic/Item/Concept/Descriptor 筛选
    { key: 'topic-only',      i18nKey: 'filterPresetTopicOnly',       label: '仅主题',     icon: 'iconFile' },
    { key: 'item-only',       i18nKey: 'filterPresetItemOnly',        label: '仅卡片',     icon: 'iconCheck' },
    { key: 'concept-only',    i18nKey: 'filterPresetConceptOnly',     label: '仅概念卡',   icon: 'iconBrain' },
    { key: 'descriptor-only', i18nKey: 'filterPresetDescriptorOnly',  label: '仅描述符卡', icon: 'iconTag' },
];

/**
 * 根据队列类型获取可用的卡片类型筛选选项
 * 
 * @param queueId 队列 ID（retrieval, final-drill, neural, incremental-learning 等）
 * @returns 可用的卡片类型筛选选项数组
 */
export function getAvailableCardTypeFilters(queueId: string | null): Array<{ value: CardTypeFilter; i18nKey: string; label: string }> {
    // 提取练习队列和刻意练习队列：只显示 all、item-only、descriptor-only
    // 原因：concept 卡片使用 A-Factor 调度器，不应出现在 FSRS 练习队列中
    if (queueId === 'retrieval' || queueId === 'final-drill') {
        return [
            { value: 'all',             i18nKey: 'cardTypeAll',             label: '所有类型' },
            { value: 'item-only',       i18nKey: 'cardTypeItemOnly',        label: '仅卡片' },
            { value: 'descriptor-only', i18nKey: 'cardTypeDescriptorOnly',  label: '仅描述符卡' },
        ];
    }

    // 神经漫游队列：只显示 concept-only 和 descriptor-only
    if (queueId === 'neural') {
        return [
            { value: 'concept-only',    i18nKey: 'cardTypeConceptOnly',     label: '仅概念卡' },
            { value: 'descriptor-only', i18nKey: 'cardTypeDescriptorOnly',  label: '仅描述符卡' },
        ];
    }

    // 其他队列（渐进学习、筛选组、全部卡片等）：显示所有选项
    return [
        { value: 'all',             i18nKey: 'cardTypeAll',             label: '所有类型' },
        { value: 'topic-only',      i18nKey: 'cardTypeTopicOnly',       label: '仅主题' },
        { value: 'item-only',       i18nKey: 'cardTypeItemOnly',        label: '仅卡片' },
        { value: 'concept-only',    i18nKey: 'cardTypeConceptOnly',     label: '仅概念卡' },
        { value: 'descriptor-only', i18nKey: 'cardTypeDescriptorOnly',  label: '仅描述符卡' },
    ];
}

/** 批量操作类型 */
export type BatchAction =
    | 'reschedule'
    | 'reset'
    | 'suspend'
    | 'unsuspend'
    | 'priority'
    | 'delete';

/** 批量操作定义 */
export interface BatchActionDef {
    key: BatchAction;
    label: string;
    i18nKey: string;
    icon: string;
    shortcut?: string;
    danger?: boolean;
}

/** 批量操作列表 */
export const BATCH_ACTIONS: BatchActionDef[] = [
    { key: 'reschedule', i18nKey: 'batchReschedule', label: '重新调度', icon: 'iconCalendar', shortcut: 'Ctrl+J' },
    { key: 'reset',      i18nKey: 'batchReset',      label: '重置为新卡', icon: 'iconRefresh', shortcut: 'Ctrl+Shift+R' },
    { key: 'suspend',    i18nKey: 'batchSuspend',    label: '暂停卡片', icon: 'iconPause', shortcut: 'Ctrl+K' },
    { key: 'unsuspend',  i18nKey: 'batchUnsuspend',  label: '取消暂停', icon: 'iconPlay', shortcut: 'Ctrl+Shift+K' },
    { key: 'priority',   i18nKey: 'batchSetPriority',label: '设置优先级', icon: 'iconMark', shortcut: 'Ctrl+P' },
    { key: 'delete',     i18nKey: 'batchDeleteCard', label: '取消闪卡', icon: 'iconTrashcan', shortcut: 'Del', danger: true },
];

/** 重新调度选项 */
export interface RescheduleOptions {
    mode: 'absolute' | 'relative';
    absoluteDate?: Date;
    relativeDays?: number;
}

/** 浏览器配置 */
export interface BrowserConfig {
    pageSize: number;
    showPreview: boolean;
    previewWidth: number;
}

/** 默认配置 */
export const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
    pageSize: 100,
    showPreview: true,
    previewWidth: 350,
};

/** 计算 Retrievability (FSRS 遗忘曲线) */
export function calculateRetrievability(stability: number, elapsedDays: number): number {
    if (stability <= 0) return 0;
    return Math.pow(1 + elapsedDays / (9 * stability), -1);
}

/** 格式化日期 */
export function formatDate(date: Date | null | undefined): string {
    if (!date) return '-';
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
        return `明天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === -1) {
        return `昨天`;
    } else if (diffDays < -1) {
        return `已过期 ${Math.abs(diffDays)} 天`;
    }

    return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/** 格式化到期时间（用于 NextRep，始终显示具体日期） */
export function formatDueDate(date: Date | null | undefined): string {
    if (!date) return '-';
    
    // 始终显示具体日期（包含年份）
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/** 格式化历史时间（用于 LastRep/FirstRep，始终显示具体日期） */
export function formatHistoryDate(date: Date | null | undefined): string {
    if (!date) return '-';
    
    // 始终显示具体日期（包含年份）
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/** 截断文本 */
export function truncateContent(text: string, maxLength = 100): string {
    const cleaned = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLength) return cleaned;
    return cleaned.slice(0, maxLength) + '...';
}

// ==========================================================================
// 🆕 Phase 3: 从 SRSBrowser.vue 提取的额外类型
// ==========================================================================

/** 面包屑项 */
export interface IBreadcrumbItem {
    id: string;
    name: string;
    type: string;
    subType: string;
    children: [];
}

/** 浏览器视图模式 */
export type BrowserViewMode = 'flat' | 'hierarchy';

/** 卡片类型筛选 */
export type CardTypeFilter = 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only';

/** 浏览器模式 */
export type BrowserMode = 'dialog' | 'tab' | 'dock';

/** 全局统计信息 */
export interface GlobalStats {
    total: number;
    new: number;
    learning: number;
    review: number;
    due: number;
    overdue: number;
    suspended: number;
}

/** 队列统计信息 */
export interface QueueStats {
    active: string;  // 当前活跃队列 ID
    counts: Record<string, number>;  // 各队列卡片数量
}

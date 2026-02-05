/**
 * Unified Data Source Architecture Types
 * 统一数据源架构的核心类型定义
 * 
 * 本文件定义了统一数据源架构所需的所有类型、接口和枚举。
 * 这些类型支持模式感知路由、动态队列管理和观察者模式。
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 */

import { FSRSCard } from './card';

// ============================================================================
// 核心枚举类型
// ============================================================================

/**
 * 操作模式
 * 
 * - Simple: 简单模式，使用 Riff API 作为数据源，功能有限
 * - Advanced: 高级模式，使用本地存储，具有完整功能访问权限
 * 
 * @see 需求 1.1, 1.2
 */
export enum OperationMode {
    Simple = 'simple',
    Advanced = 'advanced',
}

/**
 * 队列类型
 * 
 * - RetrievalPractice: 检索练习队列（动态，仅项目卡片）
 * - FinalDrill: 最终训练队列（静态，手动管理）
 * - IncrementalLearning: 渐进学习队列（动态，项目+主题卡片）
 * - FilterGroup: 过滤组队列（动态，基于过滤条件）
 * - NeuralRoam: 神经漫游队列（静态，知识图谱导航）
 * 
 * @see 需求 2.1, 3.1
 */
export enum QueueType {
    RetrievalPractice = 'retrieval-practice',
    FinalDrill = 'final-drill',
    IncrementalLearning = 'incremental-learning',
    FilterGroup = 'filter-group',
    NeuralRoam = 'neural-roam',
}

// ============================================================================
// 数据变更事件
// ============================================================================

/**
 * 数据变更事件类型
 * 
 * @see 需求 11.1, 14.3
 */
export type DataChangeEventType =
    | 'card-updated'    // 卡片数据更新
    | 'card-deleted'    // 卡片删除
    | 'queue-changed'   // 队列内容变化
    | 'mode-switched';  // 模式切换

/**
 * 数据变更事件
 * 
 * 当数据发生变化时，通过观察者模式通知所有已注册的观察者。
 * 
 * @see 需求 11.1, 11.2, 14.3, 14.4
 */
export interface DataChangeEvent {
    /** 事件类型 */
    type: DataChangeEventType;
    
    /** 受影响的卡片 ID 列表（可选） */
    cardIds?: string[];
    
    /** 受影响的队列类型（可选） */
    queueType?: QueueType;
    
    /** 事件发生时间戳 */
    timestamp: number;
}

// ============================================================================
// 观察者接口
// ============================================================================

/**
 * 数据源观察者接口
 * 
 * 实现此接口的组件可以注册到 UnifiedDataSourceManager，
 * 以接收数据变更通知。
 * 
 * @see 需求 14.1, 14.2, 14.3
 */
export interface IDataSourceObserver {
    /**
     * 当数据变化时调用
     * 
     * @param event 数据变更事件
     */
    onDataChanged(event: DataChangeEvent): void;
}

// ============================================================================
// 卡片过滤器
// ============================================================================

/**
 * 日期范围过滤器
 */
export interface DateRangeFilter {
    /** 小于或等于（包含） */
    lte?: Date;
    
    /** 大于或等于（包含） */
    gte?: Date;
}

/**
 * 优先级范围过滤器
 */
export interface PriorityRangeFilter {
    /** 最小优先级 */
    min?: number;
    
    /** 最大优先级 */
    max?: number;
}

/**
 * 卡片过滤器
 * 
 * 用于过滤卡片集合，支持多种过滤条件。
 * 
 * @see 需求 5.3
 */
export interface CardFilter {
    /** 卡片类型过滤 */
    cardType?: 'item' | 'topic';
    
    /** 到期日期过滤 */
    dueDate?: DateRangeFilter;
    
    /** 标签过滤 */
    tags?: string[];
    
    /** 优先级过滤 */
    priority?: PriorityRangeFilter;
}

// ============================================================================
// 数据路由器接口
// ============================================================================

/**
 * 数据路由器接口
 * 
 * 定义数据访问的统一接口，由 SimpleDataRouter 和 AdvancedDataRouter 实现。
 * 
 * @see 需求 1.1, 1.2
 */
export interface IDataRouter {
    /**
     * 获取单个卡片
     * 
     * @param cardId 卡片 ID
     * @returns 卡片数据
     */
    getCard(cardId: string): Promise<FSRSCard>;
    
    /**
     * 获取卡片列表
     * 
     * @param filter 可选的过滤条件
     * @returns 卡片数组
     */
    getCards(filter?: CardFilter): Promise<FSRSCard[]>;
    
    /**
     * 更新卡片
     * 
     * @param card 要更新的卡片
     */
    updateCard(card: FSRSCard): Promise<void>;
    
    /**
     * 删除卡片
     * 
     * @param cardId 要删除的卡片 ID
     */
    deleteCard(cardId: string): Promise<void>;
    
    /**
     * 获取当前模式下可用的队列类型
     * 
     * @returns 队列类型数组
     */
    getAvailableQueueTypes(): QueueType[];
    
    /**
     * 获取当前模式下的上下文菜单选项
     * 
     * @returns 上下文菜单选项数组
     */
    getContextMenuOptions(): ContextMenuOption[];
}

// ============================================================================
// 上下文菜单
// ============================================================================

/**
 * 上下文菜单选项
 * 
 * @see 需求 2.3, 3.3
 */
export interface ContextMenuOption {
    /** 选项 ID */
    id: string;
    
    /** 显示标签 */
    label: string;
    
    /** 图标（可选） */
    icon?: string;
    
    /** 是否启用（可选，默认 true） */
    enabled?: boolean;
}

// ============================================================================
// 队列接口
// ============================================================================

/**
 * 复习队列接口
 * 
 * 定义所有队列类型的统一接口。
 * 
 * @see 需求 5.1, 6.1
 */
export interface IReviewQueue {
    /**
     * 获取队列类型
     * 
     * @returns 队列类型
     */
    getType(): QueueType;
    
    /**
     * 获取队列中的所有卡片
     * 
     * @returns 卡片数组
     */
    getCards(): Promise<FSRSCard[]>;
    
    /**
     * 添加卡片到队列
     * 
     * @param cardId 卡片 ID
     * @param source 来源类型（可选，仅用于最终训练队列）
     */
    addCard(cardId: string, source?: 'manual' | 'auto-failed'): Promise<void>;
    
    /**
     * 从队列中移除卡片
     * 
     * @param cardId 卡片 ID
     */
    removeCard(cardId: string): Promise<void>;
    
    /**
     * 处理卡片复习
     * 
     * @param cardId 卡片 ID
     * @param rating 评分 (1-4)
     */
    handleReview(cardId: string, rating: number): Promise<void>;
    
    /**
     * 判断是否为动态队列
     * 
     * 动态队列自动获取到期卡片，静态队列仅包含手动管理的卡片。
     * 
     * @returns true 表示动态队列，false 表示静态队列
     */
    isDynamic(): boolean;
    
    /**
     * 重新排序队列
     * 
     * 根据提供的卡片顺序重新排列队列中的卡片。
     * 这个方法用于支持浏览器中的排序功能，允许用户自定义队列顺序。
     * 
     * 实现说明：
     * - 动态队列：支持临时排序覆盖，影响 getCards() 的返回顺序（不持久化）
     * - 静态队列：支持持久化排序，永久改变队列顺序
     * 
     * @param orderedCards 按新顺序排列的卡片数组
     * @returns true 表示重排序成功，false 表示不支持或失败
     */
    reorder(orderedCards: FSRSCard[]): Promise<boolean>;
    
    /**
     * 清除自定义排序
     * 
     * 恢复到默认排序：
     * - 动态队列：按算法排序（到期日期、优先级等）
     * - 静态队列：按添加顺序
     */
    clearCustomOrder(): void;
}

// ============================================================================
// 最终训练队列条目
// ============================================================================

/**
 * 最终训练队列条目
 * 
 * 记录卡片在最终训练队列中的元数据。
 * 
 * @see 需求 6.1, 9.1, 9.4, 9.5
 */
export interface FinalDrillEntry {
    /** 卡片 ID */
    cardId: string;
    
    /** 来源类型 */
    source: 'manual' | 'auto-failed';
    
    /** 添加时间戳 */
    timestamp: number;
}

// ============================================================================
// 复习界面
// ============================================================================

/**
 * 复习按钮类型
 */
export type ReviewButtonType = 'rating' | 'action';

/**
 * 复习按钮配置
 * 
 * @see 需求 10.1, 10.2, 21.3
 */
export interface ReviewButtonConfig {
    /** 按钮类型 */
    type: ReviewButtonType;
    
    /** 按钮标签 */
    label: string;
    
    /** 评分值（仅用于 rating 类型） */
    value?: number;
    
    /** 操作类型（仅用于 action 类型） */
    action?: 'insert' | 'next' | 'lock-seed';
}

// ============================================================================
// 持久化数据结构
// ============================================================================

/**
 * 持久化队列数据
 * 
 * 用于在应用程序关闭时保存队列状态。
 * 
 * @see 需求 13.1, 13.2
 */
export interface PersistedQueueData {
    /** 最终训练队列数据 */
    finalDrill: {
        /** 队列条目 */
        entries: FinalDrillEntry[];
        
        /** 上次清理时间戳 */
        lastCleanup: number;
    };
    
    /** 神经漫游队列数据 */
    neuralRoam: {
        /** 卡片 ID 列表 */
        cardIds: string[];
    };
    
    /** 手动添加的卡片（按队列类型） */
    manualAdditions: {
        [queueType: string]: string[];
    };
}

/**
 * 同步元数据
 * 
 * 用于跟踪数据同步状态。
 * 
 * @see 需求 4.1
 */
export interface SyncMetadata {
    /** 上次同步时间戳 */
    lastSyncTime: number;
    
    /** 同步版本号 */
    syncVersion: number;
    
    /** 待处理的变更 */
    pendingChanges: CardChange[];
}

/**
 * 卡片变更记录
 * 
 * 用于增量同步。
 */
export interface CardChange {
    /** 卡片 ID */
    cardId: string;
    
    /** 变更类型 */
    changeType: 'create' | 'update' | 'delete';
    
    /** 变更时间戳 */
    timestamp: number;
    
    /** 变更数据（可选） */
    data?: Partial<FSRSCard>;
}

// ============================================================================
// 错误类型
// ============================================================================

/**
 * 数据源错误基类
 */
export class DataSourceError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'DataSourceError';
    }
}

/**
 * 模式错误
 * 
 * 当模式切换失败时抛出。
 */
export class ModeError extends DataSourceError {
    constructor(message: string) {
        super(message, 'MODE_ERROR');
    }
}

/**
 * 队列错误
 * 
 * 当队列操作失败时抛出。
 */
export class QueueError extends DataSourceError {
    constructor(message: string) {
        super(message, 'QUEUE_ERROR');
    }
}

/**
 * 同步错误
 * 
 * 当数据同步失败时抛出。
 */
export class SyncError extends DataSourceError {
    constructor(message: string) {
        super(message, 'SYNC_ERROR');
    }
}

// ============================================================================
// 类型守卫和工具函数
// ============================================================================

/**
 * 判断是否为动态队列类型
 * 
 * @param queueType 队列类型
 * @returns true 表示动态队列
 */
export function isDynamicQueueType(queueType: QueueType): boolean {
    return queueType === QueueType.RetrievalPractice
        || queueType === QueueType.IncrementalLearning
        || queueType === QueueType.FilterGroup;
}

/**
 * 判断是否为静态队列类型
 * 
 * @param queueType 队列类型
 * @returns true 表示静态队列
 */
export function isStaticQueueType(queueType: QueueType): boolean {
    return queueType === QueueType.FinalDrill
        || queueType === QueueType.NeuralRoam;
}

/**
 * 判断是否为正式复习队列
 * 
 * 正式复习队列的评分会计入调度算法。
 * 
 * @param queueType 队列类型
 * @returns true 表示正式复习队列
 */
export function isFormalReviewQueue(queueType: QueueType): boolean {
    return queueType === QueueType.RetrievalPractice
        || queueType === QueueType.IncrementalLearning
        || queueType === QueueType.FilterGroup
        || queueType === QueueType.NeuralRoam;
}

/**
 * 获取简单模式下可用的队列类型
 * 
 * @returns 队列类型数组
 * @see 需求 2.1
 */
export function getSimpleModeQueueTypes(): QueueType[] {
    return [
        QueueType.RetrievalPractice,
        QueueType.FinalDrill,
    ];
}

/**
 * 获取高级模式下可用的队列类型
 * 
 * @returns 队列类型数组
 * @see 需求 3.1
 */
export function getAdvancedModeQueueTypes(): QueueType[] {
    return [
        QueueType.RetrievalPractice,
        QueueType.FinalDrill,
        QueueType.IncrementalLearning,
        QueueType.FilterGroup,
        QueueType.NeuralRoam,
    ];
}

/**
 * 获取简单模式下的上下文菜单选项
 * 
 * @returns 上下文菜单选项数组
 * @see 需求 2.3
 */
export function getSimpleModeContextMenuOptions(): ContextMenuOption[] {
    return [
        { id: 'open', label: '打开' },
        { id: 'delete', label: '删除' },
        { id: 'add-to-final-drill', label: '添加到最终训练' },
    ];
}

/**
 * 获取高级模式下的上下文菜单选项
 * 
 * @returns 上下文菜单选项数组
 * @see 需求 3.3
 */
export function getAdvancedModeContextMenuOptions(): ContextMenuOption[] {
    return [
        { id: 'open', label: '打开' },
        { id: 'delete', label: '删除' },
        { id: 'add-to-final-drill', label: '添加到最终训练' },
        { id: 'switch-scheduler', label: '切换调度器' },
        { id: 'modify-card-type', label: '修改卡片类型' },
        { id: 'set-priority', label: '设置优先级' },
        { id: 'sync-to-riff', label: '同步到 Riff' },
    ];
}

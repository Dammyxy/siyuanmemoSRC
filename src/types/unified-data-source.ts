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
import type { QueueSnapshotRow } from './queue-browser';
import type { QueueItem } from '../core/queue/types';
import type { SchedulingWriteSource } from '@/core/scheduler/schedulingStateCleanliness';
import type {
    QueueProjectionReadiness,
    QueueProjectionReadinessRequest,
} from '../../packages/contracts/src/backend-rpc';
import type {
    BackendNeuralRoamCommandRequest,
    BackendNeuralRoamCommandResult,
    BackendNeuralRoamViewState,
    BackendNeuralRoamViewStateRequest,
    BackendNeuralRoamViewStateResult,
} from '../../packages/contracts/src/backend-rpc';
import type {
    QueueProjectionLiveIdentityListener,
} from './queue-projection-live-identity';

// ============================================================================
// 核心枚举类型
// ============================================================================

/**
 * 队列类型
 * 
 * - RetrievalPractice: 检索练习队列（动态，仅项目卡片）
 * - FinalDrill: 最终训练队列（静态，手动管理）
 * - IncrementalLearning: 渐进学习队列（动态，项目+主题卡片）
 * - FilterGroup: 过滤组队列（动态，基于过滤条件）
 * - NeuralRoam: 神经漫游队列（backend advance，知识图谱导航）
 * 
 * @see 需求 2.1, 3.1
 */
export enum QueueType {
    RetrievalPractice = 'retrieval-practice',
    FinalDrill = 'final-drill',
    IncrementalLearning = 'incremental-learning',
    FilterGroup = 'filter-group',
    NeuralRoam = 'neural-roam',
    Leech = 'leech', // 难点攻坚队列
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
    | 'card-created'    // 卡片创建
    | 'card-updated'    // 卡片数据更新
    | 'card-deleted'    // 卡片删除
    | 'queue-changed'   // 队列内容变化
    | 'mode-switched';  // 模式切换（触发全量刷新）

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

    /** 受影响的块 ID 列表（可选，删除事件中与 cardIds 分离） */
    blockIds?: string[];
    
    /** 受影响的队列类型（可选） */
    queueType?: QueueType;

    /** 本次队列变更是否需要消费者执行完整重载（可选） */
    requiresFullRefresh?: boolean;
    
    /** 事件发生时间戳 */
    timestamp: number;
}

export interface CardMutationOptions {
    preferIncomingScheduling?: boolean;
    schedulingWriteSource?: SchedulingWriteSource;
    suppressAutosave?: boolean;
    suppressDueIndexSort?: boolean;
}

export type QueueCounterBuckets = {
    all: number;
    item: number;
    descriptor: number;
    topic: number;
    concept: number;
};

export interface QueueCounterSnapshot {
    version: number;
    remaining: number;
    due: number;
    total: number | null;
    currentLearningDue?: number;
    todayReviewDue?: number;
    allowedNew?: number;
    learnAheadAvailable?: number;
    scheduledTotal?: number;
    buckets: QueueCounterBuckets;
    source: 'hot' | 'reconciled';
}

export interface QueueProjectionSnapshot {
    queueType: QueueType;
    policyHash: string;
    generation: number;
    rows: QueueSnapshotRow[];
    counters: QueueCounterSnapshot | null;
}

export type QueueProjectionRolloutState =
    | 'existing-queue-strategy'
    | 'parity-checking'
    | 'backend-advance'
    | 'advance-contract-unavailable'
    | 'backend-projection'
    | 'projection-unavailable';
export type QueueProjectionReadPath = 'backend-projection' | 'backend-advance' | 'existing-queue-strategy';
export type QueueProjectionReadMode = 'backend-projection' | 'local-queue';
export type QueueProjectionRolloutReason =
    | 'rollout-enabled'
    | 'advance-backed'
    | 'advance-contract-unavailable'
    | 'projection-rollout-pending'
    | 'parity-checking'
    | 'backend-unavailable'
    | 'refresh-required'
    | 'projection-unavailable';

export interface QueueProjectionRolloutDiagnostic {
    queueType: QueueType;
    projectionBacked: boolean;
    state: QueueProjectionRolloutState;
    readPath: QueueProjectionReadPath;
    reason: QueueProjectionRolloutReason;
    nextCoverageTask: string | null;
    unavailableReason?: QueueProjectionRolloutReason | string | null;
    backendStatus?: string | null;
    policyHash?: string | null;
    generation?: number | null;
    checkedAt?: number | null;
    freshness?: {
        checkedAt: number;
        totalRows: number;
        freshRows: number;
        staleRows: number;
        missingRows: number;
        staleCardIds: string[];
        missingCardIds: string[];
    } | null;
}

export interface QueueReviewResult {
    updatedCard: FSRSCard | null;
    removedFromQueue: boolean;
    remainsInQueue: boolean;
    queueChanged: boolean;
    requiresCurrentViewReorder: boolean;
    counterSnapshot: QueueCounterSnapshot | null;
    version: number;
    queueImpact?: unknown | null;
    projectionAction?: QueueReviewProjectionAction | null;
    projectionImpactEntry?: unknown | null;
}

export interface QueueReviewProjectionAction {
    status: 'patch-applied' | 'refresh-required' | 'deferred' | 'generation-mismatch' | 'not-applicable' | 'unavailable' | string;
    queueType: string | null;
    generation: number | null;
    policyHash: string | null;
    reason: string | null;
}

export type BatchCardMutationResult = {
    attemptedCount: number;
    updatedCount: number;
    updatedCardIds: string[];
    failedCardIds: string[];
};

export type BatchCardDeleteResult = {
    attemptedCount: number;
    deletedCount: number;
    deletedCardIds: string[];
    failedCardIds: string[];
};

export type QueueBulkAddInput = FSRSCard | QueueItem | string;

export type QueueBulkFailure = {
    id: string;
    message?: string;
};

export type QueueBulkMutationResult = {
    attemptedCount: number;
    changedCount: number;
    failedIds: string[];
    failedItems?: QueueBulkFailure[];
};

export type QueueReviewSchedulingReason = 'manual-early-review';

export interface QueueReviewSchedulingContext {
    reviewTime?: number;
    memoryStateAsOf?: number;
    queueType?: QueueType;
    queueMode?: 'formal' | 'filtered-preview' | 'filtered-rescheduling' | 'drill' | 'rotation';
    commitPolicy?: 'write-schedule' | 'preview-only' | 'drill-only';
    source?: 'queue' | 'browser' | 'manual' | 'arena' | 'test' | string;
    sessionId?: string;
    elapsedMs?: number;
    commitIdempotencyKey?: string;
    projectionGeneration?: number;
    projectionPolicyHash?: string;
    isDrill?: boolean;
    isFiltered?: boolean;
    customStudy?: boolean;
    reason?: QueueReviewSchedulingReason;
}

export interface ReviewQueueProgressSnapshot {
    queueType: string | null;
    queueLabel: string;
    completed: number;
    remaining: number;
    total: number | null;
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

/**
 * 统一数据源管理器门面端口（供 UI / 应用服务依赖）
 *
 * 说明：
 * - 这是应用层的抽象契约，不绑定具体类实现
 * - 用于 DDD 依赖倒置，避免 UI 直接耦合 UnifiedDataSourceManager 具体实现
 */
export interface IUnifiedDataSourceManagerFacade {
    getCard(cardId: string, options?: { silent?: boolean }): Promise<FSRSCard>;
    getCards(filter?: CardFilter): Promise<FSRSCard[]>;
    updateCard(card: FSRSCard, options?: CardMutationOptions): Promise<void>;
    batchUpdateCards?(cards: FSRSCard[], options?: CardMutationOptions): Promise<BatchCardMutationResult>;
    deleteCard?(cardId: string): Promise<void>;
    batchDeleteCards?(cardIds: string[], options?: { blockIds?: string[] }): Promise<BatchCardDeleteResult>;
    onCardsDeleted?(cardIds: string[], blockIds?: string[]): Promise<void>;
    getQueue(type: QueueType): IReviewQueue;
    batchAddToQueue?(type: QueueType, cards: QueueBulkAddInput[], source?: QueueAddSource): Promise<QueueBulkMutationResult>;
    batchRemoveFromQueue?(type: QueueType, cardIdsOrBlockIds: string[]): Promise<QueueBulkMutationResult>;
    getQueueProjectionRolloutDiagnostics?(queueType?: QueueType): QueueProjectionRolloutDiagnostic[];
    ensureQueueProjectionReady?(request: QueueProjectionReadinessRequest): Promise<QueueProjectionReadiness>;
    subscribeQueueProjectionLiveIdentityEvents?(listener: QueueProjectionLiveIdentityListener): () => void;
    readNeuralRoamViewState?(request?: BackendNeuralRoamViewStateRequest): Promise<BackendNeuralRoamViewStateResult>;
    neuralRoamCommand?(request: BackendNeuralRoamCommandRequest): Promise<BackendNeuralRoamCommandResult>;
    getAvailableQueueTypes(): QueueType[];
    registerObserver(observer: IDataSourceObserver): void;
    unregisterObserver(observer: IDataSourceObserver): void;
    getI18n?(key: string): string | undefined;
}

// ============================================================================
// Neural Roam Session Contract
// ============================================================================

export type NeuralNavigationMode = 'explore' | 'follow';
export type NeuralEngineMode = 'orbit' | 'hyperspace';
export type NeuralTraceQuality = 'exact' | 'legacy';
export type NeuralSourceRole = 'orbit-center' | 'activation-source';
export type NeuralSourceNodeKind = 'concept' | 'element' | 'virtual';
export type NeuralPropagationOrigin =
    | 'source'
    | 'backlink'
    | 'direct-ref'
    | 'indirect-ref'
    | 'descriptor'
    | 'block-tree'
    | 'document-tree'
    | 'follow-path'
    | 'manual-jump';
export type NeuralAssociationType =
    | 'backlink'
    | 'outgoing-direct'
    | 'outgoing-indirect'
    | 'descriptor'
    | 'associated-review'
    | 'same-block-card'
    | 'focus'
    | 'path'
    | 'source'
    | 'concept-link'
    | 'element-link'
    | 'tree-child'
    | 'tree-sibling'
    | 'tree-parent'
    | 'follow-path'
    | 'manual-jump';
export type NeuralActivationKind =
    | 'focus-root'
    | 'source-root'
    | 'graph-edge'
    | 'tree-edge'
    | 'follow-path'
    | 'manual-jump';

export interface NeuralNavigationState {
    currentPathIndex: number;
    currentNodeId: string | null;
    currentEventId: string | null;
    navigationMode: NeuralNavigationMode;
    engineMode: NeuralEngineMode;
    engineSessionId: string | null;
    hasBookmark: boolean;
    pathLength: number;
    sessionId: string | null;
}

export interface NeuralRoamHistoryEntry {
    eventId: string;
    nodeId: string;
    cardId?: string | null;
    focusId: string | null;
    sessionId: string;
    associationType: NeuralAssociationType;
    reason: string;
    visitedAt: number;
    isVirtual: boolean;
    nodePreview: string;
    traceQuality: NeuralTraceQuality;
    engineMode: NeuralEngineMode;
    sourceRole: NeuralSourceRole | null;
    origin?: NeuralPropagationOrigin | null;
    sourceNodeId: string | null;
    sourceEventId: string | null;
    branchRootNodeId: string | null;
    activationKind: NeuralActivationKind;
    depth: number | null;
    conductionScore: number | null;
}

export interface NeuralHistoryPageRequest {
    offset: number;
    limit: number;
    sessionId?: string | null;
}

export interface NeuralHistoryPageResult {
    entries: NeuralRoamHistoryEntry[];
    totalCount: number;
    hasMore: boolean;
}

export interface NeuralActivationTraceStep {
    eventId: string;
    nodeId: string;
    cardId?: string | null;
    nodePreview: string;
    isVirtual: boolean;
    associationType: NeuralAssociationType;
    reason: string;
    activationKind: NeuralActivationKind;
    visitedAt: number;
    focusId: string | null;
    engineMode: NeuralEngineMode;
    sourceRole: NeuralSourceRole | null;
    origin?: NeuralPropagationOrigin | null;
    sourceNodeId: string | null;
    sourceEventId: string | null;
    branchRootNodeId: string | null;
    traceQuality: NeuralTraceQuality;
    depth: number | null;
    conductionScore: number | null;
    isSyntheticRoot: boolean;
}

export interface NeuralActivationTrace {
    targetEventId: string;
    targetNodeId: string;
    branchRootNodeId: string | null;
    isExact: boolean;
    degradedReason: string | null;
    steps: NeuralActivationTraceStep[];
}

export type NeuralFocusNodeKind = 'concept' | 'virtual';

export interface NeuralRoamFocusEntry {
    nodeId: string;
    nodePreview: string;
    isVirtual: boolean;
    nodeKind: NeuralFocusNodeKind;
    priority: number;
    addedAt: number;
    visitedAt: number;
}

export interface NeuralRoamSeedEntry {
    nodeId: string;
    nodePreview: string;
    priority: number;
    addedAt: number;
    visitedAt: number;
}

export interface NeuralRoamAnchorEntry {
    nodeId: string;
    nodePreview: string;
    isVirtual: boolean;
    nodeKind: NeuralFocusNodeKind;
    priority: number;
    addedAt: number;
    visitedAt: number;
}

export interface NeuralRoamSourceEntry {
    nodeId: string;
    nodePreview: string;
    nodeKind: NeuralSourceNodeKind;
    role: NeuralSourceRole;
    priority: number;
    addedAt: number;
    visitedAt: number;
}

export type NeuralRoamBatchKind = 'orbit-round' | 'hyperspace-current-node';

export interface NeuralRoamBatchNode {
    eventId: string;
    nodeId: string;
    cardId?: string | null;
    nodePreview: string;
    isVirtual: boolean;
    associationType: NeuralAssociationType;
    reason: string;
    visitedAt: number;
    sourceNodeId: string | null;
    sourceEventId: string | null;
}

export interface NeuralRoamBatchSnapshot {
    kind: NeuralRoamBatchKind;
    engineMode: NeuralEngineMode;
    navigationState: NeuralNavigationState;
    focusNodeId: string | null;
    focusNodePreview: string | null;
    currentNodeId: string | null;
    roundSize: number;
    viewedCount: number;
    remainingCount: number;
    roundNodes: NeuralRoamBatchNode[];
    recentPath: NeuralRoamHistoryEntry[];
    sourceSnapshot: NeuralRoamSourceEntry[];
    seedSnapshot: NeuralRoamSeedEntry[];
    anchorSnapshot: NeuralRoamAnchorEntry[];
}

export interface HyperspaceExcerptInjectionContext {
    currentNodeId?: string | null;
    currentEventId?: string | null;
}

export interface NeuralRoamSessionQueue {
    listRoutes?(): Promise<import('@/core/queue/neural/routes').NeuralRoamRouteListItem[]>;
    switchRoute?(routeId: string): Promise<import('@/core/queue/neural/routes').NeuralRoamRouteSnapshot>;
    createRoute?(input?: { name?: string }): Promise<import('@/core/queue/neural/routes').NeuralRoamRouteSnapshot>;
    renameRoute?(routeId: string, name: string): Promise<import('@/core/queue/neural/routes').NeuralRoamRouteSnapshot>;
    deleteRoute?(routeId: string): Promise<void>;
    resolveTemporaryRouteCloseAction?(): Promise<
        | { kind: 'none' }
        | { kind: 'discard-clean'; routeId: string; previousRouteId: string | null }
        | { kind: 'prompt'; routeId: string; previousRouteId: string | null }
    >;
    closeTemporaryRoute?(input: {
        action: 'save' | 'discard' | 'cancel';
        routeId?: string | null;
        name?: string | null;
    }): Promise<import('@/core/queue/neural/routes').NeuralRoamRouteSnapshot | null>;
    replaceActiveTemporaryRoute?(input: {
        name?: string;
        seedBlockId: string;
    }): Promise<import('@/core/queue/neural/routes').NeuralRoamRouteSnapshot>;
    createTemporaryRoute?(input: {
        name?: string;
        seedBlockId: string;
        previousRouteId?: string | null;
    }): Promise<import('@/core/queue/neural/routes').NeuralRoamRouteSnapshot>;
    saveTemporaryRoute?(routeId?: string | null, name?: string | null): Promise<import('@/core/queue/neural/routes').NeuralRoamRouteSnapshot>;
    discardTemporaryRoute?(routeId?: string | null): Promise<void>;
    getEngineMode(): NeuralEngineMode;
    setEngineMode(
        mode: NeuralEngineMode,
        options?: {
            carryCurrentNode?: boolean;
        }
    ): Promise<void>;
    getSourceSnapshot(): NeuralRoamSourceEntry[];
    setSourceEntry(nodeId: string, enabled?: boolean): Promise<void>;
    injectExcerptIntoHyperspace?(
        excerptNodeId: string,
        context?: HyperspaceExcerptInjectionContext,
    ): Promise<boolean>;
    getSeedSnapshot(): NeuralRoamSeedEntry[];
    setSeedEntry(nodeId: string, enabled?: boolean): Promise<void>;
    getAnchorSnapshot(): NeuralRoamAnchorEntry[];
    setAnchorEntry(nodeId: string, enabled?: boolean): Promise<void>;
    clearAnchors(): Promise<void>;
    getCurrentBatchSnapshot(): NeuralRoamBatchSnapshot | null;
    /**
     * @deprecated Use getSeedSnapshot instead.
     */
    getConceptBlocks(): string[];
    /**
     * @deprecated Use getAnchorSnapshot instead.
     */
    getFocusPoolSnapshot(): NeuralRoamFocusEntry[];
    /**
     * @deprecated Use setAnchorEntry instead.
     */
    setFocusPoolEntry(nodeId: string, enabled?: boolean): Promise<void>;
    /**
     * @deprecated Use clearAnchors instead.
     */
    clearFocusPool(): Promise<void>;
    setCurrentFocus(
        focusId: string,
        options?: {
            includeFocusAsFirst?: boolean;
            resetHistory?: boolean;
            bookmarkCurrentPath?: boolean;
        }
    ): Promise<void>;
    startRoamingFromFocus(
        focusId: string,
        options?: {
            includeFocusAsFirst?: boolean;
            resetHistory?: boolean;
            startNewSession?: boolean;
        }
    ): Promise<void>;
    getHistoryCount(sessionId?: string | null): number;
    getHistoryPage(request: NeuralHistoryPageRequest): NeuralHistoryPageResult;
    getRouteHistoryPage?(request: NeuralHistoryPageRequest): NeuralHistoryPageResult | Promise<NeuralHistoryPageResult>;
    getHistorySnapshot(): NeuralRoamHistoryEntry[];
    getHistoryEntryByEventId(eventId: string): NeuralRoamHistoryEntry | null;
    getHistoryEntriesByNodeId(nodeId: string): NeuralRoamHistoryEntry[];
    getHistoryHitCount(nodeId: string): number;
    getActivationTrace(eventId: string): NeuralActivationTrace | null;
    getSessionFocusStack(): NeuralRoamHistoryEntry[];
    /**
     * @deprecated Use getFocusPoolSnapshot instead.
     */
    getPinnedFocusBlocks(): NeuralRoamHistoryEntry[];
    /**
     * @deprecated Use setFocusPoolEntry instead.
     */
    setPinnedFocusBlock(blockId: string, pinned?: boolean): Promise<void>;
    jumpToHistoryNode(nodeId: string): Promise<boolean>;
    getPathItemByNodeId(blockId: string): Promise<FSRSCard | null>;
    getNavigationState(): NeuralNavigationState;
    setNavigationMode(mode: NeuralNavigationMode): void;
    returnToBookmark(): boolean;
    clearHistory(scope?: 'current' | 'all'): Promise<void>;
    clearRouteHistory?(): Promise<void>;
    setBackendViewState?(viewState: BackendNeuralRoamViewState | null): void;
    getBackendViewState?(): BackendNeuralRoamViewState | null;
}

export function isNeuralRoamSessionQueue(
    queue: unknown
): queue is IReviewQueue & NeuralRoamSessionQueue {
    const candidate = queue as Partial<NeuralRoamSessionQueue>;
    return typeof candidate?.getEngineMode === 'function'
        && typeof candidate?.setEngineMode === 'function'
        && typeof candidate?.getSourceSnapshot === 'function'
        && typeof candidate?.setSourceEntry === 'function'
        && typeof candidate?.getSeedSnapshot === 'function'
        && typeof candidate?.setSeedEntry === 'function'
        && typeof candidate?.getAnchorSnapshot === 'function'
        && typeof candidate?.setAnchorEntry === 'function'
        && typeof candidate?.clearAnchors === 'function'
        && typeof candidate?.getCurrentBatchSnapshot === 'function'
        && typeof candidate?.getConceptBlocks === 'function'
        && typeof candidate?.getFocusPoolSnapshot === 'function'
        && typeof candidate?.setFocusPoolEntry === 'function'
        && typeof candidate?.clearFocusPool === 'function'
        && typeof candidate?.setCurrentFocus === 'function'
        && typeof candidate?.startRoamingFromFocus === 'function'
        && typeof candidate?.getHistoryCount === 'function'
        && typeof candidate?.getHistoryPage === 'function'
        && typeof candidate?.getHistorySnapshot === 'function'
        && typeof candidate?.getHistoryEntryByEventId === 'function'
        && typeof candidate?.getHistoryEntriesByNodeId === 'function'
        && typeof candidate?.getHistoryHitCount === 'function'
        && typeof candidate?.getActivationTrace === 'function'
        && typeof candidate?.getSessionFocusStack === 'function'
        && typeof candidate?.getPinnedFocusBlocks === 'function'
        && typeof candidate?.setPinnedFocusBlock === 'function'
        && typeof candidate?.jumpToHistoryNode === 'function'
        && typeof candidate?.getPathItemByNodeId === 'function'
        && typeof candidate?.getNavigationState === 'function'
        && typeof candidate?.setNavigationMode === 'function'
        && typeof candidate?.returnToBookmark === 'function'
        && typeof candidate?.clearHistory === 'function';
}

export type BrowserCardTypeFilter =
    | 'all'
    | 'topic-only'
    | 'item-only'
    | 'concept-only'
    | 'descriptor-only'
    | 'missing-block-only';

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
 * 数值范围过滤器（通用）
 * 
 * 用于过滤数值范围，例如复习次数、遗忘次数、间隔天数等。
 * 
 * @see filter-group-queue-ui 需求 9.1, 9.2, 9.3, 9.4, 9.5
 */
export interface NumericRangeFilter {
    /** 最小值 */
    min?: number;
    
    /** 最大值 */
    max?: number;
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
 * @see filter-group-queue-ui 需求 9.1, 9.2, 9.3, 9.4, 9.5
 * @see block-menu-review-entries 需求 3.1
 */
export interface CardFilter {
    /** 卡片类型过滤（支持单个类型或多个类型） */
    cardType?: 'item' | 'topic' | 'concept' | 'descriptor' | 'incremental' | 'webpage' | Array<'item' | 'topic' | 'concept' | 'descriptor' | 'incremental' | 'webpage'>;
    
    /** 到期日期过滤 */
    dueDate?: DateRangeFilter;
    
    /** 标签过滤 */
    tags?: string[];
    
    /** 优先级过滤 */
    priority?: PriorityRangeFilter;
    
    /** 块 ID 列表过滤（只显示这些块的卡片） */
    blockIds?: string[];

    /** 文档范围过滤（rootId 命中文档集合时可见） */
    scopeDocIds?: string[];
    
    // ========================================================================
    // 新增过滤字段（filter-group-queue-ui 功能）
    // ========================================================================
    
    /** 复习次数过滤（范围 0-999） */
    repetitions?: NumericRangeFilter;
    
    /** 遗忘次数过滤（范围 0-999） */
    lapses?: NumericRangeFilter;
    
    /** 间隔天数过滤（范围 0-9999） */
    interval?: NumericRangeFilter;
    
    /** 上次复习日期过滤 */
    lastReview?: DateRangeFilter;
    
    /** 难度过滤（范围 0-10，对应 SuperMemo 的 A-Factor） */
    difficulty?: NumericRangeFilter;
    
    /** 稳定性过滤（范围 0-9999，FSRS 算法参数） */
    stability?: NumericRangeFilter;
    
    /** 可提取性过滤（范围 0-1，对应 SuperMemo 的 Forgetting Index） */
    retrievability?: NumericRangeFilter;
    
    /** 卡片状态过滤（New=0、Learning=1、Review=2、Relearning=3） */
    cardStatus?: Array<'new' | 'learning' | 'review' | 'relearning'>;

    /** 是否包含已暂停/已排除卡片 */
    includeSuspended?: boolean;
    
    /** 关键词过滤（搜索卡片内容） */
    keyword?: string;
}

export interface FilterGroupQueueRollbackSnapshot {
    temporaryBlacklist: string[];
    customOrder: string[] | null;
    manualCards: string[];
}

export interface FilterGroupQueueSessionSnapshot {
    filter: CardFilter;
    rollbackSnapshot: FilterGroupQueueRollbackSnapshot;
    visibleCardIds?: string[];
}

export interface InitialReviewSessionState {
    initialTotal?: number;
    answeredCount?: number;
    correctCount?: number;
}

export type ReviewTabTransferState = {
    kind: 'filter-group-session';
    filterSession: FilterGroupQueueSessionSnapshot;
    session?: InitialReviewSessionState;
} | {
    kind: 'static-subset-session';
    queueType: QueueType.FilterGroup | QueueType.FinalDrill;
    blockIds: string[];
    cardIds?: string[];
    preferredCardId?: string;
    session?: InitialReviewSessionState;
};

// ============================================================================
// 数据路由器接口
// ============================================================================

/**
 * 数据路由器接口
 * 
 * 定义数据访问的统一接口，由 AdvancedDataRouter 实现。
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
    updateCard(card: FSRSCard, options?: CardMutationOptions): Promise<void>;

    /**
     * 批量更新卡片。
     */
    batchUpdateCards?(cards: FSRSCard[], options?: CardMutationOptions): Promise<BatchCardMutationResult>;
    
    /**
     * 删除卡片
     * 
     * @param cardId 要删除的卡片 ID
     */
    deleteCard(cardId: string): Promise<void>;

    /**
     * 批量删除卡片。
     */
    batchDeleteCards?(cardIds: string[]): Promise<BatchCardDeleteResult>;
    
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
     * 队列名称
     */
    name: string;
    
    /**
     * 队列类型
     */
    type: QueueType;

    /**
     * 获取队列类型
     * 
     * @returns 队列类型
     */
    getType(): QueueType;
    
    /**
     * 获取队列中的所有卡片
     * 
     * 返回队列的真实可见顺序，而不是浏览器列排序后的视图顺序。
     *
     * @returns 卡片数组
     */
    getCards(): Promise<FSRSCard[]>;

    /**
     * 获取当前队列可见卡片的轻量快照行。
     *
     * 快照顺序必须与队列真实顺序一致；浏览器如果需要按列排序，
     * 只能在快照副本上做 view-only 排序。
     */
    getSnapshotRows(forceRefresh?: boolean): Promise<QueueSnapshotRow[]>;

    /**
     * Queue-specific projection read policy.
     *
     * `backend-projection` keeps the queue on backend-owned projection reads.
     * `local-queue` forces the queue to read its own live cards instead.
     */
    getProjectionReadMode?(): QueueProjectionReadMode;

    /**
     * 按 snapshot row id 定位并返回对应的 FSRS 卡片。
     */
    getCardsBySnapshotIds(ids: string[], forceRefresh?: boolean): Promise<FSRSCard[]>;
    
    /**
     * 获取队列中的所有卡片（包括过滤后的结果）
     * 
     * 此方法用于浏览器等 UI 组件，返回经过过滤和处理的卡片列表。
     * 与 getCards() 的区别：
     * - getCards(): 返回原始卡片数据
     * - getAllCards(): 返回经过数据源过滤的卡片（例如：只返回到期的卡片）
     * 
     * @returns 卡片数组（FSRSCard[]）
     */
    getAllCards(): Promise<FSRSCard[]>;

    /**
     * 获取下一张卡片
     */
    getNextCard(): Promise<FSRSCard | null>;
    
    /**
     * 添加卡片到队列
     * 
     * @param card 卡片
     */
    addCard(card: FSRSCard | QueueItem | string, source?: QueueAddSource): Promise<void>;

    /**
     * 批量添加卡片到队列。
     */
    addCards?(cards: QueueBulkAddInput[], source?: QueueAddSource): Promise<QueueBulkMutationResult>;
    
    /**
     * 从队列中移除卡片
     * 
     * @param cardIdOrBlockId 卡片 ID 或 Block ID
     */
    removeCard(cardIdOrBlockId: string): Promise<void>;

    /**
     * 批量从队列中移除卡片。
     */
    removeCards?(cardIdsOrBlockIds: string[]): Promise<QueueBulkMutationResult>;

    /**
     * 更新卡片
     */
    updateCard(card: FSRSCard, options?: CardMutationOptions): Promise<void>;
    
    /**
     * 处理卡片复习
     * 
     * @param cardId 卡片 ID
     * @param rating 评分 (1-4)
     */
    handleReview(cardId: string, rating: number, options?: { commitIdempotencyKey?: string }): Promise<QueueReviewResult>;

    /**
     * 可选：为本次复习提供调度时间锚点。
     * 例如手动提前复习未来卡时，把调度计算锚定到原 due 日。
     */
    getReviewSchedulingContext?(card: FSRSCard): QueueReviewSchedulingContext | null;
    
    /**
     * 跳过卡片
     * 
     * 将卡片移到队列末尾，不影响调度数据。
     * 
     * @param cardId 卡片 ID
     */
    skip(cardId: string): Promise<void>;
    
    /**
     * 获取队列统计信息
     * 
     * @returns 队列统计数据
     */
    getStats(): Promise<QueueStats>;

    /**
     * 获取轻量实时计数快照
     *
     * 用于复习头部与浏览器队列计数，优先读取队列自身缓存，
     * 仅在必要时才回退到权威重建。
     */
    getCounterSnapshot(forceRefresh?: boolean): Promise<QueueCounterSnapshot>;

    /**
     * 显式提前学习候选。普通队列为空时才应由 UI 暴露。
     */
    getLearnAheadCards?(): Promise<FSRSCard[]>;

    /**
     * 获取当前队列剩余可见数量
     */
    getRemainingSize(): Promise<number>;

    /**
     * 可选会话转移快照，供筛选复习等 surface handoff 使用。
     */
    serializeSessionSnapshot?(): FilterGroupQueueSessionSnapshot;

    /**
     * 可选会话恢复钩子，供 detached transfer queue 使用。
     */
    restoreSessionSnapshot?(snapshot: FilterGroupQueueSessionSnapshot): void;

    /**
     * 可选的插入操作，供支持手动插队的队列实现。
     */
    insertAt?(cardId: string, position: number): Promise<void>;

    /**
     * 可选清理钩子，供会话销毁时释放观察者或缓存。
     */
    cleanup?(): void;

    /**
     * 神经漫游等队列的概念节点读取能力。
     */
    getConceptBlocks?(): string[];
    
    /**
     * 获取队列 UI 配置
     * 
     * @returns UI 配置对象
     */
    getUIConfig(): QueueUIConfig;
    
    /**
     * 判断是否为动态队列
     * 
     * 动态队列会根据自身语义自动重建可见集合；
     * 静态队列仅包含持久化管理的成员。
     * 
     * @returns true 表示动态队列，false 表示静态队列
     */
    isDynamic(): boolean;

    /**
     * 刷新队列
     */
    refresh(): Promise<void>;
    
    /**
     * 清空队列
     */
    clear(): Promise<void>;
    
    /**
     * 获取队列大小
     */
    getSize(): Promise<number>;
    
    /**
     * 判断队列是否为空
     */
    isEmpty(): Promise<boolean>;
    
    /**
     * 排序队列
     *
     * 仅用于重建队列自己的默认顺序或执行明确的队列内排序，
     * 不承接浏览器列排序。
     */
    sort(compareFn?: (a: FSRSCard, b: FSRSCard) => number): Promise<void>;
    
    /**
     * 过滤队列
     */
    filter(predicate: (card: FSRSCard) => boolean): Promise<FSRSCard[]>;

    /**
     * 订阅队列变更
     */
    subscribe(observer: QueueObserver): void;
    
    /**
     * 取消订阅队列变更
     */
    unsubscribe(observer: QueueObserver): void;
    
    /**
     * 通知所有订阅者
     */
    notifyObservers(): void;
    
    /**
     * 重新排序队列
     * 
     * 根据提供的卡片顺序重新排列队列中的卡片。
     * 这个方法只用于明确的手动重排动作，不能被浏览器列排序隐式触发。
     * 
     * 实现说明：
     * - 动态队列：支持临时排序覆盖，影响 getCards() 的真实返回顺序（不持久化）
     * - 静态队列：支持持久化排序，永久改变真实队列顺序
     * 
     * @param orderedCards 按新顺序排列的卡片数组
     * @returns true 表示重排序成功，false 表示不支持或失败
     */
    reorder(orderedCards: FSRSCard[]): Promise<boolean>;
    
    /**
     * 清除自定义排序
     * 
     * 恢复到默认排序：
     * - 动态队列：回到算法/队列语义定义的默认顺序
     * - 静态队列：回到持久化条目顺序
     */
    clearCustomOrder(): void;

    /**
     * 创建回滚快照（可选）
     *
     * 复习会话可在评分前调用此方法记录队列状态，
     * 用于实现“撤回上次评分”的事务回滚。
     */
    createRollbackSnapshot?(): Promise<unknown>;

    /**
     * 恢复回滚快照（可选）
     *
     * 与 createRollbackSnapshot 配套，恢复队列状态到先前快照。
     */
    restoreRollbackSnapshot?(snapshot: unknown): Promise<void>;
}

export type QueueAddSource = 'manual' | 'auto-failed' | 'manual-add-all';

/**
 * 队列观察者接口
 */
export interface QueueObserver {
    onQueueUpdate(queue: IReviewQueue): void;
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
// 队列统计信息
// ============================================================================

/**
 * 队列统计信息
 * 
 * 提供队列的统计数据，用于 UI 显示和监控。
 */
export interface QueueStats {
    /** 队列中的总卡片数 */
    total: number;
    
    /** 到期卡片数 */
    due: number;
    
    /** 新卡片数（从未复习过） */
    new: number;
    
    /** 学习中的卡片数 */
    learning: number;
    
    /** 已复习的卡片数（本次会话） */
    reviewed: number;
}

/**
 * 队列 UI 配置
 * 
 * 定义队列在复习界面中的 UI 行为和按钮配置。
 */
export interface QueueUIConfig {
    /** 队列显示名称 */
    displayName: string;
    
    /** 复习按钮配置 */
    buttons: ReviewButtonConfig[];
    
    /** 是否显示跳过按钮 */
    showSkipButton: boolean;
    
    /** 是否显示进度条 */
    showProgressBar: boolean;
    
    /** 自定义 CSS 类名（可选） */
    customClass?: string;
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
    action?: 'insert' | 'next' | 'lock-focus';
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
 * Queue projection is temporarily not ready.
 *
 * This is distinct from a hard projection/backend outage: callers may retry
 * after the backend projection finishes rebuilding or materialization.
 */
export class QueueProjectionNotReadyError extends DataSourceError {
    constructor(message: string) {
        super(message, 'QUEUE_PROJECTION_NOT_READY');
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

function resolveMenuLabel(i18n: Record<string, string> | undefined, key: string, fallback: string): string {
    return i18n?.[key] || fallback;
}

/**
 * 获取高级模式下的上下文菜单选项
 * 
 * @returns 上下文菜单选项数组
 * @see 需求 3.3
 */
export function getAdvancedModeContextMenuOptions(i18n?: Record<string, string>): ContextMenuOption[] {
    return [
        { id: 'open', label: resolveMenuLabel(i18n, 'openInTab', 'Open') },
        { id: 'delete', label: resolveMenuLabel(i18n, 'deleteCard', 'Delete') },
        { id: 'add-to-final-drill', label: resolveMenuLabel(i18n, 'addToFinalDrillQueue', 'Add to Deliberate Practice') },
        { id: 'switch-scheduler', label: resolveMenuLabel(i18n, 'switchScheduler', 'Switch Scheduler') },
        { id: 'modify-card-type', label: resolveMenuLabel(i18n, 'modifyCardType', 'Modify Card Type') },
        { id: 'set-priority', label: resolveMenuLabel(i18n, 'setPriority', 'Set Priority') },
        { id: 'sync-to-riff', label: resolveMenuLabel(i18n, 'syncToRiff', 'Sync to Riff') },
    ];
}

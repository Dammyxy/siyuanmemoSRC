/**
 * Base Review Queue
 * 复习队列基类
 * 
 * 提供所有队列类型的通用实现基础。
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 */

import {
    IReviewQueue,
    QueueObserver,
    QueueCounterBuckets,
    QueueCounterSnapshot,
    QueueReviewResult,
    QueueType,
    QueueStats,
    QueueUIConfig,
    ReviewButtonConfig,
    QueueAddSource,
    QueueReviewSchedulingContext,
    QueueProjectionSnapshot,
    QueueProjectionRolloutDiagnostic,
    QueueError,
    QueueProjectionNotReadyError,
    type QueueBulkAddInput,
    type QueueBulkMutationResult,
} from '../../../types/unified-data-source';
import { CardState, FSRSCard } from '../../../types/card';
import type { QueueSnapshotRow } from '../../../types/queue-browser';
import type { QueueItem } from '../types';
import type { QueueSchedulerPort, UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import { formatUnknownDependencyError } from '../dependencyErrors';
import { normalizeToFSRSCard, resolveCardId, validateQueueReturnType } from '../../../diagnostics/type-guards';
import { PriorityQueueService, type QueueOrderingMode } from './PriorityQueueService';
import { buildQueueSnapshotRow } from './queueCardProjection';
import { shouldReadQueueLocally } from './queueProjectionReadPolicy';
import { createLogger } from '@/utils/logger';

const logger = createLogger('BaseReviewQueue');
const DAY_MS = 24 * 60 * 60 * 1000;

type QueueDefaultOrderOptions = {
    mode?: QueueOrderingMode;
    randomization?: number;
    now?: number;
};

/**
 * 复习队列抽象基类
 * 
 * 所有队列类型（动态和静态）的基类。
 * 提供通用的队列类型访问，子类实现具体的队列逻辑。
 * 
 * @see 需求 5.1, 6.1
 */
export abstract class BaseReviewQueue implements IReviewQueue {
    /**
     * 队列名称
     */
    public abstract name: string;
    
    /**
     * 数据源管理器引用
     */
    protected manager: UnifiedDataSourceManager;
    
    /**
     * 队列类型
     */
    public type: QueueType;

    /**
     * 队列卡片缓存
     */
    protected cards: FSRSCard[] = [];

    /**
     * cards 是否可作为当前队列可见集的权威快照使用。
     */
    protected cardsTrusted = false;

    /**
     * 轻量实时计数快照
     */
    protected counterSnapshot: QueueCounterSnapshot | null = null;
    protected counterVersion = 0;
    protected counterSnapshotDirty = true;
    protected snapshotRows: QueueSnapshotRow[] = [];
    protected snapshotRowsTrusted = false;
    protected snapshotCardIdByRowId = new Map<string, string>();
    private projectionSnapshotTrusted = false;
    private projectionPolicyHash: string | null = null;
    private projectionGeneration: number | null = null;

    /**
     * 队列观察者
     */
    protected observers: QueueObserver[] = [];

    /**
     * 队列初始化加载 Promise（由应用层注入）
     */
    private pendingInitialLoad: Promise<void> | null = null;
    private initialLoadCompleted = false;
    
    /**
     * 构造函数
     * 
     * @param manager 统一数据源管理器实例
     * @param type 队列类型
     */
    constructor(manager: UnifiedDataSourceManager, type: QueueType) {
        this.manager = manager;
        this.type = type;
    }

    /**
     * 注入初始化加载 Promise，用于保证 load() 与读写操作的时序一致
     */
    public setInitialLoad(loadPromise: Promise<void>): void {
        this.pendingInitialLoad = loadPromise;
        this.initialLoadCompleted = false;
    }

    /**
     * 确保队列初始状态已经加载
     */
    protected async ensureInitialLoad(): Promise<void> {
        if (this.initialLoadCompleted) {
            return;
        }

        if (!this.pendingInitialLoad) {
            this.initialLoadCompleted = true;
            return;
        }

        try {
            await this.pendingInitialLoad;
        } finally {
            this.pendingInitialLoad = null;
            this.initialLoadCompleted = true;
        }
    }

    protected markInitialLoadCompleted(): void {
        this.pendingInitialLoad = null;
        this.initialLoadCompleted = true;
    }
    
    /**
     * 获取队列类型
     * 
     * @returns 队列类型
     * @see 需求 5.1, 6.1
     */
    public getType(): QueueType {
        return this.type;
    }

    protected getCounterBucket(card: FSRSCard): keyof QueueCounterBuckets {
        switch (String(card.type || 'item')) {
            case 'descriptor':
                return 'descriptor';
            case 'topic':
                return 'topic';
            case 'concept':
                return 'concept';
            default:
                return 'item';
        }
    }

    protected createEmptyCounterBuckets(): QueueCounterBuckets {
        return {
            all: 0,
            item: 0,
            descriptor: 0,
            topic: 0,
            concept: 0,
        };
    }

    protected buildCounterSnapshot(cards: FSRSCard[]): QueueCounterSnapshot {
        const now = Date.now();
        const buckets = this.createEmptyCounterBuckets();
        let currentLearningDue = 0;
        let todayReviewDue = 0;
        let allowedNew = 0;

        for (const card of cards) {
            buckets.all += 1;
            buckets[this.getCounterBucket(card)] += 1;
            if (this.isSrsLearningStep(card) && Number(card.due) <= now) {
                currentLearningDue += 1;
            } else if (card.state === CardState.Review) {
                todayReviewDue += 1;
            } else if (card.state === CardState.New || Number(card.reps) === 0) {
                allowedNew += 1;
            }
        }

        return {
            version: this.counterVersion,
            remaining: cards.length,
            due: cards.length,
            total: cards.length,
            currentLearningDue,
            todayReviewDue,
            allowedNew,
            scheduledTotal: cards.length,
            buckets,
            source: 'reconciled',
        };
    }

    protected cloneCounterSnapshot(snapshot: QueueCounterSnapshot): QueueCounterSnapshot {
        return {
            ...snapshot,
            buckets: {
                ...snapshot.buckets,
            },
        };
    }

    protected markCounterSnapshotDirty(): void {
        this.counterSnapshotDirty = true;
    }

    protected commitCounterSnapshot(
        snapshot: QueueCounterSnapshot,
        source: QueueCounterSnapshot['source'],
    ): QueueCounterSnapshot {
        const committed: QueueCounterSnapshot = {
            ...snapshot,
            source,
            version: ++this.counterVersion,
            buckets: {
                ...snapshot.buckets,
            },
        };
        this.counterSnapshot = committed;
        this.counterSnapshotDirty = false;
        return this.cloneCounterSnapshot(committed);
    }

    protected cacheResolvedCards(
        cards: FSRSCard[],
        source: QueueCounterSnapshot['source'] = 'reconciled',
    ): FSRSCard[] {
        const normalized = normalizeToFSRSCard(cards);
        this.cards = [...normalized];
        this.cardsTrusted = true;
        this.invalidateSnapshotRows();
        this.clearSizeCache();
        this.commitCounterSnapshot(this.buildCounterSnapshot(normalized), source);
        return normalized;
    }

    protected invalidateCachedCards(): void {
        this.cardsTrusted = false;
        this.invalidateSnapshotRows();
        this.markCounterSnapshotDirty();
        this.clearSizeCache();
    }

    protected invalidateSnapshotRows(): void {
        this.snapshotRowsTrusted = false;
        this.projectionSnapshotTrusted = false;
        this.projectionPolicyHash = null;
        this.projectionGeneration = null;
        this.snapshotRows = [];
        this.snapshotCardIdByRowId.clear();
    }

    protected applySnapshotOnCardRemoved(card: FSRSCard): QueueCounterSnapshot | null {
        if (!this.counterSnapshot || this.counterSnapshotDirty) {
            return null;
        }

        const snapshot = this.cloneCounterSnapshot(this.counterSnapshot);
        const bucket = this.getCounterBucket(card);
        snapshot.remaining = Math.max(0, snapshot.remaining - 1);
        snapshot.total = snapshot.total == null ? null : Math.max(0, snapshot.total - 1);
        snapshot.buckets.all = Math.max(0, snapshot.buckets.all - 1);
        snapshot.buckets[bucket] = Math.max(0, snapshot.buckets[bucket] - 1);
        if (Number(card.due) <= Date.now()) {
            snapshot.due = Math.max(0, snapshot.due - 1);
        }

        return this.commitCounterSnapshot(snapshot, 'hot');
    }

    protected applySnapshotOnCardRetained(beforeCard: FSRSCard, afterCard: FSRSCard): QueueCounterSnapshot | null {
        if (!this.counterSnapshot || this.counterSnapshotDirty) {
            return null;
        }

        const snapshot = this.cloneCounterSnapshot(this.counterSnapshot);
        const beforeBucket = this.getCounterBucket(beforeCard);
        const afterBucket = this.getCounterBucket(afterCard);
        if (beforeBucket !== afterBucket) {
            snapshot.buckets[beforeBucket] = Math.max(0, snapshot.buckets[beforeBucket] - 1);
            snapshot.buckets[afterBucket] += 1;
        }

        const beforeDue = Number(beforeCard.due) <= Date.now();
        const afterDue = Number(afterCard.due) <= Date.now();
        if (beforeDue !== afterDue) {
            snapshot.due = Math.max(0, snapshot.due + (afterDue ? 1 : -1));
        }

        return this.commitCounterSnapshot(snapshot, 'hot');
    }

    protected findCachedCardIndex(cardIdOrBlockId: string): number {
        return this.cards.findIndex(
            (card) => card.id === cardIdOrBlockId || card.blockId === cardIdOrBlockId,
        );
    }

    protected getPriorityRandomness(): number {
        const runtime = this.manager as UnifiedDataSourceManager & {
            getPriorityRandomness?: () => number;
        };

        const configured = runtime.getPriorityRandomness?.();
        if (!Number.isFinite(configured)) {
            return 0;
        }

        return Math.max(0, Math.min(1, Number(configured)));
    }

    protected getNewCardsPerDay(): number {
        const runtime = this.manager as UnifiedDataSourceManager & {
            getNewCardsPerDay?: () => number;
        };

        const configured = runtime.getNewCardsPerDay?.();
        if (!Number.isFinite(configured)) {
            return 20;
        }

        return Math.max(0, Math.floor(Number(configured)));
    }

    protected getReviewsPerDay(): number {
        const runtime = this.manager as UnifiedDataSourceManager & {
            getReviewsPerDay?: () => number;
        };

        const configured = runtime.getReviewsPerDay?.();
        if (!Number.isFinite(configured)) {
            return 0;
        }

        return Math.max(0, Math.floor(Number(configured)));
    }

    protected getFilteredReviewDefault(): 'preview-only' | 'reschedule' {
        const runtime = this.manager as UnifiedDataSourceManager & {
            getFilteredReviewDefault?: () => 'preview-only' | 'reschedule';
        };

        return runtime.getFilteredReviewDefault?.() === 'reschedule'
            ? 'reschedule'
            : 'preview-only';
    }

    protected isAutoSortEnabled(): boolean {
        const runtime = this.manager as UnifiedDataSourceManager & {
            getAutoSortEnabled?: () => boolean;
        };

        const configured = runtime.getAutoSortEnabled?.();
        return typeof configured === 'boolean' ? configured : true;
    }

    protected getAddToOutstandingEveryNth(fallback = 2): number {
        const runtime = this.manager as UnifiedDataSourceManager & {
            getAddToOutstandingEveryNth?: () => number;
        };

        const configured = runtime.getAddToOutstandingEveryNth?.();
        if (!Number.isFinite(configured)) {
            return Math.max(1, Math.min(100, Math.floor(fallback)));
        }

        return Math.max(1, Math.min(100, Math.floor(Number(configured))));
    }
    
    /**
     * 获取队列中的所有卡片
     * 
     * 子类必须实现此方法以提供具体的卡片获取逻辑。
     * 
     * @returns 卡片数组
     * @see 需求 5.1, 5.2, 5.3, 6.1, 6.2
     */
    public abstract getCards(): Promise<FSRSCard[]>;

    protected buildSnapshotRows(cards: FSRSCard[]): QueueSnapshotRow[] {
        return cards.map((card, index) => buildQueueSnapshotRow(card, {
            queueIndex: index + 1,
        }));
    }

    private cloneSnapshotRows(rows: QueueSnapshotRow[]): QueueSnapshotRow[] {
        return rows.map((row) => ({
            ...row,
            tags: [...row.tags],
        }));
    }

    private getProjectionRolloutDiagnostic(): QueueProjectionRolloutDiagnostic | null {
        const manager = this.manager as UnifiedDataSourceManager & {
            getQueueProjectionRolloutDiagnostics?: (queueType?: QueueType) => QueueProjectionRolloutDiagnostic[];
        };
        const diagnostics = manager.getQueueProjectionRolloutDiagnostics?.(this.type);
        return Array.isArray(diagnostics) ? diagnostics[0] ?? null : null;
    }

    private isProjectionReadRequired(): boolean {
        if (shouldReadQueueLocally(this)) {
            return false;
        }
        const diagnostic = this.getProjectionRolloutDiagnostic();
        return diagnostic?.readPath === 'backend-projection';
    }

    protected getLearnAheadWindowMinutes(): number {
        const runtime = this.manager as UnifiedDataSourceManager & {
            getLearnAheadWindowMinutes?: () => number;
        };

        const configured = runtime.getLearnAheadWindowMinutes?.();
        if (!Number.isFinite(configured)) {
            return 20;
        }

        return Math.max(0, Math.floor(Number(configured)));
    }

    protected getLearnAheadMaxCards(): number {
        const runtime = this.manager as UnifiedDataSourceManager & {
            getLearnAheadMaxCards?: () => number;
        };

        const configured = runtime.getLearnAheadMaxCards?.();
        if (!Number.isFinite(configured)) {
            return 20;
        }

        return Math.max(0, Math.floor(Number(configured)));
    }

    protected isSrsLearningStep(card: Pick<FSRSCard, 'state'>): boolean {
        return card.state === CardState.Learning || card.state === CardState.Relearning;
    }

    private createProjectionUnavailableError(operation: string, cause?: unknown): Error {
        const diagnostic = this.getProjectionRolloutDiagnostic();
        const isRefreshRequired = diagnostic?.reason === 'refresh-required'
            || diagnostic?.unavailableReason === 'refresh-required';
        const code = isRefreshRequired ? 'QUEUE_PROJECTION_NOT_READY' : 'QUEUE_PROJECTION_UNAVAILABLE';
        const unavailable = isRefreshRequired
            ? new QueueProjectionNotReadyError(
                `${code}: ${operation} for ${this.type} requires backend projection `
                + `but projection is still refreshing`
                + ` (state=${diagnostic?.state ?? 'unknown'}, reason=${diagnostic?.reason ?? 'unknown'}, `
                + `unavailableReason=${diagnostic?.unavailableReason ?? 'unknown'})`,
            )
            : new QueueError(
                `${code}: ${operation} for ${this.type} requires backend projection `
                + `but projection is unavailable`
                + ` (state=${diagnostic?.state ?? 'unknown'}, reason=${diagnostic?.reason ?? 'unknown'}, `
                + `unavailableReason=${diagnostic?.unavailableReason ?? 'unknown'})`,
            );
        if (cause !== undefined) {
            unavailable.message += `: ${formatUnknownDependencyError(cause)}`;
            (unavailable as Error & { cause?: unknown }).cause = cause;
        }
        return unavailable;
    }

    private cacheProjectionCards(cards: FSRSCard[]): FSRSCard[] {
        const normalized = normalizeToFSRSCard(cards).map((card) => ({ ...card }));
        this.cards = normalized;
        this.cardsTrusted = true;
        this.clearSizeCache();
        return normalized;
    }

    private async readProjectionCards(forceRefresh = false): Promise<FSRSCard[] | null> {
        const projectionSnapshot = await this.readProjectionSnapshot(forceRefresh);
        if (!projectionSnapshot) {
            if (this.isProjectionReadRequired()) {
                throw this.createProjectionUnavailableError('snapshot rows');
            }
            return null;
        }

        const orderedIds = projectionSnapshot.rows.map((row) => row.id);
        if (orderedIds.length === 0) {
            return this.cacheProjectionCards([]);
        }

        const projectionCards = await this.getProjectionCardsBySnapshotIds(orderedIds, forceRefresh);
        if (projectionCards.length !== orderedIds.length) {
            if (this.isProjectionReadRequired()) {
                throw this.createProjectionUnavailableError('snapshot row hydration');
            }
            return null;
        }

        return this.cacheProjectionCards(projectionCards);
    }

    private async readProjectionSnapshot(forceRefresh = false): Promise<QueueProjectionSnapshot | null> {
        if (shouldReadQueueLocally(this)) {
            return null;
        }

        const reader = this.manager.readQueueProjectionSnapshot;
        if (typeof reader !== 'function') {
            return null;
        }

        try {
            const snapshot = await reader.call(this.manager, this.type, { forceRefresh });
            if (!snapshot) {
                return null;
            }
            this.snapshotRows = this.cloneSnapshotRows(snapshot.rows);
            this.snapshotRowsTrusted = true;
            this.projectionSnapshotTrusted = true;
            this.projectionGeneration = Number(snapshot.generation);
            this.projectionPolicyHash = String(snapshot.policyHash || '') || null;
            this.snapshotCardIdByRowId.clear();
            for (const row of this.snapshotRows) {
                this.snapshotCardIdByRowId.set(row.id, row.fsrsCardId);
                this.snapshotCardIdByRowId.set(row.fsrsCardId, row.fsrsCardId);
            }
            if (snapshot.counters) {
                this.counterVersion = Math.max(this.counterVersion, Number(snapshot.counters.version) || 0);
                this.counterSnapshot = this.cloneCounterSnapshot(snapshot.counters);
                this.counterSnapshotDirty = false;
            }
            return {
                ...snapshot,
                rows: this.cloneSnapshotRows(this.snapshotRows),
                counters: snapshot.counters ? this.cloneCounterSnapshot(snapshot.counters) : null,
            };
        } catch (error) {
            logger.warn(`[${this.type}] Failed to read queue projection snapshot:`, error);
            throw this.createProjectionUnavailableError('snapshot rows', error);
        }
    }

    private async getProjectionCardsBySnapshotIds(ids: string[], forceRefresh = false): Promise<FSRSCard[]> {
        if (shouldReadQueueLocally(this)) {
            return [];
        }

        if (!this.projectionSnapshotTrusted) {
            return [];
        }
        const reader = this.manager.getQueueProjectionCardsBySnapshotIds;
        if (typeof reader !== 'function') {
            return [];
        }

        try {
            const cards = await reader.call(this.manager, this.type, ids, { forceRefresh });
            return normalizeToFSRSCard(cards).map((card) => ({ ...card }));
        } catch (error) {
            logger.warn(`[${this.type}] Failed to hydrate queue projection snapshot ids:`, error);
            throw this.createProjectionUnavailableError('snapshot row hydration', error);
        }
    }

    public async getSnapshotRows(forceRefresh = false): Promise<QueueSnapshotRow[]> {
        await this.ensureInitialLoad();

        if (forceRefresh) {
            this.invalidateSnapshotRows();
            this.invalidateCachedCards();
        }

        if (!forceRefresh && this.projectionSnapshotTrusted && this.snapshotRowsTrusted) {
            return this.cloneSnapshotRows(this.snapshotRows);
        }

        const projectionSnapshot = await this.readProjectionSnapshot(forceRefresh);
        if (projectionSnapshot) {
            return this.cloneSnapshotRows(this.snapshotRows);
        }

        if (this.isProjectionReadRequired()) {
            throw this.createProjectionUnavailableError('snapshot rows');
        }

        if (!this.cardsTrusted || this.cards.length === 0) {
            await this.getAllCards();
        }

        if (!this.snapshotRowsTrusted) {
            const rows = this.buildSnapshotRows(this.cards);
            this.snapshotRows = rows;
            this.snapshotRowsTrusted = true;
            this.snapshotCardIdByRowId.clear();
            for (const row of rows) {
                this.snapshotCardIdByRowId.set(row.id, row.fsrsCardId);
            }
        }

        return this.cloneSnapshotRows(this.snapshotRows);
    }

    public async getCardsBySnapshotIds(ids: string[], forceRefresh = false): Promise<FSRSCard[]> {
        const orderedIds = ids.map((id) => String(id || '')).filter(Boolean);
        if (orderedIds.length === 0) {
            return [];
        }

        await this.getSnapshotRows(forceRefresh);
        const projectionCards = await this.getProjectionCardsBySnapshotIds(orderedIds, forceRefresh);
        if (projectionCards.length > 0) {
            return projectionCards;
        }

        if (this.isProjectionReadRequired()) {
            throw this.createProjectionUnavailableError('snapshot row hydration');
        }

        const cardById = new Map<string, FSRSCard>();
        for (const card of this.cards) {
            cardById.set(card.id, card);
            if (card.riffCardId) {
                cardById.set(card.riffCardId, card);
            }
        }

        return orderedIds
            .map((rowId) => {
                const cardId = this.snapshotCardIdByRowId.get(rowId) || rowId;
                return cardById.get(cardId);
            })
            .filter((card): card is FSRSCard => Boolean(card));
    }
    
    /**
     * 获取队列中的所有卡片（包括过滤后的结果）
     * 
     * 此方法用于浏览器等 UI 组件，返回经过过滤和处理的卡片列表。
     * 默认实现直接调用 getCards()，子类可以覆盖以提供不同的行为。
     * 
     * 与 getCards() 的区别：
     * - getCards(): 返回原始卡片数据
     * - getAllCards(): 返回经过数据源过滤的卡片（例如：只返回到期的卡片）
     * 
     * @returns 卡片数组
     * @see 需求 5.1, 5.2, 5.3, 6.1, 6.2
     */
    public async getAllCards(): Promise<FSRSCard[]> {
        await this.ensureInitialLoad();
        if (this.isProjectionReadRequired()) {
            const projectionCards = await this.readProjectionCards(false);
            if (projectionCards) {
                validateQueueReturnType(this.name ?? this.type, 'getAllCards', projectionCards);
                return projectionCards;
            }
        }

        const rawCards = await this.getCards();
        const cards = this.cacheResolvedCards(rawCards, 'reconciled');
        validateQueueReturnType(this.name ?? this.type, 'getAllCards', cards);
        return cards;
    }

    public async getCounterSnapshot(forceRefresh = false): Promise<QueueCounterSnapshot> {
        await this.ensureInitialLoad();

        if (!forceRefresh && this.counterSnapshot && !this.counterSnapshotDirty) {
            return this.cloneCounterSnapshot(this.counterSnapshot);
        }

        if (forceRefresh) {
            this.invalidateSnapshotRows();
        }

        const projectionSnapshot = await this.readProjectionSnapshot(forceRefresh);
        if (projectionSnapshot?.counters) {
            return this.cloneCounterSnapshot(projectionSnapshot.counters);
        }

        if (this.isProjectionReadRequired()) {
            throw this.createProjectionUnavailableError('counter snapshot');
        }

        if (this.cardsTrusted) {
            const snapshot = this.commitCounterSnapshot(
                this.buildCounterSnapshot(this.cards),
                'reconciled',
            );
            return this.cloneCounterSnapshot(snapshot);
        }

        const cards = normalizeToFSRSCard(await this.getCards());
        validateQueueReturnType(this.name ?? this.type, 'getCounterSnapshot', cards);
        this.cacheResolvedCards(cards, 'reconciled');
        return this.cloneCounterSnapshot(this.counterSnapshot!);
    }

    /**
     * 获取下一张卡片
     */
    public async getNextCard(): Promise<FSRSCard | null> {
        if (!this.cardsTrusted || this.cards.length === 0) {
            await this.getAllCards();
        }
        return this.cards.length > 0 ? this.cards[0] : null;
    }
    
    /**
     * 添加卡片到队列
     * 
     * 子类必须实现此方法以提供具体的添加逻辑。
     * 
     * @param cardId 卡片 ID
     * @param source 来源类型（可选，仅用于最终训练队列）
     * @see 需求 5.4, 6.1, 6.2, 9.1, 9.5, 18.1
     */
    public abstract addCard(card: FSRSCard | QueueItem | string, source?: QueueAddSource): Promise<void>;

    public async addCards(
        cards: QueueBulkAddInput[],
        source: QueueAddSource = 'manual',
    ): Promise<QueueBulkMutationResult> {
        const items = this.dedupeBulkItems(cards);
        let changedCount = 0;
        const failedIds: string[] = [...items.invalidIds];

        for (const item of items.values) {
            try {
                await this.addCard(item.value, source);
                changedCount++;
            } catch (error) {
                failedIds.push(item.id);
                logger.error(`[${this.type}] Failed to add card in bulk:`, { id: item.id, error });
            }
        }

        return {
            attemptedCount: items.attemptedCount,
            changedCount,
            failedIds: this.uniqueBulkIds(failedIds),
        };
    }
    
    /**
     * 从队列中移除卡片
     * 
     * 子类必须实现此方法以提供具体的移除逻辑。
     * 
     * @param cardId 卡片 ID
     * @see 需求 5.5, 6.1, 6.2, 12.1, 12.2, 12.3
     */
    public abstract removeCard(cardIdOrBlockId: string): Promise<void>;

    public async removeCards(cardIdsOrBlockIds: string[]): Promise<QueueBulkMutationResult> {
        const ids = this.dedupeBulkIds(cardIdsOrBlockIds);
        let changedCount = 0;
        const failedIds: string[] = [];

        for (const id of ids) {
            try {
                await this.removeCard(id);
                changedCount++;
            } catch (error) {
                failedIds.push(id);
                logger.error(`[${this.type}] Failed to remove card in bulk:`, { id, error });
            }
        }

        return {
            attemptedCount: ids.length,
            changedCount,
            failedIds,
        };
    }

    /**
     * 评分后移除卡片（受保护钩子）
     *
     * 默认行为与 removeCard 一致。动态队列可覆写该方法，
     * 实现“评分移除”与“用户手动移除”的语义分离。
     */
    protected async removeCardAfterReview(cardIdOrBlockId: string): Promise<void> {
        await this.removeCard(cardIdOrBlockId);
    }

    /**
     * 更新卡片
     */
    public async updateCard(card: FSRSCard): Promise<void> {
        const index = this.cards.findIndex(c => c.blockId === card.blockId);
        if (index !== -1) {
            const beforeCard = this.cards[index];
            this.cards[index] = card;
            this.cardsTrusted = true;
            this.invalidateSnapshotRows();
            this.applySnapshotOnCardRetained(beforeCard, card);
            this.notifyObservers();
            return;
        }

        this.invalidateCachedCards();
    }
    
    /**
     * 处理卡片复习
     * 
     * 子类必须实现此方法以提供具体的复习处理逻辑。
     * 不同队列类型有不同的复习行为：
     * - 正式队列：评分计入调度，高评分移除，低评分保留
     * - 最终训练：评分不计入调度，评分 4 移除，其他保留
     * - 神经漫游：评分计入调度，但永不自动移除
     * 
     * @param cardId 卡片 ID
     * @param rating 评分 (1-4)
     * @see 需求 7.1-7.7, 8.1-8.3, 9.1-9.3
     */
    public abstract handleReview(cardId: string, rating: number): Promise<QueueReviewResult>;
    
    // ========================================================================
    // 调度器集成辅助方法（队列-调度器职责分离）
    // @see .kiro/specs/queue-scheduler-separation/requirements.md
    // ========================================================================
    
    /**
     * 获取 SchedulerRouter 实例
     * 
     * 通过 UnifiedDataSourceManager 访问 SchedulerRouter。
     * 
     * @returns SchedulerRouter 实例
     * @throws Error 如果 application commit 端口或 SchedulerRouter 不可用
     * @see 需求 8.3
     */
    protected getSchedulerRouter(): QueueSchedulerPort {
        const resolver = this.manager.getSchedulerRouter;
        if (typeof resolver !== 'function') {
            throw new Error(`[${this.type}] SchedulerRouter provider not available on manager`);
        }

        const schedulerRouter = resolver.call(this.manager);
        if (
            !schedulerRouter
            || typeof schedulerRouter.answer !== 'function'
            || typeof schedulerRouter.commit !== 'function'
        ) {
            throw new Error(`[${this.type}] SchedulerRouter not available - plugin initialization failed`);
        }

        return schedulerRouter;
    }

    public getReviewSchedulingContext(_card: FSRSCard): QueueReviewSchedulingContext | null {
        return null;
    }

    protected buildReviewSchedulingContext(card: FSRSCard): QueueReviewSchedulingContext {
        const context: QueueReviewSchedulingContext = {
            queueType: this.type,
            source: 'queue',
            ...(this.getReviewSchedulingContext(card) ?? {}),
        };
        if (this.projectionGeneration !== null) {
            context.projectionGeneration = this.projectionGeneration;
        }
        if (this.projectionPolicyHash !== null) {
            context.projectionPolicyHash = this.projectionPolicyHash;
        }
        return context;
    }

    /**
     * 获取一天开始的小时数
     * 
     * 从插件配置中获取 dayStartHour，用于计算当天结束时间。
     * 
     * @returns 一天开始的小时数（默认 4）
     * @see 需求 2.2, 2.3
     */
    protected getDayStartHour(): number {
        try {
            const resolver = this.manager.getDayStartHour;
            if (typeof resolver === 'function') {
                const value = resolver.call(this.manager);
                if (Number.isFinite(value)) {
                    return value;
                }
            }
        } catch (error) {
            logger.warn(`[${this.type}] Failed to get dayStartHour from settings:`, error);
        }
        
        return 4; // 默认值
    }
    
    /**
     * 判断卡片是否应该从队列中移除
     * 
     * 统一委托给队列自己的 active-window 语义。
     * 
     * 这意味着“复习后是否留队”不再依赖全局启发式，而是由具体队列覆写
     * `isCardInActiveWindow()` 明确表达：
     * - today-window 队列：例如 due <= currentDayEnd
     * - filter-backed 队列：例如仍匹配当前 filter
     * - session/static 队列：例如永不因窗口自动出队
     * 
     * @param card 卡片对象
     * @returns true 表示应该移除，false 表示应该保留
     * @see 需求 2.1, 2.2, 2.3, 5.1
     */
    protected shouldRemoveFromQueue(card: FSRSCard): boolean {
        const now = Date.now();
        const dayStartHour = this.getDayStartHour();
        const activeWindowEnd = this.getCurrentDayEnd(dayStartHour, now);

        if (!card.due || isNaN(card.due) || card.due <= 0) {
            logger.error(`[${this.type}] Invalid due date for card ${card.id}:`, {
                due: card.due,
                cardState: card.state,
                reps: card.reps,
            });
            return false;
        }

        const remainsActive = this.isCardInActiveWindow(card, now);
        const shouldRemove = !remainsActive;

        logger.debug(`[${this.type}] shouldRemoveFromQueue:`, {
            cardId: card.id,
            due: new Date(card.due).toISOString(),
            activeWindowEnd: new Date(activeWindowEnd).toISOString(),
            scheduledDays: card.scheduledDays,
            remainsActive,
            shouldRemove,
        });

        return shouldRemove;
    }
    
    /**
     * 获取当天结束时间
     * 
     * 根据 dayStartHour 计算当天的结束时间戳。
     * 
     * @param dayStartHour 一天开始的小时数
     * @returns 当天结束时间戳
     * @private
     */
    protected getCurrentDayEnd(dayStartHour: number, nowValue = Date.now()): number {
        const now = new Date(nowValue);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), dayStartHour, 0, 0, 0);
        
        if (now.getTime() < today.getTime()) {
            return today.getTime() + DAY_MS;
        } else {
            return today.getTime() + DAY_MS;
        }
    }

    /**
     * 判断卡片是否仍处于当前队列的活跃窗口内。
     *
     * 基类默认语义是 today-window；特殊队列应覆写它来表达自身的
     * membership / retention 规则。
     */
    protected isCardInActiveWindow(card: FSRSCard, now = Date.now()): boolean {
        const due = Number(card.due);
        if (!Number.isFinite(due) || due <= 0) {
            return false;
        }

        return due <= this.getCurrentDayEnd(this.getDayStartHour(), now);
    }

    protected buildDefaultOrder(cards: FSRSCard[], options: QueueDefaultOrderOptions = {}): FSRSCard[] {
        const now = Number.isFinite(options.now) ? Number(options.now) : Date.now();
        const mode = options.mode ?? 'due-priority';
        return PriorityQueueService.sortCards(cards, {
            mode,
            randomization: mode === 'priority-due'
                ? (options.randomization ?? this.getPriorityRandomness())
                : 0,
            stableSalt: `${this.type}:${this.getCurrentDayEnd(this.getDayStartHour(), now)}`,
        });
    }
    
    /**
     * 使用调度器处理卡片复习（通用实现）
     * 
     * 这是一个通用的复习处理方法，实现了队列-调度器职责分离：
     * 1. 队列负责：卡片生命周期管理（排序、过滤、移除）
     * 2. application commit use case 负责：读取当前卡、提交 SRS v2 决策、写日志、发布事件
     * 3. 调度器负责：算法计算（到期日期、稳定性、难度）和调度结果持久化
     * 
     * 处理流程：
     * 1. 获取卡片
     * 2. 通过 manager.commitReview() 提交 QueueReviewCommand
     * 3. 同步更新后的卡片状态（不重复持久化或重复发事件）
     * 4. 调用 shouldRemoveFromQueue() 判断是否移除
     * 5. 移除或保留卡片
     * 
     * 子类使用方式：
     * - 标准队列：直接调用此方法
     * - 特殊队列：覆盖 handleReview() 实现自定义逻辑
     * 
     * @param cardId 卡片 ID
     * @param rating 评分 (1-4)
     * @throws Error 如果 SchedulerRouter 不可用
     * @see 需求 1.1, 1.2, 1.3, 2.1
     * @see .kiro/specs/queue-scheduler-separation/design.md
     */
    protected async handleReviewWithScheduler(cardId: string, rating: number): Promise<QueueReviewResult> {
        try {
            // 1. 获取卡片
            const card = await this.manager.getCard(cardId);
            const cachedIndex = this.findCachedCardIndex(cardId);
            const beforeCard = cachedIndex >= 0 ? this.cards[cachedIndex] : card;
            
            logger.debug(`[${this.type}] handleReviewWithScheduler - Before scheduling:`, {
                cardId: card.id,
                rating,
                due: card.due,
                state: card.state,
                reps: card.reps,
            });
            
            // 2. 通过 application review commit use case 调度卡片；旧 manager 仍走 scheduler fallback
            const routeOptions = this.buildReviewSchedulingContext(card);
            let updatedCard: FSRSCard;
            let schedulingCommitted = true;
            let postCommitNotificationRequired = false;
            let queueImpact: unknown | null = null;

            if (typeof this.manager.commitReview === 'function') {
                const commitResult = await this.manager.commitReview({
                    cardId: card.id,
                    rating,
                    context: routeOptions,
                });
                schedulingCommitted = commitResult.committed;
                updatedCard = commitResult.updatedCard;
                queueImpact = commitResult.queueImpact ?? null;
            } else {
                const schedulerRouter = this.getSchedulerRouter();
                postCommitNotificationRequired = true;
                const decision = schedulerRouter.answer(card, rating, routeOptions);
                const commitResult = await schedulerRouter.commit(decision);
                schedulingCommitted = commitResult.committed;
                updatedCard = commitResult.updatedCard ?? decision.current;
            }
            
            logger.debug(`[${this.type}] handleReviewWithScheduler - After scheduling:`, {
                cardId: updatedCard.id,
                due: updatedCard.due,
                state: updatedCard.state,
                reps: updatedCard.reps,
            });
            
            // 验证调度器返回的卡片数据
            if (!updatedCard.due || isNaN(updatedCard.due) || updatedCard.due <= 0) {
                logger.error(`[${this.type}] Scheduler returned invalid due date:`, {
                    cardId: updatedCard.id,
                    due: updatedCard.due,
                    rating,
                });
                throw new Error(`Scheduler returned invalid due date for card ${cardId}: ${updatedCard.due}`);
            }
            
            // 3. 调度器已完成持久化，这里只做队列缓存失效 + 事件通知
            if (schedulingCommitted && postCommitNotificationRequired) {
                if (typeof this.manager.onCardUpdatedFromScheduler === 'function') {
                    await this.manager.onCardUpdatedFromScheduler(updatedCard);
                } else {
                    // 向后兼容：旧 manager 仍走 updateCard 路径
                    await this.manager.updateCard(updatedCard);
                }
            } else if (!schedulingCommitted) {
                logger.debug(`[${this.type}] SRS v2 decision was preview/drill-only; formal schedule was not updated`, {
                    cardId,
                    rating,
                    queueType: routeOptions.queueType,
                    queueMode: routeOptions.queueMode,
                    commitPolicy: routeOptions.commitPolicy,
                });
            }
            
            // 4. 判断是否应该从队列移除
            const shouldRemove = this.shouldRemoveFromQueue(updatedCard);
            let counterSnapshot: QueueCounterSnapshot | null = null;
            
            // 5. 移除或保留卡片
            if (shouldRemove) {
                await this.removeCardAfterReview(cardId);
                const removalIndex = this.findCachedCardIndex(cardId);
                if (removalIndex >= 0) {
                    this.cards.splice(removalIndex, 1);
                    this.cardsTrusted = true;
                    this.invalidateSnapshotRows();
                    counterSnapshot = this.applySnapshotOnCardRemoved(beforeCard);
                } else if (this.cardsTrusted) {
                    this.invalidateSnapshotRows();
                    counterSnapshot = this.commitCounterSnapshot(
                        this.buildCounterSnapshot(this.cards),
                        'reconciled',
                    );
                }
                this.clearSizeCache();
                logger.info(`[${this.type}] Card ${cardId} reviewed with rating ${rating}, removed from queue`);
                return {
                    updatedCard,
                    removedFromQueue: true,
                    remainsInQueue: false,
                    queueChanged: true,
                    requiresCurrentViewReorder: false,
                    counterSnapshot,
                    version: counterSnapshot?.version ?? this.counterVersion,
                    queueImpact,
                };
            } else {
                if (cachedIndex >= 0) {
                    this.cards[cachedIndex] = updatedCard;
                    this.cardsTrusted = true;
                    this.invalidateSnapshotRows();
                    counterSnapshot = this.applySnapshotOnCardRetained(beforeCard, updatedCard);
                } else if (this.cardsTrusted) {
                    this.invalidateSnapshotRows();
                    counterSnapshot = this.commitCounterSnapshot(
                        this.buildCounterSnapshot(this.cards),
                        'reconciled',
                    );
                }
                this.clearSizeCache();
                logger.info(`[${this.type}] Card ${cardId} reviewed with rating ${rating}, kept in queue`);
                return {
                    updatedCard,
                    removedFromQueue: false,
                    remainsInQueue: true,
                    queueChanged: false,
                    requiresCurrentViewReorder: false,
                    counterSnapshot,
                    version: counterSnapshot?.version ?? this.counterVersion,
                    queueImpact,
                };
            }
        } catch (error) {
            logger.error(`[${this.type}] Failed to handle review:`, error);
            throw error;
        }
    }
    
    /**
     * 跳过卡片
     * 
     * 默认实现：将卡片移到队列末尾。
     * 子类可以覆盖此方法以提供自定义行为。
     * 
     * @param cardId 卡片 ID
     */
    public async skip(cardId: string): Promise<void> {
        try {
            if (!this.cardsTrusted || this.cards.length === 0) {
                await this.getAllCards();
            }
            
            const index = this.cards.findIndex(c => c.id === cardId || c.blockId === cardId);
            if (index === -1) {
                logger.warn(`[${this.type}] Card ${cardId} not found in queue`);
                return;
            }
            
            const card = this.cards[index];
            this.cards.splice(index, 1);
            this.cards.push(card);
            this.cardsTrusted = true;
            this.invalidateSnapshotRows();
            this.commitCounterSnapshot(this.buildCounterSnapshot(this.cards), 'reconciled');
            this.clearSizeCache();
            
            logger.info(`[${this.type}] Card ${cardId} skipped (moved to end)`);
            this.notifyObservers();
        } catch (error) {
            logger.error(`[${this.type}] Failed to skip card:`, error);
            throw error;
        }
    }
    
    /**
     * 获取队列统计信息
     * 
     * 默认实现：基于当前队列卡片计算统计。
     * 子类可以覆盖此方法以提供更精确的统计。
     * 
     * @returns 队列统计数据
     */
    public async getStats(): Promise<QueueStats> {
        try {
            if (this.cardsTrusted) {
                const now = Date.now();
                const total = this.cards.length;
                const due = this.cards.filter(c => c.due <= now).length;
                const newCards = this.cards.filter(c => c.reps === 0).length;
                const learning = this.cards.filter(c => c.state === 1).length;

                return {
                    total,
                    due,
                    new: newCards,
                    learning,
                    reviewed: 0,
                };
            }

            const snapshot = await this.getCounterSnapshot();
            return {
                total: snapshot.total ?? snapshot.remaining,
                due: snapshot.due,
                new: 0,
                learning: 0,
                reviewed: 0,
            };
        } catch (error) {
            logger.error(`[${this.type}] Failed to get stats:`, error);
            throw error;
        }
    }
    
    /**
     * 获取队列 UI 配置
     * 
     * 默认实现：返回标准的 4 按钮配置。
     * 子类可以覆盖此方法以提供自定义 UI 配置。
     * 
     * @returns UI 配置对象
     */
    public getUIConfig(): QueueUIConfig {
        return {
            displayName: this.name || this.type,
            buttons: this.getDefaultButtons(),
            showSkipButton: true,
            showProgressBar: true,
        };
    }
    
    /**
     * 获取默认按钮配置
     * 
     * 返回标准的 4 按钮配置（Again, Hard, Good, Easy）。
     * 
     * @returns 按钮配置数组
     */
    protected getDefaultButtons(): ReviewButtonConfig[] {
        return [
            { type: 'rating', label: 'Again', value: 1 },
            { type: 'rating', label: 'Hard', value: 2 },
            { type: 'rating', label: 'Good', value: 3 },
            { type: 'rating', label: 'Easy', value: 4 },
        ];
    }



    
    /**
     * 判断是否为动态队列
     * 
     * 子类必须实现此方法以标识队列类型。
     * - 动态队列：自动获取到期卡片（检索练习、渐进学习、过滤组）
     * - 静态队列：仅包含手动管理的卡片（最终训练、神经漫游）
     * 
     * @returns true 表示动态队列，false 表示静态队列
     * @see 需求 5.1, 6.1
     */
    public abstract isDynamic(): boolean;

    /**
     * 刷新队列
     */
    public async refresh(): Promise<void> {
        await this.getAllCards();
        this.clearSizeCache();
        this.notifyObservers();
    }

    /**
     * 清空队列
     */
    public async clear(): Promise<void> {
        this.cards = [];
        this.cardsTrusted = true;
        this.invalidateSnapshotRows();
        this.commitCounterSnapshot(this.buildCounterSnapshot([]), 'reconciled');
        this.clearSizeCache();
        this.notifyObservers();
    }

    /**
     * 获取队列大小
     * 
     * 注意：总是调用 getCards() 以确保返回最新的队列大小
     */
    public async getSize(): Promise<number> {
        if (this.counterSnapshot && !this.counterSnapshotDirty) {
            const total = this.counterSnapshot.total ?? this.counterSnapshot.remaining;
            logger.debug(`[${this.name}] getSize: returning ${total} from counter snapshot`);
            return total;
        }

        if (this.cardsTrusted) {
            logger.debug(`[${this.name}] getSize: returning ${this.cards.length} from trusted cache`);
            return this.cards.length;
        }

        const snapshot = await this.getCounterSnapshot();
        const total = snapshot.total ?? snapshot.remaining;
        logger.debug(`[${this.name}] getSize: returning ${total} after snapshot rebuild`);
        return total;
    }

    /**
     * 判断队列是否为空
     */
    public async isEmpty(): Promise<boolean> {
        return (await this.getSize()) === 0;
    }

    /**
     * 排序队列
     */
    public async sort(compareFn?: (a: FSRSCard, b: FSRSCard) => number): Promise<void> {
        if (!this.cardsTrusted || this.cards.length === 0) {
            await this.getAllCards();
        }
        if (compareFn) {
            this.cards.sort(compareFn);
        } else {
            this.cards = this.buildDefaultOrder(this.cards);
        }
        this.cardsTrusted = true;
        this.invalidateSnapshotRows();
        this.commitCounterSnapshot(this.buildCounterSnapshot(this.cards), 'reconciled');
        this.clearSizeCache();
        this.notifyObservers();
    }

    /**
     * 过滤队列
     */
    public async filter(predicate: (card: FSRSCard) => boolean): Promise<FSRSCard[]> {
        if (!this.cardsTrusted || this.cards.length === 0) {
            await this.getAllCards();
        }
        return this.cards.filter(predicate);
    }

    /**
     * 订阅队列变更
     */
    public subscribe(observer: QueueObserver): void {
        if (!this.observers.includes(observer)) {
            this.observers.push(observer);
        }
    }

    /**
     * 取消订阅队列变更
     */
    public unsubscribe(observer: QueueObserver): void {
        this.observers = this.observers.filter(o => o !== observer);
    }

    /**
     * 通知所有订阅者
     */
    public notifyObservers(): void {
        this.observers.forEach(observer => observer.onQueueUpdate(this));
    }

    protected emitQueueChangedEvent(options: { requiresFullRefresh?: boolean } = {}): void {
        this.manager.notifyObservers({
            type: 'queue-changed',
            queueType: this.type,
            requiresFullRefresh: options.requiresFullRefresh === true ? true : undefined,
            timestamp: Date.now(),
        });
    }

    /**
     * 合并多个卡片数组并按 card.id 去重（后出现的覆盖前出现的）
     */
    protected mergeUniqueCards(...groups: FSRSCard[][]): FSRSCard[] {
        const cardMap = new Map<string, FSRSCard>();
        for (const group of groups) {
            for (const card of group) {
                cardMap.set(card.id, card);
            }
        }
        return Array.from(cardMap.values());
    }

    private dedupeBulkItems(cards: QueueBulkAddInput[]): {
        attemptedCount: number;
        invalidIds: string[];
        values: Array<{ id: string; value: QueueBulkAddInput }>;
    } {
        const valuesById = new Map<string, QueueBulkAddInput>();
        const invalidIds: string[] = [];

        for (const card of cards || []) {
            try {
                const id = String(resolveCardId(card) || '').trim();
                if (!id) {
                    invalidIds.push('');
                    continue;
                }
                if (!valuesById.has(id)) {
                    valuesById.set(id, card);
                }
            } catch {
                invalidIds.push('');
            }
        }

        return {
            attemptedCount: valuesById.size + invalidIds.length,
            invalidIds,
            values: Array.from(valuesById.entries()).map(([id, value]) => ({ id, value })),
        };
    }

    private dedupeBulkIds(ids: string[]): string[] {
        return this.uniqueBulkIds((ids || []).map((id) => String(id || '').trim()));
    }

    private uniqueBulkIds(ids: string[]): string[] {
        return Array.from(new Set(ids.filter((id) => id.length > 0)));
    }

    /**
     * 按 due -> priority -> id 稳定排序
     */
    protected sortByDuePriority(cards: FSRSCard[]): FSRSCard[] {
        return this.buildDefaultOrder(cards, { mode: 'due-priority' });
    }

    /**
     * 按 priority -> due -> id 排序，并支持稳定的轻量随机扰动
     */
    protected sortByPriorityThenDue(cards: FSRSCard[]): FSRSCard[] {
        return this.buildDefaultOrder(cards, {
            mode: 'priority-due',
            randomization: this.getPriorityRandomness(),
        });
    }
    
    /**
     * 重新排序队列
     * 
     * 默认实现：使用内存中的排序覆盖（不持久化）。
     * 子类可以覆盖此方法以实现自定义排序逻辑（如持久化）。
     * 
     * 实现说明：
     * - 动态队列：支持临时排序覆盖，影响 getCards() 的返回顺序
     * - 静态队列：支持持久化排序，永久改变队列顺序
     * 
     * @param orderedCards 按新顺序排列的卡片数组
     * @returns true 表示重排序成功，false 表示失败
     */
    public async reorder(orderedCards: FSRSCard[]): Promise<boolean> {
        try {
            logger.info(`[${this.type}] Reordering ${orderedCards.length} cards`);
            
            // 将排序顺序存储在内存中
            this.customOrder = orderedCards.map(card => card.id);
            this.invalidateCachedCards();
            
            // 通知观察者队列已变更（触发复习界面刷新）
            this.emitQueueChangedEvent();
            
            logger.info(`[${this.type}] Reorder completed successfully (in-memory)`);
            return true;
        } catch (error) {
            logger.error(`[${this.type}] Failed to reorder:`, error);
            return false;
        }
    }
    
    /**
     * 清除自定义排序
     * 
     * 恢复到默认排序（动态队列按算法排序，静态队列按添加顺序）
     */
    public clearCustomOrder(): void {
        this.customOrder = null;
        this.invalidateCachedCards();
        logger.info(`[${this.type}] Custom order cleared`);
    }

    /**
     * 创建回滚快照（基础实现）
     *
     * 子类可覆盖以补充队列特有状态（例如 manualCards、entries）。
     */
    public async createRollbackSnapshot(): Promise<{
        temporaryBlacklist: string[];
        customOrder: string[] | null;
    }> {
        await this.ensureInitialLoad();
        return {
            temporaryBlacklist: Array.from(this.temporaryBlacklist),
            customOrder: this.customOrder ? [...this.customOrder] : null,
        };
    }

    /**
     * 恢复回滚快照（基础实现）
     */
    public async restoreRollbackSnapshot(snapshot: unknown): Promise<void> {
        const candidate = (snapshot ?? {}) as {
            temporaryBlacklist?: unknown;
            customOrder?: unknown;
        };

        const temporaryBlacklist = Array.isArray(candidate.temporaryBlacklist)
            ? candidate.temporaryBlacklist.map(item => String(item))
            : [];
        const customOrder = Array.isArray(candidate.customOrder)
            ? candidate.customOrder.map(item => String(item))
            : null;

        this.temporaryBlacklist = new Set(temporaryBlacklist);
        this.customOrder = customOrder;
        this.cards = [];
        this.cardsTrusted = false;
        this.invalidateCachedCards();
    }
    
    /**
     * 应用自定义排序到卡片数组
     * 
     * 如果存在自定义排序，按照自定义顺序重新排列卡片。
     * 
     * @param cards 原始卡片数组
     * @returns 排序后的卡片数组
     */
    protected applyCustomOrder(cards: FSRSCard[]): FSRSCard[] {
        if (!this.customOrder || this.customOrder.length === 0) {
            return cards;
        }
        
        // 创建卡片 ID 到卡片的映射
        const cardMap = new Map<string, FSRSCard>();
        for (const card of cards) {
            cardMap.set(card.id, card);
        }
        
        // 按照自定义顺序重新排列
        const orderedCards: FSRSCard[] = [];
        for (const cardId of this.customOrder) {
            const card = cardMap.get(cardId);
            if (card) {
                orderedCards.push(card);
                cardMap.delete(cardId);
            }
        }
        
        // 添加不在自定义顺序中的卡片（保持在末尾）
        for (const card of cardMap.values()) {
            orderedCards.push(card);
        }
        
        return orderedCards;
    }
    
    /**
     * 自定义排序顺序（卡片 ID 数组）
     * 
     * 用于临时覆盖队列的默认排序。
     * - null 表示使用默认排序
     * - 非空数组表示使用自定义排序
     */
    protected customOrder: string[] | null = null;
    
    /**
     * 临时黑名单（会话级，不持久化）
     * 
     * 用于临时移除不想复习的卡片。移除的卡片在当前会话中不再显示，
     * 但关闭浏览器或重新加载插件后会自动恢复。
     * 
     * 特性：
     * - 只存在于内存中，不持久化
     * - 每个队列实例维护独立的黑名单
     * - 通过 addCard() 可以立即恢复被移除的卡片
     * 
     * @see .kiro/specs/retrieval-practice-browser-display-fix/requirements.md
     * @see .kiro/specs/retrieval-practice-browser-display-fix/design.md
     */
    protected temporaryBlacklist: Set<string> = new Set();
    
    /**
     * 获取临时黑名单大小
     * 
     * 用于调试和统计临时移除的卡片数量。
     * 
     * @returns 临时黑名单中的卡片数量
     */
    public getTemporaryBlacklistSize(): number {
        return this.temporaryBlacklist.size;
    }
    
    /**
     * 清空临时黑名单
     * 
     * 用于测试或手动恢复所有被移除的卡片。
     * 调用此方法后，所有被临时移除的卡片将重新出现在队列中。
     */
    public clearTemporaryBlacklist(): void {
        this.temporaryBlacklist.clear();
        this.invalidateCachedCards();
        logger.info(`[${this.constructor.name}] Temporary blacklist cleared`);
    }
    
    /**
     * 插入卡片到指定位置
     * 
     * @param cardId 卡片 ID
     * @param position 位置 (1-based)
     */
    public async insertAt(cardId: string, position: number): Promise<void> {
        try {
            // 1. 验证位置
            const size = await this.getSize();
            if (position < 1 || position > size) {
                throw new Error(`Invalid position: ${position}, queue size: ${size}`);
            }
            
            // 2. 获取当前队列
            if (!this.cardsTrusted || this.cards.length === 0) {
                await this.getAllCards();
            }
            
            // 3. 找到目标卡片
            const cardIndex = this.cards.findIndex(c => c.id === cardId || c.blockId === cardId);
            if (cardIndex === -1) {
                throw new Error(`Card not found: ${cardId}`);
            }
            
            // 4. 移除卡片
            const [card] = this.cards.splice(cardIndex, 1);
            
            // 5. 插入到指定位置 (position - 1 因为是 0-based)
            this.cards.splice(position - 1, 0, card);
            
            // 6. 更新自定义排序
            this.customOrder = this.cards.map(c => c.id);
            this.cardsTrusted = true;
            this.invalidateSnapshotRows();
            this.commitCounterSnapshot(this.buildCounterSnapshot(this.cards), 'reconciled');
            this.clearSizeCache();
            
            logger.info(`[${this.type}] Card ${cardId} inserted at position ${position}`);
            
            // 7. 通知观察者
            this.notifyObservers();
        } catch (error) {
            logger.error(`[${this.type}] Failed to insert card:`, error);
            throw error;
        }
    }
    
    /**
     * 获取剩余卡片数量
     */
    public async getRemainingSize(): Promise<number> {
        const now = Date.now();

        if (this.cachedSize !== null && now - this.cacheTimestamp < this.CACHE_TTL) {
            return this.cachedSize;
        }

        if (this.counterSnapshot && !this.counterSnapshotDirty) {
            this.cachedSize = this.counterSnapshot.remaining;
            this.cacheTimestamp = now;
            return this.cachedSize;
        }

        if (this.cardsTrusted) {
            this.cachedSize = this.cards.length;
            this.cacheTimestamp = now;
            return this.cachedSize;
        }

        const snapshot = await this.getCounterSnapshot();
        this.cachedSize = snapshot.remaining;
        this.cacheTimestamp = now;
        return this.cachedSize;
    }
    
    /**
     * 清除缓存（在队列变化时调用）
     */
    protected clearSizeCache(): void {
        this.cachedSize = null;
        this.cacheTimestamp = 0;
    }
    
    /**
     * 队列大小缓存
     */
    private cachedSize: number | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_TTL = 5000; // 5 秒缓存
}

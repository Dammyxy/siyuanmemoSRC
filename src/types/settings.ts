/**
 * Settings Types
 * 插件设置数据结构
 */

/** 存储键名 */
import { default_w } from 'ts-fsrs';
import {
    DEFAULT_ARENA_SETTINGS,
    normalizeArenaSettings,
    type ArenaSettings,
} from '@/types/arena';

export const STORAGE_NAME = 'fsrs-config';
export const FSRS_WEIGHT_COUNT = default_w.length;
export const LEGACY_FSRS_V5 = 'fsrs-v5';
export const ACTIVE_FSRS_VERSION = 'fsrs-v6';
export const DEFAULT_FSRS_WEIGHTS: number[] = [...default_w];

function isFiniteNumberArray(value: unknown): value is number[] {
    return Array.isArray(value) && value.every(item => typeof item === 'number' && Number.isFinite(item));
}

function normalizeDefaultSchedulerLiteral(value: unknown): SchedulerConfig['defaultScheduler'] {
    return value === 'a-factor-v2' ? 'a-factor-v2' : ACTIVE_FSRS_VERSION;
}

function normalizeItemSchedulerLiteral(_value: unknown): NonNullable<SchedulerConfig['itemScheduler']> {
    return ACTIVE_FSRS_VERSION;
}

export function normalizeFSRSWeights(weights: unknown): number[] {
    const source = isFiniteNumberArray(weights) ? weights : [];
    if (source.length >= FSRS_WEIGHT_COUNT) {
        return source.slice(0, FSRS_WEIGHT_COUNT);
    }

    const padded = source.slice();
    for (let i = source.length; i < FSRS_WEIGHT_COUNT; i++) {
        padded.push(DEFAULT_FSRS_WEIGHTS[i]);
    }
    return padded;
}

const DEFAULT_SRS_V2_LEARNING_STEPS_MINUTES = [1, 10];
const DEFAULT_SRS_V2_RELEARNING_STEPS_MINUTES = [10];
const DEFAULT_SRS_V2_LEARN_AHEAD_WINDOW_MINUTES = 20;
const DEFAULT_SRS_V2_LEARN_AHEAD_MAX_CARDS = 20;

function normalizeStepMinutes(value: unknown, fallback: number[]): number[] {
    const source = Array.isArray(value) ? value : fallback;
    const normalized = source
        .map(item => Math.max(1, Math.min(30 * 24 * 60, Math.floor(Number(item)))))
        .filter(item => Number.isFinite(item));

    return normalized.length > 0 ? normalized : [...fallback];
}

function normalizeFilteredReviewDefault(value: unknown): SrsV2FilteredReviewDefault {
    return value === 'reschedule' ? 'reschedule' : 'preview-only';
}

function normalizeSrsV2LearnAheadSettings(value: unknown): SrsV2LearnAheadSettings {
    const source = typeof value === 'object' && value !== null
        ? value as Partial<SrsV2LearnAheadSettings>
        : {};
    const windowMinutes = Number(source.windowMinutes);
    const maxCards = Number(source.maxCards);
    return {
        windowMinutes: Number.isFinite(windowMinutes)
            ? Math.max(0, Math.min(24 * 60, Math.floor(windowMinutes)))
            : DEFAULT_SRS_V2_LEARN_AHEAD_WINDOW_MINUTES,
        maxCards: Number.isFinite(maxCards)
            ? Math.max(0, Math.min(500, Math.floor(maxCards)))
            : DEFAULT_SRS_V2_LEARN_AHEAD_MAX_CARDS,
    };
}

function normalizeSrsV2SchedulerSettings(value: unknown): SrsV2SchedulerSettings {
    const source = typeof value === 'object' && value !== null
        ? value as Partial<SrsV2SchedulerSettings>
        : {};
    return {
        learningStepsMinutes: normalizeStepMinutes(
            source.learningStepsMinutes,
            DEFAULT_SRS_V2_LEARNING_STEPS_MINUTES
        ),
        relearningStepsMinutes: normalizeStepMinutes(
            source.relearningStepsMinutes,
            DEFAULT_SRS_V2_RELEARNING_STEPS_MINUTES
        ),
        filteredReviewDefault: normalizeFilteredReviewDefault(source.filteredReviewDefault),
        learnAhead: normalizeSrsV2LearnAheadSettings(source.learnAhead),
    };
}

/** FSRS 算法参数 */
export interface FSRSParameters {
    requestRetention: number;  // 期望保留率 0.7-0.99，默认 0.9
    maximumInterval: number;   // 最大间隔天数，默认 36500
    weights: number[];         // 21 个权重参数
    enableFuzz: boolean;       // 启用模糊化
    enableShortTerm: boolean;  // 启用短期调度器
    
    /**
     * 每日刷新时间（小时，0-23）
     * 
     * 定义"新的一天"的开始时间。
     * 
     * ## 使用场景
     * - 用户习惯在凌晨4点睡觉，希望将"新的一天"设置为凌晨4点
     * - 用户希望在23:59:59就能看到第二天的卡片
     * 
     * ## 影响范围
     * - 浏览器的'due'预设筛选
     * - 复习队列的到期卡片获取
     * - 统计数据的"今天"计算
     * 
     * @default 4 (凌晨4点)
     */
    dayStartHour?: number;
}

export type SchedulerEngine = 'simple-fsrs' | 'a-factor-v2';

export type SrsV2FilteredReviewDefault = 'preview-only' | 'reschedule';

export interface SrsV2LearnAheadSettings {
    windowMinutes: number;
    maxCards: number;
}

export interface SrsV2SchedulerSettings {
    learningStepsMinutes: number[];
    relearningStepsMinutes: number[];
    filteredReviewDefault: SrsV2FilteredReviewDefault;
    learnAhead: SrsV2LearnAheadSettings;
}

/** 🆕 调度器配置 */
export interface SchedulerConfig {
    defaultScheduler: 'fsrs-v6' | 'a-factor-v2';

    // 按卡片类型配置（可选）
    topicScheduler?: 'a-factor-v2';  // Topic 固定使用 A-Factor v2
    itemScheduler?: 'fsrs-v6';

    srsV2?: SrsV2SchedulerSettings;
}

/** 复习筛选器类型 */
export type ReviewFilterType = 'all' | 'document' | 'sql' | 'backlink';

/** 复习筛选器配置 */
export interface ReviewFilter {
    type: ReviewFilterType;
    documentId?: string;       // 文档树根 ID
    includeChildren?: boolean; // 包含子文档
    sqlQuery?: string;         // 自定义 SQL
    blockId?: string;          // 反链源块 ID
    name?: string;             // 筛选器名称（用于保存）
}

/** 难点检测设置 */
export interface LeechSettings {
    enabled: boolean;          // 启用难点检测
    threshold: number;         // 难点阈值（连续遗忘次数），默认 8
    action: 'notify' | 'suspend' | 'tag'; // 触发动作
    tagName?: string;          // 打标签时的标签名
}

/** 复习界面设置 */
export interface UISettings {
    defaultMode: 'dialog' | 'dock'; // 默认复习模式
    showTimer: boolean;        // 显示计时器
    showProgress: boolean;     // 显示进度
    showStats: boolean;        // 显示本次统计
    autoAdvance: boolean;      // 自动翻到下一张
    autoAdvanceDelay: number;  // 自动翻卡延迟（秒）
    reviewOpenInNewTabByDefault: boolean; // 桌面端默认以新页签打开复习
    reviewOpenFullscreenByDefault: boolean; // 桌面端对话框复习默认全屏
    reviewSourceBlockRefreshEnabled: boolean; // 复习页监听源块 workspace transaction 并刷新正文（高级开关，默认关闭）
    enableDebugLogs: boolean;  // 启用调试日志（开发用）
}

/** 增量阅读设置 */
export interface IncrementalSettings {
    enabled: boolean;
    defaultPriority: number;   // 新增量内容默认优先级
    extractPriority: number;   // 摘录卡片默认优先级
    autoAddToQueue: boolean;   // 自动加入复习队列
    autoCardEnabled: boolean;  // 自动制卡（实时监听）
}

/** 快速制卡设置 */
export interface QuickCardSettings {
    /** 启用快速制卡 */
    enabled: boolean;

    /** 思源原生闪卡类别对 Topic/Item 的映射开关 */
    flashcard: {
        mark: boolean;
        list: boolean;
        heading: boolean;
        superBlock: boolean;
    };

    /** 是否已从思源原生 flashcard 设置做过一次性初始化 */
    flashcardSeededFromSiyuan?: boolean;
    
    /** 启用的符号类型 */
    enabledSymbols: {
        basic: boolean;        // >> << <>
        concept: boolean;      // ::
        descriptor: boolean;   // ;;
        cloze: boolean;        // {{}}
        multiLine: boolean;    // >>>
    };
    
    /** 防抖时间（毫秒） */
    debounceDelay: {
        quick: number;         // 快速符号防抖时间（默认 300ms）
        list: number;          // 列表模版防抖时间（默认 2000ms）
    };
    
    /** Descriptor 是否使用 Xiuyuan */
    descriptorUseXiuyuan: boolean;

    /** Topic 卡上的自然派生 item 配置 */
    topicDerivation?: {
        enabled: boolean;
        storageMode: 'workbench' | 'source-child';
    };
}

/** 机械练习设置 */
export interface DrillSettings {
    enabled: boolean;
    maxCards: number;          // 单次练习最大卡片数
    shuffleCards: boolean;     // 随机打乱顺序
}

export interface ProgressiveReadingSettings {
    altXExcerptEnabled: boolean;
    sourceMarkingEnabled: boolean;
    storage: ConfiguredCaptureStorageSettings;
}

export type ConfiguredCaptureStorageMode = 'source-child' | 'library' | 'daily-note';

export interface ConfiguredCaptureStorageSettings {
    mode: ConfiguredCaptureStorageMode;
    notebookId: string;
    targetBlockId?: string;
}

export function normalizeConfiguredCaptureStorageMode(
    value: unknown,
    options?: {
        allowSourceChild?: boolean;
        fallback?: ConfiguredCaptureStorageMode;
    },
): ConfiguredCaptureStorageMode {
    const allowSourceChild = options?.allowSourceChild !== false;
    if (value === 'library' || value === 'daily-note' || (allowSourceChild && value === 'source-child')) {
        return value;
    }
    if (options?.fallback) {
        return options.fallback;
    }
    return allowSourceChild ? 'source-child' : 'daily-note';
}

export function normalizeConfiguredCaptureStorageSettings(
    value: unknown,
    options?: {
        allowSourceChild?: boolean;
        fallback?: ConfiguredCaptureStorageSettings;
    },
): ConfiguredCaptureStorageSettings {
    const allowSourceChild = options?.allowSourceChild !== false;
    const fallback = options?.fallback ?? {
        mode: allowSourceChild ? 'source-child' : 'daily-note',
        notebookId: '',
        targetBlockId: '',
    };
    const source = typeof value === 'object' && value !== null
        ? value as Partial<ConfiguredCaptureStorageSettings>
        : {};

    return {
        mode: normalizeConfiguredCaptureStorageMode(source.mode, {
            allowSourceChild,
            fallback: fallback.mode,
        }),
        notebookId: String(source.notebookId ?? fallback.notebookId ?? '').trim(),
        targetBlockId: String(source.targetBlockId ?? fallback.targetBlockId ?? '').trim(),
    };
}

export interface FilterGroupDefinition {
    id: string;
    name: string;
    type: 'doc' | 'tree' | 'sql';
    value: string;
    weight: number;
}

export interface HyperspaceTreeChannels {
    blockTree: boolean;
    documentTree: boolean;
}

export interface HyperspaceSettings {
    treeChannels: HyperspaceTreeChannels;
    maxLayersPerRepetition: number;
    maxTotalDepth: number;
    conceptLinkGroupPriority: number;
    elementLinkGroupPriority: number;
    treeChildGroupPriority: number;
    treeParentGroupPriority: number;
    treeSiblingBaseGroupPriority: number;
    siblingDistancePenalty: number;
    articleRootParentConductionProbability: number;
    activationCarryDecay: number;
    raceRandomness: number;
}

export interface NeuralRoamHistorySettings {
    maxEntries: number;
}

export interface NeuralRoamSettings {
    preferredMode?: 'orbit' | 'hyperspace' | 'semantic-activation';
    history: NeuralRoamHistorySettings;
    hyperspace: HyperspaceSettings;
}

export interface QueueSettings {
    defaultQueue: 'retrieval' | 'final-drill' | 'neural-roam' | 'filter-group';
    /**
     * Add-to-outstanding 稀疏插入间隔（每 N 张插入 1 张手动加入卡）
     * @default 2
     */
    addToOutstandingEveryNth?: number;
    /**
     * @deprecated 旧键名，仅用于读取兼容，不再写入
     */
    outstandingEveryNth?: number;
    /**
     * @deprecated 旧键名，仅用于读取兼容，不再写入
     */
    outstandingSpacing?: number;
    /**
     * @deprecated 旧位置的 dayStartHour，仅用于读取兼容，实际应使用 fsrs.dayStartHour
     */
    dayStartHour?: number;
    /**
     * 自动排序开关（Outstanding 按优先级排序）
     * @default { enabled: true }
     */
    autoSort?: {
        enabled?: boolean;
    };
    /**
     * 自动延期开关与参数（复习会话开始前执行）
     */
    autoPostpone?: {
        enabled?: boolean;
        skipTopNElements?: number;
        delayFactor?: number;
        minInterval?: number;
        maxInterval?: number;
        modifyDelayByRetrievability?: boolean;
        modifyDelayByPriority?: boolean;
    };
    neuralWandering: {
        enabled: boolean;
        maxPool: number;
        historyLimit: number;
        maxContext: number;
        enableTags: boolean;
        maxTags: number;
        enableSiblings: boolean;
        maxSiblings: number;
        weights: {
            ref: number;
            context: number;
            tag: number;
            sibling: number;
        };
    };
    neuralRoam?: NeuralRoamSettings;
    filterGroup: {
        enabled: boolean;
        groups: FilterGroupDefinition[];
    };
}

/** 存储冲突解决策略 */
export type StorageConflictResolutionStrategy = 'merge' | 'prefer-local' | 'prefer-remote';

/** 插件完整设置 */
export interface PluginSettings {
    // FSRS 算法
    fsrs: FSRSParameters;
    
    /**
     * @deprecated 已废弃，保留用于向后兼容。请使用 scheduler.defaultScheduler
     */
    schedulerEngine: SchedulerEngine;

    // 🆕 调度器配置
    scheduler?: SchedulerConfig;

    // 多实例/多设备写冲突时的解决策略
    storageConflictResolution: StorageConflictResolutionStrategy;

    // 复习队列
    newCardsPerDay: number;    // 每日新卡上限
    reviewsPerDay: number;     // 每日复习上限（0=无限制）

    // 优先级
    defaultPriority: number;   // 新卡片默认优先级
    priorityRandomness: number; // 优先级随机因子 0-1

    // 功能开关
    leech: LeechSettings;
    ui: UISettings;
    incremental: IncrementalSettings;
    quickCard: QuickCardSettings;
    drill: DrillSettings;
    progressiveReading: ProgressiveReadingSettings;
    arena: ArenaSettings;
    queues: QueueSettings;

    // 保存的筛选器
    savedFilters: ReviewFilter[];

    // 统计
    collectStats: boolean;     // 收集统计数据
}

function normalizeStorageConflictResolution(
    value: unknown
): StorageConflictResolutionStrategy {
    return value === 'merge' || value === 'prefer-local' || value === 'prefer-remote'
        ? value
        : 'merge';
}

export function normalizePluginSettings(settings: PluginSettings): { settings: PluginSettings; changed: boolean } {
    let changed = false;
    const legacySettings = settings as PluginSettings & {
        riffIntegration?: {
            storageConflictResolution?: unknown;
        };
    };
    const hasRetiredRiffIntegration = Object.prototype.hasOwnProperty.call(legacySettings, 'riffIntegration');
    const {
        riffIntegration: _retiredRiffIntegration,
        ...settingsWithoutRetiredRiffIntegration
    } = legacySettings;
    const normalizedStorageConflictResolution = normalizeStorageConflictResolution(
        legacySettings.riffIntegration?.storageConflictResolution
            ?? settings.storageConflictResolution
    );
    const sourceProgressiveReading = settings.progressiveReading as (PluginSettings['progressiveReading'] & {
        dailyTraceEnabled?: boolean;
    }) | undefined;
    const hasRetiredAiSettings = Object.prototype.hasOwnProperty.call(settings, 'ai');
    const { dailyTraceEnabled: _legacyDailyTraceEnabled, ...sourceProgressiveReadingWithoutLegacy } = sourceProgressiveReading || {};
    const normalized: PluginSettings = {
        ...settingsWithoutRetiredRiffIntegration,
        fsrs: { ...settings.fsrs },
        scheduler: {
            ...DEFAULT_SETTINGS.scheduler,
            ...(settings.scheduler || {}),
            srsV2: normalizeSrsV2SchedulerSettings(settings.scheduler?.srsV2),
        },
        storageConflictResolution: normalizedStorageConflictResolution,
        queues: {
            ...DEFAULT_SETTINGS.queues,
            ...(settings.queues || {}),
            neuralWandering: {
                ...DEFAULT_SETTINGS.queues.neuralWandering,
                ...(settings.queues?.neuralWandering || {}),
                weights: {
                    ...DEFAULT_SETTINGS.queues.neuralWandering.weights,
                    ...(settings.queues?.neuralWandering?.weights || {}),
                },
            },
            neuralRoam: {
                ...DEFAULT_SETTINGS.queues.neuralRoam,
                ...(settings.queues?.neuralRoam || {}),
                preferredMode: settings.queues?.neuralRoam?.preferredMode === 'hyperspace'
                    || settings.queues?.neuralRoam?.preferredMode === 'semantic-activation'
                    ? settings.queues.neuralRoam.preferredMode
                    : DEFAULT_SETTINGS.queues.neuralRoam?.preferredMode,
                history: {
                    ...DEFAULT_SETTINGS.queues.neuralRoam?.history,
                    ...(settings.queues?.neuralRoam?.history || {}),
                },
                hyperspace: {
                    ...DEFAULT_SETTINGS.queues.neuralRoam?.hyperspace,
                    ...(settings.queues?.neuralRoam?.hyperspace || {}),
                    treeChannels: {
                        ...DEFAULT_SETTINGS.queues.neuralRoam?.hyperspace.treeChannels,
                        ...(settings.queues?.neuralRoam?.hyperspace?.treeChannels || {}),
                    },
                },
            },
            filterGroup: {
                ...DEFAULT_SETTINGS.queues.filterGroup,
                ...(settings.queues?.filterGroup || {}),
            },
        },
        quickCard: {
            ...DEFAULT_SETTINGS.quickCard,
            ...(settings.quickCard || {}),
            flashcard: {
                ...DEFAULT_SETTINGS.quickCard.flashcard,
                ...(settings.quickCard?.flashcard || {}),
            },
            topicDerivation: {
                ...DEFAULT_SETTINGS.quickCard.topicDerivation,
                ...(settings.quickCard?.topicDerivation || {}),
            },
        },
        progressiveReading: {
            ...DEFAULT_SETTINGS.progressiveReading,
            ...sourceProgressiveReadingWithoutLegacy,
            sourceMarkingEnabled: sourceProgressiveReadingWithoutLegacy.sourceMarkingEnabled ?? DEFAULT_SETTINGS.progressiveReading.sourceMarkingEnabled,
            storage: normalizeConfiguredCaptureStorageSettings(
                sourceProgressiveReadingWithoutLegacy.storage,
                {
                    allowSourceChild: true,
                    fallback: DEFAULT_SETTINGS.progressiveReading.storage,
                },
            ),
        },
        arena: normalizeArenaSettings((settings as Partial<PluginSettings>).arena),
        ui: {
            ...DEFAULT_SETTINGS.ui,
            ...(settings.ui || {}),
        },
    };

    const normalizedWeights = normalizeFSRSWeights(normalized.fsrs?.weights);
    const currentWeights = isFiniteNumberArray(normalized.fsrs?.weights) ? normalized.fsrs.weights : [];
    if (
        currentWeights.length !== normalizedWeights.length
        || currentWeights.some((value, index) => value !== normalizedWeights[index])
    ) {
        normalized.fsrs.weights = normalizedWeights;
        changed = true;
    }

    if (!settings.scheduler) {
        changed = true;
    }

    const normalizedScheduler = normalized.scheduler!;
    const nextDefault = normalizeDefaultSchedulerLiteral(normalizedScheduler.defaultScheduler);
    if (nextDefault !== normalizedScheduler.defaultScheduler) {
        normalizedScheduler.defaultScheduler = nextDefault as typeof normalizedScheduler.defaultScheduler;
        changed = true;
    }

    const nextItem = normalizeItemSchedulerLiteral(normalizedScheduler.itemScheduler);
    if (nextItem !== normalizedScheduler.itemScheduler) {
        normalizedScheduler.itemScheduler = nextItem as typeof normalizedScheduler.itemScheduler;
        changed = true;
    }

    const sourceSrsV2 = settings.scheduler?.srsV2;
    const normalizedSrsV2 = normalizedScheduler.srsV2!;
    if (
        !sourceSrsV2
        || sourceSrsV2.filteredReviewDefault !== normalizedSrsV2.filteredReviewDefault
        || JSON.stringify(sourceSrsV2.learningStepsMinutes) !== JSON.stringify(normalizedSrsV2.learningStepsMinutes)
        || JSON.stringify(sourceSrsV2.relearningStepsMinutes) !== JSON.stringify(normalizedSrsV2.relearningStepsMinutes)
        || sourceSrsV2.learnAhead?.windowMinutes !== normalizedSrsV2.learnAhead.windowMinutes
        || sourceSrsV2.learnAhead?.maxCards !== normalizedSrsV2.learnAhead.maxCards
    ) {
        changed = true;
    }

    const sourceQuickCard = settings.quickCard;
    const normalizedQuickCard = normalized.quickCard;
    if (!sourceQuickCard) {
        changed = true;
    } else {
        const flashcardConfig = sourceQuickCard.flashcard;
        if (!flashcardConfig) {
            changed = true;
        } else if (
            flashcardConfig.mark !== normalizedQuickCard.flashcard.mark
            || flashcardConfig.list !== normalizedQuickCard.flashcard.list
            || flashcardConfig.heading !== normalizedQuickCard.flashcard.heading
            || flashcardConfig.superBlock !== normalizedQuickCard.flashcard.superBlock
        ) {
            changed = true;
        }

        if ((sourceQuickCard.flashcardSeededFromSiyuan ?? false) !== normalizedQuickCard.flashcardSeededFromSiyuan) {
            changed = true;
        }

        const sourceTopicDerivation = sourceQuickCard.topicDerivation;
        if (!sourceTopicDerivation) {
            changed = true;
        } else if (
            (sourceTopicDerivation.enabled ?? DEFAULT_SETTINGS.quickCard.topicDerivation.enabled) !== normalizedQuickCard.topicDerivation.enabled
            || (sourceTopicDerivation.storageMode ?? DEFAULT_SETTINGS.quickCard.topicDerivation.storageMode) !== normalizedQuickCard.topicDerivation.storageMode
        ) {
            changed = true;
        }
    }

    if (!settings.progressiveReading) {
        changed = true;
    } else if (
        Object.prototype.hasOwnProperty.call(settings.progressiveReading, 'dailyTraceEnabled')
        || settings.progressiveReading.altXExcerptEnabled !== normalized.progressiveReading.altXExcerptEnabled
        || settings.progressiveReading.sourceMarkingEnabled !== normalized.progressiveReading.sourceMarkingEnabled
        || settings.progressiveReading.storage?.mode !== normalized.progressiveReading.storage.mode
        || settings.progressiveReading.storage?.notebookId !== normalized.progressiveReading.storage.notebookId
        || (settings.progressiveReading.storage?.targetBlockId || '') !== normalized.progressiveReading.storage.targetBlockId
    ) {
        changed = true;
    }

    if (hasRetiredAiSettings) {
        delete (normalized as Partial<PluginSettings> & { ai?: unknown }).ai;
        changed = true;
    }

    if (JSON.stringify((settings as Partial<PluginSettings>).arena || null) !== JSON.stringify(normalized.arena)) {
        changed = true;
    }

    if (!settings.ui) {
        changed = true;
    } else {
        const sourceUi = settings.ui;
        const normalizedUi = normalized.ui;
        const hasReviewOpenInNewTabDefault = Object.prototype.hasOwnProperty.call(sourceUi, 'reviewOpenInNewTabByDefault');
        const hasReviewOpenFullscreenDefault = Object.prototype.hasOwnProperty.call(sourceUi, 'reviewOpenFullscreenByDefault');
        const hasReviewSourceBlockRefreshEnabled = Object.prototype.hasOwnProperty.call(sourceUi, 'reviewSourceBlockRefreshEnabled');
        if (
            sourceUi.defaultMode !== normalizedUi.defaultMode
            || sourceUi.showTimer !== normalizedUi.showTimer
            || sourceUi.showProgress !== normalizedUi.showProgress
            || sourceUi.showStats !== normalizedUi.showStats
            || sourceUi.autoAdvance !== normalizedUi.autoAdvance
            || sourceUi.autoAdvanceDelay !== normalizedUi.autoAdvanceDelay
            || !hasReviewOpenInNewTabDefault
            || !hasReviewOpenFullscreenDefault
            || !hasReviewSourceBlockRefreshEnabled
            || (sourceUi.reviewOpenInNewTabByDefault ?? DEFAULT_SETTINGS.ui.reviewOpenInNewTabByDefault) !== normalizedUi.reviewOpenInNewTabByDefault
            || (sourceUi.reviewOpenFullscreenByDefault ?? DEFAULT_SETTINGS.ui.reviewOpenFullscreenByDefault) !== normalizedUi.reviewOpenFullscreenByDefault
            || (sourceUi.reviewSourceBlockRefreshEnabled ?? DEFAULT_SETTINGS.ui.reviewSourceBlockRefreshEnabled) !== normalizedUi.reviewSourceBlockRefreshEnabled
            || sourceUi.enableDebugLogs !== normalizedUi.enableDebugLogs
        ) {
            changed = true;
        }
    }

    if (
        hasRetiredRiffIntegration
        || settings.storageConflictResolution !== normalizedStorageConflictResolution
    ) {
        changed = true;
    }

    if (!settings.queues?.neuralRoam?.hyperspace) {
        changed = true;
    } else {
        const sourceHyperspace = settings.queues.neuralRoam.hyperspace;
        const normalizedHyperspace = normalized.queues.neuralRoam?.hyperspace;
        if (!normalizedHyperspace) {
            changed = true;
        } else if (
            sourceHyperspace.maxLayersPerRepetition !== normalizedHyperspace.maxLayersPerRepetition
            || sourceHyperspace.maxTotalDepth !== normalizedHyperspace.maxTotalDepth
            || sourceHyperspace.conceptLinkGroupPriority !== normalizedHyperspace.conceptLinkGroupPriority
            || sourceHyperspace.elementLinkGroupPriority !== normalizedHyperspace.elementLinkGroupPriority
            || sourceHyperspace.treeChildGroupPriority !== normalizedHyperspace.treeChildGroupPriority
            || sourceHyperspace.treeParentGroupPriority !== normalizedHyperspace.treeParentGroupPriority
            || sourceHyperspace.treeSiblingBaseGroupPriority !== normalizedHyperspace.treeSiblingBaseGroupPriority
            || sourceHyperspace.siblingDistancePenalty !== normalizedHyperspace.siblingDistancePenalty
            || sourceHyperspace.articleRootParentConductionProbability !== normalizedHyperspace.articleRootParentConductionProbability
            || sourceHyperspace.activationCarryDecay !== normalizedHyperspace.activationCarryDecay
            || sourceHyperspace.raceRandomness !== normalizedHyperspace.raceRandomness
            || sourceHyperspace.treeChannels?.blockTree !== normalizedHyperspace.treeChannels.blockTree
            || sourceHyperspace.treeChannels?.documentTree !== normalizedHyperspace.treeChannels.documentTree
        ) {
            changed = true;
        }
    }

    return { settings: normalized, changed };
}

/** 默认设置 */
export const DEFAULT_SETTINGS: PluginSettings = {
    fsrs: {
        requestRetention: 0.9,
        maximumInterval: 36500,
        weights: [...DEFAULT_FSRS_WEIGHTS],
        enableFuzz: true,
        enableShortTerm: true,
        dayStartHour: 4,  // 🆕 默认凌晨4点
    },
    schedulerEngine: 'simple-fsrs',  // ⚠️ 已废弃，保留用于向后兼容
    scheduler: {
        defaultScheduler: 'fsrs-v6',
        topicScheduler: 'a-factor-v2',
        itemScheduler: 'fsrs-v6',
        srsV2: {
            learningStepsMinutes: [...DEFAULT_SRS_V2_LEARNING_STEPS_MINUTES],
            relearningStepsMinutes: [...DEFAULT_SRS_V2_RELEARNING_STEPS_MINUTES],
            filteredReviewDefault: 'preview-only',
            learnAhead: {
                windowMinutes: DEFAULT_SRS_V2_LEARN_AHEAD_WINDOW_MINUTES,
                maxCards: DEFAULT_SRS_V2_LEARN_AHEAD_MAX_CARDS,
            },
        },
    },
    storageConflictResolution: 'merge',
    newCardsPerDay: 20,
    reviewsPerDay: 0,
    defaultPriority: 50,
    priorityRandomness: 0.1,
    leech: {
        enabled: true,
        threshold: 8,
        action: 'notify',
    },
    ui: {
        defaultMode: 'dialog',
        showTimer: true,
        showProgress: true,
        showStats: true,
        autoAdvance: false,
        autoAdvanceDelay: 0.5,
        reviewOpenInNewTabByDefault: false,
        reviewOpenFullscreenByDefault: false,
        reviewSourceBlockRefreshEnabled: false,
        enableDebugLogs: false,  // 默认关闭调试日志
    },
    incremental: {
        enabled: true,
        defaultPriority: 30,
        extractPriority: 40,
        autoAddToQueue: true,
        autoCardEnabled: false,
    },
    quickCard: {
        enabled: false,  // 🆕 默认关闭，避免误触发
        flashcard: {
            mark: true,
            list: true,
            heading: true,
            superBlock: true,
        },
        flashcardSeededFromSiyuan: false,
        enabledSymbols: {
            basic: true,
            concept: true,
            descriptor: true,
            cloze: true,
            multiLine: true,
        },
        debounceDelay: {
            quick: 300,
            list: 2000,
        },
        descriptorUseXiuyuan: true,
        topicDerivation: {
            enabled: true,
            storageMode: 'workbench',
        },
    },
    drill: {
        enabled: true,
        maxCards: 50,
        shuffleCards: true,
    },
    progressiveReading: {
        altXExcerptEnabled: false,
        sourceMarkingEnabled: true,
        storage: {
            mode: 'source-child',
            notebookId: '',
            targetBlockId: '',
        },
    },
    arena: DEFAULT_ARENA_SETTINGS,
    queues: {
        defaultQueue: 'retrieval',
        addToOutstandingEveryNth: 2,
        autoSort: {
            enabled: true,
        },
        autoPostpone: {
            enabled: false,
            skipTopNElements: 20,
            delayFactor: 1.1,
            minInterval: 1,
            maxInterval: 365,
            modifyDelayByRetrievability: false,
            modifyDelayByPriority: false,
        },
        neuralWandering: {
            enabled: false,
            maxPool: 200,
            historyLimit: 50,
            maxContext: 30,
            enableTags: false,
            maxTags: 10,
            enableSiblings: false,
            maxSiblings: 10,
            weights: {
                ref: 10,
                context: 5,
                tag: 3,
                sibling: 1,
            },
        },
        neuralRoam: {
            preferredMode: 'orbit',
            history: {
                maxEntries: 3000,
            },
            hyperspace: {
                treeChannels: {
                    blockTree: false,
                    documentTree: false,
                },
                maxLayersPerRepetition: 2,
                maxTotalDepth: 8,
                conceptLinkGroupPriority: 0.01,
                elementLinkGroupPriority: 0.05,
                treeChildGroupPriority: 0.16,
                treeParentGroupPriority: 0.20,
                treeSiblingBaseGroupPriority: 0.26,
                siblingDistancePenalty: 0.75,
                articleRootParentConductionProbability: 0.35,
                activationCarryDecay: 0.72,
                raceRandomness: 0.12,
            },
        },
        filterGroup: {
            enabled: false,
            groups: [],
        },
    },
    savedFilters: [],
    collectStats: true,
};

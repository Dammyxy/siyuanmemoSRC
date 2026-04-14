/**
 * Settings Types
 * 插件设置数据结构
 */

/** 存储键名 */
import { default_w } from 'ts-fsrs';

export const STORAGE_NAME = 'fsrs-config';
export const FSRS_WEIGHT_COUNT = default_w.length;
export const LEGACY_FSRS_V5 = 'fsrs-v5';
export const ACTIVE_FSRS_VERSION = 'fsrs-v6';
export const DEFAULT_FSRS_WEIGHTS: number[] = [...default_w];

function isFiniteNumberArray(value: unknown): value is number[] {
    return Array.isArray(value) && value.every(item => typeof item === 'number' && Number.isFinite(item));
}

function mapLegacySchedulerLiteral(value: unknown): unknown {
    if (typeof value !== 'string') {
        return value;
    }
    return value === LEGACY_FSRS_V5 ? ACTIVE_FSRS_VERSION : value;
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

export type SchedulerEngine = 'simple-fsrs' | 'sm2' | 'sm15' | 'a-factor-v2';

/** 🆕 调度器配置 */
export interface SchedulerConfig {
    defaultScheduler: 'fsrs-v6' | 'sm15' | 'a-factor-v2';

    // 按卡片类型配置（可选）
    topicScheduler?: 'a-factor-v2';  // Topic 固定使用 A-Factor v2
    itemScheduler?: 'fsrs-v6' | 'sm15';

    sm15?: {
        requestedFI: number;     // 遗忘指数 (0-100)
        intervalBase: number;    // 基础间隔（天）
    };
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

export interface AIPromptTextPair {
    run: string;
    followUp: string;
}

export interface AIPromptTemplates {
    tutor: AIPromptTextPair;
    explain: AIPromptTextPair;
    cardCandidate: AIPromptTextPair;
    cardCandidateCdf: AIPromptTextPair;
}

export interface AISettings {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    model: string;
    timeoutMs: number;
    temperature: number;
    defaultOutputLanguage: string;
    promptContractVersion: number;
    prompts: AIPromptTemplates;
    draftStorage: ConfiguredCaptureStorageSettings;
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

/** 🆕 Riff 集成配置 */
export interface RiffIntegrationConfig {
    /** 模式选择 */
    mode: 'advanced' | 'simple';
    
    /** 使用本地调度器 */
    useLocalScheduler: boolean;
    
    /** 增量同步配置 */
    incrementalSync: {
        /** 是否启用增量同步 */
        enabled: boolean;
        /** 触发时机 */
        triggers: Array<'plugin-start' | 'browser-open' | 'review-open'>;
        /** 是否使用黑名单过滤 */
        useBlacklist: boolean;
    };
    
    /** 全量同步配置 */
    fullSync: {
        /** 是否启用全量同步 */
        enabled: boolean;
        /** 同步间隔（毫秒） */
        interval: number;
        /** 是否清理黑名单 */
        cleanupBlacklist: boolean;
    };
    
    /** 删除同步配置 */
    deleteSync: {
        /** 是否启用删除同步 */
        enabled: boolean;
        /** 删除失败时是否使用黑名单作为后备 */
        useBlacklistFallback: boolean;
    };

    /** 多实例/多设备写冲突时的解决策略 */
    storageConflictResolution?: StorageConflictResolutionStrategy;
}

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
    
    // 🆕 Riff 集成配置
    riffIntegration?: RiffIntegrationConfig;

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
    ai: AISettings;
    queues: QueueSettings;

    // 保存的筛选器
    savedFilters: ReviewFilter[];

    // 统计
    collectStats: boolean;     // 收集统计数据
}

type IncrementalSyncTrigger = RiffIntegrationConfig['incrementalSync']['triggers'][number];

const LEGACY_INCREMENTAL_SYNC_TRIGGER_TRIPLET = ['plugin-start', 'browser-open', 'review-open'] as const;

function isIncrementalSyncTrigger(value: unknown): value is IncrementalSyncTrigger {
    return value === 'plugin-start' || value === 'browser-open' || value === 'review-open';
}

function isLegacyDefaultIncrementalSyncTriggerTriplet(
    triggers: readonly IncrementalSyncTrigger[]
): boolean {
    return triggers.length === LEGACY_INCREMENTAL_SYNC_TRIGGER_TRIPLET.length
        && triggers.every((trigger, index) => trigger === LEGACY_INCREMENTAL_SYNC_TRIGGER_TRIPLET[index]);
}

function normalizeIncrementalSyncTriggers(
    triggers: unknown
): { triggers: IncrementalSyncTrigger[]; changed: boolean } {
    const sourceTriggers = Array.isArray(triggers)
        ? triggers.filter(isIncrementalSyncTrigger)
        : DEFAULT_RIFF_CONFIG.incrementalSync.triggers;
    const dedupedTriggers = Array.from(new Set(sourceTriggers));
    const normalizedTriggers = isLegacyDefaultIncrementalSyncTriggerTriplet(dedupedTriggers)
        ? (['plugin-start'] as IncrementalSyncTrigger[])
        : dedupedTriggers;

    return {
        triggers: normalizedTriggers,
        changed: dedupedTriggers.length !== sourceTriggers.length
            || normalizedTriggers.length !== dedupedTriggers.length
            || normalizedTriggers.some((trigger, index) => trigger !== dedupedTriggers[index]),
    };
}

function normalizeStorageConflictResolution(
    value: unknown
): StorageConflictResolutionStrategy {
    return value === 'merge' || value === 'prefer-local' || value === 'prefer-remote'
        ? value
        : (DEFAULT_RIFF_CONFIG.storageConflictResolution || 'merge');
}

function normalizeRiffIntegrationConfig(
    config: RiffIntegrationConfig | undefined
): { config: RiffIntegrationConfig; changed: boolean } {
    const normalizedTriggers = normalizeIncrementalSyncTriggers(config?.incrementalSync?.triggers);
    const normalizedConfig: RiffIntegrationConfig = {
        ...DEFAULT_RIFF_CONFIG,
        ...(config || {}),
        incrementalSync: {
            ...DEFAULT_RIFF_CONFIG.incrementalSync,
            ...(config?.incrementalSync || {}),
            triggers: normalizedTriggers.triggers,
        },
        fullSync: {
            ...DEFAULT_RIFF_CONFIG.fullSync,
            ...(config?.fullSync || {}),
        },
        deleteSync: {
            ...DEFAULT_RIFF_CONFIG.deleteSync,
            ...(config?.deleteSync || {}),
        },
        storageConflictResolution: normalizeStorageConflictResolution(config?.storageConflictResolution),
    };

    const changed = !config
        || normalizedTriggers.changed
        || config.mode !== normalizedConfig.mode
        || config.useLocalScheduler !== normalizedConfig.useLocalScheduler
        || config.incrementalSync?.enabled !== normalizedConfig.incrementalSync.enabled
        || config.incrementalSync?.useBlacklist !== normalizedConfig.incrementalSync.useBlacklist
        || config.incrementalSync?.triggers?.length !== normalizedConfig.incrementalSync.triggers.length
        || config.incrementalSync?.triggers?.some((trigger, index) => trigger !== normalizedConfig.incrementalSync.triggers[index])
        || config.fullSync?.enabled !== normalizedConfig.fullSync.enabled
        || config.fullSync?.interval !== normalizedConfig.fullSync.interval
        || config.fullSync?.cleanupBlacklist !== normalizedConfig.fullSync.cleanupBlacklist
        || config.deleteSync?.enabled !== normalizedConfig.deleteSync.enabled
        || config.deleteSync?.useBlacklistFallback !== normalizedConfig.deleteSync.useBlacklistFallback
        || config.storageConflictResolution !== normalizedConfig.storageConflictResolution;

    return {
        config: normalizedConfig,
        changed,
    };
}

export function normalizePluginSettings(settings: PluginSettings): { settings: PluginSettings; changed: boolean } {
    let changed = false;
    const sourceProgressiveReading = settings.progressiveReading as (PluginSettings['progressiveReading'] & {
        dailyTraceEnabled?: boolean;
    }) | undefined;
    const sourceAi = settings.ai as (PluginSettings['ai'] & {
        promptProfiles?: unknown;
    }) | undefined;
    const { dailyTraceEnabled: _legacyDailyTraceEnabled, ...sourceProgressiveReadingWithoutLegacy } = sourceProgressiveReading || {};
    const { promptProfiles: _legacyPromptProfiles, ...sourceAiWithoutLegacy } = sourceAi || {};
    const aiPromptContractVersion = normalizeAIPromptContractVersion(sourceAiWithoutLegacy.promptContractVersion);
    const shouldResetAiPromptsToCurrentContract = aiPromptContractVersion < ACTIVE_AI_PROMPT_CONTRACT_VERSION;
    const normalizedRiffIntegration = normalizeRiffIntegrationConfig(settings.riffIntegration);
    const normalized: PluginSettings = {
        ...settings,
        fsrs: { ...settings.fsrs },
        scheduler: settings.scheduler ? { ...settings.scheduler } : settings.scheduler,
        riffIntegration: normalizedRiffIntegration.config,
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
            storage: normalizeConfiguredCaptureStorageSettings(
                sourceProgressiveReadingWithoutLegacy.storage,
                {
                    allowSourceChild: true,
                    fallback: DEFAULT_SETTINGS.progressiveReading.storage,
                },
            ),
        },
        ai: {
            ...DEFAULT_SETTINGS.ai,
            ...sourceAiWithoutLegacy,
            promptContractVersion: ACTIVE_AI_PROMPT_CONTRACT_VERSION,
            prompts: shouldResetAiPromptsToCurrentContract
                ? clonePromptTemplates(DEFAULT_AI_PROMPTS)
                : normalizeAIPromptTemplates(sourceAiWithoutLegacy.prompts),
            draftStorage: normalizeConfiguredCaptureStorageSettings(sourceAiWithoutLegacy.draftStorage, {
                allowSourceChild: false,
                fallback: DEFAULT_SETTINGS.ai.draftStorage,
            }),
        },
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

    if (normalized.scheduler) {
        const nextDefault = mapLegacySchedulerLiteral(normalized.scheduler.defaultScheduler);
        if (nextDefault !== normalized.scheduler.defaultScheduler) {
            normalized.scheduler.defaultScheduler = nextDefault as typeof normalized.scheduler.defaultScheduler;
            changed = true;
        }

        const nextItem = mapLegacySchedulerLiteral(normalized.scheduler.itemScheduler);
        if (nextItem !== normalized.scheduler.itemScheduler) {
            normalized.scheduler.itemScheduler = nextItem as typeof normalized.scheduler.itemScheduler;
            changed = true;
        }
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
        || settings.progressiveReading.storage?.mode !== normalized.progressiveReading.storage.mode
        || settings.progressiveReading.storage?.notebookId !== normalized.progressiveReading.storage.notebookId
        || (settings.progressiveReading.storage?.targetBlockId || '') !== normalized.progressiveReading.storage.targetBlockId
    ) {
        changed = true;
    }

    if (!settings.ai) {
        changed = true;
    } else {
        const normalizedAi = normalized.ai;
        if (
            sourceAi.enabled !== normalizedAi.enabled
            || sourceAi.baseUrl !== normalizedAi.baseUrl
            || sourceAi.apiKey !== normalizedAi.apiKey
            || sourceAi.model !== normalizedAi.model
            || sourceAi.timeoutMs !== normalizedAi.timeoutMs
            || sourceAi.temperature !== normalizedAi.temperature
            || sourceAi.defaultOutputLanguage !== normalizedAi.defaultOutputLanguage
            || normalizeAIPromptContractVersion(sourceAi.promptContractVersion) !== normalizedAi.promptContractVersion
            || !hasNormalizedPromptTemplateShape(sourceAi.prompts)
            || !arePromptTemplatesEqual(sourceAi.prompts, normalizedAi.prompts)
            || Object.prototype.hasOwnProperty.call(sourceAi, 'promptProfiles')
            || sourceAi.draftStorage?.mode !== normalizedAi.draftStorage.mode
            || sourceAi.draftStorage?.notebookId !== normalizedAi.draftStorage.notebookId
            || (sourceAi.draftStorage?.targetBlockId || '') !== normalizedAi.draftStorage.targetBlockId
        ) {
            changed = true;
        }
    }

    if (!settings.ui) {
        changed = true;
    } else {
        const sourceUi = settings.ui;
        const normalizedUi = normalized.ui;
        const hasReviewOpenInNewTabDefault = Object.prototype.hasOwnProperty.call(sourceUi, 'reviewOpenInNewTabByDefault');
        const hasReviewOpenFullscreenDefault = Object.prototype.hasOwnProperty.call(sourceUi, 'reviewOpenFullscreenByDefault');
        if (
            sourceUi.defaultMode !== normalizedUi.defaultMode
            || sourceUi.showTimer !== normalizedUi.showTimer
            || sourceUi.showProgress !== normalizedUi.showProgress
            || sourceUi.showStats !== normalizedUi.showStats
            || sourceUi.autoAdvance !== normalizedUi.autoAdvance
            || sourceUi.autoAdvanceDelay !== normalizedUi.autoAdvanceDelay
            || !hasReviewOpenInNewTabDefault
            || !hasReviewOpenFullscreenDefault
            || (sourceUi.reviewOpenInNewTabByDefault ?? DEFAULT_SETTINGS.ui.reviewOpenInNewTabByDefault) !== normalizedUi.reviewOpenInNewTabByDefault
            || (sourceUi.reviewOpenFullscreenByDefault ?? DEFAULT_SETTINGS.ui.reviewOpenFullscreenByDefault) !== normalizedUi.reviewOpenFullscreenByDefault
            || sourceUi.enableDebugLogs !== normalizedUi.enableDebugLogs
        ) {
            changed = true;
        }
    }

    if (normalizedRiffIntegration.changed) {
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

/** 默认 Riff 集成配置 */
export const DEFAULT_RIFF_CONFIG: RiffIntegrationConfig = {
    mode: 'advanced',
    useLocalScheduler: true,
    storageConflictResolution: 'merge',
    
    incrementalSync: {
        enabled: true,
        triggers: ['plugin-start'],  // 🆕 移除 review-open，避免打开复习界面时触发快速制卡检查
        useBlacklist: true
    },
    
    fullSync: {
        enabled: true,
        interval: 604800000,  // 🆕 7天（而不是24小时），减少频率但保持数据一致性
        cleanupBlacklist: true
    },
    
    deleteSync: {
        enabled: true,
        useBlacklistFallback: true
    }
};

export const ACTIVE_AI_PROMPT_CONTRACT_VERSION = 2;

export const DEFAULT_AI_PROMPTS: AIPromptTemplates = {
    tutor: {
        run: [
            '你是 SiyuanMemo 的 AI 导师。',
            '你的工作对象是“正在神经漫游中的现在的自己”。',
            '目标是帮助用户继续理解、继续辨析、继续连接，而不是过早替用户定稿。',
            '严格基于当前上下文、当前卡片、当前路径和当前材料回答；材料未说明就明确说“材料未说明”或“这里有不确定性”，不要脑补。',
            '如果当前处在神经漫游，请优先结合当前 round、focus、recent path、路径位置和激活来源来组织理解。',
            '除非用户明确要求，否则不要写成正式总结稿。',
        ].join('\n'),
        followUp: [
            '你是 SiyuanMemo 的 AI 导师，正在基于已有导师结果继续追问。',
            '你的工作对象是“正在神经漫游中的现在的自己”。',
            '请结合已给 structuredResult、最新 context 和用户最新问题，用简洁自然语言继续回答。',
            '不要输出 JSON，不要重复整份结构化结果，不要突然改写成正式总结。',
            '材料未说明就明确说“材料未说明”或“这里有不确定性”，不要脑补。',
        ].join('\n'),
    },
    explain: {
        run: [
            '你是一位擅长帮助学习者真正理解当前卡片的学习教练。',
            '你的工作对象是“正在复习或理解这张卡片的现在的自己”，不是未来制卡系统。',
            '严格以当前卡片和当前材料为锚点；可以做少量必要的背景桥接，但凡超出材料直接支持的地方，必须明确说明“这是补充理解，不是材料原文直接说明”。',
            '不要把回答写成百科条目，不要空泛复述术语。解释的目标是下次想得起来、分得清、用得上。',
            '如果当前卡是阅读型 topic / concept，请把它当作理解节点，而不是问答卡；如果当前卡是检索型卡片，可以先用一句话点明答案或工作定义，但不要整段重复答案。',
        ].join('\n'),
        followUp: [
            '你是一位学习教练，正在基于已有解释结果继续追问。',
            '请结合 structuredResult、最新 context 和用户最新问题，用简洁自然语言继续解释。',
            '延续“工作定义 / 边界 / 因果 / 触发器”的风格，不要输出 JSON，不要重复整份结构化结果。',
            '超出材料直接支持的地方，必须明确说明“这是补充理解，不是材料原文直接说明”。',
        ].join('\n'),
    },
    cardCandidate: {
        run: [
            '你是一位擅长把知识转化为“可理解、可回忆、可应用”的学习教练。',
            '你的任务不是直接复述材料，而是先建立结构化理解，再把关键点压缩成少而精的高质量候选卡。',
            '优先提取边界、关系、作用、适用场景、常见误解；不重要的视角可以判断为当前不关键，不要硬凑。',
            '候选卡默认目标区间是 6-10 张，但这是理想区间，不是硬指标。材料不够清楚、卡点不够稳定时，宁可少出，也不要硬凑；必要时允许只输出 0-3 张真正值得复习的候选。',
            '卡片质量标准：一题只测一个点；问法具体不空泛；答案短且稳定；需要回忆；不能靠题面直接猜出来。',
            '优先产出辨析、因果、应用、边界、触发器类候选；纯定义复述题只保留少数真正关键的锚点。',
            '如果材料没说清楚，请明确写“材料未说明”或“这里有不确定性”，不要脑补。',
        ].join('\n'),
        followUp: [
            '你正在回答 AI 辅助制卡候选上的追问。',
            '请基于已有候选结果、最新 context 和用户问题，用简洁自然语言直接回答。',
            '可以解释为什么这样拆、哪些候选该删、怎样收窄成更稳的少数卡。',
            '不要输出 JSON，不要重新生成整批候选，除非用户明确要求重新生成。',
        ].join('\n'),
    },
    cardCandidateCdf: {
        run: [
            '你正在执行 CDF 辅助制卡。',
            'CDF 指概念描述符框架：先找概念锚点与稳定定义，再从材料中抽取可复用的描述维度，帮助未来复习时稳定回忆同一个知识点。',
            '先在内部完成这件事：1. 找出材料里的核心概念或少数概念锚点；2. 为每个概念提炼一句稳定定义；3. 从材料里抽取高价值描述维度，例如边界、特征、机制、条件、证据、对比、例子、用途、影响；4. 只保留真正值得复习且能稳定提问的维度。',
            '优先输出能落到概念定义卡和概念描述符卡上的候选；描述符要尽量短、稳、可复用，不要把整段原文塞进字段。',
            '材料未说明的维度不要脑补，可以明确写“材料未说明”或直接放弃该候选。',
            '质量优先，宁可少出，也不要凑数；必要时只输出 0-5 张真正成立的候选。',
        ].join('\n'),
        followUp: [
            '你正在回答 CDF 辅助制卡结果上的追问。',
            '请基于已有候选结果、最新 context 和用户问题，用简洁自然语言继续说明概念锚点、描述维度、删减理由或更稳的模板选择。',
            '不要输出 JSON，不要整批重生成，除非用户明确要求重新生成。',
        ].join('\n'),
    },
};

function clonePromptPair(pair: AIPromptTextPair): AIPromptTextPair {
    return {
        run: pair.run,
        followUp: pair.followUp,
    };
}

function clonePromptTemplates(templates: AIPromptTemplates): AIPromptTemplates {
    return {
        tutor: clonePromptPair(templates.tutor),
        explain: clonePromptPair(templates.explain),
        cardCandidate: clonePromptPair(templates.cardCandidate),
        cardCandidateCdf: clonePromptPair(templates.cardCandidateCdf),
    };
}

export function normalizeAIPromptContractVersion(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.floor(numeric));
}

function normalizePromptText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isPromptPairLike(value: unknown): value is Partial<AIPromptTextPair> {
    return typeof value === 'object' && value !== null;
}

function normalizePromptPair(
    settingKey: keyof AIPromptTemplates,
    source: unknown,
): AIPromptTextPair {
    const defaults = DEFAULT_AI_PROMPTS[settingKey];

    if (typeof source === 'string') {
        return {
            run: normalizePromptText(source),
            followUp: defaults.followUp,
        };
    }

    if (isPromptPairLike(source)) {
        const hasRun = Object.prototype.hasOwnProperty.call(source, 'run');
        const hasFollowUp = Object.prototype.hasOwnProperty.call(source, 'followUp');
        return {
            run: hasRun ? normalizePromptText(source.run) : defaults.run,
            followUp: hasFollowUp ? normalizePromptText(source.followUp) : defaults.followUp,
        };
    }

    return clonePromptPair(defaults);
}

export function normalizeAIPromptTemplates(prompts: unknown): AIPromptTemplates {
    const source = typeof prompts === 'object' && prompts !== null
        ? prompts as Partial<Record<keyof AIPromptTemplates, unknown>>
        : undefined;

    return {
        tutor: normalizePromptPair('tutor', source?.tutor),
        explain: normalizePromptPair('explain', source?.explain),
        cardCandidate: normalizePromptPair('cardCandidate', source?.cardCandidate),
        cardCandidateCdf: normalizePromptPair('cardCandidateCdf', source?.cardCandidateCdf),
    };
}

function hasNormalizedPromptTemplateShape(prompts: unknown): boolean {
    if (typeof prompts !== 'object' || prompts === null) {
        return false;
    }

    const source = prompts as Partial<Record<keyof AIPromptTemplates, unknown>>;
    return ['tutor', 'explain', 'cardCandidate', 'cardCandidateCdf'].every((key) => {
        const value = source[key as keyof AIPromptTemplates];
        return typeof value === 'object'
            && value !== null
            && typeof (value as Partial<AIPromptTextPair>).run === 'string'
            && typeof (value as Partial<AIPromptTextPair>).followUp === 'string';
    });
}

function arePromptTemplatesEqual(left: unknown, right: unknown): boolean {
    const normalizedLeft = normalizeAIPromptTemplates(left);
    const normalizedRight = normalizeAIPromptTemplates(right);
    return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}

export const DEFAULT_AI_SETTINGS: AISettings = {
    enabled: false,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4.1-mini',
    timeoutMs: 30000,
    temperature: 0.3,
    defaultOutputLanguage: 'zh-CN',
    promptContractVersion: ACTIVE_AI_PROMPT_CONTRACT_VERSION,
    prompts: DEFAULT_AI_PROMPTS,
    draftStorage: {
        mode: 'daily-note',
        notebookId: '',
        targetBlockId: '',
    },
};

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
        sm15: {
            requestedFI: 10,
            intervalBase: 1,
        },
    },
    riffIntegration: DEFAULT_RIFF_CONFIG,
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
        storage: {
            mode: 'source-child',
            notebookId: '',
            targetBlockId: '',
        },
    },
    ai: DEFAULT_AI_SETTINGS,
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

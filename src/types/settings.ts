/**
 * Settings Types
 * 插件设置数据结构
 */

/** 存储键名 */
import { default_w } from 'ts-fsrs';
import type {
    AIConceptCoachSelfTestCreationMode,
    AIGenericStructuredRendererKind,
    AIUserSkillDefinition,
    AIUserSkillSectionDefinition,
} from '@/types/ai';

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

export interface AIConceptCoachPromptTemplates {
    baseRun: string;
    tabs: {
        'working-definition': AIPromptTextPair;
        perspectives: AIPromptTextPair;
        'integrated-understanding': AIPromptTextPair;
        'self-test-cards': AIPromptTextPair;
        'real-world-triggers': AIPromptTextPair;
    };
}

export interface AIPromptTemplates {
    skills: {
        conceptCoach: AIConceptCoachPromptTemplates;
    };
    /**
     * @deprecated Legacy explain prompt slot. Normalization migrates it to the skill prompt contract.
     */
    explain?: AIPromptTextPair;
}

export type AIProviderProtocol = 'openai-compatible' | 'openai' | 'claude' | 'gemini';
export type AIWebSearchBackend = 'none' | 'tavily' | 'bocha' | 'google-cse';
export type AIToolGroupKey =
    | 'context-read'
    | 'siyuan-read'
    | 'review-read'
    | 'flashcard-write'
    | 'web'
    | 'vars';
export type AIToolExecutionPolicy = 'auto' | 'ask-once' | 'ask-always';
export type AIToolResultApprovalPolicy = 'never' | 'on-error' | 'always';

export interface AIModelCapabilityFlags {
    chatCompletions?: boolean;
    structuredOutput?: boolean;
    jsonObject?: boolean;
    tools?: boolean;
    streaming?: boolean;
    reasoning?: boolean;
    unstableJsonObject?: boolean;
}

export interface AIModelConfig {
    id: string;
    label?: string;
    capabilities?: AIModelCapabilityFlags;
}

export interface AIProviderEndpointConfig {
    chatCompletions?: string;
    messages?: string;
    generateContent?: string;
}

export interface AIProviderConfig {
    id: string;
    name: string;
    protocol: AIProviderProtocol;
    baseUrl: string;
    apiKey: string;
    endpoints?: AIProviderEndpointConfig;
    models: AIModelConfig[];
    capabilities: AIModelCapabilityFlags;
}

export interface AIChatDefaults {
    defaultSkillId: 'general-chat' | 'concept-coach';
    reviewDefaultSkillId: 'general-chat' | 'concept-coach';
    maxToolRounds: number;
    stream: boolean;
    includeContextByDefault: boolean;
}

export interface AIWebSearchSettings {
    backend: AIWebSearchBackend;
    apiKey: string;
    baseUrl?: string;
    googleCseId?: string;
}

export interface AIConceptCoachSelfTestSettings {
    defaultCreationMode: AIConceptCoachSelfTestCreationMode;
}

export interface AIConceptCoachSettings {
    selfTest: AIConceptCoachSelfTestSettings;
}

export interface AIToolPolicySettings {
    groupDefaults: Record<AIToolGroupKey, boolean>;
    toolDefaults: Partial<Record<string, boolean>>;
    executionPolicies: Partial<Record<string, AIToolExecutionPolicy>>;
    resultApprovalPolicies: Partial<Record<string, AIToolResultApprovalPolicy>>;
}

export interface AISettings {
    enabled: boolean;
    providers: AIProviderConfig[];
    defaultModelId: string;
    chatDefaults: AIChatDefaults;
    conceptCoach: AIConceptCoachSettings;
    webSearch: AIWebSearchSettings;
    toolPolicies: AIToolPolicySettings;
    skillPromptOverrides: Record<string, string>;
    userSkills: AIUserSkillDefinition[];
    /**
     * @deprecated Legacy single-provider field. Normalization migrates it to providers[].
     */
    baseUrl: string;
    /**
     * @deprecated Legacy single-provider field. Normalization migrates it to providers[].
     */
    apiKey: string;
    /**
     * @deprecated Legacy single-provider field. Normalization migrates it to providers[] / defaultModelId.
     */
    model: string;
    timeoutMs: number;
    temperature: number;
    defaultOutputLanguage: string;
    promptContractVersion: number;
    prompts: AIPromptTemplates;
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
        triggers: Array<'plugin-start' | 'browser-open'>;
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
type LegacyIncrementalSyncTrigger = typeof LEGACY_INCREMENTAL_SYNC_TRIGGER_TRIPLET[number];

function isIncrementalSyncTrigger(value: unknown): value is IncrementalSyncTrigger {
    return value === 'plugin-start' || value === 'browser-open';
}

function isLegacyDefaultIncrementalSyncTriggerTriplet(
    triggers: readonly unknown[]
): boolean {
    return triggers.length === LEGACY_INCREMENTAL_SYNC_TRIGGER_TRIPLET.length
        && triggers.every((trigger, index) => trigger === LEGACY_INCREMENTAL_SYNC_TRIGGER_TRIPLET[index]);
}

function normalizeIncrementalSyncTriggers(
    triggers: unknown
): { triggers: IncrementalSyncTrigger[]; changed: boolean } {
    const rawTriggers = Array.isArray(triggers)
        ? triggers
        : DEFAULT_RIFF_CONFIG.incrementalSync.triggers;
    const sourceTriggers = rawTriggers.filter(isIncrementalSyncTrigger);
    const dedupedTriggers = Array.from(new Set(sourceTriggers));
    const normalizedTriggers = isLegacyDefaultIncrementalSyncTriggerTriplet(rawTriggers as readonly LegacyIncrementalSyncTrigger[])
        ? (['plugin-start'] as IncrementalSyncTrigger[])
        : dedupedTriggers;

    return {
        triggers: normalizedTriggers,
        changed: rawTriggers.length !== sourceTriggers.length
            || dedupedTriggers.length !== sourceTriggers.length
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
        draftStorage?: unknown;
    }) | undefined;
    const { dailyTraceEnabled: _legacyDailyTraceEnabled, ...sourceProgressiveReadingWithoutLegacy } = sourceProgressiveReading || {};
    const {
        promptProfiles: _legacyPromptProfiles,
        draftStorage: _legacyDraftStorage,
        ...sourceAiWithoutLegacy
    } = sourceAi || {};
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
        ai: normalizeAISettings({
            ...sourceAiWithoutLegacy,
            prompts: shouldResetAiPromptsToCurrentContract
                ? clonePromptTemplates(DEFAULT_AI_PROMPTS)
                : sourceAiWithoutLegacy.prompts,
        }),
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
        const sourceAiNormalized = normalizeAISettings({
            ...sourceAiWithoutLegacy,
            prompts: shouldResetAiPromptsToCurrentContract
                ? clonePromptTemplates(DEFAULT_AI_PROMPTS)
                : sourceAiWithoutLegacy.prompts,
        });
        if (
            JSON.stringify(sourceAiNormalized) !== JSON.stringify(normalizedAi)
            || normalizeAIPromptContractVersion(sourceAi.promptContractVersion) !== normalizedAi.promptContractVersion
            || !hasNormalizedPromptTemplateShape(sourceAi.prompts)
            || !arePromptTemplatesEqual(sourceAi.prompts, normalizedAi.prompts)
            || Object.prototype.hasOwnProperty.call(sourceAi, 'promptProfiles')
            || Object.prototype.hasOwnProperty.call(sourceAi, 'draftStorage')
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
        interval: 86400000,  // 24小时：删除检测只由 full reconcile 执行
        cleanupBlacklist: true
    },
    
    deleteSync: {
        enabled: true,
        useBlacklistFallback: true
    }
};

export const ACTIVE_AI_PROMPT_CONTRACT_VERSION = 3;

export const DEFAULT_AI_PROMPTS: AIPromptTemplates = {
    skills: {
        conceptCoach: {
            baseRun: [
                '你是一位擅长把知识转化为“可理解、可回忆、可应用”的学习教练。',
                '我会给你一个概念、一张卡片，或一段解释该概念的材料。你的任务不是只给出定义，而是帮助我建立结构化理解，并把关键内容转成可自测的高质量问答。',
                '总原则：不要只做百科定义复述；优先提取边界、关系、作用、适用场景、常见误解；材料没说清楚的地方写“材料未说明”或“这里有不确定性”，不要脑补。',
                '所有自测题尽量满足：一题只测一个点，问法具体，答案短、稳定、可重复，需要回忆，不能靠题面直接猜出来。',
                '用清楚、具体、少术语的中文。一旦出现抽象表述，立刻补一个具体例子。目标是下次能想起来、分得清、用得上。',
            ].join('\n'),
            tabs: {
                'working-definition': {
                    run: [
                        '阶段：工作定义。',
                        '用 1-2 句话给出概念的工作定义，不追求百科式完整，追求抓住本质、便于理解和使用。',
                    ].join('\n'),
                    followUp: '你正在围绕“工作定义”继续解释。请结合当前 tab 结果、完整 skill 结果、上下文和用户问题，用自然语言回答；不要输出 JSON。',
                },
                perspectives: {
                    run: [
                        '阶段：多视角理解。',
                        '从五个视角抽取概念知识：特性和倾向、辨析异同、部分和整体、因果关系、意义和影响。',
                        '每个视角都要具体，若某个视角当前不关键，请明确说明“此视角当前不关键”，不要硬凑。',
                    ].join('\n'),
                    followUp: '你正在围绕“多视角理解”继续解释。请优先回答用户点名的视角；没有点名时，结合五个视角综合回答。不要输出 JSON。',
                },
                'integrated-understanding': {
                    run: [
                        '阶段：整合理解。',
                        '基于工作定义和多视角理解，输出这个概念到底是什么、它不是什么、学会后应该能做到的三件事。',
                    ].join('\n'),
                    followUp: '你正在围绕“整合理解”继续解释。请帮助用户把零散视角压缩成能复述、能辨析、能应用的理解；不要输出 JSON。',
                },
                'self-test-cards': {
                    run: [
                        '阶段：生成可直接制卡的自测草稿。',
                        '根据当前自测制卡模式，生成 10-18 个可直接落地为对应块结构的草稿。',
                        '每个草稿只测试一个点，优先测试区别、因果、应用、反例、边界，少做纯定义复述。',
                    ].join('\n'),
                    followUp: '你正在围绕“自测卡片”继续协助。可以改写题目、解释某张卡为什么值得保留，或补充更好的候选卡；不要直接建卡。',
                },
                'real-world-triggers': {
                    run: [
                        '阶段：现实触发器。',
                        '输出 3 个以后遇到什么情况时应该想起这个概念的触发场景。触发器要具体、可识别、能迁移。',
                    ].join('\n'),
                    followUp: '你正在围绕“现实触发器”继续解释。请把概念连接到用户可能遇到的真实判断、行动或学习场景；不要输出 JSON。',
                },
            },
        },
    },
};

function clonePromptPair(pair: AIPromptTextPair): AIPromptTextPair {
    return {
        run: pair.run,
        followUp: pair.followUp,
    };
}

function cloneConceptCoachPromptTemplates(templates: AIConceptCoachPromptTemplates): AIConceptCoachPromptTemplates {
    return {
        baseRun: templates.baseRun,
        tabs: {
            'working-definition': clonePromptPair(templates.tabs['working-definition']),
            perspectives: clonePromptPair(templates.tabs.perspectives),
            'integrated-understanding': clonePromptPair(templates.tabs['integrated-understanding']),
            'self-test-cards': clonePromptPair(templates.tabs['self-test-cards']),
            'real-world-triggers': clonePromptPair(templates.tabs['real-world-triggers']),
        },
    };
}

function clonePromptTemplates(templates: AIPromptTemplates): AIPromptTemplates {
    return {
        skills: {
            conceptCoach: cloneConceptCoachPromptTemplates(templates.skills.conceptCoach),
        },
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
    defaults: AIPromptTextPair,
    source: unknown,
): AIPromptTextPair {

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

function normalizeConceptCoachPromptTemplates(source: unknown): AIConceptCoachPromptTemplates {
    const defaults = DEFAULT_AI_PROMPTS.skills.conceptCoach;
    const value = typeof source === 'object' && source !== null
        ? source as Partial<AIConceptCoachPromptTemplates>
        : {};
    const tabs = typeof value.tabs === 'object' && value.tabs !== null
        ? value.tabs as Partial<AIConceptCoachPromptTemplates['tabs']>
        : {};
    return {
        baseRun: normalizePromptText(value.baseRun) || defaults.baseRun,
        tabs: {
            'working-definition': normalizePromptPair(defaults.tabs['working-definition'], tabs['working-definition']),
            perspectives: normalizePromptPair(defaults.tabs.perspectives, tabs.perspectives),
            'integrated-understanding': normalizePromptPair(defaults.tabs['integrated-understanding'], tabs['integrated-understanding']),
            'self-test-cards': normalizePromptPair(defaults.tabs['self-test-cards'], tabs['self-test-cards']),
            'real-world-triggers': normalizePromptPair(defaults.tabs['real-world-triggers'], tabs['real-world-triggers']),
        },
    };
}

export function normalizeAIPromptTemplates(prompts: unknown): AIPromptTemplates {
    const source = typeof prompts === 'object' && prompts !== null
        ? prompts as Partial<AIPromptTemplates> & { conceptCoach?: unknown }
        : undefined;

    return {
        skills: {
            conceptCoach: normalizeConceptCoachPromptTemplates(
                source?.skills?.conceptCoach ?? source?.conceptCoach,
            ),
        },
    };
}

function hasNormalizedPromptTemplateShape(prompts: unknown): boolean {
    if (typeof prompts !== 'object' || prompts === null) {
        return false;
    }

    const source = prompts as Partial<AIPromptTemplates>;
    const conceptCoach = source.skills?.conceptCoach;
    if (typeof conceptCoach !== 'object' || conceptCoach === null || typeof conceptCoach.baseRun !== 'string') {
        return false;
    }
    const tabs = conceptCoach.tabs;
    return Boolean(tabs)
        && ['working-definition', 'perspectives', 'integrated-understanding', 'self-test-cards', 'real-world-triggers'].every((tabId) => {
            const pair = tabs[tabId as keyof typeof tabs];
            return typeof pair === 'object'
                && pair !== null
                && typeof pair.run === 'string'
                && typeof pair.followUp === 'string';
        });
}

function arePromptTemplatesEqual(left: unknown, right: unknown): boolean {
    const normalizedLeft = normalizeAIPromptTemplates(left);
    const normalizedRight = normalizeAIPromptTemplates(right);
    return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}

function normalizeAIProviderProtocol(value: unknown): AIProviderProtocol {
    if (value === 'openai' || value === 'claude' || value === 'gemini' || value === 'openai-compatible') {
        return value;
    }
    return 'openai-compatible';
}

function normalizeAIWebSearchBackend(value: unknown): AIWebSearchBackend {
    if (value === 'tavily' || value === 'bocha' || value === 'google-cse') {
        return value;
    }
    return 'none';
}

function normalizeToolExecutionPolicy(value: unknown, fallback: AIToolExecutionPolicy): AIToolExecutionPolicy {
    return value === 'auto' || value === 'ask-once' || value === 'ask-always'
        ? value
        : fallback;
}

function normalizeToolResultApprovalPolicy(value: unknown, fallback: AIToolResultApprovalPolicy): AIToolResultApprovalPolicy {
    return value === 'never' || value === 'on-error' || value === 'always'
        ? value
        : fallback;
}

function normalizeAIModelCapabilities(value: unknown): AIModelCapabilityFlags {
    const source = typeof value === 'object' && value !== null
        ? value as AIModelCapabilityFlags
        : {};
    return {
        chatCompletions: source.chatCompletions !== false,
        structuredOutput: source.structuredOutput !== false,
        jsonObject: source.jsonObject !== false,
        tools: source.tools !== false,
        streaming: source.streaming === true,
        reasoning: source.reasoning === true,
        unstableJsonObject: source.unstableJsonObject === true,
    };
}

function inferAIProviderId(baseUrl: string, model: string): string {
    const normalizedBaseUrl = String(baseUrl || '').toLowerCase();
    const normalizedModel = String(model || '').toLowerCase();
    if (normalizedBaseUrl.includes('deepseek.com') || normalizedModel.startsWith('deepseek-')) {
        return 'deepseek';
    }
    if (normalizedBaseUrl.includes('anthropic.com') || normalizedModel.startsWith('claude-')) {
        return 'anthropic';
    }
    if (normalizedBaseUrl.includes('generativelanguage.googleapis.com') || normalizedModel.startsWith('gemini-')) {
        return 'gemini';
    }
    if (normalizedBaseUrl.includes('openai.com')) {
        return 'openai';
    }
    return 'default';
}

function inferAIProviderName(providerId: string): string {
    switch (providerId) {
        case 'deepseek':
            return 'DeepSeek';
        case 'anthropic':
            return 'Anthropic Claude';
        case 'gemini':
            return 'Google Gemini';
        case 'openai':
            return 'OpenAI';
        default:
            return 'OpenAI Compatible';
    }
}

function inferAIProviderProtocol(providerId: string, baseUrl: string, model: string): AIProviderProtocol {
    const normalizedBaseUrl = String(baseUrl || '').toLowerCase();
    const normalizedModel = String(model || '').toLowerCase();
    if (providerId === 'anthropic' || normalizedBaseUrl.includes('anthropic.com') || normalizedModel.startsWith('claude-')) {
        return 'claude';
    }
    if (providerId === 'gemini' || normalizedBaseUrl.includes('generativelanguage.googleapis.com') || normalizedModel.startsWith('gemini-')) {
        return 'gemini';
    }
    if (providerId === 'openai') {
        return 'openai';
    }
    return 'openai-compatible';
}

function normalizeAIProviderConfig(value: unknown, fallback: AIProviderConfig): AIProviderConfig {
    const source = typeof value === 'object' && value !== null
        ? value as Partial<AIProviderConfig>
        : {};
    const baseUrl = String(source.baseUrl ?? fallback.baseUrl ?? '').trim();
    const fallbackModel = fallback.models[0]?.id || DEFAULT_AI_SETTINGS.model;
    const sourceModels = Array.isArray(source.models) ? source.models : fallback.models;
    const models = sourceModels
        .map((model): AIModelConfig | null => {
            const raw = typeof model === 'object' && model !== null ? model as Partial<AIModelConfig> : { id: String(model || '') };
            const id = String(raw.id || '').trim();
            if (!id) {
                return null;
            }
            const label = String(raw.label || '').trim();
            const normalized: AIModelConfig = {
                id,
                capabilities: normalizeAIModelCapabilities(raw.capabilities),
            };
            if (label) {
                normalized.label = label;
            }
            return normalized;
        })
        .filter((model): model is AIModelConfig => Boolean(model));
    if (models.length === 0 && fallbackModel) {
        models.push({
            id: fallbackModel,
            capabilities: normalizeAIModelCapabilities(fallback.capabilities),
        });
    }

    return {
        id: String(source.id || fallback.id || inferAIProviderId(baseUrl, models[0]?.id || '')).trim() || 'default',
        name: String(source.name || fallback.name || inferAIProviderName(fallback.id)).trim() || 'OpenAI Compatible',
        protocol: normalizeAIProviderProtocol(source.protocol ?? fallback.protocol),
        baseUrl,
        apiKey: String(source.apiKey ?? fallback.apiKey ?? '').trim(),
        endpoints: {
            ...(fallback.endpoints || {}),
            ...(source.endpoints || {}),
        },
        models,
        capabilities: {
            ...normalizeAIModelCapabilities(fallback.capabilities),
            ...normalizeAIModelCapabilities(source.capabilities),
        },
    };
}

function buildLegacyDefaultAIProvider(source: Partial<AISettings> | undefined): AIProviderConfig {
    const baseUrl = String(source?.baseUrl ?? DEFAULT_AI_SETTINGS.baseUrl).trim();
    const model = String(source?.model ?? DEFAULT_AI_SETTINGS.model).trim() || DEFAULT_AI_SETTINGS.model;
    const providerId = inferAIProviderId(baseUrl, model);
    return {
        id: providerId,
        name: inferAIProviderName(providerId),
        protocol: inferAIProviderProtocol(providerId, baseUrl, model),
        baseUrl,
        apiKey: String(source?.apiKey ?? DEFAULT_AI_SETTINGS.apiKey).trim(),
        endpoints: {},
        models: [{
            id: model,
            capabilities: {
                chatCompletions: true,
                structuredOutput: true,
                jsonObject: true,
                tools: true,
                streaming: false,
                reasoning: false,
                unstableJsonObject: providerId === 'deepseek',
            },
        }],
        capabilities: {
            chatCompletions: true,
            structuredOutput: true,
            jsonObject: true,
            tools: true,
            streaming: false,
            reasoning: false,
            unstableJsonObject: providerId === 'deepseek',
        },
    };
}

function hasMeaningfulLegacyAIProviderInput(source: Partial<AISettings>): boolean {
    const baseUrl = String(source.baseUrl ?? '').trim();
    const apiKey = String(source.apiKey ?? '').trim();
    const model = String(source.model ?? '').trim();
    return Boolean(
        apiKey
        || (baseUrl && baseUrl !== DEFAULT_AI_SETTINGS.baseUrl)
        || (model && model !== DEFAULT_AI_SETTINGS.model)
    );
}

function isDefaultEmptyAIProvider(provider: AIProviderConfig): boolean {
    const defaultProvider = DEFAULT_AI_SETTINGS.providers[0];
    return !provider.apiKey
        && provider.baseUrl === defaultProvider.baseUrl
        && provider.models.length === 1
        && provider.models[0]?.id === defaultProvider.models[0]?.id;
}

function normalizeAIChatDefaults(value: unknown): AIChatDefaults {
    const source = typeof value === 'object' && value !== null
        ? value as Partial<AIChatDefaults>
        : {};
    const defaultSkillId = source.defaultSkillId === 'concept-coach' ? 'concept-coach' : 'general-chat';
    const reviewDefaultSkillId = source.reviewDefaultSkillId === 'general-chat' ? 'general-chat' : 'concept-coach';
    const maxToolRounds = Math.max(1, Math.min(8, Math.floor(Number(source.maxToolRounds) || DEFAULT_AI_SETTINGS.chatDefaults.maxToolRounds)));
    return {
        defaultSkillId,
        reviewDefaultSkillId,
        maxToolRounds,
        stream: source.stream === true,
        includeContextByDefault: source.includeContextByDefault !== false,
    };
}

function normalizeAIWebSearchSettings(value: unknown): AIWebSearchSettings {
    const source = typeof value === 'object' && value !== null
        ? value as Partial<AIWebSearchSettings>
        : {};
    return {
        backend: normalizeAIWebSearchBackend(source.backend),
        apiKey: String(source.apiKey || '').trim(),
        baseUrl: String(source.baseUrl || '').trim(),
        googleCseId: String(source.googleCseId || '').trim(),
    };
}

function normalizeAIConceptCoachSelfTestCreationMode(
    value: unknown,
    fallback: AIConceptCoachSelfTestCreationMode = 'list-item',
): AIConceptCoachSelfTestCreationMode {
    return value === 'mark'
        || value === 'heading'
        || value === 'super-block'
        || value === 'multi-mark'
        || value === 'cdf-multiline'
        || value === 'list-item'
        ? value
        : fallback;
}

function normalizeAIConceptCoachSettings(value: unknown): AIConceptCoachSettings {
    const source = typeof value === 'object' && value !== null
        ? value as Partial<AIConceptCoachSettings>
        : {};
    const selfTest = typeof source.selfTest === 'object' && source.selfTest !== null
        ? source.selfTest as Partial<AIConceptCoachSelfTestSettings>
        : {};
    return {
        selfTest: {
            defaultCreationMode: normalizeAIConceptCoachSelfTestCreationMode(selfTest.defaultCreationMode),
        },
    };
}

function normalizeAIToolPolicySettings(value: unknown): AIToolPolicySettings {
    const source = typeof value === 'object' && value !== null
        ? value as Partial<AIToolPolicySettings>
        : {};
    const defaults = DEFAULT_AI_SETTINGS.toolPolicies;
    const sourceGroupDefaults = typeof source.groupDefaults === 'object' && source.groupDefaults !== null
        ? source.groupDefaults as Partial<Record<AIToolGroupKey, boolean>>
        : {};
    const executionPolicies = typeof source.executionPolicies === 'object' && source.executionPolicies !== null
        ? source.executionPolicies
        : {};
    const resultApprovalPolicies = typeof source.resultApprovalPolicies === 'object' && source.resultApprovalPolicies !== null
        ? source.resultApprovalPolicies
        : {};
    const toolDefaults = typeof source.toolDefaults === 'object' && source.toolDefaults !== null
        ? source.toolDefaults
        : {};

    return {
        groupDefaults: {
            ...defaults.groupDefaults,
            'context-read': sourceGroupDefaults['context-read'] !== false,
            'siyuan-read': sourceGroupDefaults['siyuan-read'] !== false,
            'review-read': sourceGroupDefaults['review-read'] !== false,
            'flashcard-write': sourceGroupDefaults['flashcard-write'] === true,
            web: sourceGroupDefaults.web !== false,
            vars: sourceGroupDefaults.vars !== false,
        },
        toolDefaults: Object.fromEntries(Object.entries(toolDefaults).map(([name, enabled]) => [
            name,
            enabled !== false,
        ])),
        executionPolicies: Object.fromEntries(Object.entries(executionPolicies).map(([name, policy]) => [
            name,
            normalizeToolExecutionPolicy(policy, defaults.executionPolicies[name] || 'auto'),
        ])),
        resultApprovalPolicies: Object.fromEntries(Object.entries(resultApprovalPolicies).map(([name, policy]) => [
            name,
            normalizeToolResultApprovalPolicy(policy, defaults.resultApprovalPolicies[name] || 'never'),
        ])),
    };
}

const AI_USER_SKILL_TOOL_GROUPS: AIToolGroupKey[] = [
    'context-read',
    'siyuan-read',
    'review-read',
    'web',
    'vars',
    'flashcard-write',
];
const AI_USER_SKILL_RENDERERS: AIGenericStructuredRendererKind[] = ['markdown', 'list', 'cards', 'keyValue'];
const AI_RESERVED_SKILL_IDS = new Set(['general-chat', 'concept-coach']);

function normalizeSlug(value: unknown, fallback: string): string {
    const normalized = String(value || '')
        .trim()
        .replace(/^user:/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
    return normalized || fallback;
}

function normalizeResponseKey(value: unknown, fallback: string): string {
    const normalized = String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9_$-]+/g, '')
        .slice(0, 64);
    return normalized || fallback;
}

function normalizeUserSkillToolGroups(value: unknown): AIToolGroupKey[] {
    const raw = Array.isArray(value) ? value : [];
    const groups = raw
        .map((entry) => String(entry || '').trim() as AIToolGroupKey)
        .filter((entry) => AI_USER_SKILL_TOOL_GROUPS.includes(entry));
    const unique = Array.from(new Set(groups));
    return unique.length > 0 ? unique : ['context-read', 'vars'];
}

function normalizeUserSkillRenderer(value: unknown): AIGenericStructuredRendererKind {
    return AI_USER_SKILL_RENDERERS.includes(value as AIGenericStructuredRendererKind)
        ? value as AIGenericStructuredRendererKind
        : 'markdown';
}

function normalizeAIUserSkillSections(value: unknown, _skillSlug: string): AIUserSkillSectionDefinition[] {
    const rawSections = Array.isArray(value) ? value : [];
    const usedIds = new Set<string>();
    return rawSections
        .map((entry, index): AIUserSkillSectionDefinition | null => {
            const source = typeof entry === 'object' && entry !== null
                ? entry as Partial<AIUserSkillSectionDefinition>
                : {};
            let id = normalizeSlug(source.id, `section-${index + 1}`);
            if (usedIds.has(id)) {
                id = `${id}-${index + 1}`;
            }
            usedIds.add(id);
            const title = String(source.title || '').trim() || `Section ${index + 1}`;
            const responseKey = normalizeResponseKey(source.responseKey, id.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase()));
            return {
                id,
                title,
                emptyHint: String(source.emptyHint || '').trim() || '这个 section 暂时没有可展示内容。',
                runPrompt: String(source.runPrompt || '').trim() || `生成「${title}」部分。`,
                followUpPrompt: String(source.followUpPrompt || '').trim() || `基于「${title}」结果回答用户追问。`,
                responseKey,
                renderer: normalizeUserSkillRenderer(source.renderer),
                required: source.required !== false,
            };
        })
        .filter((section): section is AIUserSkillSectionDefinition => Boolean(section))
        .slice(0, 12);
}

export function normalizeAIUserSkills(value: unknown): AIUserSkillDefinition[] {
    const rawSkills = Array.isArray(value) ? value : [];
    const usedIds = new Set<string>();
    return rawSkills
        .map((entry, index): AIUserSkillDefinition | null => {
            if (typeof entry !== 'object' || entry === null) {
                return null;
            }
            const source = entry as Partial<AIUserSkillDefinition>;
            let slug = normalizeSlug(source.id, `skill-${index + 1}`);
            if (AI_RESERVED_SKILL_IDS.has(slug)) {
                slug = `${slug}-${index + 1}`;
            }
            if (usedIds.has(slug)) {
                slug = `${slug}-${index + 1}`;
            }
            usedIds.add(slug);
            const title = String(source.title || '').trim();
            const mode = source.mode === 'structured' ? 'structured' : 'chat';
            const sections = mode === 'structured'
                ? normalizeAIUserSkillSections(source.sections, slug)
                : [];
            const hasUsableStructuredShape = mode === 'chat' || sections.length > 0;
            return {
                id: slug,
                title: title || '未命名 Skill',
                brief: String(source.brief || '').trim(),
                enabled: source.enabled !== false && Boolean(title) && hasUsableStructuredShape,
                mode,
                systemPromptTemplate: String(source.systemPromptTemplate || '').trim()
                    || '你是思源笔记里的学习助手。请基于当前上下文、用户补充材料和可用工具，给出准确、可执行的帮助。',
                composerPreset: String(source.composerPreset || '').trim() || '请基于当前上下文继续处理。',
                primaryActionLabel: String(source.primaryActionLabel || '').trim() || (mode === 'structured' ? '运行 Skill' : '开始聊天'),
                defaultToolGroups: normalizeUserSkillToolGroups(source.defaultToolGroups),
                sections,
                surfaceHints: typeof source.surfaceHints === 'object' && source.surfaceHints !== null
                    ? {
                        compactTitle: String(source.surfaceHints.compactTitle || '').trim(),
                        hideTabs: source.surfaceHints.hideTabs === true,
                        composerRows: Math.max(2, Math.min(10, Math.floor(Number(source.surfaceHints.composerRows) || (mode === 'chat' ? 5 : 4)))),
                    }
                    : {
                        hideTabs: mode === 'chat',
                        composerRows: mode === 'chat' ? 5 : 4,
                    },
                version: Math.max(1, Math.floor(Number(source.version) || 1)),
            };
        })
        .filter((skill): skill is AIUserSkillDefinition => Boolean(skill))
        .slice(0, 30);
}

export function normalizeAISettings(source: unknown): AISettings {
    const value = typeof source === 'object' && source !== null
        ? source as Partial<AISettings> & { promptProfiles?: unknown; draftStorage?: unknown }
        : {};
    const legacyProvider = buildLegacyDefaultAIProvider(value);
    const hasProviderList = Array.isArray(value.providers) && value.providers.length > 0;
    const normalizedInputProviders = hasProviderList
        ? value.providers
            .map((provider, index) => normalizeAIProviderConfig(provider, index === 0 ? legacyProvider : DEFAULT_AI_SETTINGS.providers[0]))
            .filter((provider) => provider.id && provider.baseUrl)
        : [];
    const shouldPreferLegacyProvider = hasMeaningfulLegacyAIProviderInput(value)
        && (
            normalizedInputProviders.length === 0
            || normalizedInputProviders.every((provider) => !provider.apiKey)
            || (normalizedInputProviders.length === 1 && isDefaultEmptyAIProvider(normalizedInputProviders[0]))
        );
    const rawProviders = shouldPreferLegacyProvider
        ? [legacyProvider]
        : hasProviderList
        ? value.providers
        : [legacyProvider];
    const providers = rawProviders
        .map((provider, index) => normalizeAIProviderConfig(provider, index === 0 ? legacyProvider : DEFAULT_AI_SETTINGS.providers[0]))
        .filter((provider) => provider.id && provider.baseUrl);
    if (providers.length === 0) {
        providers.push(legacyProvider);
    }

    const defaultProvider = providers[0];
    const defaultModelId = String(
        shouldPreferLegacyProvider
            ? legacyProvider.models[0]?.id || value.model || value.defaultModelId
            : value.defaultModelId || value.model || defaultProvider.models[0]?.id || DEFAULT_AI_SETTINGS.model
    ).trim();
    const modelExists = providers.some((provider) => provider.models.some((model) => model.id === defaultModelId));
    if (!modelExists && defaultModelId) {
        defaultProvider.models.unshift({
            id: defaultModelId,
            capabilities: normalizeAIModelCapabilities(defaultProvider.capabilities),
        });
    }

    const activeProvider = providers.find((provider) => provider.models.some((model) => model.id === defaultModelId)) || defaultProvider;
    return {
        enabled: value.enabled === true,
        providers,
        defaultModelId: defaultModelId || activeProvider.models[0]?.id || DEFAULT_AI_SETTINGS.model,
        chatDefaults: normalizeAIChatDefaults(value.chatDefaults),
        conceptCoach: normalizeAIConceptCoachSettings(value.conceptCoach),
        webSearch: normalizeAIWebSearchSettings(value.webSearch),
        toolPolicies: normalizeAIToolPolicySettings(value.toolPolicies),
        skillPromptOverrides: typeof value.skillPromptOverrides === 'object' && value.skillPromptOverrides !== null
            ? Object.fromEntries(Object.entries(value.skillPromptOverrides).map(([key, prompt]) => [key, String(prompt || '')]))
            : {},
        userSkills: normalizeAIUserSkills(value.userSkills),
        baseUrl: activeProvider.baseUrl,
        apiKey: activeProvider.apiKey,
        model: defaultModelId || activeProvider.models[0]?.id || DEFAULT_AI_SETTINGS.model,
        timeoutMs: Math.max(1000, Number(value.timeoutMs) || DEFAULT_AI_SETTINGS.timeoutMs),
        temperature: Math.min(2, Math.max(0, Number(value.temperature) || DEFAULT_AI_SETTINGS.temperature)),
        defaultOutputLanguage: String(value.defaultOutputLanguage || DEFAULT_AI_SETTINGS.defaultOutputLanguage).trim(),
        promptContractVersion: ACTIVE_AI_PROMPT_CONTRACT_VERSION,
        prompts: normalizeAIPromptTemplates(value.prompts),
    };
}

export const DEFAULT_AI_SETTINGS: AISettings = {
    enabled: false,
    providers: [{
        id: 'openai',
        name: 'OpenAI',
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        endpoints: {},
        models: [{
            id: 'gpt-4.1-mini',
            capabilities: {
                chatCompletions: true,
                structuredOutput: true,
                jsonObject: true,
                tools: true,
                streaming: false,
                reasoning: false,
                unstableJsonObject: false,
            },
        }],
        capabilities: {
            chatCompletions: true,
            structuredOutput: true,
            jsonObject: true,
            tools: true,
            streaming: false,
            reasoning: false,
            unstableJsonObject: false,
        },
    }],
    defaultModelId: 'gpt-4.1-mini',
    chatDefaults: {
        defaultSkillId: 'general-chat',
        reviewDefaultSkillId: 'concept-coach',
        maxToolRounds: 4,
        stream: false,
        includeContextByDefault: true,
    },
    conceptCoach: {
        selfTest: {
            defaultCreationMode: 'list-item',
        },
    },
    webSearch: {
        backend: 'none',
        apiKey: '',
        baseUrl: '',
        googleCseId: '',
    },
    toolPolicies: {
        groupDefaults: {
            'context-read': true,
            'siyuan-read': true,
            'review-read': true,
            'flashcard-write': false,
            web: true,
            vars: true,
        },
        toolDefaults: {},
        executionPolicies: {},
        resultApprovalPolicies: {},
    },
    skillPromptOverrides: {},
    userSkills: [],
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4.1-mini',
    timeoutMs: 30000,
    temperature: 0.3,
    defaultOutputLanguage: 'zh-CN',
    promptContractVersion: ACTIVE_AI_PROMPT_CONTRACT_VERSION,
    prompts: DEFAULT_AI_PROMPTS,
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

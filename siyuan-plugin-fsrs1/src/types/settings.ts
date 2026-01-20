/**
 * Settings Types
 * 插件设置数据结构
 */

/** FSRS 算法参数 */
export interface FSRSParameters {
    requestRetention: number;  // 期望保留率 0.7-0.99，默认 0.9
    maximumInterval: number;   // 最大间隔天数，默认 36500
    weights: number[];         // 19 个权重参数
    enableFuzz: boolean;       // 启用模糊化
    enableShortTerm: boolean;  // 启用短期调度器
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
}

/** 增量阅读设置 */
export interface IncrementalSettings {
    enabled: boolean;
    defaultPriority: number;   // 新增量内容默认优先级
    extractPriority: number;   // 摘录卡片默认优先级
    autoAddToQueue: boolean;   // 自动加入复习队列
}

/** 机械练习设置 */
export interface DrillSettings {
    enabled: boolean;
    maxCards: number;          // 单次练习最大卡片数
    shuffleCards: boolean;     // 随机打乱顺序
}

/** 插件完整设置 */
export interface PluginSettings {
    // FSRS 算法
    fsrs: FSRSParameters;

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
    drill: DrillSettings;

    // 保存的筛选器
    savedFilters: ReviewFilter[];

    // 统计
    collectStats: boolean;     // 收集统计数据
}

/** 默认设置 */
export const DEFAULT_SETTINGS: PluginSettings = {
    fsrs: {
        requestRetention: 0.9,
        maximumInterval: 36500,
        weights: [
            0.40255, 1.18385, 3.173, 15.69105,
            7.1949, 0.5345, 1.4604, 0.0046,
            1.54575, 0.1192, 1.01925, 1.9395,
            0.11, 0.29605, 2.2698, 0.2315,
            2.9898, 0.51655, 0.6621
        ],
        enableFuzz: true,
        enableShortTerm: true,
    },
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
    },
    incremental: {
        enabled: true,
        defaultPriority: 30,
        extractPriority: 40,
        autoAddToQueue: true,
    },
    drill: {
        enabled: true,
        maxCards: 50,
        shuffleCards: true,
    },
    savedFilters: [],
    collectStats: true,
};

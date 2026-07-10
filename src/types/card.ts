/**
 * FSRS Card Types
 * 基于 FSRS v6 算法的卡片数据结构
 */

import type { RescheduleHistoryEntry } from './reschedule';

/** 卡片状态 */
export enum CardState {
    New = 0,        // 新卡片
    Learning = 1,   // 学习中
    Review = 2,     // 复习阶段
    Relearning = 3, // 重新学习
    Suspended = 4,  // 暂停
}

/** 卡片类型 */
export enum CardType {
    Item = 'item',               // 普通闪卡（基于块）
    Topic = 'topic',             // 主题（增量阅读）
    Concept = 'concept',         // 概念卡（使用 FSRS 调度器）
    Descriptor = 'descriptor',   // 描述符卡（使用 FSRS 调度器）
    /** @deprecated Use Item or Topic instead */
    Incremental = 'incremental',
    /** @deprecated Use Item or Topic instead */
    Webpage = 'webpage',
}

/** 评分 */
export enum Rating {
    Again = 1, // 完全忘记
    Hard = 2,  // 有点难
    Good = 3,  // 一般
    Easy = 4,  // 很简单
}

/**
 * Stable locator for a schedulable card derived from a Xiuyuan.
 *
 * `ruleId` identifies the card-generation rule on the CardTypeDefinition.
 * `faceIndex` identifies a Xiuyuan face/list/cloze item when one rule produces
 * more than one schedulable card. It does not own front/back content.
 */
export interface CardFaceKey {
    ruleId: string;
    faceIndex?: number;
}

/** FSRS 卡片核心数据 */
export interface FSRSCard {
    // === 标识 ===
    id: string;           // 卡片唯一 ID
    xiuyuanID: string;    // 关联的 Xiuyuan ID
    blockId: string;      // 关联的思源块 ID
    faceKey?: CardFaceKey; // 稳定复习实例定位器（ruleId + 可选 faceIndex）

    // === FSRS 核心字段 ===
    due: number;          // 下次复习时间戳 (ms)
    stability: number;    // 稳定性 (S)
    difficulty: number;   // 难度 (D) 1-10
    reps: number;         // 复习次数
    lapses: number;       // 遗忘次数
    state: CardState;     // 卡片状态
    lastReview: number;   // 上次复习时间戳 (ms)
    elapsedDays: number;  // 距上次复习经过的天数
    scheduledDays: number; // 预定的间隔天数
    learning_step?: number; // 当前 learning step 索引 (0-based)，用于跟踪卡片在 learning steps 中的位置

    // === 扩展功能 ===
    priority: number;     // 优先级 0-100 (越小越优先)
    type: CardType;       // 卡片类型
    tags: string[];       // 标签
    cardTypeMarker?: 'concept' | 'descriptor';  // 卡片类型标记（用户层语义）
    neuralRoamSeed?: boolean;  // 是否为神经漫游种子

    // === 难点攻克 ===
    leechCount: number;   // 连续遗忘计数
    isLeech: boolean;     // 是否标记为难点

    // === 跳过/留言 ===
    skipped: boolean;     // 是否跳过
    skipNote?: string;    // 跳过原因/留言
    skipUntil?: number;   // 跳过到期时间

    // === 增量阅读 ===
    sourceUrl?: string;   // 来源网页 URL
    extractedFrom?: string; // 原始块 ID（如果是摘录）

    // === 元数据 ===
    createdAt: number;    // 创建时间戳
    updatedAt: number;    // 更新时间戳
    meta?: Record<string, unknown>;           // 扩展元数据 (for CardBuilder strategies)

    // === Topic/Item 区分 ===
    aFactor?: number;     // A-Factor (仅 Topic 卡片，1.2-6.0)

    // === 🆕 调度器相关字段 ===
    schedulerType?: 'fsrs-v6' | 'a-factor-v2' | 'riff' | string;
    riffCardId?: string;      // Riff 卡片 ID
    schedulerMeta?: {
        topic?: {
            afs: number[];           // A-Factor 历史（ImprovedTopicScheduler）
            of: number;              // O-Factor
            optimalInterval: number; // 最优间隔
        };
    };

    // === 🆕 重新调度相关字段 ===
    postponeCount?: number;        // 推迟次数
    lastPostponeDate?: number;     // 上次推迟时间戳
    rescheduleHistory?: RescheduleHistoryEntry[];  // 重新调度历史
}

/**
 * 网页卡片 - 用于渐进阅读
 */
export interface WebpageCard extends FSRSCard {
    type: CardType.Webpage;

    // === 网页信息 ===
    url: string;          // 网页 URL
    title: string;        // 网页标题
    favicon?: string;     // 网站图标

    // === 阅读进度 ===
    scrollPosition?: number;  // 滚动位置（百分比 0-100）
    readingTime?: number;     // 累计阅读时长（秒）
    lastReadAt?: number;      // 上次阅读时间戳

    // === 摘抄关联 ===
    extractIds?: string[];    // 关联的摘抄块 ID
    clozeIds?: string[];      // 关联的挖空闪卡 ID
}

/**
 * 创建新卡片的默认值
 * 
 * @deprecated 此函数已废弃，请使用 CardApplicationService.createCard() 或 CardCreationHelper
 * @see CardApplicationService.createCard()
 * @see CardCreationHelper
 * @throws {Error} 抛出 DeprecationError，提示使用新的 API
 * @example
 * // 旧代码（已废弃）
 * const card = createDefaultCard(blockId);
 * 
 * // 新代码（推荐）
 * const helper = new CardCreationHelper(cardService);
 * const result = await helper.createQuickCard(blockId);
 */
export function createDefaultCard(_blockId: string): FSRSCard {
    throw new Error(
        'DeprecationError: createDefaultCard() is deprecated. ' +
        'Please use CardApplicationService.createCard() or CardCreationHelper instead. ' +
        'See migration guide: .kiro/specs/xiuyuan-unification/04-implementation-plan.md'
    );
}

/**
 * 创建网页卡片
 * 
 * @deprecated Webpage 卡片类型已被移除，此函数已废弃
 * @throws {Error} 抛出 DeprecationError
 */
export function createWebpageCard(_url: string, _title: string): WebpageCard {
    throw new Error(
        'DeprecationError: createWebpageCard() is deprecated. ' +
        'Webpage card type has been removed in XiuYuan unification.'
    );
}

/** 判断是否为网页卡片 */
export function isWebpageCard(card: FSRSCard): card is WebpageCard {
    return card.type === CardType.Webpage;
}



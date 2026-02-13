/**
 * Card Migration Utilities
 * 卡片数据迁移工具
 * 
 * 用于处理卡片数据的向后兼容性和迁移逻辑。
 * 
 * @see .kiro/specs/learning-steps-rating-fix/requirements.md
 * @see .kiro/specs/learning-steps-rating-fix/design.md
 * @see .kiro/specs/supermemo-reschedule-operations/requirements.md (Requirement 18.7)
 * @see .kiro/specs/supermemo-reschedule-operations/design.md
 */

import { FSRSCard, CardState } from '../types/card';

/**
 * 迁移单个卡片数据
 * 
 * 确保卡片具有所有必需的字段，提供向后兼容性。
 * 
 * 主要功能：
 * - 为现有卡片添加默认 learning_step = 0（如果未定义）
 * - state 字段通常已存在，不需要推断
 * - 为现有卡片添加默认的 postponeCount = 0（如果未定义）
 * - 为现有卡片添加空的 rescheduleHistory（如果未定义）
 * - 确保向后兼容，不破坏现有数据
 * 
 * 注意：此函数会修改传入的卡片对象（in-place mutation）
 * 
 * @param card 原始卡片数据
 * @returns 迁移后的卡片数据（同一个对象引用）
 */
export function migrateCard(card: FSRSCard): FSRSCard {
    // 如果 learning_step 未定义，设置为 0
    if (card.learning_step === undefined) {
        card.learning_step = 0;
    }
    
    // state 字段通常已存在（从 riffCard 或 storage 读取）
    // 但为了完全向后兼容，如果缺失则根据 scheduledDays 推断
    if (card.state === undefined) {
        card.state = inferCardState(card);
    }
    
    // 🆕 SuperMemo 重新调度字段迁移
    // 为现有卡片添加默认的 postponeCount = 0
    if (card.postponeCount === undefined) {
        card.postponeCount = 0;
    }
    
    // 为现有卡片添加空的 rescheduleHistory
    if (card.rescheduleHistory === undefined) {
        card.rescheduleHistory = [];
    }
    
    // lastPostponeDate 保持为 undefined（只有在实际推迟后才设置）
    
    return card;
}

/**
 * 批量迁移卡片数据
 * 
 * 对卡片数组中的每张卡片应用迁移逻辑。
 * 
 * @param cards 原始卡片数组
 * @returns 迁移后的卡片数组
 */
export function migrateCards(cards: FSRSCard[]): FSRSCard[] {
    return cards.map(card => migrateCard(card));
}

/**
 * 根据 scheduledDays 推断卡片状态
 * 
 * 仅在 state 字段缺失时使用（向后兼容）。
 * 
 * 推断规则：
 * - scheduledDays === 0: New（新卡片）
 * - scheduledDays < 1: Learning（学习中）
 * - scheduledDays >= 1: Review（复习阶段）
 * 
 * @param card 卡片数据
 * @returns 推断的卡片状态
 */
function inferCardState(card: FSRSCard): CardState {
    if (card.scheduledDays === 0) {
        return CardState.New;
    } else if (card.scheduledDays < 1) {
        return CardState.Learning;
    } else {
        return CardState.Review;
    }
}

/**
 * 检查卡片是否需要迁移
 * 
 * 用于诊断和测试。
 * 
 * @param card 卡片数据
 * @returns 如果卡片需要迁移则返回 true
 */
export function needsMigration(card: FSRSCard): boolean {
    return card.learning_step === undefined 
        || card.state === undefined
        || card.postponeCount === undefined
        || card.rescheduleHistory === undefined;
}

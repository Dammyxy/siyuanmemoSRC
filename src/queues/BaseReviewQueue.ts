/**
 * Base Review Queue
 * 复习队列基类
 * 
 * 提供所有队列类型的通用实现基础。
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 */

import { IReviewQueue, QueueType } from '../types/unified-data-source';
import { FSRSCard } from '../types/card';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';

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
     * 数据源管理器引用
     */
    protected manager: UnifiedDataSourceManager;
    
    /**
     * 队列类型
     */
    protected type: QueueType;
    
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
     * 获取队列类型
     * 
     * @returns 队列类型
     * @see 需求 5.1, 6.1
     */
    public getType(): QueueType {
        return this.type;
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
    
    /**
     * 添加卡片到队列
     * 
     * 子类必须实现此方法以提供具体的添加逻辑。
     * 
     * @param cardId 卡片 ID
     * @param source 来源类型（可选，仅用于最终训练队列）
     * @see 需求 5.4, 6.1, 6.2, 9.1, 9.5, 18.1
     */
    public abstract addCard(cardId: string, source?: 'manual' | 'auto-failed'): Promise<void>;
    
    /**
     * 从队列中移除卡片
     * 
     * 子类必须实现此方法以提供具体的移除逻辑。
     * 
     * @param cardId 卡片 ID
     * @see 需求 5.5, 6.1, 6.2, 12.1, 12.2, 12.3
     */
    public abstract removeCard(cardId: string): Promise<void>;
    
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
    public abstract handleReview(cardId: string, rating: number): Promise<void>;
    
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
}

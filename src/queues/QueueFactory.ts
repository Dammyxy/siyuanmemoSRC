/**
 * Queue Factory
 * 队列工厂
 * 
 * 负责创建和管理队列实例，实现懒加载和缓存失效。
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 */

import { IReviewQueue, QueueType, QueueError } from '../types/unified-data-source';
import type { UnifiedDataSourceManager } from '../managers/UnifiedDataSourceManager';
import { RetrievalPracticeQueue } from './RetrievalPracticeQueue';
import { IncrementalLearningQueue } from './IncrementalLearningQueue';
import { FilterGroupQueue } from './FilterGroupQueue';
import { FinalDrillQueue } from './FinalDrillQueue';
import { NeuralRoamQueue } from './NeuralRoamQueue';

/**
 * 队列工厂类
 * 
 * 使用工厂模式创建队列实例，支持懒加载和缓存管理。
 * 
 * @see 需求 5.1, 15.3
 */
export class QueueFactory {
    /**
     * 数据源管理器引用
     */
    private manager: UnifiedDataSourceManager;
    
    /**
     * 队列实例缓存
     * 
     * 使用 Map 存储已创建的队列实例，避免重复创建。
     */
    private queueInstances: Map<QueueType, IReviewQueue>;
    
    /**
     * 构造函数
     * 
     * @param manager 统一数据源管理器实例
     */
    constructor(manager: UnifiedDataSourceManager) {
        this.manager = manager;
        this.queueInstances = new Map();
    }
    
    /**
     * 获取队列实例（懒加载）
     * 
     * 如果队列实例不存在，则创建新实例；否则返回缓存的实例。
     * 
     * @param type 队列类型
     * @returns 队列实例
     * @throws {QueueError} 如果队列类型未知
     * @see 需求 5.1
     */
    public getQueue(type: QueueType): IReviewQueue {
        // 检查缓存
        if (!this.queueInstances.has(type)) {
            // 创建新实例
            const queue = this.createQueue(type);
            this.queueInstances.set(type, queue);
        }
        
        return this.queueInstances.get(type)!;
    }
    
    /**
     * 创建队列实例（工厂方法）
     * 
     * 根据队列类型创建相应的队列实例。
     * 
     * @param type 队列类型
     * @returns 队列实例
     * @throws {QueueError} 如果队列类型未知
     * @see 需求 5.1
     */
    private createQueue(type: QueueType): IReviewQueue {
        switch (type) {
            case QueueType.RetrievalPractice:
                return new RetrievalPracticeQueue(this.manager);
            
            case QueueType.IncrementalLearning:
                return new IncrementalLearningQueue(this.manager);
            
            case QueueType.FilterGroup:
                return new FilterGroupQueue(this.manager);
            
            case QueueType.FinalDrill:
                return new FinalDrillQueue(this.manager);
            
            case QueueType.NeuralRoam:
                return new NeuralRoamQueue(this.manager);
            
            default:
                throw new QueueError(`Unknown queue type: ${type}`);
        }
    }
    
    /**
     * 使队列缓存失效
     * 
     * 删除指定队列的缓存实例，下次访问时将重新创建。
     * 用于在卡片数据变化时刷新队列。
     * 
     * @param type 队列类型
     * @see 需求 15.3
     */
    public invalidateQueue(type: QueueType): void {
        this.queueInstances.delete(type);
    }
    
    /**
     * 使所有队列缓存失效
     * 
     * 清空所有队列缓存，用于模式切换等场景。
     */
    public invalidateAllQueues(): void {
        this.queueInstances.clear();
    }
    
    /**
     * 获取已缓存的队列类型列表
     * 
     * @returns 已缓存的队列类型数组
     */
    public getCachedQueueTypes(): QueueType[] {
        return Array.from(this.queueInstances.keys());
    }
}

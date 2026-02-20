/**
 * Queue Factory
 * 队列工厂
 * 
 * ⚠️ DEPRECATED: 此类已废弃，不再使用
 * 
 * 原因：违反 DDD 分层原则
 * - QueueFactory 位于基础设施层（infrastructure）
 * - 但它试图创建需要应用层服务（UnifiedDataSourceManager）的队列
 * - 这导致基础设施层依赖应用层，违反了 DDD 分层规则
 * 
 * 新架构：
 * - UnifiedDataSourceManager（应用层）直接创建和管理队列
 * - 队列通过 UnifiedDataSourceManager.getQueue() 访问
 * - 符合 DDD 分层原则：应用层 → 领域层 → 基础设施层
 * 
 * @deprecated 使用 UnifiedDataSourceManager.getQueue() 代替
 * @see UnifiedDataSourceManager
 * @see .kiro/specs/bugfix/queue-initialization-ddd-refactoring.md
 */

import { IReviewQueue, QueueType, QueueError } from '../../../types/unified-data-source';
import type { IQueuePersistenceService } from '../../../infrastructure/services/QueuePersistenceService';
import { RetrievalPracticeQueue } from '../domain/RetrievalPracticeQueue';
import { IncrementalLearningQueue } from '../domain/IncrementalLearningQueue';
import { FilterGroupQueue } from '../domain/FilterGroupQueue';
import { FinalDrillQueue } from '../domain/FinalDrillQueue';
import { NeuralRoamQueue } from '../domain/NeuralRoamQueue';

/**
 * 队列工厂类
 * 
 * 使用工厂模式创建队列实例，支持懒加载和缓存管理。
 * 
 * @see 需求 5.1, 15.3
 */
export class QueueFactory {
    /**
     * 队列持久化服务引用
     */
    private queuePersistence: IQueuePersistenceService;
    
    /**
     * 队列实例缓存
     * 
     * 使用 Map 存储已创建的队列实例，避免重复创建。
     */
    private queueInstances: Map<QueueType, IReviewQueue>;
    
    /**
     * 构造函数
     * 
     * @param queuePersistence 队列持久化服务实例
     */
    constructor(queuePersistence: IQueuePersistenceService) {
        this.queuePersistence = queuePersistence;
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
                return new RetrievalPracticeQueue(this.queuePersistence);
            
            case QueueType.IncrementalLearning:
                return new IncrementalLearningQueue(this.queuePersistence);
            
            case QueueType.FilterGroup:
                return new FilterGroupQueue(this.queuePersistence);
            
            case QueueType.FinalDrill:
                return new FinalDrillQueue(this.queuePersistence);
            
            case QueueType.NeuralRoam:
                // Note: NeuralRoamQueue not yet refactored, needs manager
                // TODO: Refactor NeuralRoamQueue to use QueuePersistenceService
                throw new QueueError(`NeuralRoamQueue not yet refactored to use QueuePersistenceService`);
            
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

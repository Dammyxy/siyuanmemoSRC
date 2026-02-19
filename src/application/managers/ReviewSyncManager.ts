/**
 * ReviewSyncManager - 复习同步管理器
 * 
 * 作为观察者监听数据变更事件,负责在复习过程中管理数据同步:
 * - 自动同步:监听 card-updated 事件,每 N 张卡片或每 M 分钟同步一次
 * - 完成同步:复习完成时强制同步
 * - 关闭同步:对话框关闭时强制同步
 * 
 * 确保数据及时保存到服务器,避免数据丢失。
 * 
 * DDD 架构:
 * - 使用 EventBus 发布同步事件
 * - 通过 XiuyuanSyncService 执行同步
 * - 不直接调用 UI 层(通过事件通知)
 */

import type { XiuyuanSyncService } from '@/application/services/XiuyuanSyncService';
import type { IDataSourceObserver, DataChangeEvent } from '@/types/unified-data-source';
import type { UnifiedDataSourceManager } from '@/application/services/UnifiedDataSourceManager';
import type { EventBus } from '@/core/shared/domain/events/EventBus';

export interface ReviewSyncManagerConfig {
  /**
   * 自动同步间隔(卡片数量)
   * 默认:每 10 张卡片同步一次
   */
  autoSyncCardInterval?: number;
  
  /**
   * 自动同步间隔(时间,毫秒)
   * 默认:每 5 分钟同步一次
   */
  autoSyncTimeInterval?: number;
  
  /**
   * 是否在复习完成时显示提示
   * 默认:true
   */
  showCompletionMessage?: boolean;
  
  /**
   * 是否在自动同步失败时显示错误
   * 默认:false(静默失败)
   */
  showAutoSyncErrors?: boolean;
}

export class ReviewSyncManager implements IDataSourceObserver {
  private reviewCount = 0;
  private lastSyncTime = Date.now();
  private isSyncing = false;
  
  private config: Required<ReviewSyncManagerConfig>;
  private unifiedDataSourceManager?: UnifiedDataSourceManager;
  
  constructor(
    private xiuyuanSyncService: XiuyuanSyncService,
    private eventBus: EventBus,
    config?: ReviewSyncManagerConfig
  ) {
    this.config = {
      autoSyncCardInterval: config?.autoSyncCardInterval ?? 10,
      autoSyncTimeInterval: config?.autoSyncTimeInterval ?? 5 * 60 * 1000, // 5 分钟
      showCompletionMessage: config?.showCompletionMessage ?? true,
      showAutoSyncErrors: config?.showAutoSyncErrors ?? false,
    };
    
    console.log('[ReviewSyncManager] Initialized with config:', this.config);
  }
  
  /**
   * 设置 UnifiedDataSourceManager 引用
   * 
   * 用于在对话框关闭时通知观察者刷新 UI
   */
  setUnifiedDataSourceManager(manager: UnifiedDataSourceManager): void {
    this.unifiedDataSourceManager = manager;
  }
  
  /**
   * 观察者接口：响应数据变更事件
   * 
   * 监听 card-updated 事件，累计变更数量，定期触发自动同步。
   * 
   * @param event 数据变更事件
   */
  onDataChanged(event: DataChangeEvent): void {
    // 只响应卡片更新事件
    if (event.type !== 'card-updated') {
      return;
    }
    
    // 累计变更数量
    const cardCount = event.cardIds?.length || 0;
    this.reviewCount += cardCount;
    
    console.log('[ReviewSyncManager] Data changed:', {
      type: event.type,
      cardCount,
      totalReviewed: this.reviewCount,
    });
    
    // 检查是否需要自动同步
    void this.checkAndAutoSync();
  }
  
  /**
   * 检查并执行自动同步
   * 
   * 每 N 张卡片或每 M 分钟触发一次自动同步。
   * 
   * 调用时机：每次 onDataChanged 后
   */
  private async checkAndAutoSync(): Promise<void> {
    const now = Date.now();
    const timeSinceLastSync = now - this.lastSyncTime;
    
    // 检查是否需要自动同步
    const shouldSyncByCount = this.reviewCount >= this.config.autoSyncCardInterval;
    const shouldSyncByTime = timeSinceLastSync > this.config.autoSyncTimeInterval;
    
    if (shouldSyncByCount || shouldSyncByTime) {
      console.log('[ReviewSyncManager] Auto-sync triggered:', {
        reviewCount: this.reviewCount,
        timeSinceLastSync: `${Math.round(timeSinceLastSync / 1000)}s`,
        reason: shouldSyncByCount ? 'card-count' : 'time-interval',
      });
      
      await this.autoSync();
    }
  }
  
  /**
   * 复习过程中的自动同步（已废弃，由观察者模式替代）
   * 
   * @deprecated 使用观察者模式自动响应数据变更
   */
  async onCardReviewed(): Promise<void> {
    console.warn('[ReviewSyncManager] onCardReviewed is deprecated, use observer pattern instead');
  }
  
  /**
   * 复习完成时的同步
   * 
   * 当队列为空,复习完成时调用。
   * 
   * 流程:
   * 1. 保存所有数据
   * 2. 同步到服务器
   * 3. 发布完成事件
   * 4. 重置计数器
   */
  async onReviewCompleted(): Promise<void> {
    if (this.isSyncing) {
      console.log('[ReviewSyncManager] Already syncing, skipping...');
      return;
    }
    
    this.isSyncing = true;
    
    try {
      console.log('[ReviewSyncManager] Review completed, syncing...', {
        totalReviewed: this.reviewCount,
      });
      
      // 1. 保存所有数据到本地
      await this.xiuyuanSyncService.incrementalSync();
      console.log('[ReviewSyncManager] Data synced');
      
      // 2. 发布复习完成事件
      this.publishEvent('review.completed', {
        reviewCount: this.reviewCount,
        showMessage: this.config.showCompletionMessage,
        timestamp: Date.now(),
      });
      
      // 3. 重置计数器
      this.reset();
      
      console.log('[ReviewSyncManager] ✅ Review completion sync finished');
    } catch (err) {
      console.error('[ReviewSyncManager] Review completion sync failed:', err);
      
      // 发布同步失败事件
      this.publishEvent('review.sync.failed', {
        error: err as Error,
        context: 'completion',
        timestamp: Date.now(),
      });
    } finally {
      this.isSyncing = false;
    }
  }
  
  /**
   * 对话框关闭时的同步
   * 
   * 当用户关闭复习对话框时调用。
   * 
   * 流程:
   * 1. 保存所有数据
   * 2. 同步到服务器
   * 3. 通知观察者刷新 UI
   * 4. 重置计数器
   */
  async onDialogClose(): Promise<void> {
    if (this.isSyncing) {
      console.log('[ReviewSyncManager] Already syncing, skipping...');
      return;
    }
    
    // 如果没有复习过任何卡片,跳过同步
    if (this.reviewCount === 0) {
      console.log('[ReviewSyncManager] No cards reviewed, skipping sync');
      return;
    }
    
    this.isSyncing = true;
    
    try {
      console.log('[ReviewSyncManager] Dialog closing, syncing...', {
        totalReviewed: this.reviewCount,
      });
      
      // 1. 保存所有数据到本地
      await this.xiuyuanSyncService.incrementalSync();
      console.log('[ReviewSyncManager] Data synced');
      
      // 2. 通知观察者刷新 UI(触发浏览器刷新)
      // 使用 'mode-switched' 事件类型,因为它会触发 loadData()
      if (this.unifiedDataSourceManager) {
        this.unifiedDataSourceManager.notifyObservers({
          type: 'mode-switched' as any,
          timestamp: Date.now(),
        });
        console.log('[ReviewSyncManager] Notified observers to refresh UI');
      }
      
      // 3. 重置计数器
      this.reset();
      
      console.log('[ReviewSyncManager] ✅ Dialog close sync finished');
    } catch (err) {
      console.error('[ReviewSyncManager] Dialog close sync failed:', err);
      // 对话框关闭时的同步失败不显示错误提示(避免打断用户)
    } finally {
      this.isSyncing = false;
    }
  }
  
  /**
   * 自动同步(私有方法)
   * 
   * 在复习过程中定期触发的自动同步。
   * 
   * 流程:
   * 1. 保存所有数据
   * 2. 同步到服务器
   * 3. 更新时间戳
   */
  private async autoSync(): Promise<void> {
    if (this.isSyncing) {
      console.log('[ReviewSyncManager] Already syncing, skipping auto-sync...');
      return;
    }
    
    this.isSyncing = true;
    
    try {
      console.log('[ReviewSyncManager] Auto-syncing...');
      
      // 保存所有数据到本地
      await this.xiuyuanSyncService.incrementalSync();
      
      // 更新时间戳
      this.lastSyncTime = Date.now();
      
      console.log('[ReviewSyncManager] ✅ Auto-sync finished');
    } catch (err) {
      console.error('[ReviewSyncManager] Auto-sync failed:', err);
      
      // 发布自动同步失败事件
      if (this.config.showAutoSyncErrors) {
        this.publishEvent('review.sync.failed', {
          error: err as Error,
          context: 'auto',
          timestamp: Date.now(),
        });
      }
    } finally {
      this.isSyncing = false;
    }
  }
  
  /**
   * 发布事件(通过 EventBus)
   */
  private publishEvent(eventName: string, eventData: any): void {
    const domainEvent = {
      getEventName: () => eventName,
      occurredOn: new Date(),
      toJSON: () => eventData
    };
    
    this.eventBus.publish(domainEvent as any).catch(error => {
      console.error(`[ReviewSyncManager] Failed to publish event ${eventName}:`, error);
    });
  }
  
  /**
   * 重置计数器
   * 
   * 在复习完成或对话框关闭后调用。
   */
  private reset(): void {
    this.reviewCount = 0;
    this.lastSyncTime = Date.now();
    console.log('[ReviewSyncManager] Counters reset');
  }
}

/**
 * EventBus - 事件总线
 * 
 * 负责领域事件的发布和订阅。
 * 
 * **职责**：
 * - 管理事件订阅者
 * - 发布事件到订阅者
 * - 错误处理
 * 
 * **特性**：
 * - 异步处理：事件处理器异步执行
 * - 错误隔离：一个处理器失败不影响其他处理器
 * - 类型安全：使用 TypeScript 泛型确保类型安全
 * 
 * @see .kiro/DDD-GUIDE.md - 领域事件机制
 * @see .kiro/specs/ddd-refactoring/long-term-improvements.md - 阶段 3
 */

import { DomainEvent } from './DomainEvent';
import { createLogger } from '@/utils/logger';

const logger = createLogger('EventBus');

/**
 * 事件处理器类型
 * 
 * 接收一个事件，执行相应的业务逻辑。
 * 可以是同步或异步函数。
 */
export type EventHandler<T extends DomainEvent> = (event: T) => void | Promise<void>;

/**
 * EventBus 类
 * 
 * 事件总线，负责事件的发布和订阅。
 * 
 * @example
 * ```typescript
 * const eventBus = new EventBus();
 * 
 * // 订阅事件
 * eventBus.subscribe('card.created', async (event: CardCreatedEvent) => {
 *   console.log(`Card ${event.cardId} created`);
 * });
 * 
 * // 发布事件
 * const event = new CardCreatedEvent('card-123', 'xiuyuan-456');
 * await eventBus.publish(event);
 * ```
 */
export class EventBus {
  /**
   * 事件处理器映射表
   * 
   * key: 事件名称
   * value: 处理器数组
   */
  private handlers: Map<string, EventHandler<any>[]> = new Map();
  
  /**
   * 是否启用调试日志
   */
  private debugMode: boolean = false;
  
  /**
   * 构造函数
   * 
   * @param debugMode - 是否启用调试日志（可选，默认为 false）
   */
  constructor(debugMode: boolean = false) {
    this.debugMode = debugMode;
  }
  
  /**
   * 订阅事件
   * 
   * 注册一个事件处理器，当指定事件发布时会被调用。
   * 
   * @param eventName - 事件名称
   * @param handler - 事件处理器
   * 
   * @example
   * ```typescript
   * eventBus.subscribe('card.created', async (event: CardCreatedEvent) => {
   *   console.log(`Card ${event.cardId} created`);
   * });
   * ```
   */
  subscribe<T extends DomainEvent>(
    eventName: string,
    handler: EventHandler<T>
  ): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    
    this.handlers.get(eventName)!.push(handler);
    
    if (this.debugMode) {
      logger.debug(`Subscribed to event: ${eventName}`);
    }
  }
  
  /**
   * 取消订阅事件
   * 
   * 移除指定的事件处理器。
   * 
   * @param eventName - 事件名称
   * @param handler - 事件处理器
   * 
   * @example
   * ```typescript
   * const handler = (event: CardCreatedEvent) => { ... };
   * eventBus.subscribe('card.created', handler);
   * 
   * // 取消订阅
   * eventBus.unsubscribe('card.created', handler);
   * ```
   */
  unsubscribe(eventName: string, handler: EventHandler<any>): void {
    const handlers = this.handlers.get(eventName);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
        
        if (this.debugMode) {
          logger.debug(`Unsubscribed from event: ${eventName}`);
        }
      }
    }
  }
  
  /**
   * 发布事件
   * 
   * 将事件发送给所有订阅者。
   * 处理器按注册顺序依次执行。
   * 如果某个处理器抛出异常，会记录错误但不影响其他处理器。
   * 
   * @param event - 领域事件
   * 
   * @example
   * ```typescript
   * const event = new CardCreatedEvent('card-123', 'xiuyuan-456');
   * await eventBus.publish(event);
   * ```
   */
  async publish(event: DomainEvent): Promise<void> {
    const eventName = event.getEventName();
    const handlers = this.handlers.get(eventName) || [];
    
    if (this.debugMode) {
      logger.debug(`Publishing event: ${eventName}`, event.toJSON());
      logger.debug(`Found ${handlers.length} handler(s)`);
    }
    
    // 依次执行所有处理器
    for (const handler of handlers) {
      try {
        await handler(event);
        
        if (this.debugMode) {
          logger.debug(`Handler executed successfully for: ${eventName}`);
        }
      } catch (error) {
        // 记录错误但不中断其他处理器
        logger.error(`Error handling event ${eventName}:`, error);
        logger.error('Event data:', event.toJSON());
      }
    }
  }
  
  /**
   * 批量发布事件
   * 
   * 按顺序发布多个事件。
   * 
   * @param events - 事件数组
   * 
   * @example
   * ```typescript
   * const events = [
   *   new CardCreatedEvent('card-1', 'xiuyuan-1'),
   *   new CardCreatedEvent('card-2', 'xiuyuan-1'),
   * ];
   * await eventBus.publishAll(events);
   * ```
   */
  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
  
  /**
   * 获取指定事件的订阅者数量
   * 
   * @param eventName - 事件名称
   * @returns 订阅者数量
   */
  getSubscriberCount(eventName: string): number {
    return this.handlers.get(eventName)?.length || 0;
  }
  
  /**
   * 获取所有已订阅的事件名称
   * 
   * @returns 事件名称数组
   */
  getSubscribedEvents(): string[] {
    return Array.from(this.handlers.keys());
  }
  
  /**
   * 清除所有订阅
   * 
   * 用于测试或重置事件总线。
   */
  clear(): void {
    this.handlers.clear();
    
    if (this.debugMode) {
      logger.debug('All subscriptions cleared');
    }
  }
  
  /**
   * 启用或禁用调试模式
   * 
   * @param enabled - 是否启用
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }
}

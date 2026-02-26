/**
 * DomainEvent - 领域事件基类
 * 
 * 领域事件表示领域中发生的重要状态变化。
 * 所有领域事件都应该继承这个基类。
 * 
 * **特性**：
 * - 不可变：事件一旦创建就不能修改
 * - 过去式命名：表示已经发生的事情
 * - 包含必要信息：事件 ID、发生时间、聚合根 ID、相关数据
 * 
 * **使用场景**：
 * - 解耦模块：通过事件通信而不是直接调用
 * - 审计日志：记录所有重要的状态变化
 * - 最终一致性：确保相关操作的一致性
 * - 扩展性：新增功能只需订阅事件
 * 
 * @see .kiro/DDD-GUIDE.md - 领域事件机制
 * @see .kiro/specs/ddd-refactoring/long-term-improvements.md - 阶段 3
 */

/**
 * DomainEvent 抽象基类
 * 
 * 所有领域事件都应该继承这个类。
 * 
 * @example
 * ```typescript
 * export class CardCreatedEvent extends DomainEvent {
 *   constructor(
 *     aggregateId: string,
 *     public readonly cardId: string,
 *     public readonly faceIndex: number
 *   ) {
 *     super(aggregateId);
 *   }
 *   
 *   getEventName(): string {
 *     return 'CardCreated';
 *   }
 * }
 * ```
 */
export abstract class DomainEvent {
  /**
   * 事件发生时间
   */
  public readonly occurredOn: Date;
  
  /**
   * 事件唯一标识
   */
  public readonly eventId: string;
  
  /**
   * 聚合根 ID
   * 
   * 标识事件来源的聚合根
   */
  public readonly aggregateId: string;
  
  /**
   * 构造函数
   * 
   * @param aggregateId - 聚合根 ID
   * @param occurredOn - 事件发生时间（可选，默认为当前时间）
   */
  constructor(aggregateId: string, occurredOn?: Date) {
    this.aggregateId = aggregateId;
    this.occurredOn = occurredOn || new Date();
    this.eventId = this.generateEventId();
  }
  
  /**
   * 事件名称
   * 
   * 用于事件路由和订阅。
   * 建议使用 PascalCase 命名，如：'CardCreated', 'CardDeleted'
   * 
   * @returns 事件名称
   */
  abstract getEventName(): string;
  
  /**
   * 生成事件 ID
   * 
   * 使用时间戳和随机数生成唯一 ID。
   * 
   * @returns 事件 ID
   */
  private generateEventId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    return `${timestamp}-${random}`;
  }
  
  /**
   * 转换为 JSON 对象
   * 
   * 用于序列化和日志记录。
   * 
   * @returns JSON 对象
   */
  toJSON(): Record<string, unknown> {
    return {
      eventId: this.eventId,
      eventName: this.getEventName(),
      aggregateId: this.aggregateId,
      occurredOn: this.occurredOn.toISOString(),
      ...this.getPayload(),
    };
  }
  
  /**
   * 获取事件负载
   * 
   * 子类可以重写此方法以提供自定义的序列化逻辑。
   * 
   * @returns 事件负载
   */
  protected getPayload(): Record<string, unknown> {
    // 默认返回所有公共属性
    const payload: Record<string, unknown> = {};
    const eventData = this as unknown as Record<string, unknown>;
    for (const key of Object.keys(eventData)) {
      if (key !== 'eventId' && key !== 'occurredOn' && key !== 'eventName' && key !== 'aggregateId') {
        payload[key] = eventData[key];
      }
    }
    return payload;
  }
}

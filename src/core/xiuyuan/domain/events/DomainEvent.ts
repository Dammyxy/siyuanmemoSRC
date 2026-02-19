/**
 * DomainEvent - 领域事件基类
 * 
 * @description
 * 所有领域事件的基类，提供事件的基本属性。
 * 
 * **设计原则**：
 * - 不可变性：事件一旦创建，不可修改
 * - 时间戳：记录事件发生的时间
 * - 聚合根 ID：记录事件来源
 */

export abstract class DomainEvent {
  public readonly occurredOn: Date;

  constructor(
    public readonly aggregateId: string,
    occurredOn?: Date
  ) {
    this.occurredOn = occurredOn || new Date();
  }

  abstract getEventName(): string;
}

/**
 * XiuyuanCreatedEvent - Xiuyuan 创建事件
 * 
 * @description
 * 当 Xiuyuan 聚合根被创建时发布的领域事件。
 */

import { DomainEvent } from '@/core/shared/domain/events/DomainEvent';

export class XiuyuanCreatedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly templateId: string,
    public readonly blockIds: string[],
    occurredOn?: Date
  ) {
    super(aggregateId, occurredOn);
  }

  getEventName(): string {
    return 'XiuyuanCreated';
  }
}

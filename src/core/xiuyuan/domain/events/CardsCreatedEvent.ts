/**
 * CardsCreatedEvent - 批量卡片创建事件
 *
 * @description
 * 当一批 Card 被创建并持久化完成时发布的领域事件。
 */

import { DomainEvent } from '@/core/shared/domain/events/DomainEvent';

export class CardsCreatedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly cardIds: string[],
    public readonly blockIds: string[],
    public readonly xiuyuanIds: string[],
    public readonly source: string,
    occurredOn?: Date,
  ) {
    super(aggregateId, occurredOn);
  }

  getEventName(): string {
    return 'CardsCreated';
  }
}

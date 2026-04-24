/**
 * CardsDeletedEvent - 批量卡片删除事件
 * 
 * @description
 * 当多张 Card 被批量删除时发布的领域事件。
 * 用于批量同步到 Riff 等外部系统，避免频繁触发单个删除事件。
 */

import { DomainEvent } from '@/core/shared/domain/events/DomainEvent';

export class CardsDeletedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly cardIds: string[],
    public readonly blockIds: string[],
    occurredOn?: Date
  ) {
    super(aggregateId, occurredOn);
  }

  getEventName(): string {
    return 'CardsDeleted';
  }
}

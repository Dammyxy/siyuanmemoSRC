/**
 * Domain Events - 领域事件导出
 */

export { DomainEvent } from '@/core/shared/domain/events/DomainEvent';
export { XiuyuanCreatedEvent } from './XiuyuanCreatedEvent';
export { CardCreatedEvent } from './CardCreatedEvent';
export {
  CARD_DELETE_INTENTS,
  hasNativeHardDeleteAuthorization,
  normalizeCardDeleteIntent,
  isNativeHardDeleteIntent,
  type CardDeleteIntent,
  type CardDeleteIntentOptions,
  type NativeHardDeleteOwnershipProof,
} from './CardDeleteIntent';
export { CardDeletedEvent } from './CardDeletedEvent';
export { CardReviewedEvent } from './CardReviewedEvent';

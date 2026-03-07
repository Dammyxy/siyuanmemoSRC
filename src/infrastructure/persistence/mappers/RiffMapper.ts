import { CardState, CardType, type FSRSCard } from '../../../types/card';
import type { RiffBlock } from '../../../core/siyuan/riff';

function parseTimestamp(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toCardState(value: number | undefined): CardState {
  switch (value) {
    case CardState.Learning:
      return CardState.Learning;
    case CardState.Review:
      return CardState.Review;
    case CardState.Relearning:
      return CardState.Relearning;
    case CardState.Suspended:
      return CardState.Suspended;
    case CardState.New:
    default:
      return CardState.New;
  }
}

function resolveCardType(
  cardTypeAttr: string | undefined,
  cardTypeMarkerAttr: string | undefined
): { type: CardType; cardTypeMarker?: 'concept' | 'descriptor' } {
  if (cardTypeMarkerAttr === 'concept') {
    return { type: CardType.Concept, cardTypeMarker: 'concept' };
  }

  if (cardTypeMarkerAttr === 'descriptor') {
    return { type: CardType.Descriptor, cardTypeMarker: 'descriptor' };
  }

  switch (cardTypeAttr) {
    case CardType.Topic:
      return { type: CardType.Topic };
    case CardType.Concept:
      return { type: CardType.Concept };
    case CardType.Descriptor:
      return { type: CardType.Descriptor };
    case CardType.Item:
    default:
      return { type: CardType.Item };
  }
}

export class RiffMapper {
  static toDomain(riffBlock: RiffBlock): FSRSCard {
    const ial = riffBlock.ial || {};
    const cardTypeAttr = ial['custom-card-type'];
    const cardTypeMarkerAttr = ial['custom-fsrs-card-type'];
    const priorityAttr = ial['custom-riff-priority'];
    const { type, cardTypeMarker } = resolveCardType(cardTypeAttr, cardTypeMarkerAttr);
    const riffPriority = priorityAttr ? parseInt(priorityAttr, 10) : 5;
    const priority = Math.min(100, Math.max(0, riffPriority * 10));
    const riffCard = riffBlock.riffCard;
    const xiuyuanAttrs = this.extractXiuyuanAttributes(riffBlock);
    const createdAt = parseTimestamp(riffBlock.created, Date.now());
    const updatedAt = parseTimestamp(riffBlock.updated, createdAt);

    return {
      id: riffBlock.id,
      xiuyuanID: xiuyuanAttrs.xiuyuanID || '',
      blockId: riffBlock.id,
      due: parseTimestamp(riffCard?.due, Date.now()),
      stability: riffCard?.stability || 0,
      difficulty: riffCard?.difficulty || 0,
      reps: riffCard?.reps || 0,
      lapses: riffCard?.lapses || 0,
      state: toCardState(riffCard?.state),
      lastReview: parseTimestamp(riffCard?.lastReview, 0),
      elapsedDays: riffCard?.elapsedDays || 0,
      scheduledDays: riffCard?.scheduledDays || 0,
      priority,
      type,
      tags: [],
      cardTypeMarker,
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt,
      updatedAt,
      aFactor: undefined,
      schedulerType: type === CardType.Topic ? 'a-factor' : 'fsrs-v6',
      syncToRiff: true,
      riffCardId: riffCard?.id || riffBlock.riffCardID || riffBlock.riffCardId || riffBlock.id,
      meta: {
        riffBlock,
      },
    };
  }

  static toDomainBatch(riffBlocks: RiffBlock[]): FSRSCard[] {
    return riffBlocks.map((block) => this.toDomain(block));
  }

  static extractXiuyuanAttributes(riffBlock: RiffBlock): {
    xiuyuanID?: string;
    templateID?: string;
  } {
    const ial = riffBlock.ial || {};
    return {
      xiuyuanID: ial['custom-xiuyuan-id'] || ial['custom-fsrs-xiuyuan-id'],
      templateID: ial['custom-xiuyuan-template'] || ial['custom-fsrs-template-id'],
    };
  }

  static isXiuyuanCard(riffBlock: RiffBlock): boolean {
    const attrs = this.extractXiuyuanAttributes(riffBlock);
    return !!attrs.xiuyuanID;
  }
}

import {
  resolveProgressiveTopicContext,
  type ProgressiveTopicContext,
} from '@/application/services/ProgressiveSourceContextResolver';

export type TopicDerivedSourceRole =
  | 'plain'
  | 'topic'
  | 'item'
  | 'descriptor'
  | 'concept'
  | 'cloze'
  | 'unknown';

export type TopicDerivedSourceEligibilityReason =
  | 'eligible-topic-source'
  | 'plain-block-under-topic'
  | 'missing-source-block'
  | 'missing-topic-context'
  | 'non-topic-flashcard-source';

export interface TopicDerivedSourceEligibility {
  eligible: boolean;
  topicContext: ProgressiveTopicContext | null;
  sourceRole: TopicDerivedSourceRole;
  rejectedRole?: TopicDerivedSourceRole;
  sourceCardCount: number;
  reason: TopicDerivedSourceEligibilityReason;
  message?: string;
}

type TopicDerivedCardLookup = {
  getCardByBlockId: (blockId: string) => unknown;
  getCardsByBlockId?: (blockId: string) => unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getLocalCardsByBlockId(cardLookup: TopicDerivedCardLookup, blockId: string): unknown[] {
  if (typeof cardLookup.getCardsByBlockId === 'function') {
    return cardLookup.getCardsByBlockId(blockId);
  }
  const single = cardLookup.getCardByBlockId(blockId);
  return single ? [single] : [];
}

function readTopicDerivedSourceRole(card: unknown): TopicDerivedSourceRole {
  if (!isRecord(card)) {
    return 'unknown';
  }
  const meta = isRecord(card.meta) ? card.meta : {};
  const marker = readString(card.cardTypeMarker) || readString(meta.cardTypeMarker);
  if (marker === 'concept' || marker === 'descriptor') {
    return marker;
  }

  const rawType = readString(card.type);
  if (
    rawType === 'topic'
    || rawType === 'item'
    || rawType === 'descriptor'
    || rawType === 'concept'
    || rawType === 'cloze'
  ) {
    return rawType;
  }

  return 'unknown';
}

function roleLabel(role: TopicDerivedSourceRole): string {
  switch (role) {
    case 'item':
      return 'Item';
    case 'descriptor':
      return 'Descriptor';
    case 'concept':
      return 'Concept';
    case 'cloze':
      return 'cloze';
    case 'topic':
      return 'Topic';
    case 'plain':
      return '普通块';
    default:
      return '未知类型';
  }
}

export function formatTopicDerivedSourceRejectionMessage(
  eligibility: TopicDerivedSourceEligibility | null | undefined,
): string {
  if (!eligibility) {
    return '';
  }
  if (eligibility.reason === 'non-topic-flashcard-source') {
    return `当前块已经是 ${roleLabel(eligibility.rejectedRole || eligibility.sourceRole)} 闪卡，不能继续派生 Item`;
  }
  if (eligibility.reason === 'missing-topic-context') {
    return '当前块不在 Topic 阅读材料中，不能继续派生 Item';
  }
  if (eligibility.reason === 'missing-source-block') {
    return '当前块不可用，不能继续派生 Item';
  }
  return '';
}

export function resolveTopicDerivedSourceEligibility(input: {
  blockId: string;
  rootId?: string;
  topicContainerId?: string;
  topicContainerIds?: string[];
  cardLookup: TopicDerivedCardLookup;
}): TopicDerivedSourceEligibility {
  const blockId = String(input.blockId || '').trim();
  if (!blockId) {
    return {
      eligible: false,
      topicContext: null,
      sourceRole: 'plain',
      sourceCardCount: 0,
      reason: 'missing-source-block',
      message: '当前块不可用，不能继续派生 Item',
    };
  }

  const topicContext = resolveProgressiveTopicContext({
    blockId,
    rootId: input.rootId,
    topicContainerId: input.topicContainerId,
    topicContainerIds: input.topicContainerIds,
    cardLookup: input.cardLookup,
  });
  const sourceCards = getLocalCardsByBlockId(input.cardLookup, blockId);
  const sourceRoles = sourceCards.map((card) => readTopicDerivedSourceRole(card));
  const rejectedRole = sourceRoles.find((role) => role !== 'topic');
  if (rejectedRole) {
    const eligibility: TopicDerivedSourceEligibility = {
      eligible: false,
      topicContext,
      sourceRole: rejectedRole,
      rejectedRole,
      sourceCardCount: sourceCards.length,
      reason: 'non-topic-flashcard-source',
    };
    return {
      ...eligibility,
      message: formatTopicDerivedSourceRejectionMessage(eligibility),
    };
  }

  if (!topicContext) {
    const sourceRole = sourceRoles.includes('topic') ? 'topic' : 'plain';
    return {
      eligible: false,
      topicContext: null,
      sourceRole,
      sourceCardCount: sourceCards.length,
      reason: 'missing-topic-context',
      message: '当前块不在 Topic 阅读材料中，不能继续派生 Item',
    };
  }

  return {
    eligible: true,
    topicContext,
    sourceRole: sourceRoles.includes('topic') ? 'topic' : 'plain',
    sourceCardCount: sourceCards.length,
    reason: sourceRoles.includes('topic') ? 'eligible-topic-source' : 'plain-block-under-topic',
  };
}

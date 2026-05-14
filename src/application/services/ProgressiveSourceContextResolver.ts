import {
  ATTR_PROGRESSIVE_KIND,
  ATTR_PROGRESSIVE_MODE,
  ATTR_PROGRESSIVE_SESSION_ID,
  ATTR_PROGRESSIVE_SOURCE_DOC_ID,
  getLegacyProgressiveAttrName,
} from '@/application/services/ProgressiveAttrContract';

export type ProgressiveTopicScope = 'block' | 'doc-root';
export type ProgressiveSourceRootKind =
  | 'ordinary-doc'
  | 'piece'
  | 'excerpt-doc'
  | 'excerpt-block'
  | 'topic-doc';
export type ProgressiveLogicalParentType = 'root-doc' | 'topic' | 'excerpt';

export interface ProgressiveTopicContext {
  topicCardId: string;
  topicBlockId: string;
  sourceDocId: string;
  scope: ProgressiveTopicScope;
}

export interface ProgressiveSourceContext {
  blockId: string;
  rootDocId: string;
  rootKind: ProgressiveSourceRootKind;
  sourceDocId: string;
  sourceBlockId: string;
  topicContext: ProgressiveTopicContext | null;
  parentTopicCardId?: string;
  parentExcerptId?: string;
  sessionId?: string;
  mode?: 'linear' | 'nonlinear';
  attrSourceDocId?: string;
  logicalParentId: string;
  logicalParentType: ProgressiveLogicalParentType;
}

type ProgressiveCardLookup = {
  getCardByBlockId: (blockId: string) => unknown;
  getCardsByBlockId?: (blockId: string) => unknown[];
};

type ProgressiveAttrLookup = {
  getBlockAttrs: (blockId: string) => Promise<Record<string, string>>;
};

function isTopicLikeLocalCard(card: unknown): card is { id: string } {
  if (!card || typeof card !== 'object') {
    return false;
  }
  const candidate = card as {
    id?: string;
    type?: string;
  };
  return typeof candidate.id === 'string' && candidate.id.trim().length > 0 && candidate.type === 'topic';
}

function getLocalCardsByBlockId(cardLookup: ProgressiveCardLookup, blockId: string): unknown[] {
  if (typeof cardLookup.getCardsByBlockId === 'function') {
    return cardLookup.getCardsByBlockId(blockId);
  }
  const single = cardLookup.getCardByBlockId(blockId);
  return single ? [single] : [];
}

function readProgressiveAttr(attrs: Record<string, string> | null | undefined, attrName: string): string {
  if (!attrs) {
    return '';
  }
  const directValue = String(attrs[attrName] || '').trim();
  if (directValue) {
    return directValue;
  }
  const legacyAttrName = getLegacyProgressiveAttrName(attrName);
  return legacyAttrName ? String(attrs[legacyAttrName] || '').trim() : '';
}

export function resolveProgressiveTopicContext(input: {
  blockId: string;
  rootId?: string;
  topicContainerId?: string;
  topicContainerIds?: string[];
  cardLookup: ProgressiveCardLookup;
}): ProgressiveTopicContext | null {
  const blockId = String(input.blockId || '').trim();
  const rootId = String(input.rootId || '').trim();
  const topicContainerId = String(input.topicContainerId || '').trim();
  if (!blockId) {
    return null;
  }

  const topicContainerIds = [
    ...(
      Array.isArray(input.topicContainerIds)
        ? input.topicContainerIds.map((id) => String(id || '').trim())
        : []
    ),
    topicContainerId,
  ].filter((id, index, values) => id && id !== blockId && id !== rootId && values.indexOf(id) === index);

  for (const candidateTopicContainerId of topicContainerIds) {
    const containerTopicCard = getLocalCardsByBlockId(input.cardLookup, candidateTopicContainerId).find((card) => isTopicLikeLocalCard(card));
    if (containerTopicCard && isTopicLikeLocalCard(containerTopicCard)) {
      return {
        topicCardId: containerTopicCard.id,
        topicBlockId: candidateTopicContainerId,
        sourceDocId: rootId || blockId,
        scope: 'block',
      };
    }
  }

  const blockTopicCard = getLocalCardsByBlockId(input.cardLookup, blockId).find((card) => isTopicLikeLocalCard(card));
  if (blockTopicCard && isTopicLikeLocalCard(blockTopicCard)) {
    return {
      topicCardId: blockTopicCard.id,
      topicBlockId: blockId,
      sourceDocId: rootId || blockId,
      scope: 'block',
    };
  }

  if (!rootId || rootId === blockId) {
    return null;
  }

  const rootTopicCard = getLocalCardsByBlockId(input.cardLookup, rootId).find((card) => isTopicLikeLocalCard(card));
  if (rootTopicCard && isTopicLikeLocalCard(rootTopicCard)) {
    return {
      topicCardId: rootTopicCard.id,
      topicBlockId: rootId,
      sourceDocId: rootId,
      scope: 'doc-root',
    };
  }

  return null;
}

export async function resolveProgressiveSourceContext(input: {
  blockId: string;
  rootId?: string;
  topicContainerId?: string;
  topicContainerIds?: string[];
  cardLookup: ProgressiveCardLookup;
  attrLookup: ProgressiveAttrLookup;
}): Promise<ProgressiveSourceContext> {
  const blockId = String(input.blockId || '').trim();
  const rootDocId = String(input.rootId || '').trim() || blockId;
  const topicContext = resolveProgressiveTopicContext({
    blockId,
    rootId: rootDocId,
    topicContainerId: input.topicContainerId,
    topicContainerIds: input.topicContainerIds,
    cardLookup: input.cardLookup,
  });

  const blockAttrs = blockId ? await input.attrLookup.getBlockAttrs(blockId) : {};
  const rootAttrs = rootDocId && rootDocId !== blockId
    ? await input.attrLookup.getBlockAttrs(rootDocId)
    : blockAttrs;

  const blockKind = readProgressiveAttr(blockAttrs, ATTR_PROGRESSIVE_KIND);
  const rootKindAttr = readProgressiveAttr(rootAttrs, ATTR_PROGRESSIVE_KIND);
  const sessionId = readProgressiveAttr(blockAttrs, ATTR_PROGRESSIVE_SESSION_ID)
    || readProgressiveAttr(rootAttrs, ATTR_PROGRESSIVE_SESSION_ID)
    || undefined;
  const modeValue = readProgressiveAttr(blockAttrs, ATTR_PROGRESSIVE_MODE)
    || readProgressiveAttr(rootAttrs, ATTR_PROGRESSIVE_MODE);
  const attrSourceDocId = readProgressiveAttr(blockAttrs, ATTR_PROGRESSIVE_SOURCE_DOC_ID)
    || readProgressiveAttr(rootAttrs, ATTR_PROGRESSIVE_SOURCE_DOC_ID)
    || undefined;

  let rootKind: ProgressiveSourceRootKind = 'ordinary-doc';
  if (blockKind === 'excerpt') {
    rootKind = 'excerpt-block';
  } else if (rootKindAttr === 'piece') {
    rootKind = 'piece';
  } else if (rootKindAttr === 'excerpt-doc') {
    rootKind = 'excerpt-doc';
  } else if (topicContext?.scope === 'doc-root') {
    rootKind = 'topic-doc';
  }

  const parentExcerptId = blockKind === 'excerpt'
    ? blockId
    : rootKindAttr === 'excerpt-doc'
      ? rootDocId
      : undefined;
  const parentTopicCardId = topicContext?.topicCardId;
  const logicalParentType: ProgressiveLogicalParentType = parentExcerptId
    ? 'excerpt'
    : parentTopicCardId
      ? 'topic'
      : 'root-doc';
  const logicalParentId = parentExcerptId || topicContext?.topicBlockId || rootDocId;

  return {
    blockId,
    rootDocId,
    rootKind,
    sourceDocId: rootDocId,
    sourceBlockId: blockId,
    topicContext,
    parentTopicCardId,
    parentExcerptId,
    sessionId,
    mode: modeValue === 'linear' || modeValue === 'nonlinear' ? modeValue : undefined,
    attrSourceDocId,
    logicalParentId,
    logicalParentType,
  };
}

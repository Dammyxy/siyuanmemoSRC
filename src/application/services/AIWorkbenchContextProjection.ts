import type { FSRSCard } from '@/types/card';
import type {
  AIReviewCardContext,
  AIReviewNeuralContext,
  AIWorkbenchContextSnapshot,
} from '@/types/ai';
import type { NeuralRoamBatchSnapshot } from '@/types/unified-data-source';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeString(entry)).filter(Boolean);
  }
  const text = normalizeString(value);
  return text ? [text] : [];
}

export function serializeNeuralBatch(batch: NeuralRoamBatchSnapshot | null): unknown {
  if (!batch) {
    return null;
  }
  if (batch.kind !== 'orbit-round') {
    return batch;
  }
  return {
    kind: batch.kind,
    engineMode: batch.engineMode,
    currentNodeId: batch.currentNodeId,
    currentEventId: batch.currentEventId,
    roundSize: batch.roundSize,
    viewedCount: batch.viewedCount,
    remainingCount: batch.remainingCount,
    roundNodes: batch.roundNodes.map((node) => node.nodeId),
  };
}

export function buildContextSignature(context: AIWorkbenchContextSnapshot | null): string | null {
  if (!context) {
    return null;
  }
  return JSON.stringify({
    source: context.source,
    queueType: context.queueType ?? null,
    queueProgress: context.queueProgress ?? null,
    selectedBlockIds: context.selectedBlockIds,
    blockIds: context.blocks.map((block) => block.blockId),
    currentCard: context.currentCard ? {
      cardId: context.currentCard.cardId,
      blockId: context.currentCard.blockId,
      cardType: context.currentCard.cardType,
      revealed: context.currentCard.revealed,
      hasAnswerFace: context.currentCard.hasAnswerFace,
      explainRequiresReveal: context.currentCard.explainRequiresReveal,
      reviewActionLabel: context.currentCard.reviewActionLabel,
      roleDescription: context.currentCard.roleDescription,
      sourceBlockIds: context.currentCard.sourceBlockIds,
      neuralContext: context.currentCard.neuralContext,
    } : null,
    neuralBatch: serializeNeuralBatch(context.neuralBatch),
  });
}

export function buildReviewChatKey(queueType: unknown, queueLabel: unknown): string | null {
  const normalizedQueueType = normalizeString(queueType);
  const normalizedQueueLabel = normalizeString(queueLabel);
  if (!normalizedQueueType || !normalizedQueueLabel) {
    return null;
  }
  return `${normalizedQueueType}::${normalizedQueueLabel}`;
}

export function deriveReviewChatKey(
  context: AIWorkbenchContextSnapshot | null,
  explicitReviewChatKey?: string | null,
): string | null {
  return normalizeString(explicitReviewChatKey)
    || buildReviewChatKey(context?.queueType, context?.queueProgress?.queueLabel);
}

export function readXiuyuanMeta(card: FSRSCard | null | undefined): Record<string, unknown> | null {
  return isRecord(card?.meta) ? card!.meta as Record<string, unknown> : null;
}

export function readReviewNeuralContext(card: FSRSCard | null | undefined): AIReviewNeuralContext | null {
  const meta = readXiuyuanMeta(card);
  const raw = meta?.neuralContext;
  if (!isRecord(raw)) {
    return null;
  }

  const neuralContext: AIReviewNeuralContext = {};
  const associationType = normalizeString(raw.associationType);
  const reason = normalizeString(raw.reason);
  const blockType = normalizeString(raw.blockType);
  const nodeRole = normalizeString(raw.nodeRole);
  const sourceVirtualNodeId = normalizeString(raw.sourceVirtualNodeId);

  if (associationType) neuralContext.associationType = associationType;
  if (reason) neuralContext.reason = reason;
  if (blockType) neuralContext.blockType = blockType;
  if (typeof raw.isFlashcard === 'boolean') neuralContext.isFlashcard = raw.isFlashcard;
  if (nodeRole) neuralContext.nodeRole = nodeRole;
  if (sourceVirtualNodeId) neuralContext.sourceVirtualNodeId = sourceVirtualNodeId;

  return Object.keys(neuralContext).length > 0 ? neuralContext : null;
}

export function isNeuralVirtualReviewCard(card: FSRSCard | null | undefined): boolean {
  return readReviewNeuralContext(card)?.isFlashcard === false;
}

export function readStringArrayFromMeta(meta: Record<string, unknown> | null, key: string): string[] {
  return normalizeStringArray(meta?.[key]);
}

export function isDocumentBlockType(value: unknown): boolean {
  const normalized = normalizeString(value).toLowerCase();
  return normalized === 'd' || normalized === 'nodedocument';
}

export function isReadModeCardType(cardType: unknown): boolean {
  const normalized = normalizeString(cardType).toLowerCase();
  return normalized === 'topic' || normalized === 'concept';
}

export function buildReviewCardSemantics(cardType: unknown): Pick<
  AIReviewCardContext,
  'hasAnswerFace' | 'explainRequiresReveal' | 'reviewActionLabel' | 'roleDescription'
> {
  if (isReadModeCardType(cardType)) {
    return {
      hasAnswerFace: false,
      explainRequiresReveal: false,
      reviewActionLabel: '下一张',
      roleDescription: '阅读型卡片：用于维持对主题、概念和上下文的接触，不依赖正反面答案回忆。',
    };
  }
  return {
    hasAnswerFace: true,
    explainRequiresReveal: true,
    reviewActionLabel: '显示答案',
    roleDescription: '提取型卡片：先尝试回忆，再揭示答案，用来训练稳定检索。',
  };
}

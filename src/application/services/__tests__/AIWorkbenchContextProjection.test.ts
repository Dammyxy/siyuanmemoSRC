import { describe, expect, it } from 'vitest';
import {
  buildContextSignature,
  buildReviewCardSemantics,
  deriveReviewChatKey,
  isDocumentBlockType,
  isNeuralVirtualReviewCard,
  readReviewNeuralContext,
  readStringArrayFromMeta,
  readXiuyuanMeta,
} from '../AIWorkbenchContextProjection';
import type { FSRSCard } from '@/types/card';
import type { AIReviewCardContext, AIWorkbenchContextSnapshot } from '@/types/ai';

function makeCard(meta: Record<string, unknown> = {}, type = 'item'): FSRSCard {
  return {
    id: 'card-1',
    blockId: 'block-1',
    type,
    meta,
  } as unknown as FSRSCard;
}

function makeReviewCardContext(overrides: Partial<AIReviewCardContext> = {}): AIReviewCardContext {
  return {
    cardId: 'card-1',
    blockId: 'block-1',
    cardType: 'item',
    revealed: false,
    hasAnswerFace: true,
    explainRequiresReveal: true,
    reviewActionLabel: '显示答案',
    roleDescription: '提取型卡片',
    sourceBlockIds: ['front-1', 'back-1'],
    frontText: 'front',
    backText: 'back',
    sourceText: 'source',
    neuralContext: null,
    ...overrides,
  };
}

describe('AIWorkbenchContextProjection', () => {
  it('builds compact context signatures for review cards and neural orbit batches', () => {
    const context: AIWorkbenchContextSnapshot = {
      source: 'review',
      selectedBlockIds: ['selected-1'],
      blocks: [{ blockId: 'block-1', text: 'Block text' }],
      queueType: 'due',
      queueProgress: { queueLabel: 'Today' } as never,
      currentCard: makeReviewCardContext({
        neuralContext: { isFlashcard: false, sourceVirtualNodeId: 'virtual-1' },
      }),
      currentCardRaw: null,
      neuralBatch: {
        kind: 'orbit-round',
        engineMode: 'review',
        currentNodeId: 'node-1',
        currentEventId: 'event-1',
        roundSize: 2,
        viewedCount: 1,
        remainingCount: 1,
        roundNodes: [{ nodeId: 'node-a' }, { nodeId: 'node-b' }],
      } as never,
    };

    const signature = JSON.parse(buildContextSignature(context) || '{}');

    expect(signature).toMatchObject({
      source: 'review',
      queueType: 'due',
      selectedBlockIds: ['selected-1'],
      blockIds: ['block-1'],
      currentCard: {
        cardId: 'card-1',
        blockId: 'block-1',
        revealed: false,
        sourceBlockIds: ['front-1', 'back-1'],
        neuralContext: { isFlashcard: false, sourceVirtualNodeId: 'virtual-1' },
      },
      neuralBatch: {
        kind: 'orbit-round',
        roundNodes: ['node-a', 'node-b'],
      },
    });
  });

  it('derives review chat keys from explicit options before queue progress', () => {
    expect(deriveReviewChatKey(null, ' explicit::key ')).toBe('explicit::key');
    expect(deriveReviewChatKey({
      source: 'review',
      selectedBlockIds: [],
      blocks: [],
      queueType: 'due',
      queueProgress: { queueLabel: 'Today' } as never,
      currentCard: null,
      currentCardRaw: null,
      neuralBatch: null,
    })).toBe('due::Today');
    expect(deriveReviewChatKey(null)).toBeNull();
  });

  it('projects review card meta, neural virtual flags, and card semantics', () => {
    const card = makeCard({
      frontBlockIDs: ['front-1', ''],
      neuralContext: {
        associationType: 'supports',
        reason: 'review orbit',
        blockType: 'd',
        isFlashcard: false,
        nodeRole: 'source',
        sourceVirtualNodeId: 'virtual-1',
      },
    }, 'topic');

    const meta = readXiuyuanMeta(card);
    expect(readStringArrayFromMeta(meta, 'frontBlockIDs')).toEqual(['front-1']);
    expect(readReviewNeuralContext(card)).toMatchObject({
      associationType: 'supports',
      isFlashcard: false,
      sourceVirtualNodeId: 'virtual-1',
    });
    expect(isNeuralVirtualReviewCard(card)).toBe(true);
    expect(isDocumentBlockType('NodeDocument')).toBe(true);
    expect(buildReviewCardSemantics(card.type)).toMatchObject({
      hasAnswerFace: false,
      explainRequiresReveal: false,
      reviewActionLabel: '下一张',
    });
  });
});

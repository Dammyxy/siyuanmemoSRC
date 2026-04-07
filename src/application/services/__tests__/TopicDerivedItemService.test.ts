import { describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import type { CreationDecision } from '@/core/card/post-creation/contracts';
import {
  ATTR_PROGRESSIVE_ANSWER_FINGERPRINT,
  ATTR_PROGRESSIVE_CREATION_RULE_ID,
  ATTR_PROGRESSIVE_KIND,
  ATTR_PROGRESSIVE_PARENT_TOPIC_CARD_ID,
  ATTR_PROGRESSIVE_SOURCE_BLOCK_ID,
  ATTR_PROGRESSIVE_SOURCE_DOC_ID,
  ATTR_PROGRESSIVE_STORAGE_MODE,
} from '@/core/siyuan/block';
import type { CardApplicationService } from '../CardApplicationService';
import type { ProgressiveReadingService } from '../ProgressiveReadingService';
import { TopicDerivedItemService } from '../TopicDerivedItemService';

function createCardServiceMock(existingCards: Array<Record<string, unknown>> = []) {
  let createdCount = 0;
  return {
    service: {
      getCards: vi.fn(async (query?: {
        filter?: {
          customFilter?: (card: Record<string, unknown>) => boolean;
        };
      }) => {
        const customFilter = query?.filter?.customFilter;
        const cards = typeof customFilter === 'function'
          ? existingCards.filter((card) => customFilter(card))
          : existingCards;
        return {
          cards,
          total: cards.length,
        };
      }),
      createCard: vi.fn(async () => ok({
        getId: () => ({
          getValue: () => `card-${++createdCount}`,
        }),
      })),
    } as unknown as CardApplicationService,
  };
}

function createProgressiveReadingServiceMock() {
  let createdCount = 0;
  return {
    service: {
      createChildDocFromSource: vi.fn(async (input: {
        storageMode?: 'workbench' | 'source-child';
      }) => ({
        docId: `derived-doc-${++createdCount}`,
        parentDocId: input.storageMode === 'source-child' ? 'doc-root' : 'workbench-root',
        storageMode: input.storageMode === 'source-child' ? 'source-child' : 'workbench',
        sequence: createdCount,
        contentBlockId: `derived-block-${createdCount}`,
      })),
    } as unknown as ProgressiveReadingService,
  };
}

function createSettingsProvider(storageMode: 'workbench' | 'source-child' = 'workbench') {
  return {
    getSettings: () => ({
      quickCard: {
        topicDerivation: {
          enabled: true,
          storageMode,
        },
      },
    }),
  };
}

const CLOZE_DECISION: CreationDecision = {
  id: 'InlineClozeRule',
  family: 'cloze',
  templateId: 'builtin-multi-cloze',
  cardType: 'item',
  mode: 'multi-face',
  executorKind: 'quick-cloze',
  priority: 100,
};

const CONCEPT_DEFINITION_DECISION: CreationDecision = {
  id: 'ConceptDefinitionInlineRule',
  family: 'concept-definition',
  templateId: 'builtin-concept-definition',
  cardType: 'item',
  mode: 'multi-face',
  executorKind: 'concept-definition-inline',
  direction: 'both',
  priority: 90,
};

describe('TopicDerivedItemService', () => {
  it('creates one derived item per cloze and keeps only the target answer marked in each child doc', async () => {
    const cardService = createCardServiceMock();
    const progressiveReadingService = createProgressiveReadingServiceMock();
    const service = new TopicDerivedItemService(
      cardService.service,
      progressiveReadingService.service,
      createSettingsProvider(),
    );

    const result = await service.createFromTopicSource({
      sourceBlockId: 'source-block-1',
      sourceDocId: 'doc-root-1',
      parentTopicCardId: 'topic-card-1',
      content: 'Alpha ==Beta== Gamma ==Delta==',
      decisions: [CLOZE_DECISION],
    });

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);
    expect(progressiveReadingService.service.createChildDocFromSource).toHaveBeenCalledTimes(2);
    expect(cardService.service.createCard).toHaveBeenCalledTimes(2);

    const firstChildInput = vi.mocked(progressiveReadingService.service.createChildDocFromSource).mock.calls[0]?.[0];
    const secondChildInput = vi.mocked(progressiveReadingService.service.createChildDocFromSource).mock.calls[1]?.[0];

    expect(firstChildInput).toEqual(expect.objectContaining({
      kind: 'derived-item-doc',
      titlePrefix: '练习',
      storageMode: 'workbench',
      attrs: expect.objectContaining({
        [ATTR_PROGRESSIVE_KIND]: 'derived-item-doc',
        [ATTR_PROGRESSIVE_SOURCE_DOC_ID]: 'doc-root-1',
        [ATTR_PROGRESSIVE_SOURCE_BLOCK_ID]: 'source-block-1',
        [ATTR_PROGRESSIVE_PARENT_TOPIC_CARD_ID]: 'topic-card-1',
        [ATTR_PROGRESSIVE_STORAGE_MODE]: 'workbench',
        [ATTR_PROGRESSIVE_CREATION_RULE_ID]: 'InlineClozeRule',
      }),
    }));
    expect(firstChildInput?.attrs?.[ATTR_PROGRESSIVE_ANSWER_FINGERPRINT]).toBe('source-block-1::InlineClozeRule::6:14');
    expect(firstChildInput?.contentMarkdown).toContain('==Beta==');
    expect(firstChildInput?.contentMarkdown).toContain('Delta');
    expect(firstChildInput?.contentMarkdown).not.toContain('==Delta==');

    expect(secondChildInput?.attrs?.[ATTR_PROGRESSIVE_ANSWER_FINGERPRINT]).toBe('source-block-1::InlineClozeRule::21:30');
    expect(secondChildInput?.contentMarkdown).toContain('Beta');
    expect(secondChildInput?.contentMarkdown).not.toContain('==Beta==');
    expect(secondChildInput?.contentMarkdown).toContain('==Delta==');

    expect(cardService.service.createCard).toHaveBeenNthCalledWith(1, expect.objectContaining({
      blockIds: ['derived-block-1'],
      cardType: 'item',
      extractedFrom: 'source-block-1',
      progressiveLineage: expect.objectContaining({
        kind: 'derived-item',
        sourceDocId: 'doc-root-1',
        sourceBlockId: 'source-block-1',
        parentTopicCardId: 'topic-card-1',
        storageMode: 'workbench',
        creationRuleId: 'InlineClozeRule',
        answerFingerprint: 'source-block-1::InlineClozeRule::6:14',
      }),
      metadata: expect.objectContaining({
        source: 'quick',
        symbolDetected: true,
        cardSource: 'quick-symbol',
        symbolType: '==',
      }),
    }));
    expect(result.items.map((item) => item.derivedCardId)).toEqual(['card-1', 'card-2']);
  });

  it('normalizes concept-definition derivation into a standalone item document and respects explicit storage mode', async () => {
    const cardService = createCardServiceMock();
    const progressiveReadingService = createProgressiveReadingServiceMock();
    const service = new TopicDerivedItemService(
      cardService.service,
      progressiveReadingService.service,
      createSettingsProvider('workbench'),
    );

    const result = await service.createFromTopicSource({
      sourceBlockId: 'source-block-2',
      sourceDocId: 'doc-root-2',
      parentTopicCardId: 'topic-card-2',
      content: '((concept-doc))::Definition body',
      decisions: [CONCEPT_DEFINITION_DECISION],
      storageMode: 'source-child',
    });

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);
    expect(progressiveReadingService.service.createChildDocFromSource).toHaveBeenCalledWith(expect.objectContaining({
      storageMode: 'source-child',
      contentMarkdown: '((concept-doc)) <> Definition body',
      previewText: 'Definition body',
    }));
    expect(cardService.service.createCard).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        source: 'symbol',
        symbolType: '<>',
        question: '((concept-doc))',
        answer: 'Definition body',
      }),
    }));
    expect(result.items[0]).toEqual(expect.objectContaining({
      sourceBlockId: 'source-block-2',
      storageMode: 'source-child',
      creationRuleId: 'ConceptDefinitionInlineRule',
      answerFingerprint: 'source-block-2::ConceptDefinitionInlineRule::((concept-doc)) <> Definition body',
    }));
  });

  it('skips already-derived fingerprints instead of creating duplicate child docs', async () => {
    const existingCards = [
      {
        meta: {
          progressive: {
            kind: 'derived-item',
            sourceBlockId: 'source-block-3',
            parentTopicCardId: 'topic-card-3',
            answerFingerprint: 'source-block-3::InlineClozeRule::6:14',
          },
        },
      },
    ];
    const cardService = createCardServiceMock(existingCards);
    const progressiveReadingService = createProgressiveReadingServiceMock();
    const service = new TopicDerivedItemService(
      cardService.service,
      progressiveReadingService.service,
      createSettingsProvider(),
    );

    const result = await service.createFromTopicSource({
      sourceBlockId: 'source-block-3',
      sourceDocId: 'doc-root-3',
      parentTopicCardId: 'topic-card-3',
      content: 'Alpha ==Beta==',
      decisions: [CLOZE_DECISION],
    });

    expect(result).toEqual({
      created: 0,
      skipped: 1,
      items: [],
    });
    expect(progressiveReadingService.service.createChildDocFromSource).not.toHaveBeenCalled();
    expect(cardService.service.createCard).not.toHaveBeenCalled();
  });
});

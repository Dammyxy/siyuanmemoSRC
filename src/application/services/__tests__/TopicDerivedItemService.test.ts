import { describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import type { CreationDecision } from '@/core/card/post-creation/contracts';
import {
  ATTR_PROGRESSIVE_ANSWER_FINGERPRINT,
  ATTR_PROGRESSIVE_CREATION_RULE_ID,
  ATTR_PROGRESSIVE_KIND,
  ATTR_PROGRESSIVE_PARENT_EXCERPT_ID,
  ATTR_PROGRESSIVE_PARENT_TOPIC_CARD_ID,
  ATTR_PROGRESSIVE_SOURCE_BLOCK_ID,
  ATTR_PROGRESSIVE_SOURCE_DOC_ID,
  ATTR_PROGRESSIVE_STORAGE_MODE,
} from '@/application/services/ProgressiveAttrContract';
import type { CardApplicationService } from '../CardApplicationService';
import type { ProgressiveNativeRiffPort } from '@/application/ports/ProgressiveNativeRiffPort';
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
      deleteCard: vi.fn(async () => ok(undefined)),
    } as unknown as CardApplicationService,
  };
}

function createProgressiveReadingServiceMock() {
  let createdCount = 0;
  const createChildDocFromSourceLocal = vi.fn(async (input: {
    storageMode?: 'workbench' | 'source-child';
  }) => ({
    docId: `derived-doc-${++createdCount}`,
    parentDocId: input.storageMode === 'source-child' ? 'doc-root' : 'workbench-root',
    storageMode: input.storageMode === 'source-child' ? 'source-child' : 'workbench',
    sequence: createdCount,
    contentBlockId: `derived-block-${createdCount}`,
  }));
  return {
    service: {
      createChildDocFromSource: vi.fn(createChildDocFromSourceLocal),
      createChildDocFromSourceLocal,
      deleteProgressiveArtifact: vi.fn(async () => undefined),
    } as unknown as ProgressiveReadingService,
  };
}

function createNativeRiffPortMock(
  overrides: Partial<ProgressiveNativeRiffPort> = {},
): ProgressiveNativeRiffPort {
  return {
    BUILTIN_DECK_ID: 'builtin-deck',
    addRiffCards: vi.fn(async () => ({
      name: 'builtin-deck',
      size: 0,
    })),
    ...overrides,
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

function createFailingSettingsProvider(error = new Error('settings unavailable')) {
  return {
    getSettings: () => {
      throw error;
    },
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
  it('reports topic-derived ownership query/command boundaries during creation', async () => {
    const cardService = createCardServiceMock();
    const progressiveReadingService = createProgressiveReadingServiceMock();
    const nativeRiffApi = createNativeRiffPortMock();
    const ownershipBoundaryClient = {
      p6OwnershipQuery: vi.fn(async () => ({ ok: true })),
      p6OwnershipCommand: vi.fn(async () => ({ ok: true })),
    };
    const service = new TopicDerivedItemService(
      cardService.service,
      progressiveReadingService.service,
      nativeRiffApi,
      createSettingsProvider(),
      ownershipBoundaryClient,
    );

    await service.createFromTopicSource({
      sourceBlockId: 'source-boundary-1',
      sourceDocId: 'doc-boundary-1',
      parentTopicCardId: 'topic-boundary-1',
      plannerContent: 'Alpha ==Beta==',
      decisions: [CLOZE_DECISION],
    });

    expect(ownershipBoundaryClient.p6OwnershipQuery).toHaveBeenCalledWith(expect.objectContaining({
      surface: 'topic-derived',
      operation: 'scan-candidates',
      payload: expect.objectContaining({
        sourceBlockId: 'source-boundary-1',
        sourceDocId: 'doc-boundary-1',
        parentTopicCardId: 'topic-boundary-1',
      }),
    }));
    expect(ownershipBoundaryClient.p6OwnershipCommand).toHaveBeenCalledWith(expect.objectContaining({
      surface: 'topic-derived',
      operation: 'execute-side-effect',
      payload: expect.objectContaining({
        sourceBlockId: 'source-boundary-1',
        sourceDocId: 'doc-boundary-1',
      }),
    }));
  });

  it('executes topic-derived creation through the backend command facade', async () => {
    const cardService = createCardServiceMock();
    const progressiveReadingService = createProgressiveReadingServiceMock();
    const nativeRiffApi = createNativeRiffPortMock();
    const backendClient = {
      executeTopicDerivedCommand: vi.fn(async () => ({
        status: 'completed' as const,
        commandId: 'topic-derived:create:1',
        idempotencyKey: 'topic-derived:source-block-1:doc-root-1:topic-card-1::planner-derived::1',
        operation: 'create-from-topic-source' as const,
        result: {
          created: 1,
          skipped: 0,
          items: [{
            derivedDocId: 'derived-doc-backend',
            derivedBlockId: 'derived-block-backend',
            derivedCardId: 'derived-card-backend',
            sourceBlockId: 'source-block-1',
            storageMode: 'workbench',
            creationRuleId: 'InlineClozeRule',
            answerFingerprint: 'fingerprint-backend',
          }],
        },
        audit: { created: 1, skipped: 0, nativeRiffRegistered: 1 },
        rollback: { attempted: false, status: 'not-needed' as const },
        progress: {
          state: 'succeeded' as const,
          updatedAt: 1,
        },
        diagnostics: {
          diagnosticEventId: 'topic-derived:create:1',
          family: 'topic-derived.command' as const,
          commandId: 'topic-derived:create:1',
          errorCategory: null,
        },
      })),
    };
    const service = new TopicDerivedItemService(
      cardService.service,
      progressiveReadingService.service,
      nativeRiffApi,
      createSettingsProvider(),
      undefined,
      backendClient,
    );

    const result = await service.createFromTopicSource({
      sourceBlockId: 'source-block-1',
      sourceDocId: 'doc-root-1',
      parentTopicCardId: 'topic-card-1',
      plannerContent: 'Alpha ==Beta==',
      decisions: [CLOZE_DECISION],
    });

    expect(result.created).toBe(1);
    expect(progressiveReadingService.service.createChildDocFromSource).not.toHaveBeenCalled();
    expect(backendClient.executeTopicDerivedCommand).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'create-from-topic-source',
      input: expect.objectContaining({
        sourceBlockId: 'source-block-1',
        sourceDocId: 'doc-root-1',
        parentTopicCardId: 'topic-card-1',
      }),
    }));
  });

  it('relays topic-derived backend commands when current window is follower', async () => {
    const cardService = createCardServiceMock();
    const progressiveReadingService = createProgressiveReadingServiceMock();
    const nativeRiffApi = createNativeRiffPortMock();
    const backendClient = {
      executeTopicDerivedCommand: vi.fn(async () => {
        throw new Error('writer should own follower topic-derived command');
      }),
    };
    const followerCommandClient = {
      submitAndWait: vi.fn(async () => ({
        status: 'completed' as const,
        commandId: 'topic-relayed',
        idempotencyKey: 'topic-relayed-key',
        operation: 'create-from-topic-source' as const,
        result: {
          created: 1,
          skipped: 0,
          items: [{
            derivedDocId: 'derived-doc-relayed',
            derivedBlockId: 'derived-block-relayed',
            derivedCardId: 'derived-card-relayed',
            sourceBlockId: 'source-block-relay',
            storageMode: 'workbench',
            creationRuleId: 'InlineClozeRule',
            answerFingerprint: 'fingerprint-relayed',
          }],
        },
        audit: { created: 1, skipped: 0, nativeRiffRegistered: 1 },
        rollback: { attempted: false, status: 'not-needed' as const },
        progress: { state: 'succeeded' as const, updatedAt: 1 },
        diagnostics: {
          diagnosticEventId: 'topic-relayed',
          family: 'topic-derived.command' as const,
          commandId: 'topic-relayed',
          errorCategory: null,
        },
      })),
    };
    const service = new TopicDerivedItemService(
      cardService.service,
      progressiveReadingService.service,
      nativeRiffApi,
      createSettingsProvider(),
      undefined,
      backendClient,
      { getMode: vi.fn(() => 'follower'), getInstanceId: vi.fn(() => 'follower-1') },
      followerCommandClient,
    );

    const result = await service.createFromTopicSource({
      sourceBlockId: 'source-block-relay',
      sourceDocId: 'doc-root-relay',
      parentTopicCardId: 'topic-card-relay',
      plannerContent: 'Alpha ==Beta==',
      decisions: [CLOZE_DECISION],
    });

    expect(result.created).toBe(1);
    expect(backendClient.executeTopicDerivedCommand).not.toHaveBeenCalled();
    expect(progressiveReadingService.service.createChildDocFromSource).not.toHaveBeenCalled();
    expect(followerCommandClient.submitAndWait).toHaveBeenCalledWith(expect.objectContaining({
      instanceId: 'follower-1',
      method: 'topic-derived.command.execute',
      params: expect.objectContaining({
        operation: 'create-from-topic-source',
        input: expect.objectContaining({
          sourceBlockId: 'source-block-relay',
          sourceDocId: 'doc-root-relay',
          parentTopicCardId: 'topic-card-relay',
        }),
        caller: expect.objectContaining({
          runtimeRole: 'follower',
          instanceId: 'follower-1',
        }),
      }),
    }));
  });

  it('creates one derived item per cloze and keeps only the target answer marked in each child doc', async () => {
    const cardService = createCardServiceMock();
    const progressiveReadingService = createProgressiveReadingServiceMock();
    const nativeRiffApi = createNativeRiffPortMock();
    const service = new TopicDerivedItemService(
      cardService.service,
      progressiveReadingService.service,
      nativeRiffApi,
      createSettingsProvider(),
    );

    const result = await service.createFromTopicSource({
      sourceBlockId: 'source-block-1',
      sourceDocId: 'doc-root-1',
      parentTopicCardId: 'topic-card-1',
      plannerContent: 'Alpha ==Beta== Gamma ==Delta==',
      decisions: [CLOZE_DECISION],
    });

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);
    expect(progressiveReadingService.service.createChildDocFromSource).toHaveBeenCalledTimes(2);
    expect(cardService.service.createCard).toHaveBeenCalledTimes(2);
    expect(nativeRiffApi.addRiffCards).toHaveBeenCalledTimes(2);

    const firstChildInput = vi.mocked(progressiveReadingService.service.createChildDocFromSource).mock.calls[0]?.[0];
    const secondChildInput = vi.mocked(progressiveReadingService.service.createChildDocFromSource).mock.calls[1]?.[0];

    expect(firstChildInput).toEqual(expect.objectContaining({
      kind: 'derived-item-doc',
      fallbackTitle: '挖空',
      storageMode: 'workbench',
      attrs: expect.objectContaining({
        [ATTR_PROGRESSIVE_KIND]: 'derived-item-doc',
        [ATTR_PROGRESSIVE_SOURCE_DOC_ID]: 'doc-root-1',
        [ATTR_PROGRESSIVE_SOURCE_BLOCK_ID]: 'source-block-1',
        [ATTR_PROGRESSIVE_PARENT_TOPIC_CARD_ID]: 'topic-card-1',
        [ATTR_PROGRESSIVE_STORAGE_MODE]: 'workbench',
      }),
    }));
    expect(firstChildInput?.attrs).not.toHaveProperty(ATTR_PROGRESSIVE_CREATION_RULE_ID);
    expect(firstChildInput?.attrs).not.toHaveProperty(ATTR_PROGRESSIVE_ANSWER_FINGERPRINT);
    expect(firstChildInput?.contentMarkdown).toContain('==Beta==');
    expect(firstChildInput?.contentMarkdown).toContain('Delta');
    expect(firstChildInput?.contentMarkdown).not.toContain('==Delta==');

    expect(secondChildInput?.attrs).not.toHaveProperty(ATTR_PROGRESSIVE_CREATION_RULE_ID);
    expect(secondChildInput?.attrs).not.toHaveProperty(ATTR_PROGRESSIVE_ANSWER_FINGERPRINT);
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
        source: 'topic-derived',
        cardSource: 'topic-derived',
      }),
    }));
    const firstMetadata = vi.mocked(cardService.service.createCard).mock.calls[0]?.[0]?.metadata as Record<string, unknown>;
    expect(firstMetadata.symbolDetected).toBeUndefined();
    expect(firstMetadata.symbolType).toBeUndefined();
    expect(nativeRiffApi.addRiffCards).toHaveBeenNthCalledWith(1, 'builtin-deck', ['derived-block-1']);
    expect(nativeRiffApi.addRiffCards).toHaveBeenNthCalledWith(2, 'builtin-deck', ['derived-block-2']);
    expect(result.items.map((item) => item.derivedCardId)).toEqual(['card-1', 'card-2']);
  });

  it('normalizes concept-definition derivation into a standalone item document and respects explicit storage mode', async () => {
    const cardService = createCardServiceMock();
    const progressiveReadingService = createProgressiveReadingServiceMock();
    const nativeRiffApi = createNativeRiffPortMock();
    const service = new TopicDerivedItemService(
      cardService.service,
      progressiveReadingService.service,
      nativeRiffApi,
      createSettingsProvider('workbench'),
    );

    const result = await service.createFromTopicSource({
      sourceBlockId: 'source-block-2',
      sourceDocId: 'doc-root-2',
      parentTopicCardId: 'topic-card-2',
      plannerContent: '((concept-doc))::Definition body',
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
        source: 'topic-derived',
        cardSource: 'topic-derived',
        question: '((concept-doc))',
        answer: 'Definition body',
      }),
    }));
    const metadata = vi.mocked(cardService.service.createCard).mock.calls[0]?.[0]?.metadata as Record<string, unknown>;
    expect(metadata.symbolDetected).toBeUndefined();
    expect(metadata.symbolType).toBeUndefined();
    expect(result.items[0]).toEqual(expect.objectContaining({
      sourceBlockId: 'source-block-2',
      storageMode: 'source-child',
      creationRuleId: 'ConceptDefinitionInlineRule',
      answerFingerprint: 'source-block-2::ConceptDefinitionInlineRule::((concept-doc)) <> Definition body',
    }));
    expect(nativeRiffApi.addRiffCards).toHaveBeenCalledWith('builtin-deck', ['derived-block-1']);
  });

  it('forces excerpt-doc derivations to create direct child docs and persist parent excerpt lineage', async () => {
    const cardService = createCardServiceMock();
    const progressiveReadingService = createProgressiveReadingServiceMock();
    const nativeRiffApi = createNativeRiffPortMock();
    const service = new TopicDerivedItemService(
      cardService.service,
      progressiveReadingService.service,
      nativeRiffApi,
      createSettingsProvider('workbench'),
    );

    const result = await service.createFromTopicSource({
      sourceBlockId: 'source-block-excerpt-1',
      sourceDocId: 'excerpt-doc-root-1',
      parentTopicCardId: 'topic-card-excerpt-1',
      parentExcerptId: 'excerpt-doc-root-1',
      sourceRootKind: 'excerpt-doc',
      plannerContent: 'Alpha ==Beta==',
      decisions: [CLOZE_DECISION],
      storageMode: 'workbench',
    });

    expect(result.created).toBe(1);
    expect(progressiveReadingService.service.createChildDocFromSource).toHaveBeenCalledWith(expect.objectContaining({
      sourceDocId: 'excerpt-doc-root-1',
      storageMode: 'source-child',
      attrs: expect.objectContaining({
        [ATTR_PROGRESSIVE_PARENT_TOPIC_CARD_ID]: 'topic-card-excerpt-1',
        [ATTR_PROGRESSIVE_PARENT_EXCERPT_ID]: 'excerpt-doc-root-1',
        [ATTR_PROGRESSIVE_STORAGE_MODE]: 'source-child',
      }),
    }));
    expect(cardService.service.createCard).toHaveBeenCalledWith(expect.objectContaining({
      progressiveLineage: expect.objectContaining({
        kind: 'derived-item',
        sourceDocId: 'excerpt-doc-root-1',
        sourceBlockId: 'source-block-excerpt-1',
        parentTopicCardId: 'topic-card-excerpt-1',
        parentExcerptId: 'excerpt-doc-root-1',
        storageMode: 'source-child',
      }),
    }));
  });

  it('keeps excerpt-block derivations bound to the parent excerpt while preserving the configured child-doc mode', async () => {
    const cardService = createCardServiceMock();
    const progressiveReadingService = createProgressiveReadingServiceMock();
    const nativeRiffApi = createNativeRiffPortMock();
    const service = new TopicDerivedItemService(
      cardService.service,
      progressiveReadingService.service,
      nativeRiffApi,
      createSettingsProvider('workbench'),
    );

    const result = await service.createFromTopicSource({
      sourceBlockId: 'excerpt-block-1',
      sourceDocId: 'daily-doc-1',
      parentTopicCardId: 'topic-card-excerpt-block-1',
      parentExcerptId: 'excerpt-block-1',
      sourceRootKind: 'excerpt-block',
      plannerContent: 'Alpha >> Beta',
      decisions: [{
        id: 'BasicDirectionRule',
        family: 'basic',
        templateId: 'builtin-quick-card',
        cardType: 'item',
        mode: 'single',
        executorKind: 'quick-basic',
        direction: 'forward',
        priority: 50,
      }],
    });

    expect(result.created).toBe(1);
    expect(progressiveReadingService.service.createChildDocFromSource).toHaveBeenCalledWith(expect.objectContaining({
      sourceDocId: 'daily-doc-1',
      storageMode: 'workbench',
      attrs: expect.objectContaining({
        [ATTR_PROGRESSIVE_PARENT_TOPIC_CARD_ID]: 'topic-card-excerpt-block-1',
        [ATTR_PROGRESSIVE_PARENT_EXCERPT_ID]: 'excerpt-block-1',
        [ATTR_PROGRESSIVE_STORAGE_MODE]: 'workbench',
      }),
    }));
    expect(cardService.service.createCard).toHaveBeenCalledWith(expect.objectContaining({
      progressiveLineage: expect.objectContaining({
        kind: 'derived-item',
        sourceDocId: 'daily-doc-1',
        sourceBlockId: 'excerpt-block-1',
        parentTopicCardId: 'topic-card-excerpt-block-1',
        parentExcerptId: 'excerpt-block-1',
        storageMode: 'workbench',
      }),
    }));
    expect(nativeRiffApi.addRiffCards).toHaveBeenCalledWith('builtin-deck', ['derived-block-1']);
  });

  it('executes backend topic-derived child-doc creation through the local progressive operation', async () => {
    const cardService = createCardServiceMock();
    const progressiveReadingService = createProgressiveReadingServiceMock();
    vi.mocked(progressiveReadingService.service.createChildDocFromSource).mockRejectedValueOnce(
      new Error('PROGRESSIVE_COMMAND_UNAVAILABLE: nested facade unavailable'),
    );
    const nativeRiffApi = createNativeRiffPortMock();
    const service = new TopicDerivedItemService(
      cardService.service,
      progressiveReadingService.service,
      nativeRiffApi,
      createSettingsProvider(),
    );

    const result = await service.executeFromBackend({
      requestId: 'topic-derived:test',
      commandId: 'topic-derived:test',
      idempotencyKey: 'topic-derived:test-key',
      operation: 'create-from-topic-source',
      requestedAt: 1,
      deadlineAt: 60_001,
      input: {
        sourceBlockId: 'source-backend-local-1',
        sourceDocId: 'doc-backend-local-1',
        parentTopicCardId: 'topic-backend-local-1',
        plannerContent: 'Alpha ==Beta==',
        decisions: [CLOZE_DECISION],
      },
      caller: {
        instanceId: 'backend-test',
        runtimeRole: 'single-window',
        surface: 'review',
      },
    });

    expect(result.status).toBe('completed');
    expect(progressiveReadingService.service.createChildDocFromSource).not.toHaveBeenCalled();
    expect(progressiveReadingService.service.createChildDocFromSourceLocal).toHaveBeenCalledTimes(1);
  });

  it('fails explicitly when topic derivation storage mode settings cannot be read', async () => {
    const cardService = createCardServiceMock();
    const progressiveReadingService = createProgressiveReadingServiceMock();
    const nativeRiffApi = createNativeRiffPortMock();
    const service = new TopicDerivedItemService(
      cardService.service,
      progressiveReadingService.service,
      nativeRiffApi,
      createFailingSettingsProvider(),
    );

    await expect(service.createFromTopicSource({
      sourceBlockId: 'source-block-settings-1',
      sourceDocId: 'doc-root-settings-1',
      parentTopicCardId: 'topic-card-settings-1',
      plannerContent: 'Alpha ==Beta==',
      decisions: [CLOZE_DECISION],
    })).rejects.toThrow('TOPIC_DERIVED_SETTINGS_UNAVAILABLE');

    expect(progressiveReadingService.service.createChildDocFromSource).not.toHaveBeenCalled();
    expect(cardService.service.createCard).not.toHaveBeenCalled();
    expect(nativeRiffApi.addRiffCards).not.toHaveBeenCalled();
  });

  it('skips malformed basic lines and uses a later valid basic line for derivation', async () => {
    const cardService = createCardServiceMock();
    const progressiveReadingService = createProgressiveReadingServiceMock();
    const nativeRiffApi = createNativeRiffPortMock();
    const service = new TopicDerivedItemService(
      cardService.service,
      progressiveReadingService.service,
      nativeRiffApi,
      createSettingsProvider('workbench'),
    );

    const result = await service.createFromTopicSource({
      sourceBlockId: 'source-block-basic-1',
      sourceDocId: 'doc-root-basic-1',
      parentTopicCardId: 'topic-card-basic-1',
      plannerContent: '测试>>\nAlpha <> Beta',
      decisions: [{
        id: 'BasicDirectionRule',
        family: 'basic',
        templateId: 'builtin-bidirectional-single',
        cardType: 'item',
        mode: 'multi-face',
        executorKind: 'quick-basic',
        direction: 'both',
        priority: 50,
      }],
    });

    expect(result.created).toBe(1);
    expect(progressiveReadingService.service.createChildDocFromSource).toHaveBeenCalledWith(expect.objectContaining({
      contentMarkdown: 'Alpha <> Beta',
      previewText: 'Beta',
    }));
    expect(cardService.service.createCard).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        question: 'Alpha',
        answer: 'Beta',
      }),
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
    const nativeRiffApi = createNativeRiffPortMock();
    const service = new TopicDerivedItemService(
      cardService.service,
      progressiveReadingService.service,
      nativeRiffApi,
      createSettingsProvider(),
    );

    const result = await service.createFromTopicSource({
      sourceBlockId: 'source-block-3',
      sourceDocId: 'doc-root-3',
      parentTopicCardId: 'topic-card-3',
      plannerContent: 'Alpha ==Beta==',
      decisions: [CLOZE_DECISION],
    });

    expect(result).toEqual({
      created: 0,
      skipped: 1,
      items: [],
    });
    expect(progressiveReadingService.service.createChildDocFromSource).not.toHaveBeenCalled();
    expect(cardService.service.createCard).not.toHaveBeenCalled();
    expect(nativeRiffApi.addRiffCards).not.toHaveBeenCalled();
  });

  it('rolls back the new child doc and local card when native Riff sync fails', async () => {
    const cardService = createCardServiceMock();
    const progressiveReadingService = createProgressiveReadingServiceMock();
    const nativeRiffApi = createNativeRiffPortMock({
      addRiffCards: vi.fn(async () => {
        throw new Error('native riff failed');
      }),
    });
    const service = new TopicDerivedItemService(
      cardService.service,
      progressiveReadingService.service,
      nativeRiffApi,
      createSettingsProvider(),
    );

    await expect(service.createFromTopicSource({
      sourceBlockId: 'source-block-4',
      sourceDocId: 'doc-root-4',
      parentTopicCardId: 'topic-card-4',
      plannerContent: 'Alpha ==Beta==',
      decisions: [CLOZE_DECISION],
    })).rejects.toThrow('native riff failed');

    expect(cardService.service.deleteCard).toHaveBeenCalledWith({ cardId: 'card-1' });
    expect(progressiveReadingService.service.deleteProgressiveArtifact).toHaveBeenCalledWith('derived-doc-1');
  });

  it('uses content DOM for manual Topic cloze items so inline links, refs, and tokens are preserved', async () => {
    const cardService = createCardServiceMock();
    const progressiveReadingService = createProgressiveReadingServiceMock();
    const nativeRiffApi = createNativeRiffPortMock();
    const service = new TopicDerivedItemService(
      cardService.service,
      progressiveReadingService.service,
      nativeRiffApi,
      createSettingsProvider(),
    );

    const result = await service.createFromTopicSource({
      sourceBlockId: 'source-block-manual-1',
      sourceDocId: 'topic-doc-root-1',
      parentTopicCardId: 'topic-card-manual-1',
      plannerContent: 'Alpha ==((20240101010101-abcdefg)) link asset siyuan tag== Gamma',
      artifactContentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Alpha <span data-type="mark"><span data-type="block-ref" data-id="20240101010101-abcdefg">*</span> <span data-type="a" data-href="https://example.com">link</span> <span data-type="a" data-href="assets/paper.pdf">asset</span> <span data-type="a" data-href="siyuan://blocks/20240101010101-abcdefg">siyuan</span> <span data-type="tag">#token#</span></span> Gamma</div></div>',
      previewText: '*',
      answerFingerprint: 'source-block-manual-1::ManualSelectionClozeRule::Alpha::((20240101010101-abcdefg))::Gamma',
      mode: 'manual-cloze',
      decisions: [CLOZE_DECISION],
    });

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);

    const firstChildInput = vi.mocked(progressiveReadingService.service.createChildDocFromSource).mock.calls[0]?.[0];
    expect(firstChildInput).toEqual(expect.objectContaining({
      kind: 'derived-item-doc',
      fallbackTitle: '挖空',
      previewText: '*',
      contentDom: expect.stringContaining('data-type="block-ref"'),
      attrs: expect.any(Object),
    }));
    expect(firstChildInput?.attrs).not.toHaveProperty(ATTR_PROGRESSIVE_CREATION_RULE_ID);
    expect(firstChildInput?.attrs).not.toHaveProperty(ATTR_PROGRESSIVE_ANSWER_FINGERPRINT);
    expect(firstChildInput?.contentDom).toContain('>*</span>');
    expect(firstChildInput?.contentDom).toContain('<span data-type="mark"><span data-type="block-ref"');
    expect(firstChildInput?.contentDom).toContain('data-href="https://example.com"');
    expect(firstChildInput?.contentDom).toContain('data-href="assets/paper.pdf"');
    expect(firstChildInput?.contentDom).toContain('data-href="siyuan://blocks/20240101010101-abcdefg"');
    expect(firstChildInput?.contentDom).toContain('data-type="tag"');
    expect(firstChildInput).not.toHaveProperty('contentMarkdown');

    expect(cardService.service.createCard).toHaveBeenCalledWith(expect.objectContaining({
      progressiveLineage: expect.objectContaining({
        kind: 'derived-item',
        answerFingerprint: 'source-block-manual-1::ManualSelectionClozeRule::Alpha::((20240101010101-abcdefg))::Gamma',
      }),
      metadata: expect.objectContaining({
        source: 'topic-derived',
        cardSource: 'topic-derived',
      }),
    }));
    expect(nativeRiffApi.addRiffCards).toHaveBeenCalledWith('builtin-deck', ['derived-block-1']);
  });

  it('skips duplicate manual Topic cloze items by the contextual answer fingerprint', async () => {
    const existingCards = [
      {
        meta: {
          progressive: {
            kind: 'derived-item',
            sourceBlockId: 'source-block-manual-2',
            parentTopicCardId: 'topic-card-manual-2',
            answerFingerprint: 'source-block-manual-2::ManualSelectionClozeRule::Alpha::Beta::Gamma',
          },
        },
      },
    ];
    const cardService = createCardServiceMock(existingCards);
    const progressiveReadingService = createProgressiveReadingServiceMock();
    const nativeRiffApi = createNativeRiffPortMock();
    const service = new TopicDerivedItemService(
      cardService.service,
      progressiveReadingService.service,
      nativeRiffApi,
      createSettingsProvider(),
    );

    const result = await service.createFromTopicSource({
      sourceBlockId: 'source-block-manual-2',
      sourceDocId: 'topic-doc-root-2',
      parentTopicCardId: 'topic-card-manual-2',
      plannerContent: 'Alpha ==Beta== Gamma',
      artifactContentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Alpha <span data-type="mark">Beta</span> Gamma</div></div>',
      previewText: 'Beta',
      answerFingerprint: 'source-block-manual-2::ManualSelectionClozeRule::Alpha::Beta::Gamma',
      mode: 'manual-cloze',
      decisions: [CLOZE_DECISION],
    });

    expect(result).toEqual({
      created: 0,
      skipped: 1,
      items: [],
    });
    expect(progressiveReadingService.service.createChildDocFromSource).not.toHaveBeenCalled();
    expect(cardService.service.createCard).not.toHaveBeenCalled();
    expect(nativeRiffApi.addRiffCards).not.toHaveBeenCalled();
  });
});

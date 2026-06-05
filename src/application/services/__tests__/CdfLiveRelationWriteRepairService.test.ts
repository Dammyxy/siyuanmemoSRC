import { describe, expect, it, vi } from 'vitest';
import {
  CdfLiveRelationSqlCandidateSourceScanner,
  CdfLiveRelationWriteRepairService,
  type CdfLiveRelationWriteRepairManagerPort,
} from '../CdfLiveRelationWriteRepairService';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { CdfLiveBlockNode, CdfLiveRelationCandidate } from '@/core/card/cdf-live-relation';

const SOURCE_ID = '20260101000001-bbbbbbb';
const CONCEPT_A_ID = '20260101000000-aaaaaaa';
const CONCEPT_B_ID = '20260101000000-ccccccc';
const CONCEPT_DUPLICATE_ID = '20260101000000-ddddddd';
const NOW = 1_700_000_000_123;

function sourceNode(markdown: string): CdfLiveBlockNode {
  return {
    id: SOURCE_ID,
    type: 'p',
    markdown,
  };
}

function node(id: string, markdown: string, children: CdfLiveBlockNode[] = []): CdfLiveBlockNode {
  return {
    id,
    type: 'i',
    markdown,
    children,
  };
}

function relationCard(overrides: {
  id?: string;
  sourceBlockId?: string;
  conceptBlockId?: string;
  relationKind?: 'definition-forward' | 'definition-reverse' | 'descriptor-forward' | 'descriptor-reverse';
  status?: string;
  reps?: number;
} = {}): FSRSCard {
  const sourceBlockId = overrides.sourceBlockId ?? SOURCE_ID;
  const conceptBlockId = overrides.conceptBlockId ?? CONCEPT_A_ID;
  const relationKind = overrides.relationKind ?? 'definition-forward';
  const templateID = relationKind.startsWith('definition')
    ? 'builtin-concept-definition-forward'
    : 'builtin-concept-descriptor';
  const typeMarker = relationKind.startsWith('definition')
    ? 'concept-definition-forward'
    : 'concept-descriptor-forward';
  return {
    id: overrides.id ?? `card-${sourceBlockId}-${conceptBlockId}-${relationKind}`,
    xiuyuanID: `xiuyuan-${sourceBlockId}-${conceptBlockId}-${relationKind}`,
    blockId: sourceBlockId,
    due: NOW,
    stability: 4,
    difficulty: 5,
    reps: overrides.reps ?? 3,
    lapses: 0,
    state: CardState.Review,
    lastReview: NOW - 10_000,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: relationKind.startsWith('definition') ? CardType.Concept : CardType.Descriptor,
    tags: [],
    cardTypeMarker: relationKind.startsWith('definition') ? 'concept' : 'descriptor',
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: NOW - 20_000,
    updatedAt: NOW - 10_000,
    faceKey: {
      ruleId: relationKind.startsWith('definition') ? 'concept-definition-forward' : 'descriptor-forward',
      faceIndex: 0,
    },
    meta: {
      xiuyuanID: `xiuyuan-${sourceBlockId}-${conceptBlockId}-${relationKind}`,
      templateID,
      typeMarker,
      liveRelationKey: `${sourceBlockId}:${conceptBlockId}:${relationKind}`,
      relationAuthority: 'live-backlink',
      sourceBlockId,
      conceptBlockId,
      relationKind,
      liveRelationStatus: overrides.status ?? 'active-live',
      liveContentStatus: 'content-complete',
      fieldMapping: relationKind.startsWith('definition')
        ? { concept: conceptBlockId, definition: sourceBlockId }
        : { concept: conceptBlockId, descriptor: sourceBlockId },
      frontBlockIDs: [conceptBlockId, sourceBlockId],
      backBlockIDs: [conceptBlockId, sourceBlockId],
    },
  };
}

function createManager(
  cards: FSRSCard[] = [],
  options: { cardsByBlockId?: Record<string, FSRSCard[]> } = {},
): CdfLiveRelationWriteRepairManagerPort {
  return {
    getCards: vi.fn(async (filter?: { blockIds?: string[] }) => {
      const blockIds = filter?.blockIds || [];
      if (options.cardsByBlockId && blockIds.length > 0) {
        return blockIds.flatMap((blockId) => options.cardsByBlockId?.[blockId] || []);
      }
      return cards;
    }),
    updateCard: vi.fn(async () => undefined),
    onCardCreated: vi.fn(async () => undefined),
  };
}

describe('CdfLiveRelationWriteRepairService', () => {
  it('previews full repair as a workspace dry-run without persisting candidate creates or metadata repairs', async () => {
    const legacySourceId = 'legacy-source';
    const existingLegacyRelation = relationCard({
      id: 'legacy-relation-card',
      sourceBlockId: legacySourceId,
      conceptBlockId: CONCEPT_A_ID,
      relationKind: 'definition-forward',
    });
    const manager = createManager([existingLegacyRelation], {
      cardsByBlockId: {
        [legacySourceId]: [existingLegacyRelation],
      },
    });
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const candidateScanner = {
      listCandidateSources: vi.fn(async () => [
        {
          sourceBlockId: SOURCE_ID,
          rootId: 'doc-root',
          notebookId: 'notebook-a',
          candidateReasons: ['operator' as const],
        },
        {
          sourceBlockId: legacySourceId,
          rootId: 'legacy-doc-root',
          notebookId: 'notebook-a',
          candidateReasons: ['existing-card' as const],
        },
      ]),
    };
    const sourceLoader = {
      loadSourceTree: vi.fn(async (sourceBlockId: string) => {
        if (sourceBlockId === 'doc-root') {
          return node('doc-root', 'Document', [
            sourceNode(`((${CONCEPT_A_ID} "Concept A")) :> definition body`),
          ]);
        }
        if (sourceBlockId === 'legacy-doc-root') {
          return node('legacy-doc-root', 'Document', [
            node(legacySourceId, 'plain text after relation removed'),
          ]);
        }
        return null;
      }),
    };
    const service = new CdfLiveRelationWriteRepairService({
      manager,
      cardCreator: creator,
      sourceLoader,
      candidateScanner,
      now: () => NOW,
      idFactory: (relation: CdfLiveRelationCandidate) => `card-${relation.sourceBlockId}-${relation.conceptBlockId}-${relation.relationKind}`,
      xiuyuanIdFactory: (relation: CdfLiveRelationCandidate) => `xiuyuan-${relation.sourceBlockId}-${relation.conceptBlockId}-${relation.relationKind}`,
    });

    const preview = await service.previewFullRepairDryRun();

    expect(preview.attempted).toBe(true);
    expect(preview.scope).toEqual({ kind: 'workspace' });
    expect(preview.reason).toBe('previewed');
    expect(preview.summary).toEqual(expect.objectContaining({
      candidateSourceCount: 2,
      scannedRootCount: 2,
      derivedRelationCount: 1,
      createCardCount: 1,
      orphanCount: 1,
      persistedMutationCount: 0,
    }));
    expect(preview.sourcePreviews).toHaveLength(2);
    expect(preview.sourcePreviews[0]).toEqual(expect.objectContaining({
      scanRootId: 'doc-root',
      candidateSourceIds: [SOURCE_ID],
      result: expect.objectContaining({
        createdCards: [
          expect.objectContaining({
            id: `card-${SOURCE_ID}-${CONCEPT_A_ID}-definition-forward`,
            meta: expect.objectContaining({
              liveRelationStatus: 'active-live',
              liveContentStatus: 'content-complete',
            }),
          }),
        ],
      }),
    }));
    expect(preview.sourcePreviews[1]).toEqual(expect.objectContaining({
      scanRootId: 'legacy-doc-root',
      candidateSourceIds: [legacySourceId],
      result: expect.objectContaining({
        updatedCards: [
          expect.objectContaining({
            id: 'legacy-relation-card',
            meta: expect.objectContaining({
              liveRelationStatus: 'orphaned-by-live-relation',
            }),
          }),
        ],
      }),
    }));
    expect(candidateScanner.listCandidateSources).toHaveBeenCalledWith({
      scope: { kind: 'workspace' },
      existingSourceBlockIds: [legacySourceId],
      limit: undefined,
    });
    expect(sourceLoader.loadSourceTree).toHaveBeenCalledWith('doc-root', {
      reconciliationScope: 'source',
      changedBlockId: undefined,
    });
    expect(sourceLoader.loadSourceTree).toHaveBeenCalledWith('legacy-doc-root', {
      reconciliationScope: 'source',
      changedBlockId: undefined,
    });
    expect(creator.createCards).not.toHaveBeenCalled();
    expect(manager.updateCard).not.toHaveBeenCalled();
    expect(manager.onCardCreated).not.toHaveBeenCalled();
  });

  it('passes Browser scope narrowing to full repair candidate scanning', async () => {
    const manager = createManager();
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const candidateScanner = {
      listCandidateSources: vi.fn(async () => []),
    };
    const service = new CdfLiveRelationWriteRepairService({
      manager,
      cardCreator: creator,
      sourceLoader: {
        loadSourceTree: vi.fn(async () => null),
      },
      candidateScanner,
      now: () => NOW,
    });

    const preview = await service.previewFullRepairDryRun({
      scope: {
        kind: 'browser',
        docId: 'doc-a',
        scopeDocIds: ['doc-b', 'doc-c'],
        notebookId: 'notebook-a',
      },
    });

    expect(preview.reason).toBe('no-candidates');
    expect(candidateScanner.listCandidateSources).toHaveBeenCalledWith({
      scope: {
        kind: 'browser',
        docId: 'doc-a',
        scopeDocIds: ['doc-b', 'doc-c'],
        notebookId: 'notebook-a',
      },
      existingSourceBlockIds: [],
      limit: undefined,
    });
  });

  it('executes full repair by reconciling existing-card candidates and leaving new candidates preview-only by default', async () => {
    const legacySourceId = 'legacy-source';
    const existingLegacyRelation = relationCard({
      id: 'legacy-relation-card',
      sourceBlockId: legacySourceId,
      conceptBlockId: CONCEPT_A_ID,
      relationKind: 'definition-forward',
    });
    const manager = createManager([existingLegacyRelation], {
      cardsByBlockId: {
        [legacySourceId]: [existingLegacyRelation],
      },
    });
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const candidateScanner = {
      listCandidateSources: vi.fn(async () => [
        {
          sourceBlockId: SOURCE_ID,
          rootId: 'doc-root',
          candidateReasons: ['operator' as const],
        },
        {
          sourceBlockId: legacySourceId,
          rootId: 'legacy-doc-root',
          candidateReasons: ['existing-card' as const],
        },
      ]),
    };
    const sourceLoader = {
      loadSourceTree: vi.fn(async (sourceBlockId: string) => {
        if (sourceBlockId === 'doc-root') {
          return node('doc-root', 'Document', [
            sourceNode(`((${CONCEPT_A_ID} "Concept A")) :> definition body`),
          ]);
        }
        if (sourceBlockId === 'legacy-doc-root') {
          return node('legacy-doc-root', 'Document', [
            node(legacySourceId, 'plain text after relation removed'),
          ]);
        }
        return null;
      }),
    };
    const service = new CdfLiveRelationWriteRepairService({
      manager,
      cardCreator: creator,
      sourceLoader,
      candidateScanner,
      now: () => NOW,
      idFactory: (relation: CdfLiveRelationCandidate) => `card-${relation.sourceBlockId}-${relation.conceptBlockId}-${relation.relationKind}`,
      xiuyuanIdFactory: (relation: CdfLiveRelationCandidate) => `xiuyuan-${relation.sourceBlockId}-${relation.conceptBlockId}-${relation.relationKind}`,
    });

    const result = await service.executeFullRepair();

    expect(result.reason).toBe('executed');
    expect(result.createNewCandidates).toBe(false);
    expect(result.sourcePreviews).toEqual([
      expect.objectContaining({
        scanRootId: 'legacy-doc-root',
        candidateSourceIds: [legacySourceId],
        persisted: true,
        previewOnly: false,
        result: expect.objectContaining({
          updatedCards: [
            expect.objectContaining({
              id: 'legacy-relation-card',
              meta: expect.objectContaining({
                liveRelationStatus: 'orphaned-by-live-relation',
              }),
            }),
          ],
        }),
      }),
    ]);
    expect(result.previewOnlySourcePreviews).toEqual([
      expect.objectContaining({
        scanRootId: 'doc-root',
        candidateSourceIds: [SOURCE_ID],
        persisted: false,
        previewOnly: true,
        result: expect.objectContaining({
          createdCards: [
            expect.objectContaining({
              id: `card-${SOURCE_ID}-${CONCEPT_A_ID}-definition-forward`,
            }),
          ],
        }),
      }),
    ]);
    expect(result.summary).toEqual(expect.objectContaining({
      candidateSourceCount: 1,
      scannedRootCount: 1,
      createCardCount: 0,
      orphanCount: 1,
      persistedMutationCount: 1,
    }));
    expect(result.previewOnlySummary).toEqual(expect.objectContaining({
      candidateSourceCount: 1,
      scannedRootCount: 1,
      createCardCount: 1,
      persistedMutationCount: 0,
    }));
    expect(creator.createCards).not.toHaveBeenCalled();
    expect(manager.updateCard).toHaveBeenCalledTimes(1);
    expect(manager.updateCard).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'legacy-relation-card',
        meta: expect.objectContaining({
          liveRelationStatus: 'orphaned-by-live-relation',
        }),
      }),
      { suppressDueIndexSort: true },
    );
  });

  it('executes full repair with createNewCandidates enabled for derived no-card candidates', async () => {
    const manager = createManager();
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const candidateScanner = {
      listCandidateSources: vi.fn(async () => [
        {
          sourceBlockId: SOURCE_ID,
          rootId: 'doc-root',
          candidateReasons: ['operator' as const],
        },
      ]),
    };
    const sourceLoader = {
      loadSourceTree: vi.fn(async () => node('doc-root', 'Document', [
        sourceNode(`((${CONCEPT_A_ID} "Concept A")) :> definition body`),
      ])),
    };
    const service = new CdfLiveRelationWriteRepairService({
      manager,
      cardCreator: creator,
      sourceLoader,
      candidateScanner,
      now: () => NOW,
      idFactory: (relation: CdfLiveRelationCandidate) => `card-${relation.sourceBlockId}-${relation.conceptBlockId}-${relation.relationKind}`,
      xiuyuanIdFactory: (relation: CdfLiveRelationCandidate) => `xiuyuan-${relation.sourceBlockId}-${relation.conceptBlockId}-${relation.relationKind}`,
    });

    const result = await service.executeFullRepair({ createNewCandidates: true });

    expect(result.createNewCandidates).toBe(true);
    expect(result.sourcePreviews).toEqual([
      expect.objectContaining({
        scanRootId: 'doc-root',
        candidateSourceIds: [SOURCE_ID],
        persisted: true,
        previewOnly: false,
        result: expect.objectContaining({
          createdCards: [
            expect.objectContaining({
              id: `card-${SOURCE_ID}-${CONCEPT_A_ID}-definition-forward`,
              meta: expect.objectContaining({
                liveRelationStatus: 'active-live',
                liveContentStatus: 'content-complete',
              }),
            }),
          ],
        }),
      }),
    ]);
    expect(result.previewOnlySourcePreviews).toHaveLength(0);
    expect(result.summary).toEqual(expect.objectContaining({
      candidateSourceCount: 1,
      scannedRootCount: 1,
      createCardCount: 1,
      persistedMutationCount: 1,
    }));
    expect(creator.createCards).toHaveBeenCalled();
    expect(manager.onCardCreated).toHaveBeenCalled();
    expect(manager.updateCard).not.toHaveBeenCalled();
  });

  it('keeps derive-failed no-card candidates preview-only during full repair execution', async () => {
    const manager = createManager();
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const candidateScanner = {
      listCandidateSources: vi.fn(async () => [
        {
          sourceBlockId: SOURCE_ID,
          rootId: 'doc-root',
          candidateReasons: ['operator' as const],
        },
      ]),
    };
    const sourceLoader = {
      loadSourceTree: vi.fn(async () => node('doc-root', 'Document', [
        sourceNode('plain text after invalid CDF candidate'),
      ])),
    };
    const service = new CdfLiveRelationWriteRepairService({
      manager,
      cardCreator: creator,
      sourceLoader,
      candidateScanner,
      now: () => NOW,
    });

    const result = await service.executeFullRepair({ createNewCandidates: true });

    expect(result.sourcePreviews).toHaveLength(0);
    expect(result.previewOnlySourcePreviews).toEqual([
      expect.objectContaining({
        scanRootId: 'doc-root',
        candidateSourceIds: [SOURCE_ID],
        persisted: false,
        previewOnly: true,
        result: expect.objectContaining({
          createdCards: [],
          updatedCards: [],
          actions: [],
          derivedRelationCount: 0,
        }),
      }),
    ]);
    expect(result.previewOnlySummary).toEqual(expect.objectContaining({
      candidateSourceCount: 1,
      deriveFailedNoCardCandidateCount: 1,
      persistedMutationCount: 0,
    }));
    expect(creator.createCards).not.toHaveBeenCalled();
    expect(manager.updateCard).not.toHaveBeenCalled();
    expect(manager.onCardCreated).not.toHaveBeenCalled();
  });

  it('scans SQL CDF candidate sources with document, notebook, and existing-card scope narrowing', async () => {
    const statements: string[] = [];
    const sql = vi.fn(async (statement: string) => {
      statements.push(statement);
      return [
        {
          id: SOURCE_ID,
          root_id: 'doc-a',
          box: 'notebook-a',
          type: 'p',
          markdown: `((${CONCEPT_A_ID} "Concept A")) :> definition body`,
          content: '',
        },
        {
          id: 'boundary-a',
          root_id: 'doc-a',
          box: 'notebook-a',
          type: 'i',
          markdown: `((${CONCEPT_A_ID} "Concept A"))`,
          content: '',
        },
        {
          id: 'existing-source',
          root_id: 'doc-a',
          box: 'notebook-a',
          type: 'p',
          markdown: 'plain existing card source',
          content: '',
        },
      ];
    });
    const scanner = new CdfLiveRelationSqlCandidateSourceScanner({ sql });

    const documentCandidates = await scanner.listCandidateSources({
      scope: { kind: 'document', docId: 'doc-a' },
      existingSourceBlockIds: ['existing-source'],
    });
    await scanner.listCandidateSources({
      scope: { kind: 'notebook', notebookId: 'notebook-a' },
      existingSourceBlockIds: [],
    });

    expect(statements[0]).toContain("root_id = 'doc-a'");
    expect(statements[0]).toContain("id = 'doc-a'");
    expect(statements[0]).toContain("id IN ('existing-source')");
    expect(statements[1]).toContain("box = 'notebook-a'");
    expect(documentCandidates).toEqual([
      expect.objectContaining({
        sourceBlockId: SOURCE_ID,
        rootId: 'doc-a',
        notebookId: 'notebook-a',
        candidateReasons: ['operator'],
      }),
      expect.objectContaining({
        sourceBlockId: 'boundary-a',
        candidateReasons: ['concept-boundary'],
      }),
      expect.objectContaining({
        sourceBlockId: 'existing-source',
        candidateReasons: ['existing-card'],
      }),
    ]);
  });

  it('previews single-source repair without persisting same-source missing cards or metadata repairs', async () => {
    const existingRelationCard = relationCard({
      id: 'existing-relation',
      conceptBlockId: CONCEPT_B_ID,
      relationKind: 'definition-forward',
    });
    const manager = createManager([], {
      cardsByBlockId: {
        [SOURCE_ID]: [existingRelationCard],
      },
    });
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const service = new CdfLiveRelationWriteRepairService({
      manager,
      cardCreator: creator,
      now: () => NOW,
      idFactory: (relation: CdfLiveRelationCandidate) => `card-${relation.conceptBlockId}-${relation.relationKind}`,
      xiuyuanIdFactory: (relation: CdfLiveRelationCandidate) => `xiuyuan-${relation.conceptBlockId}-${relation.relationKind}`,
    });

    const preview = await service.previewSingleSourceRepairDryRun({
      sourceBlockId: SOURCE_ID,
      sourceTree: node('doc-root', 'Document', [
        sourceNode(`((${CONCEPT_A_ID} "Concept A")) :> definition body`),
        node('sibling-source', `((${CONCEPT_B_ID} "Concept B")) :> sibling definition`),
      ]),
    });

    expect(preview.attempted).toBe(true);
    expect(preview.sourceBlockId).toBe(SOURCE_ID);
    expect(preview.persisted).toBe(false);
    expect(preview.result).toEqual(expect.objectContaining({
      reason: 'reconciled',
      derivedRelationCount: 1,
      createdCards: [
        expect.objectContaining({
          id: `card-${CONCEPT_A_ID}-definition-forward`,
          meta: expect.objectContaining({
            liveRelationKey: `${SOURCE_ID}:${CONCEPT_A_ID}:definition-forward`,
          }),
        }),
      ],
      updatedCards: [
        expect.objectContaining({
          id: 'existing-relation',
          meta: expect.objectContaining({
            liveRelationStatus: 'orphaned-by-live-relation',
          }),
        }),
      ],
    }));
    expect(preview.summary).toEqual(expect.objectContaining({
      derivedRelationCount: 1,
      createCardCount: 1,
      orphanCount: 1,
      persistedMutationCount: 0,
    }));
    expect(String(preview.result.createdCards[0]?.meta?.liveRelationKey || '')).not.toContain('sibling-source');
    expect(creator.createCards).not.toHaveBeenCalled();
    expect(manager.updateCard).not.toHaveBeenCalled();
    expect(manager.onCardCreated).not.toHaveBeenCalled();
  });

  it('executes single-source repair and creates missing same-source relations by default', async () => {
    const manager = createManager();
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const service = new CdfLiveRelationWriteRepairService({
      manager,
      cardCreator: creator,
      now: () => NOW,
      idFactory: (relation: CdfLiveRelationCandidate) => `card-${relation.conceptBlockId}-${relation.relationKind}`,
      xiuyuanIdFactory: (relation: CdfLiveRelationCandidate) => `xiuyuan-${relation.conceptBlockId}-${relation.relationKind}`,
    });

    const result = await service.executeSingleSourceRepair({
      sourceBlockId: SOURCE_ID,
      sourceTree: sourceNode(`((${CONCEPT_A_ID} "Concept A")) :> definition body`),
    });

    expect(result.attempted).toBe(true);
    expect(result.sourceBlockId).toBe(SOURCE_ID);
    expect(result.persisted).toBe(true);
    expect(result.result.createdCards).toEqual([
      expect.objectContaining({
        id: `card-${CONCEPT_A_ID}-definition-forward`,
        meta: expect.objectContaining({
          liveRelationStatus: 'active-live',
          liveContentStatus: 'content-complete',
        }),
      }),
    ]);
    expect(result.summary).toEqual(expect.objectContaining({
      createCardCount: 1,
      persistedMutationCount: 1,
    }));
    expect(creator.createCards).toHaveBeenCalled();
    expect(manager.onCardCreated).toHaveBeenCalled();
    expect(manager.updateCard).not.toHaveBeenCalled();
  });

  it('applies single-source repair category toggles during execution', async () => {
    const orphanRelationCard = relationCard({
      id: 'orphan-relation',
      conceptBlockId: '20260101000000-orphan',
      relationKind: 'definition-forward',
    });
    const reactivatedRelationCard = relationCard({
      id: 'reactivated-relation',
      conceptBlockId: CONCEPT_B_ID,
      relationKind: 'definition-forward',
      status: 'orphaned-by-live-relation',
    });
    const canonicalDuplicateCard = relationCard({
      id: 'canonical-duplicate',
      conceptBlockId: CONCEPT_DUPLICATE_ID,
      relationKind: 'definition-forward',
      reps: 9,
    });
    const nonCanonicalDuplicateCard = relationCard({
      id: 'noncanonical-duplicate',
      conceptBlockId: CONCEPT_DUPLICATE_ID,
      relationKind: 'definition-forward',
      reps: 1,
    });
    const manager = createManager([], {
      cardsByBlockId: {
        [SOURCE_ID]: [
          orphanRelationCard,
          reactivatedRelationCard,
          canonicalDuplicateCard,
          nonCanonicalDuplicateCard,
        ],
      },
    });
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const service = new CdfLiveRelationWriteRepairService({
      manager,
      cardCreator: creator,
      now: () => NOW,
      idFactory: (relation: CdfLiveRelationCandidate) => `card-${relation.conceptBlockId}-${relation.relationKind}`,
      xiuyuanIdFactory: (relation: CdfLiveRelationCandidate) => `xiuyuan-${relation.conceptBlockId}-${relation.relationKind}`,
    });

    const result = await service.executeSingleSourceRepair({
      sourceBlockId: SOURCE_ID,
      sourceTree: sourceNode([
        `((${CONCEPT_A_ID} "Concept A"))`,
        `((${CONCEPT_B_ID} "Concept B"))`,
        `((${CONCEPT_DUPLICATE_ID} "Duplicate"))`,
        ':> definition body',
      ].join(' ')),
      categoryToggles: {
        createMissing: false,
        pauseOrphan: true,
        pauseDuplicate: false,
        restoreActive: true,
      },
    });

    expect(result.categoryToggles).toEqual({
      createMissing: false,
      pauseOrphan: true,
      pauseDuplicate: false,
      restoreActive: true,
    });
    expect(result.result.createdCards).toHaveLength(0);
    expect(result.result.updatedCards.map((card) => card.id).sort()).toEqual([
      'canonical-duplicate',
      'orphan-relation',
      'reactivated-relation',
    ]);
    expect(result.summary).toEqual(expect.objectContaining({
      createCardCount: 0,
      orphanCount: 1,
      duplicateCount: 0,
      reactivatedCount: 1,
      persistedMutationCount: 3,
    }));
    expect(creator.createCards).not.toHaveBeenCalled();
    expect(manager.updateCard).toHaveBeenCalledTimes(3);
    expect(manager.updateCard).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'orphan-relation',
        meta: expect.objectContaining({
          liveRelationStatus: 'orphaned-by-live-relation',
        }),
      }),
      { suppressDueIndexSort: true },
    );
    expect(manager.updateCard).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'canonical-duplicate',
        meta: expect.objectContaining({
          liveRelationStatus: 'active-live',
        }),
      }),
      { suppressDueIndexSort: true },
    );
    expect(manager.updateCard).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'reactivated-relation',
        meta: expect.objectContaining({
          liveRelationStatus: 'active-live',
        }),
      }),
      { suppressDueIndexSort: true },
    );
    expect(manager.updateCard).not.toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'noncanonical-duplicate',
      }),
      expect.anything(),
    );
  });

  it('does not remember single-source repair toggles between execution sessions', async () => {
    const manager = createManager();
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const service = new CdfLiveRelationWriteRepairService({
      manager,
      cardCreator: creator,
      now: () => NOW,
      idFactory: (relation: CdfLiveRelationCandidate) => `card-${relation.conceptBlockId}-${relation.relationKind}`,
      xiuyuanIdFactory: (relation: CdfLiveRelationCandidate) => `xiuyuan-${relation.conceptBlockId}-${relation.relationKind}`,
    });
    const sourceTree = sourceNode(`((${CONCEPT_A_ID} "Concept A")) :> definition body`);

    const disabledRun = await service.executeSingleSourceRepair({
      sourceBlockId: SOURCE_ID,
      sourceTree,
      categoryToggles: {
        createMissing: false,
      },
    });
    const defaultRun = await service.executeSingleSourceRepair({
      sourceBlockId: SOURCE_ID,
      sourceTree,
    });

    expect(disabledRun.categoryToggles.createMissing).toBe(false);
    expect(disabledRun.result.createdCards).toHaveLength(0);
    expect(defaultRun.categoryToggles.createMissing).toBe(true);
    expect(defaultRun.result.createdCards).toHaveLength(1);
    expect(creator.createCards).toHaveBeenCalled();
  });

  it('creates missing live relation cards in explicit write/repair flows with new FSRS state', async () => {
    const manager = createManager();
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const service = new CdfLiveRelationWriteRepairService({
      manager,
      cardCreator: creator,
      now: () => NOW,
      idFactory: (relation: CdfLiveRelationCandidate) => `card-${relation.conceptBlockId}-${relation.relationKind}`,
      xiuyuanIdFactory: (relation: CdfLiveRelationCandidate) => `xiuyuan-${relation.conceptBlockId}-${relation.relationKind}`,
    });

    const result = await service.reconcileWriteOrRepair({
      sourceTree: sourceNode(
        `((${CONCEPT_A_ID} "Concept A")) ((${CONCEPT_B_ID} "Concept B")) :> definition body`,
      ),
    });

    expect(result.reason).toBe('reconciled');
    expect(result.createdCards).toHaveLength(2);
    expect(result.updatedCards).toHaveLength(0);
    expect(manager.getCards).toHaveBeenCalledWith({ blockIds: [SOURCE_ID] });
    expect(manager.updateCard).not.toHaveBeenCalled();
    expect(creator.createCards).toHaveBeenCalledTimes(2);

    const conceptAssetCards = creator.createCards.mock.calls[0]?.[0] as FSRSCard[];
    const conceptAssetXiuyuans = creator.createCards.mock.calls[0]?.[1] as Array<Record<string, unknown>>;
    const createdCards = creator.createCards.mock.calls[1]?.[0] as FSRSCard[];
    const createdXiuyuans = creator.createCards.mock.calls[1]?.[1] as Array<Record<string, unknown>>;
    expect(conceptAssetCards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `card_xy_${CONCEPT_A_ID}_0`,
        xiuyuanID: `xy_${CONCEPT_A_ID}`,
        blockId: CONCEPT_A_ID,
        type: CardType.Concept,
        cardTypeMarker: 'concept',
        faceKey: { ruleId: 'C', faceIndex: 0 },
        meta: expect.objectContaining({
          templateID: 'builtin-concept-simple',
          typeMarker: 'C',
          fieldMapping: { concept: CONCEPT_A_ID },
          frontBlockIDs: [CONCEPT_A_ID],
          backBlockIDs: [CONCEPT_A_ID],
        }),
      }),
      expect.objectContaining({
        id: `card_xy_${CONCEPT_B_ID}_0`,
        xiuyuanID: `xy_${CONCEPT_B_ID}`,
        blockId: CONCEPT_B_ID,
        meta: expect.objectContaining({
          templateID: 'builtin-concept-simple',
          fieldMapping: { concept: CONCEPT_B_ID },
        }),
      }),
    ]));
    expect(conceptAssetXiuyuans).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `xy_${CONCEPT_A_ID}`,
        blockIDs: [CONCEPT_A_ID],
        fields: [{ name: 'concept', blockID: CONCEPT_A_ID }],
        templateID: 'builtin-concept-simple',
      }),
      expect.objectContaining({
        id: `xy_${CONCEPT_B_ID}`,
        blockIDs: [CONCEPT_B_ID],
        fields: [{ name: 'concept', blockID: CONCEPT_B_ID }],
        templateID: 'builtin-concept-simple',
      }),
    ]));
    expect(createdCards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `card-${CONCEPT_A_ID}-definition-forward`,
        xiuyuanID: `xiuyuan-${CONCEPT_A_ID}-definition-forward`,
        blockId: SOURCE_ID,
        due: NOW,
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
        state: CardState.New,
        lastReview: 0,
        scheduledDays: 0,
        elapsedDays: 0,
        learning_step: 0,
        type: CardType.Concept,
        schedulerType: 'fsrs-v6',
        cardTypeMarker: 'concept',
        faceKey: { ruleId: 'concept-definition-forward', faceIndex: 0 },
        meta: expect.objectContaining({
          liveRelationKey: `${SOURCE_ID}:${CONCEPT_A_ID}:definition-forward`,
          relationAuthority: 'live-backlink',
          sourceBlockId: SOURCE_ID,
          conceptBlockId: CONCEPT_A_ID,
          relationKind: 'definition-forward',
          liveRelationStatus: 'active-live',
          liveContentStatus: 'content-complete',
          fieldMapping: {
            concept: CONCEPT_A_ID,
            definition: SOURCE_ID,
          },
          frontBlockIDs: [CONCEPT_A_ID],
          backBlockIDs: [SOURCE_ID],
          templateID: 'builtin-concept-definition-forward',
          typeMarker: 'concept-definition-forward',
        }),
      }),
      expect.objectContaining({
        id: `card-${CONCEPT_B_ID}-definition-forward`,
        xiuyuanID: `xiuyuan-${CONCEPT_B_ID}-definition-forward`,
        blockId: SOURCE_ID,
        meta: expect.objectContaining({
          liveRelationKey: `${SOURCE_ID}:${CONCEPT_B_ID}:definition-forward`,
          conceptBlockId: CONCEPT_B_ID,
          fieldMapping: {
            concept: CONCEPT_B_ID,
            definition: SOURCE_ID,
          },
        }),
      }),
    ]));
    expect(createdXiuyuans).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `xiuyuan-${CONCEPT_A_ID}-definition-forward`,
        blockIDs: [CONCEPT_A_ID, SOURCE_ID],
        templateID: 'builtin-concept-definition-forward',
        meta: expect.objectContaining({
          liveRelationKey: `${SOURCE_ID}:${CONCEPT_A_ID}:definition-forward`,
          relationAuthority: 'live-backlink',
        }),
      }),
      expect.objectContaining({
        id: `xiuyuan-${CONCEPT_B_ID}-definition-forward`,
        blockIDs: [CONCEPT_B_ID, SOURCE_ID],
        templateID: 'builtin-concept-definition-forward',
        meta: expect.objectContaining({
          liveRelationKey: `${SOURCE_ID}:${CONCEPT_B_ID}:definition-forward`,
          relationAuthority: 'live-backlink',
        }),
      }),
    ]));
    expect(creator.createCards).toHaveBeenNthCalledWith(
      1,
      conceptAssetCards,
      conceptAssetXiuyuans,
      { suppressDueIndexSort: true },
    );
    expect(creator.createCards).toHaveBeenNthCalledWith(
      2,
      createdCards,
      createdXiuyuans,
      { suppressDueIndexSort: true },
    );
    expect(manager.onCardCreated).toHaveBeenCalledTimes(4);
  });

  it('uses draft source markdown for dry-run previews without persisting cards or metadata', async () => {
    const existingRelationCard = relationCard({
      id: 'existing-relation',
      conceptBlockId: CONCEPT_A_ID,
      relationKind: 'definition-forward',
    });
    const manager = createManager([], {
      cardsByBlockId: {
        [SOURCE_ID]: [existingRelationCard],
      },
    });
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const service = new CdfLiveRelationWriteRepairService({
      manager,
      cardCreator: creator,
      now: () => NOW,
      idFactory: (relation: CdfLiveRelationCandidate) => `card-${relation.conceptBlockId}-${relation.relationKind}`,
      xiuyuanIdFactory: (relation: CdfLiveRelationCandidate) => `xiuyuan-${relation.conceptBlockId}-${relation.relationKind}`,
    });

    const result = await service.reconcileWriteOrRepair({
      sourceTree: sourceNode(`((${CONCEPT_A_ID} "Concept A")) :> old definition`),
      draftMarkdownByBlockId: {
        [SOURCE_ID]: `((${CONCEPT_B_ID} "Concept B")) :> draft definition`,
      },
      persist: false,
    });

    expect(result.reason).toBe('reconciled');
    expect(result.createdCards).toEqual([
      expect.objectContaining({
        id: `card-${CONCEPT_B_ID}-definition-forward`,
        meta: expect.objectContaining({
          liveRelationKey: `${SOURCE_ID}:${CONCEPT_B_ID}:definition-forward`,
          sourceSnapshot: expect.objectContaining({
            markdown: `((${CONCEPT_B_ID} "Concept B")) :> draft definition`,
          }),
        }),
      }),
    ]);
    expect(result.updatedCards).toEqual([
      expect.objectContaining({
        id: 'existing-relation',
        meta: expect.objectContaining({
          liveRelationStatus: 'orphaned-by-live-relation',
        }),
      }),
    ]);
    expect(creator.createCards).not.toHaveBeenCalled();
    expect(manager.updateCard).not.toHaveBeenCalled();
    expect(manager.onCardCreated).not.toHaveBeenCalled();
  });

  it('keeps concept document block as relation identity instead of concept simple card id', async () => {
    const manager = createManager();
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const service = new CdfLiveRelationWriteRepairService({
      manager,
      cardCreator: creator,
      now: () => NOW,
      idFactory: (relation: CdfLiveRelationCandidate) => `card-${relation.conceptBlockId}-${relation.relationKind}`,
      xiuyuanIdFactory: (relation: CdfLiveRelationCandidate) => `xiuyuan-${relation.conceptBlockId}-${relation.relationKind}`,
    });

    await service.reconcileWriteOrRepair({
      sourceTree: sourceNode(`((${CONCEPT_A_ID} "Concept A")) :> definition body`),
    });

    const createdRelationCards = creator.createCards.mock.calls[1]?.[0] as FSRSCard[];
    expect(createdRelationCards[0]?.meta).toEqual(expect.objectContaining({
      liveRelationKey: `${SOURCE_ID}:${CONCEPT_A_ID}:definition-forward`,
      conceptBlockId: CONCEPT_A_ID,
      fieldMapping: {
        concept: CONCEPT_A_ID,
        definition: SOURCE_ID,
      },
    }));
    expect(createdRelationCards[0]?.meta?.liveRelationKey).not.toContain(`card_xy_${CONCEPT_A_ID}_0`);
  });

  it('does not recreate deleted concept simple assets for existing active relations', async () => {
    const existingRelationCard: FSRSCard = {
      id: 'existing-relation-card',
      xiuyuanID: 'existing-relation-xiuyuan',
      blockId: SOURCE_ID,
      due: NOW,
      stability: 4,
      difficulty: 5,
      reps: 3,
      lapses: 0,
      state: CardState.Review,
      lastReview: NOW - 10_000,
      elapsedDays: 1,
      scheduledDays: 1,
      priority: 50,
      type: CardType.Concept,
      tags: [],
      cardTypeMarker: 'concept',
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: NOW - 20_000,
      updatedAt: NOW - 10_000,
      faceKey: { ruleId: 'concept-definition-forward', faceIndex: 0 },
      meta: {
        xiuyuanID: 'existing-relation-xiuyuan',
        templateID: 'builtin-concept-definition-forward',
        typeMarker: 'concept-definition-forward',
        liveRelationKey: `${SOURCE_ID}:${CONCEPT_A_ID}:definition-forward`,
        relationAuthority: 'live-backlink',
        sourceBlockId: SOURCE_ID,
        conceptBlockId: CONCEPT_A_ID,
        relationKind: 'definition-forward',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
        fieldMapping: {
          concept: CONCEPT_A_ID,
          definition: SOURCE_ID,
        },
        frontBlockIDs: [CONCEPT_A_ID],
        backBlockIDs: [SOURCE_ID],
      },
    };
    const manager = createManager([], {
      cardsByBlockId: {
        [SOURCE_ID]: [existingRelationCard],
      },
    });
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const service = new CdfLiveRelationWriteRepairService({
      manager,
      cardCreator: creator,
      now: () => NOW,
    });

    const result = await service.reconcileWriteOrRepair({
      sourceTree: sourceNode(`((${CONCEPT_A_ID} "Concept A")) :> definition body`),
    });

    expect(result.createdCards).toHaveLength(0);
    expect(creator.createCards).not.toHaveBeenCalled();
    expect(manager.getCards).toHaveBeenCalledTimes(1);
  });

  it('scopes block-edit reconciliation to an edited descriptor source instead of sibling boundary areas', async () => {
    const manager = createManager();
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const service = new CdfLiveRelationWriteRepairService({
      manager,
      cardCreator: creator,
      now: () => NOW,
      idFactory: (relation: CdfLiveRelationCandidate) => `card-${relation.sourceBlockId}-${relation.conceptBlockId}-${relation.relationKind}`,
      xiuyuanIdFactory: (relation: CdfLiveRelationCandidate) => `xiuyuan-${relation.sourceBlockId}-${relation.conceptBlockId}-${relation.relationKind}`,
    });

    const result = await service.reconcileWriteOrRepair({
      reconciliationScope: 'block-edit',
      changedBlockId: 'descriptor-a',
      sourceTree: node('doc-root', 'root', [
        node('boundary-a', `((${CONCEPT_A_ID}))`),
        node('descriptor-a', 'cue A ;; answer A'),
        node('boundary-b', `((${CONCEPT_B_ID}))`),
        node('descriptor-b', 'cue B ;; answer B'),
      ]),
    });

    expect(result.derivedRelationCount).toBe(1);
    expect(result.createdCards.map((card) => card.meta?.liveRelationKey)).toEqual([
      `descriptor-a:${CONCEPT_A_ID}:descriptor-forward`,
    ]);
    expect(result.createdCards.map((card) => card.meta?.liveRelationKey)).not.toContain(
      `descriptor-b:${CONCEPT_B_ID}:descriptor-forward`,
    );
    expect(manager.getCards).toHaveBeenCalledWith({
      blockIds: ['doc-root', 'boundary-a', 'descriptor-a'],
    });
  });

  it('scopes block-edit reconciliation to an edited concept boundary area', async () => {
    const oldBoundaryRelation = relationCard({
      id: 'old-boundary-relation',
      sourceBlockId: 'descriptor-a',
      conceptBlockId: CONCEPT_A_ID,
      relationKind: 'descriptor-forward',
    });
    const unrelatedRelation = relationCard({
      id: 'unrelated-relation',
      sourceBlockId: 'descriptor-b',
      conceptBlockId: CONCEPT_B_ID,
      relationKind: 'descriptor-forward',
    });
    const manager = createManager([], {
      cardsByBlockId: {
        'descriptor-a': [oldBoundaryRelation],
        'descriptor-b': [unrelatedRelation],
      },
    });
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const service = new CdfLiveRelationWriteRepairService({
      manager,
      cardCreator: creator,
      now: () => NOW,
      idFactory: (relation: CdfLiveRelationCandidate) => `card-${relation.sourceBlockId}-${relation.conceptBlockId}-${relation.relationKind}`,
      xiuyuanIdFactory: (relation: CdfLiveRelationCandidate) => `xiuyuan-${relation.sourceBlockId}-${relation.conceptBlockId}-${relation.relationKind}`,
    });

    const result = await service.reconcileWriteOrRepair({
      reconciliationScope: 'block-edit',
      changedBlockId: 'boundary-a',
      sourceTree: node('doc-root', 'root', [
        node('boundary-a', `((${CONCEPT_B_ID}))`),
        node('descriptor-a', 'cue A ;; answer A'),
        node('boundary-b', `((${CONCEPT_B_ID}))`),
        node('descriptor-b', 'cue B ;; answer B'),
      ]),
    });

    expect(result.derivedRelationCount).toBe(1);
    expect(result.createdCards.map((card) => card.meta?.liveRelationKey)).toEqual([
      `descriptor-a:${CONCEPT_B_ID}:descriptor-forward`,
    ]);
    expect(result.updatedCards).toEqual([
      expect.objectContaining({
        id: 'old-boundary-relation',
        meta: expect.objectContaining({
          liveRelationStatus: 'orphaned-by-live-relation',
        }),
      }),
    ]);
    expect(manager.updateCard).toHaveBeenCalledTimes(1);
    expect(manager.updateCard).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 'unrelated-relation' }),
      expect.anything(),
    );
    expect(manager.getCards).toHaveBeenCalledWith({
      blockIds: ['doc-root', 'boundary-a', 'descriptor-a'],
    });
  });

  it('scopes block-edit reconciliation for a changed group to its generated leaves', async () => {
    const siblingRelation = relationCard({
      id: 'sibling-relation',
      sourceBlockId: 'descriptor-outside',
      conceptBlockId: CONCEPT_A_ID,
      relationKind: 'descriptor-forward',
    });
    const manager = createManager([], {
      cardsByBlockId: {
        'descriptor-outside': [siblingRelation],
      },
    });
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const service = new CdfLiveRelationWriteRepairService({
      manager,
      cardCreator: creator,
      now: () => NOW,
      idFactory: (relation: CdfLiveRelationCandidate) => `card-${relation.sourceBlockId}-${relation.conceptBlockId}-${relation.relationKind}`,
      xiuyuanIdFactory: (relation: CdfLiveRelationCandidate) => `xiuyuan-${relation.sourceBlockId}-${relation.conceptBlockId}-${relation.relationKind}`,
    });

    const result = await service.reconcileWriteOrRepair({
      reconciliationScope: 'block-edit',
      changedBlockId: 'group-a',
      sourceTree: node('doc-root', 'root', [
        node('boundary-a', `((${CONCEPT_A_ID}))`, [
          node('group-a', 'Traits ;;;', [
            node('leaf-a', 'cue -> answer'),
            node('leaf-b', 'plain answer'),
          ]),
          node('descriptor-outside', 'outside ;; answer'),
        ]),
      ]),
    });

    expect(result.derivedRelationCount).toBe(2);
    expect(result.createdCards.map((card) => card.meta?.liveRelationKey).sort()).toEqual([
      `leaf-a:${CONCEPT_A_ID}:descriptor-forward`,
      `leaf-b:${CONCEPT_A_ID}:descriptor-forward`,
    ]);
    expect(manager.updateCard).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sibling-relation' }),
      expect.anything(),
    );
    expect(manager.getCards).toHaveBeenCalledWith({
      blockIds: ['doc-root', 'boundary-a', 'group-a', 'leaf-a', 'leaf-b'],
    });
  });

  it('preserves FSRS progress when block-edit reconciliation reactivates an orphaned relation', async () => {
    const orphaned = relationCard({
      id: 'orphaned-relation',
      sourceBlockId: 'descriptor-a',
      conceptBlockId: CONCEPT_A_ID,
      relationKind: 'descriptor-forward',
      status: 'orphaned-by-live-relation',
      reps: 11,
    });
    const manager = createManager([], {
      cardsByBlockId: {
        'descriptor-a': [orphaned],
      },
    });
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const service = new CdfLiveRelationWriteRepairService({
      manager,
      cardCreator: creator,
      now: () => NOW,
    });

    const result = await service.reconcileWriteOrRepair({
      reconciliationScope: 'block-edit',
      changedBlockId: 'descriptor-a',
      sourceTree: node('doc-root', 'root', [
        node('boundary-a', `((${CONCEPT_A_ID}))`),
        node('descriptor-a', 'cue A ;; answer A'),
      ]),
    });

    expect(result.createdCards).toHaveLength(0);
    expect(result.updatedCards).toEqual([
      expect.objectContaining({
        id: 'orphaned-relation',
        due: orphaned.due,
        stability: orphaned.stability,
        difficulty: orphaned.difficulty,
        reps: 11,
        lapses: orphaned.lapses,
        state: orphaned.state,
        lastReview: orphaned.lastReview,
        scheduledDays: orphaned.scheduledDays,
        elapsedDays: orphaned.elapsedDays,
        meta: expect.objectContaining({
          liveRelationStatus: 'active-live',
          liveRelationKey: `descriptor-a:${CONCEPT_A_ID}:descriptor-forward`,
        }),
      }),
    ]);
    expect(manager.updateCard).toHaveBeenCalledWith(
      result.updatedCards[0],
      { suppressDueIndexSort: true },
    );
  });

  it('restores content-complete eligibility after required fields are filled while preserving FSRS', async () => {
    const incomplete = relationCard({
      id: 'content-incomplete-relation',
      sourceBlockId: 'descriptor-a',
      conceptBlockId: CONCEPT_A_ID,
      relationKind: 'descriptor-forward',
      reps: 7,
    });
    incomplete.meta = {
      ...(incomplete.meta || {}),
      liveContentStatus: 'content-incomplete',
    };
    const manager = createManager([], {
      cardsByBlockId: {
        'descriptor-a': [incomplete],
      },
    });
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const service = new CdfLiveRelationWriteRepairService({
      manager,
      cardCreator: creator,
      now: () => NOW,
    });

    const result = await service.reconcileWriteOrRepair({
      reconciliationScope: 'block-edit',
      changedBlockId: 'descriptor-a',
      sourceTree: node('doc-root', 'root', [
        node('boundary-a', `((${CONCEPT_A_ID}))`),
        node('descriptor-a', 'filled cue ;; filled answer'),
      ]),
    });

    expect(result.createdCards).toHaveLength(0);
    expect(result.updatedCards).toEqual([
      expect.objectContaining({
        id: 'content-incomplete-relation',
        due: incomplete.due,
        stability: incomplete.stability,
        difficulty: incomplete.difficulty,
        reps: 7,
        lapses: incomplete.lapses,
        state: incomplete.state,
        lastReview: incomplete.lastReview,
        scheduledDays: incomplete.scheduledDays,
        elapsedDays: incomplete.elapsedDays,
        meta: expect.objectContaining({
          liveRelationStatus: 'active-live',
          liveContentStatus: 'content-complete',
        }),
      }),
    ]);
  });
});

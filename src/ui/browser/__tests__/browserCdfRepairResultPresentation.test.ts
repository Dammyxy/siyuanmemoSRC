import { describe, expect, it } from 'vitest';
import {
  buildBrowserCdfRepairResultViewModel,
  type BrowserCdfRepairResultInput,
} from '../browserCdfRepairResultPresentation';

const t = (_key: string, fallback: string) => fallback;

function relation(overrides: Record<string, unknown> = {}) {
  const sourceBlockId = String(overrides.sourceBlockId || 'source-a');
  const conceptBlockId = String(overrides.conceptBlockId || 'concept-a');
  const relationKind = String(overrides.relationKind || 'definition-forward');
  return {
    sourceBlockId,
    conceptBlockId,
    relationKind,
    relationKey: `${sourceBlockId}:${conceptBlockId}:${relationKind}`,
    contentStatus: 'content-complete',
    issues: [],
    ...overrides,
  };
}

function card(id: string, meta: Record<string, unknown> = {}) {
  return {
    id,
    blockId: String(meta.sourceBlockId || 'source-a'),
    meta,
  };
}

describe('browserCdfRepairResultPresentation', () => {
  it('builds a single-source repair summary with expandable action details and only a close action', () => {
    const result: BrowserCdfRepairResultInput = {
      attempted: true,
      sourceBlockId: 'source-a',
      persisted: true,
      categoryToggles: {
        createMissing: true,
        pauseOrphan: true,
        pauseDuplicate: true,
        restoreActive: true,
      },
      reason: 'reconciled',
      result: {
        attempted: true,
        derivedRelationCount: 2,
        reason: 'reconciled',
        createdCards: [
          card('created-a', {
            sourceBlockId: 'source-a',
            conceptBlockId: 'concept-a',
            relationKind: 'definition-forward',
            liveRelationKey: 'source-a:concept-a:definition-forward',
          }) as never,
        ],
        updatedCards: [
          card('orphan-a', { liveRelationStatus: 'orphaned-by-live-relation' }) as never,
          card('restore-a', { liveRelationStatus: 'active-live' }) as never,
        ],
        actions: [
          {
            kind: 'create-card',
            relation: relation(),
            reason: 'missing-live-relation',
          },
          {
            kind: 'update-card-meta',
            cardId: 'orphan-a',
            status: 'orphaned-by-live-relation',
            relation: null,
            meta: {},
            reason: 'orphaned',
          },
          {
            kind: 'update-card-meta',
            cardId: 'restore-a',
            status: 'active-live',
            relation: relation({ conceptBlockId: 'concept-b' }),
            meta: {},
            reason: 'reactivated',
          },
        ],
      },
      summary: {
        candidateSourceCount: 1,
        scannedRootCount: 1,
        derivedRelationCount: 2,
        actionCount: 3,
        createCardCount: 1,
        updatedCardCount: 2,
        activeUpdateCount: 0,
        orphanCount: 1,
        duplicateCount: 0,
        reactivatedCount: 1,
        legacyMigratedCount: 0,
        legacyUnavailableCount: 0,
        contentIncompleteCount: 0,
        deriveFailedNoCardCandidateCount: 0,
        sourceMissingCount: 0,
        sourceUnavailableCount: 0,
        persistedMutationCount: 3,
      },
    };

    const viewModel = buildBrowserCdfRepairResultViewModel(result, t);

    expect(viewModel.summaryItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'created', count: 1 }),
      expect.objectContaining({ key: 'paused-orphan', count: 1 }),
      expect.objectContaining({ key: 'restored', count: 1 }),
      expect.objectContaining({ key: 'persisted', count: 3 }),
    ]));
    expect(viewModel.detailGroups).toEqual([
      expect.objectContaining({
        key: 'single-source:source-a',
        items: [
          expect.objectContaining({ kind: 'created' }),
          expect.objectContaining({ kind: 'paused-orphan' }),
          expect.objectContaining({ kind: 'restored' }),
        ],
      }),
    ]);
    expect(viewModel.actions.map((action) => action.id)).toEqual(['close']);
    expect(viewModel.actions.some((action) => /undo|history/i.test(action.id + action.label))).toBe(false);
  });

  it('keeps preview-only full repair candidates visible as details without presenting undo or history controls', () => {
    const result: BrowserCdfRepairResultInput = {
      attempted: true,
      scope: { kind: 'workspace' },
      reason: 'executed',
      createNewCandidates: false,
      sourcePreviews: [],
      previewOnlySourcePreviews: [
        {
          scanRootId: 'doc-a',
          candidateSourceIds: ['source-preview'],
          candidateReasons: ['operator'],
          persisted: false,
          previewOnly: true,
          result: {
            attempted: true,
            derivedRelationCount: 1,
            reason: 'reconciled',
            createdCards: [
              card('preview-created', {
                sourceBlockId: 'source-preview',
                conceptBlockId: 'concept-a',
                relationKind: 'definition-forward',
              }) as never,
            ],
            updatedCards: [],
            actions: [
              {
                kind: 'create-card',
                relation: relation({ sourceBlockId: 'source-preview' }),
                reason: 'missing-live-relation',
              },
            ],
          },
        },
      ],
      summary: {
        candidateSourceCount: 0,
        scannedRootCount: 0,
        derivedRelationCount: 0,
        actionCount: 0,
        createCardCount: 0,
        updatedCardCount: 0,
        activeUpdateCount: 0,
        orphanCount: 0,
        duplicateCount: 0,
        reactivatedCount: 0,
        legacyMigratedCount: 0,
        legacyUnavailableCount: 0,
        contentIncompleteCount: 0,
        deriveFailedNoCardCandidateCount: 0,
        sourceMissingCount: 0,
        sourceUnavailableCount: 0,
        persistedMutationCount: 0,
      },
      previewOnlySummary: {
        candidateSourceCount: 1,
        scannedRootCount: 1,
        derivedRelationCount: 1,
        actionCount: 1,
        createCardCount: 1,
        updatedCardCount: 0,
        activeUpdateCount: 0,
        orphanCount: 0,
        duplicateCount: 0,
        reactivatedCount: 0,
        legacyMigratedCount: 0,
        legacyUnavailableCount: 0,
        contentIncompleteCount: 0,
        deriveFailedNoCardCandidateCount: 0,
        sourceMissingCount: 0,
        sourceUnavailableCount: 0,
        persistedMutationCount: 0,
      },
    };

    const viewModel = buildBrowserCdfRepairResultViewModel(result, t);

    expect(viewModel.summaryItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'preview-only', count: 1 }),
      expect.objectContaining({ key: 'persisted', count: 0 }),
    ]));
    expect(viewModel.detailGroups).toEqual([
      expect.objectContaining({
        key: 'preview:doc-a',
        previewOnly: true,
        items: [expect.objectContaining({ kind: 'created' })],
      }),
    ]);
    expect(viewModel.actions.map((action) => action.id)).toEqual(['close']);
  });
});

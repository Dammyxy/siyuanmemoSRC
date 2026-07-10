import { describe, expect, it } from 'vitest';
import { QueueType } from '@/types/unified-data-source';
import { ReviewEntryTargetResolver } from '@/application/services/ReviewEntryTargetResolver';

describe('ReviewEntryTargetResolver', () => {
  const resolver = new ReviewEntryTargetResolver();

  it('resolves projection queues with explicit Review Admission requirements', () => {
    expect(resolver.resolve({
      kind: 'projection-queue',
      queueType: QueueType.RetrievalPractice,
      entrySurface: 'topbar:start-review',
    })).toEqual({
      status: 'resolved',
      target: {
        kind: 'projection-queue',
        queueType: QueueType.RetrievalPractice,
        entrySurface: 'topbar:start-review',
        admission: { kind: 'required' },
      },
    });
  });

  it('resolves managed queues without Review Admission', () => {
    expect(resolver.resolve({
      kind: 'managed-queue',
      queueType: QueueType.FinalDrill,
      entrySurface: 'dialog-manager:final-drill',
    })).toEqual({
      status: 'resolved',
      target: {
        kind: 'managed-queue',
        queueType: QueueType.FinalDrill,
        entrySurface: 'dialog-manager:final-drill',
        admission: { kind: 'not-required' },
      },
    });
  });

  it('resolves an exact static subset and normalizes duplicate scope evidence', () => {
    expect(resolver.resolve({
      kind: 'static-subset',
      queueType: QueueType.FilterGroup,
      entrySurface: 'browser:review-subset',
      blockIds: [' block-1 ', 'block-1'],
      cardIds: ['card-2', 'card-1', 'card-2'],
      preferredCardId: ' card-2 ',
    })).toEqual({
      status: 'resolved',
      target: {
        kind: 'static-subset',
        queueType: QueueType.FilterGroup,
        entrySurface: 'browser:review-subset',
        scope: {
          blockIds: ['block-1'],
          cardIds: ['card-2', 'card-1'],
          preferredCardId: 'card-2',
        },
        admission: { kind: 'not-required' },
      },
    });
  });

  it('resolves NeuralRoam launch identity without projection admission', () => {
    expect(resolver.resolve({
      kind: 'neural-roam',
      entrySurface: 'semantic:temporary-current-block',
      startFromFocus: {
        blockId: 'block-1',
        seedBlockId: 'block-1',
        sourceReviewCardId: null,
        conceptBlockId: null,
        previousEngineMode: null,
        includeFocusAsFirst: true,
        resetHistory: false,
        startNewSession: true,
        entrySessionKind: 'temporary-current-block',
      },
      semanticPinnedSessionId: 'semantic-session-1',
    })).toEqual({
      status: 'resolved',
      target: {
        kind: 'neural-roam',
        queueType: QueueType.NeuralRoam,
        entrySurface: 'semantic:temporary-current-block',
        launch: {
          startFromFocus: {
            blockId: 'block-1',
            seedBlockId: 'block-1',
            sourceReviewCardId: null,
            conceptBlockId: null,
            previousEngineMode: null,
            includeFocusAsFirst: true,
            resetHistory: false,
            startNewSession: true,
            entrySessionKind: 'temporary-current-block',
          },
          semanticPinnedSessionId: 'semantic-session-1',
        },
        admission: { kind: 'not-required' },
      },
    });
  });

  it('fails explicitly for empty exact subsets', () => {
    expect(resolver.resolve({
      kind: 'static-subset',
      queueType: QueueType.FinalDrill,
      entrySurface: 'block-menu:temporary-drill',
      blockIds: [],
      cardIds: [],
    })).toMatchObject({
      status: 'unavailable',
      error: {
        code: 'REVIEW_ENTRY_TARGET_SCOPE_UNAVAILABLE',
      },
    });
  });

  it('fails explicitly for ambiguous compatibility evidence', () => {
    expect(resolver.resolveCompatibility({
      queueType: QueueType.NeuralRoam,
      entrySurface: 'compatibility:review-tab',
      transferState: {
        kind: 'static-subset-session',
        queueType: QueueType.FilterGroup,
        blockIds: ['block-1'],
        cardIds: ['card-1'],
      },
      neuralRoamStartFromFocus: {
        blockId: 'block-1',
      },
    })).toMatchObject({
      status: 'ambiguous',
      error: {
        code: 'REVIEW_ENTRY_TARGET_AMBIGUOUS',
      },
    });
  });

  it('fails explicitly for unsupported compatibility evidence', () => {
    expect(resolver.resolveCompatibility({
      queueType: null,
      entrySurface: 'compatibility:unknown',
    })).toMatchObject({
      status: 'unavailable',
      error: {
        code: 'REVIEW_ENTRY_TARGET_UNSUPPORTED',
      },
    });
  });
});

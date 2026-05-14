import { describe, expect, it } from 'vitest';
import { QueueType } from '../unified-data-source';
import {
  buildReviewPresentationSnapshotKeyParts,
  buildStandardReviewQueueSwitchPresets,
  resolveCurrentMainReviewQueueType,
  resolveReviewPresentation,
} from '../review-presentation-semantics';

const i18n = {
  retrievalPractice: 'Retrieval Practice',
  incrementalLearning: 'Incremental Learning',
  finalDrill: 'Final Drill',
  filterGroupPractice: 'Filter Review',
  neuralReviewTitle: 'Neural Review',
  reviewSubsetTitle: 'Subset Review',
  temporaryDrill: 'Temporary Drill',
  startLeechPractice: 'Leech Practice',
};

describe('review-presentation-semantics', () => {
  it('resolves normal queue presentation without using Browser datasource identity', () => {
    const presentation = resolveReviewPresentation({
      queueType: QueueType.RetrievalPractice,
      i18n,
      surfaceKind: 'dialog',
    });

    expect(presentation).toMatchObject({
      ok: true,
      queueType: QueueType.RetrievalPractice,
      headerVariant: 'retrieval-practice',
      title: 'Retrieval Practice',
      browserQueueId: 'retrieval',
      surfaceKind: 'dialog',
    });
    expect(presentation.ok && presentation.identityKey).toBe('dialog::retrieval-practice::retrieval-practice::Retrieval Practice::');
  });

  it('keeps Review-only variants distinct from Browser queue identity', () => {
    const presentation = resolveReviewPresentation({
      queueType: QueueType.RetrievalPractice,
      headerVariant: 'subset-review',
      i18n,
      surfaceKind: 'tab',
      scopeFingerprint: 'static:block-a',
      titleOverride: 'Document Review',
    });

    expect(presentation).toMatchObject({
      ok: true,
      queueType: QueueType.RetrievalPractice,
      headerVariant: 'subset-review',
      title: 'Document Review',
      browserQueueId: null,
      surfaceKind: 'tab',
      scopeFingerprint: 'static:block-a',
    });
    expect(presentation.ok && presentation.snapshotKeyParts).toEqual([
      'tab',
      'retrieval-practice',
      'subset-review',
      'Document Review',
      'static:block-a',
    ]);
  });

  it('fails unsupported presentation identity explicitly', () => {
    const presentation = resolveReviewPresentation({
      queueType: 'unknown-queue',
      headerVariant: 'retrieval-practice',
      i18n,
      surfaceKind: 'dialog',
    });

    expect(presentation).toEqual({
      ok: false,
      reason: 'queue-header-mismatch',
      queueType: 'unknown-queue',
      headerVariant: 'retrieval-practice',
      rawInput: 'unknown-queue::retrieval-practice',
    });
  });

  it('builds distinct snapshot key parts for same visible title with different scope', () => {
    const first = buildReviewPresentationSnapshotKeyParts({
      queueType: QueueType.IncrementalLearning,
      headerVariant: 'subset-review',
      title: '渐进学习',
      surfaceKind: 'tab',
      scopeFingerprint: 'static:block-a',
    });
    const second = buildReviewPresentationSnapshotKeyParts({
      queueType: QueueType.IncrementalLearning,
      headerVariant: 'subset-review',
      title: '渐进学习',
      surfaceKind: 'tab',
      scopeFingerprint: 'static:block-b',
    });

    expect(first.join('::')).not.toBe(second.join('::'));
  });

  it('builds standard queue switch presets and resolves current main queue type', () => {
    const presets = buildStandardReviewQueueSwitchPresets(i18n);

    expect(presets.map((preset) => [preset.queueType, preset.headerVariant, preset.title])).toEqual([
      [QueueType.RetrievalPractice, 'retrieval-practice', 'Retrieval Practice'],
      [QueueType.IncrementalLearning, 'incremental-learning', 'Incremental Learning'],
      [QueueType.FinalDrill, 'final-drill', 'Final Drill'],
      [QueueType.FilterGroup, 'filter-group', 'Filter Review'],
      [QueueType.NeuralRoam, 'neural-roam', 'Neural Review'],
    ]);
    expect(resolveCurrentMainReviewQueueType({ headerVariant: 'neural-roam' })).toBe(QueueType.NeuralRoam);
    expect(resolveCurrentMainReviewQueueType({ activeQueueType: QueueType.FinalDrill })).toBe(QueueType.FinalDrill);
    expect(resolveCurrentMainReviewQueueType({ headerVariant: 'subset-review', activeQueueType: 'unknown' })).toBeNull();
  });
});

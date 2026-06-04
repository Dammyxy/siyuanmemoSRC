import { describe, expect, it } from 'vitest';
import {
  CDF_LIVE_RELATION_AUTHORITY,
  evaluateCdfContentStatus,
  isCdfLiveRelationQueueEligible,
  readCdfLiveRelationMetadata,
  writeCdfLiveRelationMetadata,
} from '../index';

describe('CDF live relation metadata and content status', () => {
  it('evaluates required fields per content shape', () => {
    expect(evaluateCdfContentStatus({
      shape: 'definition',
      content: { definition: '' },
    })).toBe('content-incomplete');
    expect(evaluateCdfContentStatus({
      shape: 'descriptor-group-plain',
      content: { cue: '', answer: 'answer' },
    })).toBe('content-complete');
    expect(evaluateCdfContentStatus({
      shape: 'descriptor-group-arrow',
      content: { cue: '', answer: 'answer' },
    })).toBe('content-incomplete');
    expect(evaluateCdfContentStatus({
      shape: 'item',
      content: { question: 'question', answer: 'answer' },
    })).toBe('content-complete');
  });

  it('reads and writes live relation metadata without using fieldMapping as authority', () => {
    const meta = writeCdfLiveRelationMetadata(
      { fieldMapping: { concept: 'stale-concept', definition: 'stale-source' } },
      {
        liveRelationKey: 'source:concept:definition-forward',
        sourceBlockId: 'source',
        conceptBlockId: 'concept',
        relationKind: 'definition-forward',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
        liveRelationIssues: [],
      },
    );

    expect(meta.fieldMapping).toEqual({ concept: 'stale-concept', definition: 'stale-source' });
    expect(readCdfLiveRelationMetadata(meta)).toEqual(expect.objectContaining({
      relationAuthority: CDF_LIVE_RELATION_AUTHORITY,
      liveRelationKey: 'source:concept:definition-forward',
      sourceBlockId: 'source',
      conceptBlockId: 'concept',
      relationKind: 'definition-forward',
      liveRelationStatus: 'active-live',
      liveContentStatus: 'content-complete',
      liveRelationIssues: [],
    }));
  });

  it('requires active relation status, complete content, and no blocking issues for queue eligibility', () => {
    expect(isCdfLiveRelationQueueEligible({
      liveRelationStatus: 'active-live',
      liveContentStatus: 'content-complete',
      liveRelationIssues: [],
    })).toBe(true);
    expect(isCdfLiveRelationQueueEligible({
      liveRelationStatus: 'orphaned-by-live-relation',
      liveContentStatus: 'content-complete',
      liveRelationIssues: [],
    })).toBe(false);
    expect(isCdfLiveRelationQueueEligible({
      liveRelationStatus: 'active-live',
      liveContentStatus: 'content-incomplete',
      liveRelationIssues: [],
    })).toBe(false);
    expect(isCdfLiveRelationQueueEligible({
      liveRelationStatus: 'active-live',
      liveContentStatus: 'content-complete',
      liveRelationIssues: [{ code: 'missing-concept-ref', severity: 'blocking' }],
    })).toBe(false);
  });
});

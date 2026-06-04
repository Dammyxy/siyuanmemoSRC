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
    const cases: Array<[
      Parameters<typeof evaluateCdfContentStatus>[0],
      ReturnType<typeof evaluateCdfContentStatus>,
    ]> = [
      [{ shape: 'definition', content: { definition: '' } }, 'content-incomplete'],
      [{ shape: 'definition', content: { definition: 'definition' } }, 'content-complete'],
      [{ shape: 'item', content: { question: '', answer: 'answer' } }, 'content-incomplete'],
      [{ shape: 'item', content: { question: 'question', answer: '' } }, 'content-incomplete'],
      [{ shape: 'item', content: { question: 'question', answer: 'answer' } }, 'content-complete'],
      [{ shape: 'descriptor-explicit', content: { cue: '', answer: 'answer' } }, 'content-incomplete'],
      [{ shape: 'descriptor-explicit', content: { cue: 'cue', answer: '' } }, 'content-incomplete'],
      [{ shape: 'descriptor-explicit', content: { cue: 'cue', answer: 'answer' } }, 'content-complete'],
      [{ shape: 'descriptor-group-plain', content: { cue: '', answer: '' } }, 'content-incomplete'],
      [{ shape: 'descriptor-group-plain', content: { cue: '', answer: 'answer' } }, 'content-complete'],
      [{ shape: 'descriptor-group-arrow', content: { cue: '', answer: 'answer' } }, 'content-incomplete'],
      [{ shape: 'descriptor-group-arrow', content: { cue: 'cue', answer: '' } }, 'content-incomplete'],
      [{ shape: 'descriptor-group-arrow', content: { cue: 'cue', answer: 'answer' } }, 'content-complete'],
    ];

    for (const [input, expected] of cases) {
      expect(evaluateCdfContentStatus(input)).toBe(expected);
    }
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
      liveRelationIssues: [],
    })).toBe(false);
    expect(isCdfLiveRelationQueueEligible({
      liveRelationStatus: 'active-live',
      liveContentStatus: 'content-complete',
      liveRelationIssues: [{ code: 'missing-concept-ref', severity: 'blocking' }],
    })).toBe(false);
    expect(isCdfLiveRelationQueueEligible({
      liveRelationStatus: 'active-live',
      liveContentStatus: 'content-complete',
      liveRelationIssues: [{ code: 'duplicate-ref', severity: 'warning' }],
    })).toBe(true);
    expect(isCdfLiveRelationQueueEligible({
      liveRelationStatus: 'duplicate-live-relation',
      liveContentStatus: 'content-incomplete',
      liveRelationIssues: [{ code: 'duplicate-ref', severity: 'warning' }],
    })).toBe(false);
  });
});

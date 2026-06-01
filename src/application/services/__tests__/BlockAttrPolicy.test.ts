import { describe, expect, it } from 'vitest';
import {
  BLOCK_ATTR_WRITABLE_SOURCE_METADATA_KEYS,
  classifyBlockAttrWrite,
  filterWritableBlockAttrs,
  isWritableBlockAttr,
} from '../BlockAttrPolicy';

describe('BlockAttrPolicy strict write allowlist', () => {
  it('allows only tiny source-binding metadata to be written to block attrs', () => {
    expect(BLOCK_ATTR_WRITABLE_SOURCE_METADATA_KEYS).toEqual([
      'custom-xiuyuan-id',
      'custom-fsrs-reading-kind',
      'custom-fsrs-reading-source-doc-id',
      'custom-fsrs-reading-source-block-id',
      'custom-fsrs-reading-parent-topic-card-id',
      'custom-fsrs-reading-parent-excerpt-id',
      'custom-fsrs-reading-storage-mode',
    ]);
    expect(isWritableBlockAttr('custom-xiuyuan-id', 'xy_20260305010958-r26fpmd')).toBe(true);
    expect(isWritableBlockAttr('custom-fsrs-reading-kind', 'excerpt-doc')).toBe(true);
    expect(isWritableBlockAttr('custom-fsrs-reading-source-block-id', '20260305010958-r26fpmd')).toBe(true);
    expect(isWritableBlockAttr('custom-fsrs-xiuyuan-id', 'legacy')).toBe(false);
  });

  it('forbids Review, scheduler, queue, AI, diagnostics, and large high-churn attr writes', () => {
    const forbiddenAttrs = [
      'custom-fsrs-card-id',
      'custom-fsrs-card-type',
      'custom-fsrs-due',
      'custom-fsrs-reps',
      'custom-fsrs-lapses',
      'custom-fsrs-last-review',
      'custom-fsrs-suspended',
      'custom-fsrs-leech-tag',
      'custom-fsrs-queue-state',
      'custom-fsrs-ai-session-id',
      'custom-fsrs-diagnostics-payload',
      'custom-fsrs-image-occlusion',
    ];

    expect(forbiddenAttrs.map((attr) => classifyBlockAttrWrite(attr, 'value').allowed)).toEqual(
      forbiddenAttrs.map(() => false),
    );
    expect(classifyBlockAttrWrite('custom-fsrs-ai-session-id', 'session-a')).toMatchObject({
      allowed: false,
      reason: 'ai-payload',
    });
    expect(classifyBlockAttrWrite('custom-fsrs-due', '9999999999999')).toMatchObject({
      allowed: false,
      reason: 'review-scheduler-or-queue-state',
    });
    expect(classifyBlockAttrWrite('custom-fsrs-reading-source-lineage', 'x'.repeat(300))).toMatchObject({
      allowed: false,
      reason: 'large-or-high-churn-payload',
    });
  });

  it('filters attr write batches without dropping explicit clears for managed legacy attrs', () => {
    expect(filterWritableBlockAttrs({
      'custom-xiuyuan-id': 'xy_20260305010958-r26fpmd',
      'custom-fsrs-card-type': 'topic',
      'custom-fsrs-ai-status': 'draft',
      'custom-fsrs-reading-source-block-id': '20260305010958-r26fpmd',
      'custom-fsrs-suspended': '',
    })).toEqual({
      'custom-xiuyuan-id': 'xy_20260305010958-r26fpmd',
      'custom-fsrs-reading-source-block-id': '20260305010958-r26fpmd',
      'custom-fsrs-suspended': '',
    });
  });
});

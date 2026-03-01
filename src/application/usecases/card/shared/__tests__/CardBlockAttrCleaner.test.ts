import { describe, expect, it } from 'vitest';
import { buildClearedBlockAttrs, CARD_BLOCK_ATTRS_TO_REMOVE } from '../CardBlockAttrCleaner';

describe('CardBlockAttrCleaner', () => {
  it('clears legacy FSRS/Xiuyuan block attrs', () => {
    const attrs: Record<string, string> = {};
    for (const key of CARD_BLOCK_ATTRS_TO_REMOVE) {
      attrs[key] = 'value';
    }
    attrs['other-attr'] = 'keep';

    const result = buildClearedBlockAttrs(attrs);

    for (const key of CARD_BLOCK_ATTRS_TO_REMOVE) {
      expect(result[key]).toBe('');
    }
    expect(result['other-attr']).toBeUndefined();
  });

  it('updates image occlusion mapping when deleting one card', () => {
    const attrs: Record<string, string> = {
      'custom-fsrs-image-occlusion': JSON.stringify({
        version: 2,
        imageSrc: 'img.png',
        masks: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
        maskToCardId: {
          m1: 'c1',
          m2: 'c2',
          m3: 'c3',
        },
      }),
      'custom-fsrs-image-occlusion-version': '2',
      'custom-fsrs-image-occlusion-card-ids': JSON.stringify(['c1', 'c2', 'c3']),
    };

    const result = buildClearedBlockAttrs(attrs, {
      deletedCardIds: ['c2'],
    });

    expect(result['custom-fsrs-image-occlusion-card-ids']).toBe(JSON.stringify(['c1', 'c3']));

    const payload = JSON.parse(result['custom-fsrs-image-occlusion']);
    expect(payload.maskToCardId).toEqual({ m1: 'c1', m3: 'c3' });
    expect(payload.masks).toEqual([{ id: 'm1' }, { id: 'm3' }]);
  });

  it('clears all image occlusion attrs when the last card is deleted', () => {
    const attrs: Record<string, string> = {
      'custom-fsrs-image-occlusion': JSON.stringify({
        version: 2,
        masks: [{ id: 'm1' }],
        maskToCardId: { m1: 'c1' },
      }),
      'custom-fsrs-image-occlusion-version': '2',
      'custom-fsrs-image-occlusion-card-ids': JSON.stringify(['c1']),
    };

    const result = buildClearedBlockAttrs(attrs, {
      deletedCardIds: ['c1'],
    });

    expect(result['custom-fsrs-image-occlusion']).toBe('');
    expect(result['custom-fsrs-image-occlusion-version']).toBe('');
    expect(result['custom-fsrs-image-occlusion-card-ids']).toBe('');
  });

  it('falls back to card-id list update when payload is invalid JSON', () => {
    const attrs: Record<string, string> = {
      'custom-fsrs-image-occlusion': '{invalid json',
      'custom-fsrs-image-occlusion-version': '2',
      'custom-fsrs-image-occlusion-card-ids': JSON.stringify(['c1', 'c2']),
    };

    const result = buildClearedBlockAttrs(attrs, {
      deletedCardIds: ['c2'],
    });

    expect(result['custom-fsrs-image-occlusion-card-ids']).toBe(JSON.stringify(['c1']));
    expect(result['custom-fsrs-image-occlusion']).toBeUndefined();
  });
});

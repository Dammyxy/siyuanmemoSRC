import { describe, expect, it } from 'vitest';
import {
  TOPBAR_QUICK_ENTRY_DEFINITIONS,
  getTopBarQuickEntryDefinition,
} from '@/application/entries/TopBarQuickEntryRegistry';
import {
  getCoreReviewEntryDefinition,
} from '@/application/entries/CoreReviewEntryRegistry';

describe('TopBarQuickEntryRegistry', () => {
  it('keeps top bar quick action order aligned with top bar menu', () => {
    expect(TOPBAR_QUICK_ENTRY_DEFINITIONS.map((definition) => definition.id)).toEqual([
      'start-review',
      'start-incremental-learning',
      'start-deliberate-practice',
      'start-neural-roam',
      'start-filter-group-practice',
      'open-srs-browser',
      'one-click-symbol-current-doc',
      'one-click-cancel-current-doc',
    ]);
  });

  it('reuses the existing one-click symbol slash id and adds cancel slash id', () => {
    const symbol = getTopBarQuickEntryDefinition('one-click-symbol-current-doc');
    const cancel = getTopBarQuickEntryDefinition('one-click-cancel-current-doc');

    expect(symbol?.slashId).toBe('siyuanmemo-one-click-symbol-cards');
    expect(symbol?.requiresDocContext).toBe(true);

    expect(cancel?.slashId).toBe('siyuanmemo-one-click-cancel-cards');
    expect(cancel?.requiresDocContext).toBe(true);
  });

  it('keeps bare incremental slash keywords on the scoped core review entry', () => {
    const globalIncremental = getTopBarQuickEntryDefinition('start-incremental-learning');
    const scopedIncrementalAll = getCoreReviewEntryDefinition('incremental-all');

    expect(globalIncremental?.slashFilters).toContain('开始渐进学习');
    expect(globalIncremental?.slashFilters).not.toContain('渐进学习');
    expect(globalIncremental?.slashFilters).not.toContain('渐进复习');
    expect(scopedIncrementalAll?.slashFilters).toEqual(expect.arrayContaining([
      '渐进学习',
      '渐进复习',
      'incremental learning',
    ]));
  });
});

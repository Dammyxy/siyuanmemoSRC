import { describe, expect, it } from 'vitest';
import {
  TOPBAR_QUICK_ENTRY_DEFINITIONS,
  getTopBarQuickEntryDefinition,
} from '@/application/entries/TopBarQuickEntryRegistry';

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
});

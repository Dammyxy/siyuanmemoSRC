import { describe, expect, it } from 'vitest';
import { useGlobalSelection } from '../useGlobalSelection';

describe('useGlobalSelection', () => {
  it('counts all-matching with exclusions correctly', () => {
    const selection = useGlobalSelection();
    selection.selectAllMatching('fp-a', 10);
    expect(selection.selectedCount.value).toBe(10);

    selection.syncAllMatchingVisibleSelection(['a', 'b', 'c'], ['a']);
    expect(selection.excludedIds.value.has('b')).toBe(true);
    expect(selection.excludedIds.value.has('c')).toBe(true);
    expect(selection.selectedCount.value).toBe(8);
  });

  it('returns explicit selection ids in explicit mode', () => {
    const selection = useGlobalSelection();
    selection.setExplicitByIds(['a', 'b', 'a']);

    const selected = selection.resolveSelectedIds(['a', 'b', 'c']);
    expect(selected.sort()).toEqual(['a', 'b']);
    expect(selection.selectedCount.value).toBe(2);
  });

  it('clears state correctly', () => {
    const selection = useGlobalSelection();
    selection.selectAllMatching('fp-a', 5);
    selection.clear();

    expect(selection.mode.value).toBe('explicit');
    expect(selection.selectedCount.value).toBe(0);
    expect(selection.queryFingerprint.value).toBe('');
  });
});

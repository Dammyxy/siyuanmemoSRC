import { computed, ref } from 'vue';

export type GlobalSelectionMode = 'explicit' | 'all-matching';

function normalizeIds(ids: string[]): string[] {
  return Array.from(new Set((ids || []).map((id) => String(id || '')).filter(Boolean)));
}

export function useGlobalSelection() {
  const mode = ref<GlobalSelectionMode>('explicit');
  const queryFingerprint = ref('');
  const explicitIds = ref<Set<string>>(new Set());
  const excludedIds = ref<Set<string>>(new Set());
  const totalMatchingCount = ref(0);

  const explicitCount = computed(() => explicitIds.value.size);
  const selectedCount = computed(() => {
    if (mode.value === 'all-matching') {
      return Math.max(0, totalMatchingCount.value - excludedIds.value.size);
    }
    return explicitIds.value.size;
  });

  function setExplicitByIds(ids: string[]): void {
    mode.value = 'explicit';
    explicitIds.value = new Set(normalizeIds(ids));
    excludedIds.value = new Set();
    totalMatchingCount.value = explicitIds.value.size;
    queryFingerprint.value = '';
  }

  function selectAllMatching(nextFingerprint: string, totalCount: number): void {
    mode.value = 'all-matching';
    queryFingerprint.value = String(nextFingerprint || '');
    explicitIds.value = new Set();
    excludedIds.value = new Set();
    totalMatchingCount.value = Math.max(0, Math.floor(Number(totalCount) || 0));
  }

  function clear(): void {
    mode.value = 'explicit';
    explicitIds.value = new Set();
    excludedIds.value = new Set();
    totalMatchingCount.value = 0;
    queryFingerprint.value = '';
  }

  function syncAllMatchingVisibleSelection(visibleIds: string[], selectedIds: string[]): void {
    if (mode.value !== 'all-matching') {
      return;
    }

    const selectedSet = new Set(normalizeIds(selectedIds));
    const nextExcluded = new Set(excludedIds.value);

    for (const id of normalizeIds(visibleIds)) {
      if (selectedSet.has(id)) {
        nextExcluded.delete(id);
      } else {
        nextExcluded.add(id);
      }
    }

    excludedIds.value = nextExcluded;
  }

  function resolveSelectedIds(allMatchedIds: string[]): string[] {
    if (mode.value !== 'all-matching') {
      return Array.from(explicitIds.value);
    }
    return normalizeIds(allMatchedIds).filter((id) => !excludedIds.value.has(id));
  }

  return {
    mode,
    queryFingerprint,
    explicitIds,
    excludedIds,
    totalMatchingCount,
    explicitCount,
    selectedCount,
    setExplicitByIds,
    selectAllMatching,
    clear,
    syncAllMatchingVisibleSelection,
    resolveSelectedIds,
  };
}

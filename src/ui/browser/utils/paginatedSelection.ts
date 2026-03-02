export type MergeExplicitSelectionByPageInput = {
  existingSelectedIds: Iterable<string>;
  visibleIds: Iterable<string>;
  pageSelectedIds: Iterable<string>;
};

function normalizeIds(ids: Iterable<string>): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const raw of ids) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push(id);
  }

  return normalized;
}

export function mergeExplicitSelectionByPage(
  input: MergeExplicitSelectionByPageInput
): Set<string> {
  const nextSelected = new Set<string>(normalizeIds(input.existingSelectedIds));
  const visibleIds = new Set<string>(normalizeIds(input.visibleIds));
  const pageSelectedIds = normalizeIds(input.pageSelectedIds);

  for (const id of visibleIds) {
    nextSelected.delete(id);
  }
  for (const id of pageSelectedIds) {
    nextSelected.add(id);
  }

  return nextSelected;
}

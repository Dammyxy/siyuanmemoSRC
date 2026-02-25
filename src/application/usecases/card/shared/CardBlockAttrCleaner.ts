export const CARD_BLOCK_ATTRS_TO_REMOVE = Object.freeze([
  'custom-card-type',
  'custom-fsrs-card-type',
  'custom-xiuyuan-id',
  'custom-xiuyuan-template',
  'custom-template-id',
  'custom-list-template',
  'custom-priority',
  'custom-fsrs-a-factor',
]);

export function buildClearedBlockAttrs(
  attrs: Record<string, string>,
  keys: readonly string[] = CARD_BLOCK_ATTRS_TO_REMOVE
): Record<string, string> {
  const nextAttrs: Record<string, string> = {};
  for (const key of keys) {
    if (key in attrs) {
      nextAttrs[key] = '';
    }
  }
  return nextAttrs;
}

export type BlockAttrCleanupMode = 'safe' | 'full';
export type CleanupMode = BlockAttrCleanupMode;

export const BLOCK_ATTR_BINDING_KEYS = Object.freeze([
  'custom-xiuyuan-id',
]);

export const BLOCK_ATTR_FUNCTIONAL_KEYS = Object.freeze([
  'custom-fsrs-image-occlusion',
  'custom-fsrs-image-occlusion-version',
  'custom-fsrs-image-occlusion-card-ids',
  'custom-fsrs-suspended',
  'custom-fsrs-leech-tag',
  'custom-fsrs-leech-suspend',
  'custom-fsrs-reading-kind',
  'custom-fsrs-reading-session-id',
  'custom-fsrs-reading-mode',
  'custom-fsrs-reading-source-doc-id',
  'custom-fsrs-reading-source-block-id',
  'custom-fsrs-reading-piece-index',
  'custom-fsrs-reading-piece-count',
  'custom-fsrs-reading-piece-state',
  'custom-fsrs-reading-workbench-id',
  'custom-fsrs-reading-parent-excerpt-id',
  'custom-fsrs-reading-trace-kind',
  'custom-fsrs-progressive-kind',
  'custom-fsrs-progressive-session-id',
  'custom-fsrs-progressive-mode',
  'custom-fsrs-progressive-source-doc-id',
  'custom-fsrs-progressive-source-block-id',
  'custom-fsrs-progressive-piece-index',
  'custom-fsrs-progressive-piece-count',
  'custom-fsrs-progressive-piece-state',
  'custom-fsrs-progressive-workbench-id',
  'custom-fsrs-progressive-parent-excerpt-id',
  'custom-fsrs-progressive-trace-kind',
]);

export const BLOCK_ATTR_DEPRECATED_KEYS = Object.freeze([
  'custom-fsrs-card-id',
  'custom-fsrs-card-type',
  'custom-fsrs-priority',
  'custom-fsrs-flashcard',
  'custom-fsrs-neural-focus',
  'custom-fsrs-a-factor',
  'custom-xiuyuan-template',
]);

export const BLOCK_ATTR_LEGACY_KEYS = Object.freeze([
  'custom-card-id',
  'custom-card-type',
  'custom-template-id',
  'custom-list-template',
  'custom-priority',
  'custom-fsrs-xiuyuan-id',
  'custom-fsrs-template-id',
]);

export const ALL_PLUGIN_BLOCK_ATTR_KEYS = Object.freeze(
  Array.from(
    new Set([
      ...BLOCK_ATTR_BINDING_KEYS,
      ...BLOCK_ATTR_FUNCTIONAL_KEYS,
      ...BLOCK_ATTR_DEPRECATED_KEYS,
      ...BLOCK_ATTR_LEGACY_KEYS,
    ])
  )
);

const SAFE_ALWAYS_REMOVE_SET = new Set<string>([
  ...BLOCK_ATTR_DEPRECATED_KEYS,
  ...BLOCK_ATTR_LEGACY_KEYS,
]);

export function isManagedPluginBlockAttr(attrName: string): boolean {
  return ALL_PLUGIN_BLOCK_ATTR_KEYS.includes(attrName);
}

export function shouldRemoveAttrForMode(
  mode: BlockAttrCleanupMode,
  attrName: string,
  options?: { staleXiuyuanBinding?: boolean }
): boolean {
  if (!isManagedPluginBlockAttr(attrName)) {
    return false;
  }

  if (mode === 'full') {
    return true;
  }

  if (SAFE_ALWAYS_REMOVE_SET.has(attrName)) {
    return true;
  }

  if (attrName === 'custom-xiuyuan-id') {
    return options?.staleXiuyuanBinding === true;
  }

  return false;
}

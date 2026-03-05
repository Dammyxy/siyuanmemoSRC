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

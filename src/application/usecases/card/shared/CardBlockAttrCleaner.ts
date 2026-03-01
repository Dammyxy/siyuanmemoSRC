const ATTR_IMAGE_OCCLUSION = 'custom-fsrs-image-occlusion';
const ATTR_IMAGE_OCCLUSION_VERSION = 'custom-fsrs-image-occlusion-version';
const ATTR_IMAGE_OCCLUSION_CARD_IDS = 'custom-fsrs-image-occlusion-card-ids';

export const CARD_BLOCK_ATTRS_TO_REMOVE = Object.freeze([
  'custom-card-id',
  'custom-card-type',
  'custom-fsrs-card-id',
  'custom-fsrs-card-type',
  'custom-fsrs-xiuyuan-id',
  'custom-fsrs-template-id',
  'custom-fsrs-priority',
  'custom-fsrs-flashcard',
  'custom-fsrs-neural-focus',
  'custom-fsrs-suspended',
  'custom-fsrs-leech-tag',
  'custom-xiuyuan-id',
  'custom-xiuyuan-template',
  'custom-template-id',
  'custom-list-template',
  'custom-priority',
  'custom-fsrs-a-factor',
]);

type ImageOcclusionPayload = {
  version?: number;
  imageSrc?: string;
  masks?: Array<{ id?: string } & Record<string, unknown>>;
  maskToCardId?: Record<string, string>;
  updatedAt?: number;
} & Record<string, unknown>;

export interface BuildClearedBlockAttrsOptions {
  keys?: readonly string[];
  deletedCardIds?: readonly string[];
}

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
  } catch {
    return [];
  }
}

function parseImageOcclusionPayload(rawPayload: unknown): ImageOcclusionPayload | null {
  if (typeof rawPayload !== 'string' || rawPayload.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawPayload) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed as ImageOcclusionPayload;
  } catch {
    return null;
  }
}

function clearImageOcclusionAttrs(
  attrs: Record<string, string>,
  nextAttrs: Record<string, string>
): void {
  for (const key of [ATTR_IMAGE_OCCLUSION, ATTR_IMAGE_OCCLUSION_VERSION, ATTR_IMAGE_OCCLUSION_CARD_IDS]) {
    if (key in attrs) {
      nextAttrs[key] = '';
    }
  }
}

function applyImageOcclusionCleanup(
  attrs: Record<string, string>,
  nextAttrs: Record<string, string>,
  deletedCardIds: readonly string[]
): void {
  if (deletedCardIds.length === 0) {
    return;
  }

  const deletedCardIdSet = new Set(
    deletedCardIds
      .filter((id): id is string => typeof id === 'string')
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
  );
  if (deletedCardIdSet.size === 0) {
    return;
  }

  const payload = parseImageOcclusionPayload(attrs[ATTR_IMAGE_OCCLUSION]);
  const trackedCardIds = (() => {
    const parsedIds = parseJsonArray(attrs[ATTR_IMAGE_OCCLUSION_CARD_IDS]);
    if (parsedIds.length > 0) {
      return parsedIds;
    }

    const fromPayload = payload?.maskToCardId;
    if (!fromPayload || typeof fromPayload !== 'object') {
      return [];
    }

    return Array.from(
      new Set(
        Object.values(fromPayload)
          .map((cardId) => (typeof cardId === 'string' ? cardId.trim() : ''))
          .filter((cardId) => cardId.length > 0)
      )
    );
  })();
  const hasImageOcclusionAttrs =
    ATTR_IMAGE_OCCLUSION in attrs ||
    ATTR_IMAGE_OCCLUSION_CARD_IDS in attrs ||
    ATTR_IMAGE_OCCLUSION_VERSION in attrs;

  if (!hasImageOcclusionAttrs) {
    return;
  }

  const remainingTrackedCardIds = trackedCardIds.filter((cardId) => !deletedCardIdSet.has(cardId));

  if (remainingTrackedCardIds.length === 0) {
    clearImageOcclusionAttrs(attrs, nextAttrs);
    return;
  }

  nextAttrs[ATTR_IMAGE_OCCLUSION_CARD_IDS] = JSON.stringify(remainingTrackedCardIds);

  // payload 无法解析时，至少确保 card-ids 正确。
  if (!payload) {
    return;
  }

  const currentMaskToCardId = payload.maskToCardId;
  if (!currentMaskToCardId || typeof currentMaskToCardId !== 'object') {
    return;
  }

  const nextMaskToCardId = Object.fromEntries(
    Object.entries(currentMaskToCardId)
      .map(([maskId, cardId]) => [maskId.trim(), typeof cardId === 'string' ? cardId.trim() : ''] as const)
      .filter(([maskId, cardId]) => maskId.length > 0 && cardId.length > 0 && !deletedCardIdSet.has(cardId))
  );

  payload.maskToCardId = nextMaskToCardId;

  if (Array.isArray(payload.masks)) {
    const activeMaskIds = new Set(Object.keys(nextMaskToCardId));
    payload.masks = payload.masks.filter((mask) => {
      if (!mask || typeof mask !== 'object') {
        return false;
      }
      const maskId = typeof mask.id === 'string' ? mask.id.trim() : '';
      return maskId.length > 0 && activeMaskIds.has(maskId);
    });
  }

  nextAttrs[ATTR_IMAGE_OCCLUSION] = JSON.stringify(payload);

  const payloadVersion = Number.parseInt(String(payload.version ?? ''), 10);
  if (Number.isFinite(payloadVersion)) {
    nextAttrs[ATTR_IMAGE_OCCLUSION_VERSION] = String(payloadVersion);
  }
}

export function buildClearedBlockAttrs(
  attrs: Record<string, string>,
  options: BuildClearedBlockAttrsOptions = {}
): Record<string, string> {
  const keys = options.keys ?? CARD_BLOCK_ATTRS_TO_REMOVE;
  const nextAttrs: Record<string, string> = {};

  for (const key of keys) {
    if (key in attrs) {
      nextAttrs[key] = '';
    }
  }

  applyImageOcclusionCleanup(attrs, nextAttrs, options.deletedCardIds || []);
  return nextAttrs;
}

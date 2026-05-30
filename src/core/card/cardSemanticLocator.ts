import type { CardFaceKey, FSRSCard } from '@/types/card';

export type CardRuleDirection = 'forward' | 'reverse';

type CardSemanticLocatorInput = Pick<FSRSCard, 'faceKey' | 'meta'>;

export function resolveCardFaceKey(card: CardSemanticLocatorInput | null | undefined): CardFaceKey | null {
  const explicit = normalizeFaceKey(card?.faceKey) || normalizeFaceKey(readMetaValue(card, 'faceKey'));
  if (explicit) {
    return explicit;
  }

  const ruleId = resolveLegacyRuleId(card);
  if (!ruleId) {
    return null;
  }

  const faceIndex = resolveLegacyFaceIndex(card);
  return faceIndex > 0 ? { ruleId, faceIndex } : { ruleId };
}

export function resolveCardFaceIndex(card: CardSemanticLocatorInput | null | undefined): number {
  const explicit = normalizeFaceKey(card?.faceKey) || normalizeFaceKey(readMetaValue(card, 'faceKey'));
  if (explicit && typeof explicit.faceIndex === 'number') {
    return explicit.faceIndex;
  }
  return resolveLegacyFaceIndex(card);
}

export function resolveCardRuleId(card: CardSemanticLocatorInput | null | undefined): string | null {
  const explicit = normalizeFaceKey(card?.faceKey) || normalizeFaceKey(readMetaValue(card, 'faceKey'));
  return explicit?.ruleId ?? resolveLegacyRuleId(card);
}

export function resolveCardRuleDirection(card: CardSemanticLocatorInput | null | undefined): CardRuleDirection | null {
  const explicitDirection = parseRuleDirection(normalizeFaceKey(card?.faceKey)?.ruleId)
    || parseRuleDirection(normalizeFaceKey(readMetaValue(card, 'faceKey'))?.ruleId);
  if (explicitDirection) {
    return explicitDirection;
  }
  return parseRuleDirection(resolveLegacyRuleId(card));
}

export function resolveCardFaceToken(card: CardSemanticLocatorInput | null | undefined): string {
  const explicit = normalizeFaceKey(card?.faceKey) || normalizeFaceKey(readMetaValue(card, 'faceKey'));
  if (explicit) {
    return `rule:${explicit.ruleId}::face:${explicit.faceIndex ?? 0}`;
  }
  return `face:${resolveLegacyFaceIndex(card)}`;
}

function resolveLegacyRuleId(card: CardSemanticLocatorInput | null | undefined): string | null {
  return normalizeString(readMetaValue(card, 'ruleId'))
    || normalizeString(readMetaValue(card, 'typeMarker'));
}

function resolveLegacyFaceIndex(card: CardSemanticLocatorInput | null | undefined): number {
  const rawFaceIndex = readMetaValue(card, 'faceIndex') ?? readMetaValue(card, 'ruleIndex');
  const numericFaceIndex = normalizeFaceIndex(rawFaceIndex);
  return numericFaceIndex ?? 0;
}

function normalizeFaceKey(value: unknown): CardFaceKey | null {
  if (!isRecord(value)) {
    return null;
  }
  const ruleId = normalizeString(value.ruleId);
  if (!ruleId) {
    return null;
  }
  const faceIndex = normalizeFaceIndex(value.faceIndex);
  return typeof faceIndex === 'number' ? { ruleId, faceIndex } : { ruleId };
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeFaceIndex(value: unknown): number | null {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim().length > 0
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : null;
}

function parseRuleDirection(value: string | null | undefined): CardRuleDirection | null {
  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized) {
    return null;
  }
  if (/(^|[-_:])reverse($|[-_:])/.test(normalized)) {
    return 'reverse';
  }
  if (/(^|[-_:])forward($|[-_:])/.test(normalized)) {
    return 'forward';
  }
  return null;
}

function readMetaValue(card: CardSemanticLocatorInput | null | undefined, key: string): unknown {
  const meta = card?.meta;
  return isRecord(meta) ? meta[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

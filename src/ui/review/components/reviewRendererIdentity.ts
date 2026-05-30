import { resolveCardFaceToken, resolveCardRuleId } from '@/core/card/cardSemanticLocator';
import type { FSRSCard } from '@/types/card';

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readLegacyFaceIndex(card: FSRSCard | null | undefined): string {
  const value = card?.meta?.faceIndex;
  return typeof value === 'number' ? String(value) : '';
}

export function buildReviewRendererIdentity(card: FSRSCard | null | undefined, parts: string[] = []): string {
  const explicitFaceToken = card?.faceKey || card?.meta?.faceKey;
  const faceToken = explicitFaceToken
    ? resolveCardFaceToken(card)
    : `legacy-face:${readLegacyFaceIndex(card)}`;
  const ruleId = resolveCardRuleId(card) ?? '';

  return [
    ...parts,
    readString(card?.id),
    readString(card?.blockId),
    String(card?.updatedAt ?? ''),
    faceToken,
    ruleId,
  ].join('|');
}

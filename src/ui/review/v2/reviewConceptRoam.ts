import { CardType, type FSRSCard } from '@/types/card';
import {
  isConceptCard,
  isConceptDefinitionCard,
  isDescriptorSemanticCard,
} from '@/core/xiuyuan/cardMeta';
import type { ReviewUIState } from './types';

type ReviewContent = ReviewUIState['content'];

export interface ReviewConceptRoamFocus {
  focusBlockId: string;
}

export interface ReviewConceptRoamTarget extends ReviewConceptRoamFocus {
  label?: string;
}

function normalizeBlockId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readFieldMapping(card: FSRSCard | undefined, key: string): string {
  const mapping = card?.meta?.fieldMapping;
  if (!mapping || typeof mapping !== 'object') {
    return '';
  }
  return normalizeBlockId((mapping as Record<string, unknown>)[key]);
}

function readStringArray(card: FSRSCard | undefined, key: 'frontBlockIDs' | 'backBlockIDs'): string[] {
  const value = card?.meta?.[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(normalizeBlockId).filter(Boolean);
}

function uniqueCandidates(candidates: string[]): string[] {
  return Array.from(new Set(candidates.map(normalizeBlockId).filter(Boolean)));
}

function onlyUnambiguous(candidates: string[]): string {
  const unique = uniqueCandidates(candidates);
  return unique.length === 1 ? unique[0] : '';
}

function isConceptReviewCard(card: FSRSCard | undefined): boolean {
  return card?.type === CardType.Concept || card?.type === 'concept' || isConceptCard(card);
}

function resolveConceptCardFocus(content: ReviewContent, card: FSRSCard): string {
  return readFieldMapping(card, 'concept')
    || normalizeBlockId(content.id)
    || normalizeBlockId(card.blockId);
}

function toTargets(candidates: string[]): ReviewConceptRoamTarget[] {
  return uniqueCandidates(candidates).map((focusBlockId) => ({
    focusBlockId,
    label: focusBlockId,
  }));
}

export function resolveReviewConceptRoamTargets(content: ReviewContent): ReviewConceptRoamTarget[] {
  const card = content.card;
  if (!card || content.type === 'empty') {
    return [];
  }

  if (isConceptReviewCard(card)) {
    const focusBlockId = resolveConceptCardFocus(content, card);
    return focusBlockId ? [{ focusBlockId, label: focusBlockId }] : [];
  }

  if (isConceptDefinitionCard(card)) {
    const mappedConcept = readFieldMapping(card, 'concept');
    if (mappedConcept) {
      return [{ focusBlockId: mappedConcept, label: mappedConcept }];
    }
    const definitionId = readFieldMapping(card, 'definition') || normalizeBlockId(content.id);
    return toTargets([
      ...readStringArray(card, 'frontBlockIDs'),
      ...readStringArray(card, 'backBlockIDs'),
    ].filter((id) => id && id !== definitionId));
  }

  if (isDescriptorSemanticCard(card)) {
    const mappedConcept = readFieldMapping(card, 'concept');
    if (mappedConcept) {
      return [{ focusBlockId: mappedConcept, label: mappedConcept }];
    }
    const descriptorId = readFieldMapping(card, 'descriptor') || normalizeBlockId(content.id);
    return toTargets([
      ...readStringArray(card, 'frontBlockIDs'),
      ...readStringArray(card, 'backBlockIDs'),
    ].filter((id) => id && id !== descriptorId));
  }

  return [];
}

export function resolveReviewConceptRoamFocus(content: ReviewContent): ReviewConceptRoamFocus | null {
  const targets = resolveReviewConceptRoamTargets(content);
  if (targets.length !== 1) {
    return null;
  }

  return { focusBlockId: targets[0].focusBlockId };
}

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

function resolveConceptDefinitionFocus(content: ReviewContent, card: FSRSCard): string {
  const mappedConcept = readFieldMapping(card, 'concept');
  if (mappedConcept) {
    return mappedConcept;
  }

  const definitionId = readFieldMapping(card, 'definition') || normalizeBlockId(content.id);
  const front = readStringArray(card, 'frontBlockIDs');
  const back = readStringArray(card, 'backBlockIDs');
  const typeMarker = normalizeBlockId(card.meta?.typeMarker);
  const templateID = normalizeBlockId(card.meta?.templateID);

  if (templateID === 'builtin-concept-definition-reverse' || typeMarker === 'concept-definition-reverse') {
    return onlyUnambiguous([back[0], front[0]].filter((id) => id && id !== definitionId));
  }

  if (templateID.startsWith('builtin-concept-definition') || typeMarker.startsWith('concept-definition-')) {
    return onlyUnambiguous([front[0], back[0]].filter((id) => id && id !== definitionId));
  }

  return onlyUnambiguous([...front, ...back].filter((id) => id && id !== definitionId));
}

function resolveDescriptorFocus(card: FSRSCard): string {
  const mappedConcept = readFieldMapping(card, 'concept');
  if (mappedConcept) {
    return mappedConcept;
  }

  const descriptorId = readFieldMapping(card, 'descriptor');
  const front = readStringArray(card, 'frontBlockIDs');
  const back = readStringArray(card, 'backBlockIDs');
  return onlyUnambiguous([front[0], back[0]].filter((id) => id && id !== descriptorId));
}

export function resolveReviewConceptRoamFocus(content: ReviewContent): ReviewConceptRoamFocus | null {
  const card = content.card;
  if (!card || content.type === 'empty') {
    return null;
  }

  let focusBlockId = '';
  if (isConceptReviewCard(card)) {
    focusBlockId = resolveConceptCardFocus(content, card);
  } else if (isConceptDefinitionCard(card)) {
    focusBlockId = resolveConceptDefinitionFocus(content, card);
  } else if (isDescriptorSemanticCard(card)) {
    focusBlockId = resolveDescriptorFocus(card);
  }

  return focusBlockId ? { focusBlockId } : null;
}

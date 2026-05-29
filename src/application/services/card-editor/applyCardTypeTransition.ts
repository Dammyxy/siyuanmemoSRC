import { initializeAFactor } from '@/core/card-builder/detectCardType';
import { CardType, type FSRSCard } from '@/types/card';
import {
  analyzeProtectedSemanticOverwrite,
  type SemanticOverwriteAnalysis,
} from '@/core/card/semanticPayload';
import {
  applyRenderTargetTransition,
  resolveEditableRenderTarget,
  type EditableRenderTarget,
} from './applyRenderTargetTransition';

type CardMetaRecord = Record<string, unknown>;
type DescriptorDirection = 'forward' | 'reverse';

export type EditableCardType =
  | CardType.Topic
  | CardType.Item
  | CardType.Concept
  | CardType.Descriptor;

export interface CardTypeTransitionOptions {
  syncRecommendedRender?: boolean;
}

export interface CardTypeTransitionResult {
  card: FSRSCard;
  changed: boolean;
  descriptorDirection?: DescriptorDirection;
  recommendedRenderTarget: EditableRenderTarget;
  semanticOverwrite: SemanticOverwriteAnalysis;
}

function cloneMeta(meta: unknown): CardMetaRecord {
  if (meta && typeof meta === 'object') {
    return { ...(meta as CardMetaRecord) };
  }
  return {};
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clearSemanticMarker(meta: CardMetaRecord): boolean {
  if (meta.cardTypeMarker === 'concept' || meta.cardTypeMarker === 'descriptor') {
    delete meta.cardTypeMarker;
    return true;
  }
  return false;
}

function setSemanticMarker(meta: CardMetaRecord, marker: 'concept' | 'descriptor'): boolean {
  if (meta.cardTypeMarker !== marker) {
    meta.cardTypeMarker = marker;
    return true;
  }
  return false;
}

function resolveDescriptorDirection(target: EditableRenderTarget): DescriptorDirection {
  return target === 'descriptor-reverse' ? 'reverse' : 'forward';
}

export function resolveRecommendedRenderTargetForType(
  targetType: EditableCardType,
  currentRenderTarget: EditableRenderTarget,
): EditableRenderTarget {
  switch (targetType) {
    case CardType.Topic:
      return 'default';
    case CardType.Item:
      return currentRenderTarget;
    case CardType.Concept:
      return 'concept';
    case CardType.Descriptor:
      return currentRenderTarget === 'descriptor-reverse'
        ? 'descriptor-reverse'
        : 'descriptor-forward';
  }
}

export function applyCardTypeTransition(
  card: FSRSCard,
  targetType: EditableCardType,
  options: CardTypeTransitionOptions = {},
): CardTypeTransitionResult {
  const nextCard: FSRSCard = {
    ...card,
    meta: cloneMeta(card.meta),
  };
  const meta = nextCard.meta as CardMetaRecord;
  let changed = false;

  const currentRenderTarget = resolveEditableRenderTarget(card);
  const recommendedRenderTarget = resolveRecommendedRenderTargetForType(targetType, currentRenderTarget);

  switch (targetType) {
    case CardType.Topic: {
      if (nextCard.type !== CardType.Topic) {
        nextCard.type = CardType.Topic;
        changed = true;
      }
      if (nextCard.cardTypeMarker !== undefined) {
        nextCard.cardTypeMarker = undefined;
        changed = true;
      }
      changed = clearSemanticMarker(meta) || changed;
      if (!isFiniteNumber(nextCard.aFactor)) {
        nextCard.aFactor = initializeAFactor(nextCard.priority ?? 50);
        changed = true;
      }
      break;
    }

    case CardType.Item: {
      if (nextCard.type !== CardType.Item) {
        nextCard.type = CardType.Item;
        changed = true;
      }
      if (nextCard.cardTypeMarker !== undefined) {
        nextCard.cardTypeMarker = undefined;
        changed = true;
      }
      changed = clearSemanticMarker(meta) || changed;
      if (Object.prototype.hasOwnProperty.call(nextCard, 'aFactor')) {
        delete nextCard.aFactor;
        changed = true;
      }
      break;
    }

    case CardType.Concept: {
      if (nextCard.type !== CardType.Concept) {
        nextCard.type = CardType.Concept;
        changed = true;
      }
      if (nextCard.cardTypeMarker !== 'concept') {
        nextCard.cardTypeMarker = 'concept';
        changed = true;
      }
      changed = setSemanticMarker(meta, 'concept') || changed;
      break;
    }

    case CardType.Descriptor: {
      if (nextCard.type !== CardType.Descriptor) {
        nextCard.type = CardType.Descriptor;
        changed = true;
      }
      if (nextCard.cardTypeMarker !== 'descriptor') {
        nextCard.cardTypeMarker = 'descriptor';
        changed = true;
      }
      changed = setSemanticMarker(meta, 'descriptor') || changed;
      break;
    }
  }

  if (Object.keys(meta).length === 0) {
    nextCard.meta = undefined;
  }

  if (options.syncRecommendedRender !== false && targetType !== CardType.Item) {
    const renderTransition = applyRenderTargetTransition(nextCard, recommendedRenderTarget);
    changed = renderTransition.changed || changed;
    Object.assign(nextCard, renderTransition.card);
    if (changed && !renderTransition.changed) {
      nextCard.updatedAt = Date.now();
    }
  } else if (changed) {
    nextCard.updatedAt = Date.now();
  }

  return {
    card: nextCard,
    changed,
    descriptorDirection: targetType === CardType.Descriptor
      ? resolveDescriptorDirection(recommendedRenderTarget)
      : undefined,
    recommendedRenderTarget,
    semanticOverwrite: analyzeProtectedSemanticOverwrite(card, nextCard),
  };
}

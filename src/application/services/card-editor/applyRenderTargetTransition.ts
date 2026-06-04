import type { CardFaceKey, FSRSCard } from '@/types/card';
import {
  analyzeProtectedSemanticOverwrite,
  type SemanticOverwriteAnalysis,
} from '@/core/card/semanticPayload';
import { resolveCardRuleDirection } from '@/core/card/cardSemanticLocator';

type CardMetaRecord = Record<string, unknown>;

export type EditableRenderTarget =
  | 'default'
  | 'quick'
  | 'concept'
  | 'concept-definition-forward'
  | 'concept-definition-reverse'
  | 'descriptor-forward'
  | 'descriptor-reverse';

export interface RenderTargetSpec {
  typeMarker?: string;
  templateID?: string;
}

export interface RenderTargetOption {
  value: EditableRenderTarget;
  label: string;
}

export interface RenderTargetTransitionResult {
  card: FSRSCard;
  changed: boolean;
  target: EditableRenderTarget;
  semanticOverwrite: SemanticOverwriteAnalysis;
}

export const RENDER_TARGET_SPECS: Record<EditableRenderTarget, RenderTargetSpec> = {
  default: {},
  quick: {},
  concept: {
    typeMarker: 'C',
    templateID: 'builtin-concept-simple',
  },
  'concept-definition-forward': {
    typeMarker: 'concept-definition-forward',
    templateID: 'builtin-concept-definition-forward',
  },
  'concept-definition-reverse': {
    typeMarker: 'concept-definition-reverse',
    templateID: 'builtin-concept-definition-reverse',
  },
  'descriptor-forward': {
    typeMarker: 'concept-descriptor-forward',
    templateID: 'builtin-concept-descriptor',
  },
  'descriptor-reverse': {
    typeMarker: 'concept-descriptor-reverse',
    templateID: 'builtin-concept-descriptor-reverse',
  },
};

const CONCEPTUAL_RENDER_PROFILES = new Set([
  'concept',
  'descriptor',
  'concept-definition',
]);

const DIRECTIONAL_FACE_RULE_IDS = new Set([
  'concept-definition-forward',
  'concept-definition-reverse',
  'descriptor-forward',
  'descriptor-reverse',
]);

const TARGET_FACE_RULE_ID: Partial<Record<EditableRenderTarget, string>> = {
  'concept-definition-forward': 'concept-definition-forward',
  'concept-definition-reverse': 'concept-definition-reverse',
  'descriptor-forward': 'descriptor-forward',
  'descriptor-reverse': 'descriptor-reverse',
};

function cloneMeta(meta: unknown): CardMetaRecord {
  if (meta && typeof meta === 'object') {
    return { ...(meta as CardMetaRecord) };
  }
  return {};
}

function clearForceRenderFlags(meta: CardMetaRecord): boolean {
  let changed = false;

  if (Object.prototype.hasOwnProperty.call(meta, 'forceQuickRender')) {
    delete meta.forceQuickRender;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(meta, 'forceProtyleRender')) {
    delete meta.forceProtyleRender;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(meta, 'quickDetectReason')) {
    delete meta.quickDetectReason;
    changed = true;
  }

  return changed;
}

function clearRenderProfile(meta: CardMetaRecord): boolean {
  if (typeof meta.renderProfile === 'string' && CONCEPTUAL_RENDER_PROFILES.has(meta.renderProfile)) {
    delete meta.renderProfile;
    return true;
  }
  return false;
}

function applyDefaultRender(meta: CardMetaRecord): boolean {
  let changed = clearForceRenderFlags(meta);
  if (meta.forceProtyleRender !== true) {
    meta.forceProtyleRender = true;
    changed = true;
  }
  return changed;
}

function applyQuickRender(meta: CardMetaRecord): boolean {
  let changed = clearForceRenderFlags(meta);
  changed = clearRenderProfile(meta) || changed;
  if (meta.forceQuickRender !== true) {
    meta.forceQuickRender = true;
    changed = true;
  }
  return changed;
}

function applyConceptualRender(meta: CardMetaRecord, target: EditableRenderTarget): boolean {
  const spec = RENDER_TARGET_SPECS[target];
  let changed = clearForceRenderFlags(meta);
  const nextProfile = target.startsWith('descriptor')
    ? 'descriptor'
    : target.startsWith('concept-definition')
      ? 'concept-definition'
      : 'concept';

  if (meta.renderProfile !== nextProfile) {
    meta.renderProfile = nextProfile;
    changed = true;
  }

  if (spec.typeMarker && meta.typeMarker !== spec.typeMarker) {
    meta.typeMarker = spec.typeMarker;
    changed = true;
  }

  if (spec.templateID && meta.templateID !== spec.templateID) {
    meta.templateID = spec.templateID;
    changed = true;
  }

  return changed;
}

function isCardFaceKey(value: unknown): value is CardFaceKey {
  return !!value
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof (value as CardFaceKey).ruleId === 'string'
    && (value as CardFaceKey).ruleId.trim().length > 0;
}

function syncDirectionalFaceKey(
  faceKey: CardFaceKey | undefined,
  target: EditableRenderTarget,
): { faceKey: CardFaceKey | undefined; changed: boolean } {
  const targetRuleId = TARGET_FACE_RULE_ID[target];
  if (!targetRuleId || !faceKey || !DIRECTIONAL_FACE_RULE_IDS.has(faceKey.ruleId)) {
    return { faceKey, changed: false };
  }

  if (faceKey.ruleId === targetRuleId) {
    return { faceKey, changed: false };
  }

  return {
    faceKey: {
      ...faceKey,
      ruleId: targetRuleId,
    },
    changed: true,
  };
}

function syncDirectionalFaceIdentity(
  card: FSRSCard,
  meta: CardMetaRecord,
  target: EditableRenderTarget,
): boolean {
  let changed = false;

  const syncedCardFaceKey = syncDirectionalFaceKey(card.faceKey, target);
  if (syncedCardFaceKey.changed) {
    card.faceKey = syncedCardFaceKey.faceKey;
    changed = true;
  }

  const metaFaceKey = meta.faceKey;
  if (isCardFaceKey(metaFaceKey)) {
    const syncedMetaFaceKey = syncDirectionalFaceKey(metaFaceKey, target);
    if (syncedMetaFaceKey.changed) {
      meta.faceKey = syncedMetaFaceKey.faceKey;
      changed = true;
    }
  }

  return changed;
}

export function resolveEditableRenderTarget(card: FSRSCard | null | undefined): EditableRenderTarget {
  const meta = (card?.meta && typeof card.meta === 'object')
    ? (card.meta as CardMetaRecord)
    : {};
  const authoritativeDirection = resolveCardRuleDirection(card);

  if (meta.forceProtyleRender === true) {
    return 'default';
  }

  if (meta.forceQuickRender === true) {
    return 'quick';
  }

  const renderProfile = typeof meta.renderProfile === 'string' ? meta.renderProfile : '';
  const typeMarker = typeof meta.typeMarker === 'string' ? meta.typeMarker : '';
  const templateID = typeof meta.templateID === 'string' ? meta.templateID : '';

  if (renderProfile === 'concept') {
    return 'concept';
  }

  if (
    renderProfile === 'concept-definition'
    || typeMarker.startsWith('concept-definition')
    || templateID === 'builtin-concept-definition-forward'
    || templateID === 'builtin-concept-definition-reverse'
  ) {
    return (
      authoritativeDirection === 'reverse'
      || (
        authoritativeDirection !== 'forward'
        && (
          typeMarker === 'concept-definition-reverse'
          || typeMarker.endsWith('-reverse')
          || templateID === 'builtin-concept-definition-reverse'
        )
      )
    )
      ? 'concept-definition-reverse'
      : 'concept-definition-forward';
  }

  if (
    renderProfile === 'descriptor'
    || typeMarker.startsWith('concept-descriptor')
    || typeMarker.startsWith('descriptor-')
    || templateID === 'builtin-concept-descriptor'
    || templateID === 'builtin-concept-descriptor-reverse'
  ) {
    return (
      authoritativeDirection === 'reverse'
      || (
        authoritativeDirection !== 'forward'
        && (
          typeMarker.endsWith('-reverse')
          || templateID === 'builtin-concept-descriptor-reverse'
        )
      )
    )
      ? 'descriptor-reverse'
      : 'descriptor-forward';
  }

  return 'default';
}

export function getRenderTargetLabel(
  target: EditableRenderTarget,
  t: (key: string, fallback: string) => string,
): string {
  switch (target) {
    case 'default':
      return t('renderAsDefault', '标准渲染（编辑器）');
    case 'quick':
      return t('renderAsQuick', '快速渲染');
    case 'concept':
      return t('renderAsConcept', '概念卡渲染');
    case 'concept-definition-forward':
      return t('renderAsConceptDefinitionForward', '概念定义卡渲染（正向）');
    case 'concept-definition-reverse':
      return t('renderAsConceptDefinitionReverse', '概念定义卡渲染（反向）');
    case 'descriptor-forward':
      return t('renderAsDescriptorForward', '描述符渲染（正向）');
    case 'descriptor-reverse':
      return t('renderAsDescriptorReverse', '描述符渲染（反向）');
  }
}

export function getRenderTargetOptions(
  t: (key: string, fallback: string) => string,
): RenderTargetOption[] {
  return ([
    'default',
    'quick',
    'concept',
    'concept-definition-forward',
    'concept-definition-reverse',
    'descriptor-forward',
    'descriptor-reverse',
  ] as EditableRenderTarget[]).map((value) => ({
    value,
    label: getRenderTargetLabel(value, t),
  }));
}

export function applyRenderTargetTransition(
  card: FSRSCard,
  target: EditableRenderTarget,
): RenderTargetTransitionResult {
  const nextCard: FSRSCard = {
    ...card,
    meta: cloneMeta(card.meta),
  };
  const meta = nextCard.meta as CardMetaRecord;

  let changed = false;
  switch (target) {
    case 'default':
      changed = applyDefaultRender(meta);
      break;
    case 'quick':
      changed = applyQuickRender(meta);
      break;
    default:
      changed = applyConceptualRender(meta, target);
      break;
  }
  changed = syncDirectionalFaceIdentity(nextCard, meta, target) || changed;

  if (Object.keys(meta).length === 0) {
    nextCard.meta = undefined;
  }

  if (changed) {
    nextCard.updatedAt = Date.now();
  }

  return {
    card: nextCard,
    changed,
    target,
    semanticOverwrite: analyzeProtectedSemanticOverwrite(card, nextCard),
  };
}

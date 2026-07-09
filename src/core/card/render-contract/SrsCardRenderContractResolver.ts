import { CardType, type FSRSCard } from '@/types/card';
import type { SupportedRenderProfile } from '@/core/card/render-profile/RenderProfileResolver';

export type SrsCardRenderContractRendererKind =
  | 'image-occlusion'
  | 'multi-cloze'
  | 'concept-definition'
  | 'concept'
  | 'descriptor'
  | 'quick'
  | null;

export type SrsCardRenderFamily =
  | 'quick-symbol'
  | 'native-multi-cloze'
  | 'image-occlusion'
  | 'unknown';

export interface SrsCardRenderEvidence {
  source: 'meta';
  path: string;
  value: unknown;
}

export interface SrsCardRenderRepairPatch {
  metaPatch?: Record<string, unknown>;
  metaDelete?: string[];
}

export interface SrsCardRenderContract {
  version: 1;
  cardId: string;
  blockId: string;
  semanticKind: string;
  rendererKind: SrsCardRenderContractRendererKind;
  renderFamily: SrsCardRenderFamily;
  quickSymbolEvidence: SrsCardRenderEvidence[];
  repairPatch: SrsCardRenderRepairPatch | null;
  diagnostics: string[];
}

export interface SrsCardRenderContractResolverInput {
  card: FSRSCard | null | undefined;
  profile?: SupportedRenderProfile | string | null;
}

export function resolveSrsCardRenderContract(
  input: SrsCardRenderContractResolverInput,
): SrsCardRenderContract {
  const card = input.card;
  const meta = readMeta(card);
  const profile = input.profile ?? (readString(meta.renderProfile) || null);
  const quickSymbolEvidence = collectQuickSymbolEvidence(meta);
  const diagnostics: string[] = [];

  let rendererKind: SrsCardRenderContractRendererKind = null;
  let renderFamily: SrsCardRenderFamily = 'unknown';

  if (isImageOcclusion(meta)) {
    rendererKind = 'image-occlusion';
    renderFamily = 'image-occlusion';
  } else if (isNativeMultiClozeCard(meta, profile)) {
    rendererKind = 'multi-cloze';
    renderFamily = 'native-multi-cloze';
  } else if (!isProgressiveDerivedItem(card) && quickSymbolEvidence.length > 0) {
    rendererKind = 'quick';
    renderFamily = 'quick-symbol';
  }

  if (renderFamily === 'quick-symbol' && meta.forceProtyleRender === true) {
    diagnostics.push('render-contract-stale-force-protyle');
  }

  if (renderFamily === 'quick-symbol' && !readString(meta.symbolType)) {
    diagnostics.push('render-contract-symbol-type-missing');
  }

  return {
    version: 1,
    cardId: readString(card?.id),
    blockId: readString(card?.blockId),
    semanticKind: readString(card?.type),
    rendererKind,
    renderFamily,
    quickSymbolEvidence,
    repairPatch: buildQuickSymbolRepairPatch(meta, renderFamily),
    diagnostics,
  };
}

function buildQuickSymbolRepairPatch(
  meta: Record<string, unknown>,
  renderFamily: SrsCardRenderFamily,
): SrsCardRenderRepairPatch | null {
  if (renderFamily !== 'quick-symbol') {
    return null;
  }

  const metaPatch: Record<string, unknown> = {};
  const metaDelete: string[] = [];

  if (!readString(meta.source)) {
    metaPatch.source = 'symbol';
  }
  if (meta.symbolDetected !== true) {
    metaPatch.symbolDetected = true;
  }
  if (readString(meta.cardSource) !== 'quick-symbol') {
    metaPatch.cardSource = 'quick-symbol';
  }
  if (!readString(meta.quickDetectReason)) {
    metaPatch.quickDetectReason = 'symbol-rule';
  }
  if (meta.forceProtyleRender === true) {
    metaDelete.push('forceProtyleRender');
  }

  return Object.keys(metaPatch).length > 0 || metaDelete.length > 0
    ? {
      ...(Object.keys(metaPatch).length > 0 ? { metaPatch } : {}),
      ...(metaDelete.length > 0 ? { metaDelete } : {}),
    }
    : null;
}

function collectQuickSymbolEvidence(meta: Record<string, unknown>): SrsCardRenderEvidence[] {
  const evidence: SrsCardRenderEvidence[] = [];
  appendEvidence(evidence, 'meta.source', readString(meta.source) === 'symbol' ? meta.source : undefined);
  appendEvidence(evidence, 'meta.symbolDetected', meta.symbolDetected === true ? true : undefined);
  appendEvidence(evidence, 'meta.cardSource', readString(meta.cardSource) === 'quick-symbol' ? meta.cardSource : undefined);
  appendEvidence(evidence, 'meta.symbolType', readString(meta.symbolType) || undefined);
  appendEvidence(
    evidence,
    'meta.quickDetectReason',
    readString(meta.quickDetectReason) === 'symbol-rule' ? meta.quickDetectReason : undefined,
  );
  return evidence;
}

function appendEvidence(evidence: SrsCardRenderEvidence[], path: string, value: unknown): void {
  if (value === undefined || value === null || value === '') {
    return;
  }
  evidence.push({
    source: 'meta',
    path,
    value,
  });
}

function isImageOcclusion(meta: Record<string, unknown>): boolean {
  return meta.imageOcclusion === true || readString(meta.source) === 'image-occlusion';
}

function isProgressiveDerivedItem(card: FSRSCard | null | undefined): boolean {
  const progressive = readMeta(card).progressive;
  return !!progressive
    && typeof progressive === 'object'
    && !Array.isArray(progressive)
    && (progressive as Record<string, unknown>).kind === 'derived-item';
}

function isNativeMultiClozeCard(
  meta: Record<string, unknown>,
  profile: SupportedRenderProfile | string | null | undefined,
): boolean {
  const templateId = readString(meta.templateID);
  const clozeRenderMode = readString(meta.clozeRenderMode);
  return templateId === 'builtin-multi-cloze'
    && profile !== 'quick-inline-formula'
    && clozeRenderMode !== 'inline-formula-cloze';
}

function readMeta(card: FSRSCard | null | undefined): Record<string, unknown> {
  return card?.meta && typeof card.meta === 'object' && !Array.isArray(card.meta) ? card.meta : {};
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isQuickSymbolRenderContract(contract: SrsCardRenderContract | null | undefined): boolean {
  return contract?.renderFamily === 'quick-symbol' && contract.rendererKind === 'quick';
}

export function isSrsCardQuickSymbolRenderCandidate(card: FSRSCard | null | undefined): boolean {
  return isQuickSymbolRenderContract(resolveSrsCardRenderContract({ card }));
}

export function buildSrsCardQuickSymbolRenderRepairPatch(
  card: FSRSCard | null | undefined,
): SrsCardRenderRepairPatch | null {
  return resolveSrsCardRenderContract({
    card: card && card.type !== CardType.Item
      ? { ...card, type: CardType.Item }
      : card,
  }).repairPatch;
}

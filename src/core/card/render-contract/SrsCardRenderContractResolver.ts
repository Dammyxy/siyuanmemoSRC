import { CardType, type FSRSCard } from '@/types/card';
import type { SupportedRenderProfile } from '@/core/card/render-profile/RenderProfileResolver';
import {
  isConceptCard,
  isConceptDefinitionCard,
  isDescriptorSemanticCard,
} from '@/core/xiuyuan/cardMeta';
import {
  resolveRiffSymbolRenderRepair,
  type RiffSymbolRenderRepairPatch,
} from './RiffSymbolRenderRepair';

export type SrsCardRenderContractRendererKind =
  | 'image-occlusion'
  | 'multi-cloze'
  | 'concept-definition'
  | 'concept'
  | 'descriptor'
  | 'quick'
  | 'protyle';

export type SrsCardRenderFamily =
  | 'quick-symbol'
  | 'native-multi-cloze'
  | 'image-occlusion'
  | 'concept-definition'
  | 'concept'
  | 'descriptor'
  | 'protyle';

export type SrsCardRenderSide = 'front' | 'back';

export type SrsCardFrontBackContract =
  | {
    mode: 'quick-side';
    beforeReveal: SrsCardRenderSide;
    afterReveal: SrsCardRenderSide;
  }
  | {
    mode: 'renderer-owned' | 'not-required';
  };

export type SrsCardRenderReceiptStatus = 'present' | 'missing' | 'conflict' | 'not-required';

export interface SrsCardRenderRequiredReceipt {
  kind:
    | 'source-block-id'
    | 'card-id'
    | 'quick-symbol-evidence'
    | 'quick-symbol-type'
    | 'quick-source-block-match'
    | 'answer-block-route';
  status: SrsCardRenderReceiptStatus;
  diagnostic?: string;
  evidence?: SrsCardRenderEvidence[];
}

export interface SrsCardRenderEvidence {
  source: 'meta' | 'live-source';
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
  frontBackContract: SrsCardFrontBackContract;
  requiredReceipts: SrsCardRenderRequiredReceipt[];
  quickSymbolEvidence: SrsCardRenderEvidence[];
  repairPatch: SrsCardRenderRepairPatch | null;
  diagnostics: string[];
}

export interface SrsCardRenderContractResolverInput {
  card: FSRSCard | null | undefined;
  profile?: SupportedRenderProfile | string | null;
  contentBlockId?: string | null;
  answerBlockId?: string | null;
  sourceContent?: string | null;
}

export interface SrsCardRenderContractTarget {
  renderIntent: {
    policy: {
      renderContract?: SrsCardRenderContract;
    };
  };
}

export function resolveSrsCardRenderContractFromTarget(
  target: SrsCardRenderContractTarget,
): SrsCardRenderContract {
  const contract = target.renderIntent.policy.renderContract;
  if (!contract) {
    throw new Error('SRS_CARD_RENDER_CONTRACT_UNAVAILABLE');
  }
  return contract;
}

export function resolveSrsCardRenderContract(
  input: SrsCardRenderContractResolverInput,
): SrsCardRenderContract {
  const card = input.card;
  const meta = readMeta(card);
  const profile = input.profile ?? (readString(meta.renderProfile) || null);
  const riffSymbolRepair = resolveRiffSymbolRenderRepair({
    cardType: card?.type,
    meta,
    sourceContent: input.sourceContent,
  });
  const quickSymbolEvidence: SrsCardRenderEvidence[] = [
    ...collectQuickSymbolEvidence(meta),
    ...riffSymbolRepair.evidence,
  ];
  const quickSymbolType = readString(meta.symbolType) || riffSymbolRepair.symbolType;
  const diagnostics: string[] = [];
  diagnostics.push(...riffSymbolRepair.diagnostics);
  if (riffSymbolRepair.status === 'repair-required') {
    diagnostics.push('render-contract-riff-symbol-repair-required');
  }

  let rendererKind: SrsCardRenderContractRendererKind = 'protyle';
  let renderFamily: SrsCardRenderFamily = 'protyle';

  if (isImageOcclusion(meta)) {
    rendererKind = 'image-occlusion';
    renderFamily = 'image-occlusion';
  } else if (isNativeMultiClozeCard(meta, profile)) {
    rendererKind = 'multi-cloze';
    renderFamily = 'native-multi-cloze';
  } else if (!isProgressiveDerivedItem(card) && quickSymbolEvidence.length > 0) {
    rendererKind = 'quick';
    renderFamily = 'quick-symbol';
  } else if (
    profile === 'descriptor'
    || card?.type === CardType.Descriptor
    || hasDescriptorFieldMapping(card)
    || isDescriptorSemanticCard(card)
  ) {
    rendererKind = 'descriptor';
    renderFamily = 'descriptor';
  } else if (
    profile === 'concept-definition'
    || hasConceptDefinitionFieldMapping(card)
    || isConceptDefinitionCard(card)
  ) {
    rendererKind = 'concept-definition';
    renderFamily = 'concept-definition';
  } else if (
    profile === 'concept'
    || card?.type === CardType.Concept
    || isConceptCard(card)
  ) {
    rendererKind = 'concept';
    renderFamily = 'concept';
  }

  if (renderFamily === 'quick-symbol' && meta.forceProtyleRender === true) {
    diagnostics.push('render-contract-stale-force-protyle');
  }

  if (renderFamily === 'quick-symbol' && !quickSymbolType) {
    diagnostics.push('render-contract-symbol-type-missing');
  }

  if (renderFamily === 'quick-symbol' && readString(input.answerBlockId)) {
    diagnostics.push('render-contract-answer-block-route-conflict');
  }

  const requiredReceipts = buildRequiredReceipts({
    card,
    contentBlockId: input.contentBlockId,
    answerBlockId: input.answerBlockId,
    renderFamily,
    quickSymbolEvidence,
    quickSymbolType,
  });
  diagnostics.push(...requiredReceipts
    .filter(receipt => receipt.diagnostic)
    .map(receipt => receipt.diagnostic as string));

  return {
    version: 1,
    cardId: readString(card?.id),
    blockId: readString(card?.blockId),
    semanticKind: readString(card?.type),
    rendererKind,
    renderFamily,
    frontBackContract: buildFrontBackContract(renderFamily),
    requiredReceipts,
    quickSymbolEvidence,
    repairPatch: mergeRepairPatches(
      buildQuickSymbolRepairPatch(meta, renderFamily),
      riffSymbolRepair.repairPatch,
    ),
    diagnostics: Array.from(new Set(diagnostics)),
  };
}

function buildFrontBackContract(renderFamily: SrsCardRenderFamily): SrsCardFrontBackContract {
  if (renderFamily === 'quick-symbol') {
    return {
      mode: 'quick-side',
      beforeReveal: 'front',
      afterReveal: 'back',
    };
  }

  if (renderFamily === 'image-occlusion' || renderFamily === 'native-multi-cloze') {
    return { mode: 'renderer-owned' };
  }

  return { mode: 'not-required' };
}

function buildRequiredReceipts(input: {
  card: FSRSCard | null | undefined;
  contentBlockId?: string | null;
  answerBlockId?: string | null;
  renderFamily: SrsCardRenderFamily;
  quickSymbolEvidence: SrsCardRenderEvidence[];
  quickSymbolType: string;
}): SrsCardRenderRequiredReceipt[] {
  const blockId = readString(input.card?.blockId);
  const contentBlockId = readString(input.contentBlockId);
  const cardId = readString(input.card?.id);
  const requiresQuick = input.renderFamily === 'quick-symbol';
  const meta = readMeta(input.card);
  const receipts: SrsCardRenderRequiredReceipt[] = [
    {
      kind: 'source-block-id',
      status: blockId ? 'present' : requiresQuick ? 'missing' : 'not-required',
      diagnostic: requiresQuick && !blockId ? 'render-contract-source-block-missing' : undefined,
    },
    {
      kind: 'card-id',
      status: cardId ? 'present' : requiresQuick ? 'missing' : 'not-required',
      diagnostic: requiresQuick && !cardId ? 'render-contract-card-id-missing' : undefined,
    },
    {
      kind: 'quick-symbol-evidence',
      status: requiresQuick
        ? input.quickSymbolEvidence.length > 0 ? 'present' : 'missing'
        : 'not-required',
      evidence: input.quickSymbolEvidence,
      diagnostic: requiresQuick && input.quickSymbolEvidence.length === 0
        ? 'render-contract-quick-symbol-evidence-missing'
        : undefined,
    },
    {
      kind: 'quick-symbol-type',
      status: requiresQuick
        ? input.quickSymbolType ? 'present' : 'missing'
        : 'not-required',
      diagnostic: requiresQuick && !input.quickSymbolType
        ? 'render-contract-symbol-type-missing'
        : undefined,
    },
    {
      kind: 'quick-source-block-match',
      status: requiresQuick && contentBlockId && blockId && contentBlockId !== blockId
        ? 'conflict'
        : requiresQuick ? 'present' : 'not-required',
      diagnostic: requiresQuick && contentBlockId && blockId && contentBlockId !== blockId
        ? 'render-contract-source-block-mismatch'
        : undefined,
    },
    {
      kind: 'answer-block-route',
      status: requiresQuick && readString(input.answerBlockId) ? 'conflict' : 'not-required',
      diagnostic: requiresQuick && readString(input.answerBlockId)
        ? 'render-contract-answer-block-route-conflict'
        : undefined,
    },
  ];

  return receipts;
}

function mergeRepairPatches(
  base: SrsCardRenderRepairPatch | null,
  incoming: RiffSymbolRenderRepairPatch | null,
): SrsCardRenderRepairPatch | null {
  if (!base && !incoming) {
    return null;
  }

  const metaPatch = {
    ...(base?.metaPatch ?? {}),
    ...(incoming?.metaPatch ?? {}),
  };
  const metaDelete = Array.from(new Set([
    ...(base?.metaDelete ?? []),
    ...(incoming?.metaDelete ?? []),
  ]));

  return {
    ...(Object.keys(metaPatch).length > 0 ? { metaPatch } : {}),
    ...(metaDelete.length > 0 ? { metaDelete } : {}),
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
  _profile: SupportedRenderProfile | string | null | undefined,
): boolean {
  const templateId = readString(meta.templateID);
  return templateId === 'builtin-multi-cloze';
}

function hasDescriptorFieldMapping(card: FSRSCard | null | undefined): boolean {
  const fieldMapping = readMeta(card).fieldMapping;
  return !!fieldMapping
    && typeof fieldMapping === 'object'
    && !Array.isArray(fieldMapping)
    && readString((fieldMapping as Record<string, unknown>).descriptor).length > 0;
}

function hasConceptDefinitionFieldMapping(card: FSRSCard | null | undefined): boolean {
  const fieldMapping = readMeta(card).fieldMapping;
  return !!fieldMapping
    && typeof fieldMapping === 'object'
    && !Array.isArray(fieldMapping)
    && readString((fieldMapping as Record<string, unknown>).definition).length > 0;
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

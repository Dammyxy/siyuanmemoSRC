import type { ReviewHeaderVariant } from '@/ui/review/v2/types';
import {
  resolveBrowserQueueIdForQueueType,
  type BrowserQueueId,
} from './browser-queue-identity';
import { QueueType } from './unified-data-source';

export type ReviewPresentationSurfaceKind = 'dialog' | 'tab' | 'shell' | 'command' | 'adapter';

export type ReviewPresentationInvalidReason =
  | 'empty-queue'
  | 'unsupported-queue'
  | 'unsupported-header'
  | 'queue-header-mismatch';

export type ReviewPresentationI18n = Record<string, string> | undefined;

export interface ReviewPresentationInput {
  queueType: QueueType | string | null | undefined;
  headerVariant?: ReviewHeaderVariant | string | null;
  i18n?: ReviewPresentationI18n;
  surfaceKind?: ReviewPresentationSurfaceKind;
  scopeFingerprint?: string | null;
  titleOverride?: string | null;
}

export interface StandardReviewQueueSwitchPreset {
  queueType: QueueType;
  headerVariant: ReviewHeaderVariant;
  title: string;
}

export interface ReviewPresentationResolved {
  ok: true;
  queueType: QueueType;
  headerVariant: ReviewHeaderVariant;
  title: string;
  browserQueueId: BrowserQueueId | null;
  surfaceKind: ReviewPresentationSurfaceKind;
  scopeFingerprint: string;
  identityKey: string;
  snapshotKeyParts: string[];
}

export interface ReviewPresentationInvalid {
  ok: false;
  reason: ReviewPresentationInvalidReason;
  queueType: string;
  headerVariant: string;
  rawInput: string;
}

export type ReviewPresentationResult = ReviewPresentationResolved | ReviewPresentationInvalid;

const MAIN_REVIEW_QUEUE_SWITCH_ORDER: QueueType[] = [
  QueueType.RetrievalPractice,
  QueueType.IncrementalLearning,
  QueueType.FinalDrill,
  QueueType.FilterGroup,
  QueueType.NeuralRoam,
];

const MAIN_REVIEW_QUEUE_BY_HEADER_VARIANT: Partial<Record<ReviewHeaderVariant, QueueType>> = {
  'retrieval-practice': QueueType.RetrievalPractice,
  'incremental-learning': QueueType.IncrementalLearning,
  'final-drill': QueueType.FinalDrill,
  'filter-group': QueueType.FilterGroup,
  'neural-roam': QueueType.NeuralRoam,
};

const DEFAULT_REVIEW_HEADER_VARIANT_BY_QUEUE_TYPE: Partial<Record<QueueType, ReviewHeaderVariant>> = {
  [QueueType.RetrievalPractice]: 'retrieval-practice',
  [QueueType.IncrementalLearning]: 'incremental-learning',
  [QueueType.FinalDrill]: 'final-drill',
  [QueueType.FilterGroup]: 'filter-group',
  [QueueType.NeuralRoam]: 'neural-roam',
  [QueueType.Leech]: 'leech',
};

const SUPPORTED_REVIEW_HEADER_VARIANTS = new Set<ReviewHeaderVariant>([
  'retrieval-practice',
  'incremental-learning',
  'final-drill',
  'filter-group',
  'neural-roam',
  'subset-review',
  'temporary-drill',
  'leech',
]);

function t(i18n: ReviewPresentationI18n, key: string, fallback: string): string {
  return i18n?.[key] || fallback;
}

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

function invalidPresentation(
  reason: ReviewPresentationInvalidReason,
  queueType: string,
  headerVariant: string,
): ReviewPresentationInvalid {
  return {
    ok: false,
    reason,
    queueType,
    headerVariant,
    rawInput: `${queueType}::${headerVariant}`,
  };
}

export function isReviewHeaderVariant(value: unknown): value is ReviewHeaderVariant {
  return SUPPORTED_REVIEW_HEADER_VARIANTS.has(normalizeString(value) as ReviewHeaderVariant);
}

export function resolveReviewPresentationHeaderVariant(
  queueType: QueueType | string | null | undefined,
  fallback: ReviewHeaderVariant = 'retrieval-practice',
): ReviewHeaderVariant {
  const key = normalizeString(queueType) as QueueType;
  return DEFAULT_REVIEW_HEADER_VARIANT_BY_QUEUE_TYPE[key] || fallback;
}

export function resolveReviewQueueLabel(
  i18n: ReviewPresentationI18n,
  queueType: QueueType | string | null | undefined,
): string {
  switch (normalizeString(queueType)) {
    case QueueType.RetrievalPractice:
      return t(i18n, 'retrievalPractice', '提取练习');
    case QueueType.IncrementalLearning:
      return t(i18n, 'incrementalLearning', '渐进学习');
    case QueueType.FinalDrill:
      return t(i18n, 'finalDrill', '刻意练习');
    case QueueType.FilterGroup:
      return t(i18n, 'filterGroup', '筛选组');
    case QueueType.NeuralRoam:
      return t(i18n, 'neuralRoam', '神经漫游');
    default:
      return t(i18n, 'unifiedQueue', '统一队列');
  }
}

export function resolveReviewSurfaceTitle(input: {
  i18n?: ReviewPresentationI18n;
  queueType: QueueType | string | null | undefined;
  headerVariant?: ReviewHeaderVariant | string | null;
  titleOverride?: string | null;
}): string {
  const titleOverride = normalizeString(input.titleOverride);
  if (titleOverride) {
    return titleOverride;
  }

  switch (normalizeString(input.headerVariant)) {
    case 'subset-review':
      return t(input.i18n, 'reviewSubsetTitle', '子集复习');
    case 'temporary-drill':
      return t(input.i18n, 'temporaryDrill', '临时练习');
    case 'leech':
      return t(input.i18n, 'startLeechPractice', '难点攻坚');
    case 'filter-group':
      return t(input.i18n, 'filterGroupPractice', '筛选复习');
    case 'neural-roam':
      return t(input.i18n, 'neuralReviewTitle', '神经漫游');
    case 'retrieval-practice':
      return t(input.i18n, 'retrievalPractice', '提取练习');
    case 'incremental-learning':
      return t(input.i18n, 'incrementalLearning', '渐进学习');
    case 'final-drill':
      return t(input.i18n, 'finalDrill', '刻意练习');
    default:
      return resolveReviewQueueLabel(input.i18n, input.queueType);
  }
}

export function isStandardReviewHeaderVariant(headerVariant: ReviewHeaderVariant | string | null | undefined): boolean {
  return Boolean(MAIN_REVIEW_QUEUE_BY_HEADER_VARIANT[normalizeString(headerVariant) as ReviewHeaderVariant]);
}

export function buildReviewPresentationSnapshotKeyParts(input: {
  surfaceKind?: ReviewPresentationSurfaceKind;
  queueType: QueueType | string | null | undefined;
  headerVariant?: ReviewHeaderVariant | string | null;
  title?: string | null;
  scopeFingerprint?: string | null;
}): string[] {
  return [
    normalizeString(input.surfaceKind || 'adapter'),
    normalizeString(input.queueType),
    normalizeString(input.headerVariant),
    normalizeString(input.title),
    normalizeString(input.scopeFingerprint),
  ];
}

export function resolveReviewPresentation(input: ReviewPresentationInput): ReviewPresentationResult {
  const queueType = normalizeString(input.queueType);
  const headerVariant = normalizeString(input.headerVariant)
    || resolveReviewPresentationHeaderVariant(queueType);
  const surfaceKind = input.surfaceKind || 'adapter';

  if (!queueType) {
    return invalidPresentation('empty-queue', queueType, headerVariant);
  }

  if (!Object.values(QueueType).includes(queueType as QueueType)) {
    return invalidPresentation('queue-header-mismatch', queueType, headerVariant);
  }

  if (!isReviewHeaderVariant(headerVariant)) {
    return invalidPresentation('unsupported-header', queueType, headerVariant);
  }

  const standardQueueType = MAIN_REVIEW_QUEUE_BY_HEADER_VARIANT[headerVariant as ReviewHeaderVariant];
  if (standardQueueType && standardQueueType !== queueType) {
    return invalidPresentation('queue-header-mismatch', queueType, headerVariant);
  }

  const title = resolveReviewSurfaceTitle({
    i18n: input.i18n,
    queueType,
    headerVariant,
    titleOverride: input.titleOverride,
  });
  const browserQueueId = isStandardReviewHeaderVariant(headerVariant)
    ? resolveBrowserQueueIdForQueueType(queueType)
    : null;
  const scopeFingerprint = normalizeString(input.scopeFingerprint);
  const snapshotKeyParts = buildReviewPresentationSnapshotKeyParts({
    surfaceKind,
    queueType,
    headerVariant,
    title,
    scopeFingerprint,
  });

  return {
    ok: true,
    queueType: queueType as QueueType,
    headerVariant: headerVariant as ReviewHeaderVariant,
    title,
    browserQueueId,
    surfaceKind,
    scopeFingerprint,
    identityKey: snapshotKeyParts.join('::'),
    snapshotKeyParts,
  };
}

export function buildStandardReviewQueueSwitchPresets(
  i18n: ReviewPresentationI18n,
): StandardReviewQueueSwitchPreset[] {
  return MAIN_REVIEW_QUEUE_SWITCH_ORDER.map((queueType) => {
    const presentation = resolveReviewPresentation({
      queueType,
      i18n,
      surfaceKind: 'shell',
    });
    if (!presentation.ok) {
      throw new Error(`Invalid standard review presentation: ${presentation.rawInput}`);
    }
    return {
      queueType,
      headerVariant: presentation.headerVariant,
      title: presentation.title,
    };
  });
}

export function resolveCurrentMainReviewQueueType(input: {
  headerVariant?: ReviewHeaderVariant | string | null;
  activeQueueType?: QueueType | string | null;
}): QueueType | null {
  const headerVariant = normalizeString(input.headerVariant) as ReviewHeaderVariant;
  const variantQueueType = MAIN_REVIEW_QUEUE_BY_HEADER_VARIANT[headerVariant];
  if (variantQueueType) {
    return variantQueueType;
  }

  const activeQueueType = normalizeString(input.activeQueueType);
  if ((MAIN_REVIEW_QUEUE_SWITCH_ORDER as string[]).includes(activeQueueType)) {
    return activeQueueType as QueueType;
  }

  return null;
}

import type {
  CdfLiveRelationFullRepairDryRunResult,
  CdfLiveRelationFullRepairDryRunSummary,
  CdfLiveRelationFullRepairExecuteResult,
  CdfLiveRelationFullRepairSourcePreview,
  CdfLiveRelationSingleSourceRepairResult,
} from '@/application/services/CdfLiveRelationWriteRepairService';
import type { CdfReconciliationAction } from '@/core/card/cdf-live-relation';

type BrowserTranslate = (key: string, fallback: string) => string;

export type BrowserCdfRepairResultInput =
  | CdfLiveRelationSingleSourceRepairResult
  | CdfLiveRelationFullRepairDryRunResult
  | CdfLiveRelationFullRepairExecuteResult;

export type BrowserCdfRepairSummaryItem = {
  key: string;
  label: string;
  count: number;
};

export type BrowserCdfRepairDetailItem = {
  key: string;
  kind: string;
  label: string;
  text: string;
};

export type BrowserCdfRepairDetailGroup = {
  key: string;
  title: string;
  summary: string;
  previewOnly: boolean;
  items: BrowserCdfRepairDetailItem[];
};

export type BrowserCdfRepairResultViewModel = {
  title: string;
  statusLine: string;
  detailsLabel: string;
  noDetailsLabel: string;
  previewOnlyLabel: string;
  summaryItems: BrowserCdfRepairSummaryItem[];
  detailGroups: BrowserCdfRepairDetailGroup[];
  actions: Array<{ id: 'close'; label: string }>;
};

type RepairMode = 'single-source' | 'full-preview' | 'full-execute';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isSingleSourceRepairResult(
  input: BrowserCdfRepairResultInput,
): input is CdfLiveRelationSingleSourceRepairResult {
  return 'sourceBlockId' in input;
}

function isFullExecuteRepairResult(
  input: BrowserCdfRepairResultInput,
): input is CdfLiveRelationFullRepairExecuteResult {
  return 'previewOnlySourcePreviews' in input;
}

function getRepairMode(input: BrowserCdfRepairResultInput): RepairMode {
  if (isSingleSourceRepairResult(input)) return 'single-source';
  if (isFullExecuteRepairResult(input)) return 'full-execute';
  return 'full-preview';
}

function countPreviewOnlyChanges(input: BrowserCdfRepairResultInput): number {
  if (!isFullExecuteRepairResult(input)) {
    return 0;
  }
  return input.previewOnlySummary.createCardCount
    + input.previewOnlySummary.updatedCardCount
    + input.previewOnlySummary.deriveFailedNoCardCandidateCount;
}

function getStatusLine(
  input: BrowserCdfRepairResultInput,
  mode: RepairMode,
  t: BrowserTranslate,
): string {
  const persisted = input.summary.persistedMutationCount;
  const totalActions = input.summary.actionCount + countPreviewOnlyChanges(input);
  if (mode === 'full-preview' || (mode === 'single-source' && !input.persisted)) {
    return t('browserCdfRepairResultStatusPreviewed', 'Previewed {count} repair changes')
      .replace('{count}', String(totalActions));
  }
  if (persisted > 0) {
    return t('browserCdfRepairResultStatusApplied', 'Applied {count} repair changes')
      .replace('{count}', String(persisted));
  }
  return t('browserCdfRepairResultStatusNoChanges', 'No persisted repair changes');
}

function buildSummaryItems(
  summary: CdfLiveRelationFullRepairDryRunSummary,
  previewOnlyCount: number,
  t: BrowserTranslate,
): BrowserCdfRepairSummaryItem[] {
  return [
    {
      key: 'created',
      label: t('browserCdfRepairSummaryCreated', 'Created'),
      count: summary.createCardCount,
    },
    {
      key: 'paused-orphan',
      label: t('browserCdfRepairSummaryPausedOrphan', 'Paused orphan'),
      count: summary.orphanCount,
    },
    {
      key: 'paused-duplicate',
      label: t('browserCdfRepairSummaryPausedDuplicate', 'Paused duplicate'),
      count: summary.duplicateCount,
    },
    {
      key: 'restored',
      label: t('browserCdfRepairSummaryRestored', 'Restored'),
      count: summary.reactivatedCount,
    },
    {
      key: 'legacy-unavailable',
      label: t('browserCdfRepairSummaryLegacyUnavailable', 'Legacy unavailable'),
      count: summary.legacyUnavailableCount,
    },
    {
      key: 'content-incomplete',
      label: t('browserCdfRepairSummaryContentIncomplete', 'Content incomplete'),
      count: summary.contentIncompleteCount,
    },
    {
      key: 'derive-failed',
      label: t('browserCdfRepairSummaryDeriveFailed', 'Derive failed'),
      count: summary.deriveFailedNoCardCandidateCount,
    },
    {
      key: 'preview-only',
      label: t('browserCdfRepairSummaryPreviewOnly', 'Preview only'),
      count: previewOnlyCount,
    },
    {
      key: 'persisted',
      label: t('browserCdfRepairSummaryPersisted', 'Persisted'),
      count: summary.persistedMutationCount,
    },
  ];
}

function formatRelationLike(relation: unknown): string {
  if (!isRecord(relation)) {
    return '';
  }
  const sourceBlockId = readString(relation.sourceBlockId);
  const conceptBlockId = readString(relation.conceptBlockId);
  const relationKind = readString(relation.relationKind);
  return [sourceBlockId, conceptBlockId, relationKind].filter(Boolean).join(' / ');
}

function actionPresentation(
  action: CdfReconciliationAction,
  index: number,
  t: BrowserTranslate,
): BrowserCdfRepairDetailItem {
  if (action.kind === 'create-card') {
    const relationText = formatRelationLike(action.relation);
    return {
      key: `create:${index}`,
      kind: 'created',
      label: t('browserCdfRepairDetailCreated', 'Created'),
      text: relationText || t('browserCdfRepairDetailCreatedFallback', 'Created a missing live relation card'),
    };
  }

  const relationText = formatRelationLike(action.relation);
  const targetText = [action.cardId, relationText].filter(Boolean).join(' - ');
  if (action.reason === 'orphaned') {
    return {
      key: `orphan:${index}`,
      kind: 'paused-orphan',
      label: t('browserCdfRepairDetailPausedOrphan', 'Paused orphan'),
      text: targetText || action.cardId,
    };
  }
  if (action.reason === 'duplicate') {
    return {
      key: `duplicate:${index}`,
      kind: 'paused-duplicate',
      label: t('browserCdfRepairDetailPausedDuplicate', 'Paused duplicate'),
      text: targetText || action.cardId,
    };
  }
  if (action.reason === 'reactivated') {
    return {
      key: `restored:${index}`,
      kind: 'restored',
      label: t('browserCdfRepairDetailRestored', 'Restored'),
      text: targetText || action.cardId,
    };
  }
  if (action.reason === 'legacy-unavailable') {
    return {
      key: `legacy-unavailable:${index}`,
      kind: 'legacy-unavailable',
      label: t('browserCdfRepairDetailLegacyUnavailable', 'Legacy unavailable'),
      text: targetText || action.cardId,
    };
  }
  if (action.reason === 'legacy-migrated') {
    return {
      key: `legacy-migrated:${index}`,
      kind: 'legacy-migrated',
      label: t('browserCdfRepairDetailLegacyMigrated', 'Legacy migrated'),
      text: targetText || action.cardId,
    };
  }
  return {
    key: `active:${index}`,
    kind: 'active',
    label: t('browserCdfRepairDetailActive', 'Active'),
    text: targetText || action.cardId,
  };
}

function actionCountLabel(count: number, t: BrowserTranslate): string {
  const key = count === 1 ? 'browserCdfRepairOneChange' : 'browserCdfRepairManyChanges';
  const fallback = count === 1 ? '{count} change' : '{count} changes';
  return t(key, fallback).replace('{count}', String(count));
}

function sourcePreviewGroup(
  sourcePreview: CdfLiveRelationFullRepairSourcePreview,
  keyPrefix: string,
  previewOnly: boolean,
  t: BrowserTranslate,
): BrowserCdfRepairDetailGroup {
  const items = sourcePreview.result.actions.map((action, index) => actionPresentation(action, index, t));
  const fallbackTitle = previewOnly
    ? 'Preview-only source {source}'
    : 'Source {source}';
  const title = t(
    previewOnly ? 'browserCdfRepairPreviewOnlySourceTitle' : 'browserCdfRepairSourceTitle',
    fallbackTitle,
  ).replace('{source}', sourcePreview.scanRootId);
  const summary = actionCountLabel(items.length, t);
  return {
    key: `${keyPrefix}:${sourcePreview.scanRootId}`,
    title,
    summary,
    previewOnly,
    items,
  };
}

function buildDetailGroups(
  input: BrowserCdfRepairResultInput,
  t: BrowserTranslate,
): BrowserCdfRepairDetailGroup[] {
  if (isSingleSourceRepairResult(input)) {
    return [{
      key: `single-source:${input.sourceBlockId}`,
      title: t('browserCdfRepairSingleSourceTitle', 'Source {source}')
        .replace('{source}', input.sourceBlockId),
      summary: actionCountLabel(input.result.actions.length, t),
      previewOnly: !input.persisted,
      items: input.result.actions.map((action, index) => actionPresentation(action, index, t)),
    }];
  }

  const groups = input.sourcePreviews.map((sourcePreview) => sourcePreviewGroup(
    sourcePreview,
    'source',
    sourcePreview.previewOnly === true,
    t,
  ));
  if (isFullExecuteRepairResult(input)) {
    groups.push(...input.previewOnlySourcePreviews.map((sourcePreview) => sourcePreviewGroup(
      sourcePreview,
      'preview',
      true,
      t,
    )));
  }
  return groups;
}

export function buildBrowserCdfRepairResultViewModel(
  input: BrowserCdfRepairResultInput,
  t: BrowserTranslate,
): BrowserCdfRepairResultViewModel {
  const mode = getRepairMode(input);
  const previewOnlyCount = countPreviewOnlyChanges(input);
  const title = mode === 'full-preview' || (mode === 'single-source' && !input.persisted)
    ? t('browserCdfRepairPreviewTitle', 'CDF repair preview')
    : t('browserCdfRepairResultTitle', 'CDF repair result');

  return {
    title,
    statusLine: getStatusLine(input, mode, t),
    detailsLabel: t('browserCdfRepairDetailsLabel', 'Expand details'),
    noDetailsLabel: t('browserCdfRepairNoDetails', 'No detailed repair changes'),
    previewOnlyLabel: t('browserCdfRepairPreviewOnlyBadge', 'Preview only'),
    summaryItems: buildSummaryItems(input.summary, previewOnlyCount, t),
    detailGroups: buildDetailGroups(input, t),
    actions: [
      { id: 'close', label: t('close', 'Close') },
    ],
  };
}

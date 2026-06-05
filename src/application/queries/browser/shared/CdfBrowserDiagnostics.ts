import {
  hasCdfLiveRelationMetadata,
  isCdfLiveRelationQueueEligible,
  readCdfLiveRelationMetadata,
} from '@/core/card/cdf-live-relation';
import type {
  CdfLiveContentStatus,
  CdfLiveRelationIssue,
  CdfRelationStatus,
} from '@/core/card/cdf-live-relation';

export type BrowserCdfDiagnosticPreset =
  | 'cdf-abnormal'
  | 'cdf-orphaned'
  | 'cdf-duplicate'
  | 'cdf-legacy-unavailable'
  | 'cdf-content-incomplete';

export type BrowserCdfDiagnosticKind =
  | 'orphaned-by-live-relation'
  | 'duplicate-live-relation'
  | 'legacy-relation-unavailable'
  | 'blocking-relation-issue'
  | 'content-incomplete';

export type BrowserCdfDiagnosticBadge = {
  kind: 'relation' | 'content';
  code: BrowserCdfDiagnosticKind | CdfLiveRelationIssue['code'] | CdfLiveContentStatus;
  i18nKey: string;
  label: string;
};

export type BrowserCdfDiagnosticActionId =
  | 'open'
  | 'cdf-rescan-source'
  | 'delete-card'
  | 'cdf-keep-paused'
  | 'cdf-view-canonical'
  | 'cdf-keep-duplicate-paused'
  | 'cdf-attempt-live-migrate'
  | 'cdf-mark-retained'
  | 'cdf-open-structured-editor';

export type BrowserCdfDiagnosticAction = {
  id: BrowserCdfDiagnosticActionId;
  i18nKey: string;
  label: string;
  icon: string;
  danger?: boolean;
};

export type BrowserCdfDiagnostic = {
  primary: BrowserCdfDiagnosticBadge;
  secondary: BrowserCdfDiagnosticBadge | null;
  actions: BrowserCdfDiagnosticAction[];
};

export type BrowserCdfDiagnosticRow = {
  meta?: unknown;
};

const DIAGNOSTIC_PRESETS = new Set<string>([
  'cdf-abnormal',
  'cdf-orphaned',
  'cdf-duplicate',
  'cdf-legacy-unavailable',
  'cdf-content-incomplete',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toMetaRecord(row: BrowserCdfDiagnosticRow | null | undefined): Record<string, unknown> | null {
  return isRecord(row?.meta) ? row.meta : null;
}

function relationStatusBadge(status: CdfRelationStatus): BrowserCdfDiagnosticBadge | null {
  switch (status) {
    case 'orphaned-by-live-relation':
      return {
        kind: 'relation',
        code: status,
        i18nKey: 'cdfRelationOrphaned',
        label: 'Orphaned',
      };
    case 'duplicate-live-relation':
      return {
        kind: 'relation',
        code: status,
        i18nKey: 'cdfRelationDuplicate',
        label: 'Duplicate',
      };
    case 'legacy-relation-unavailable':
      return {
        kind: 'relation',
        code: status,
        i18nKey: 'cdfRelationLegacyUnavailable',
        label: 'Legacy unavailable',
      };
    default:
      return null;
  }
}

function blockingIssueBadge(issue: CdfLiveRelationIssue): BrowserCdfDiagnosticBadge {
  return {
    kind: 'relation',
    code: issue.code,
    i18nKey: `cdfIssue_${issue.code}`,
    label: issue.code,
  };
}

function contentStatusBadge(status: CdfLiveContentStatus | undefined): BrowserCdfDiagnosticBadge | null {
  if (status !== 'content-incomplete') {
    return null;
  }
  return {
    kind: 'content',
    code: status,
    i18nKey: 'cdfContentIncomplete',
    label: 'Content incomplete',
  };
}

function buildActions(kind: BrowserCdfDiagnosticKind): BrowserCdfDiagnosticAction[] {
  switch (kind) {
    case 'orphaned-by-live-relation':
      return [
        { id: 'open', i18nKey: 'cdfLocateSource', label: 'Locate source', icon: 'iconOpen' },
        { id: 'cdf-rescan-source', i18nKey: 'cdfRescanSource', label: 'Rescan source', icon: 'iconRefresh' },
        { id: 'delete-card', i18nKey: 'deleteCard', label: 'Remove flashcard', icon: 'iconTrashcan', danger: true },
        { id: 'cdf-keep-paused', i18nKey: 'cdfKeepPaused', label: 'Keep paused', icon: 'iconPause' },
      ];
    case 'duplicate-live-relation':
      return [
        { id: 'cdf-view-canonical', i18nKey: 'cdfViewCanonical', label: 'View canonical', icon: 'iconOpen' },
        { id: 'delete-card', i18nKey: 'deleteCard', label: 'Remove flashcard', icon: 'iconTrashcan', danger: true },
        { id: 'cdf-keep-duplicate-paused', i18nKey: 'cdfKeepDuplicatePaused', label: 'Keep duplicate paused', icon: 'iconPause' },
      ];
    case 'legacy-relation-unavailable':
      return [
        { id: 'open', i18nKey: 'cdfLocateLegacySource', label: 'Locate old source', icon: 'iconOpen' },
        { id: 'cdf-attempt-live-migrate', i18nKey: 'cdfAttemptLiveMigrate', label: 'Attempt live migrate', icon: 'iconRefresh' },
        { id: 'cdf-mark-retained', i18nKey: 'cdfMarkRetained', label: 'Mark retained', icon: 'iconCheck' },
      ];
    case 'content-incomplete':
      return [
        { id: 'cdf-open-structured-editor', i18nKey: 'cdfOpenStructuredEditor', label: 'Open editor', icon: 'iconEdit' },
      ];
    case 'blocking-relation-issue':
      return [
        { id: 'open', i18nKey: 'cdfLocateSource', label: 'Locate source', icon: 'iconOpen' },
        { id: 'cdf-rescan-source', i18nKey: 'cdfRescanSource', label: 'Rescan source', icon: 'iconRefresh' },
      ];
    default:
      return [];
  }
}

export function isBrowserCdfDiagnosticPreset(preset: unknown): preset is BrowserCdfDiagnosticPreset {
  return typeof preset === 'string' && DIAGNOSTIC_PRESETS.has(preset);
}

export function isBrowserCdfNormalVisible(row: BrowserCdfDiagnosticRow | null | undefined): boolean {
  const meta = toMetaRecord(row);
  if (!meta || !hasCdfLiveRelationMetadata(meta)) {
    return true;
  }
  return isCdfLiveRelationQueueEligible(meta);
}

export function resolveBrowserCdfDiagnostic(
  row: BrowserCdfDiagnosticRow | null | undefined,
): BrowserCdfDiagnostic | null {
  const metaRecord = toMetaRecord(row);
  if (!metaRecord || !hasCdfLiveRelationMetadata(metaRecord)) {
    return null;
  }

  const meta = readCdfLiveRelationMetadata(metaRecord);
  const relationBadge = meta.liveRelationStatus ? relationStatusBadge(meta.liveRelationStatus) : null;
  const contentBadge = contentStatusBadge(meta.liveContentStatus);
  if (relationBadge) {
    return {
      primary: relationBadge,
      secondary: contentBadge,
      actions: buildActions(relationBadge.code as BrowserCdfDiagnosticKind),
    };
  }

  const blockingIssue = (meta.liveRelationIssues || []).find((issue) => issue.severity === 'blocking');
  if (blockingIssue) {
    return {
      primary: blockingIssueBadge(blockingIssue),
      secondary: contentBadge,
      actions: buildActions('blocking-relation-issue'),
    };
  }

  if (contentBadge) {
    return {
      primary: contentBadge,
      secondary: null,
      actions: buildActions('content-incomplete'),
    };
  }

  return null;
}

export function matchesBrowserCdfDiagnosticPreset(
  row: BrowserCdfDiagnosticRow | null | undefined,
  preset: BrowserCdfDiagnosticPreset,
): boolean {
  const diagnostic = resolveBrowserCdfDiagnostic(row);
  if (!diagnostic) {
    return false;
  }

  switch (preset) {
    case 'cdf-abnormal':
      return true;
    case 'cdf-orphaned':
      return diagnostic.primary.code === 'orphaned-by-live-relation';
    case 'cdf-duplicate':
      return diagnostic.primary.code === 'duplicate-live-relation';
    case 'cdf-legacy-unavailable':
      return diagnostic.primary.code === 'legacy-relation-unavailable';
    case 'cdf-content-incomplete':
      return diagnostic.primary.code === 'content-incomplete'
        || diagnostic.secondary?.code === 'content-incomplete';
    default:
      return false;
  }
}

export function applyBrowserCdfDiagnosticVisibility<TRow extends BrowserCdfDiagnosticRow>(
  rows: TRow[],
  preset?: string | null,
): TRow[] {
  if (isBrowserCdfDiagnosticPreset(preset)) {
    return rows.filter((row) => matchesBrowserCdfDiagnosticPreset(row, preset));
  }
  return rows.filter(isBrowserCdfNormalVisible);
}

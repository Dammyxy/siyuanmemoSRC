import { describe, expect, it } from 'vitest';
import {
  applyBrowserCdfDiagnosticVisibility,
  isBrowserCdfNormalVisible,
  matchesBrowserCdfDiagnosticPreset,
  resolveBrowserCdfDiagnostic,
} from '../CdfBrowserDiagnostics';

function row(id: string, meta: Record<string, unknown>) {
  return { id, meta };
}

const active = row('active', {
  relationAuthority: 'live-backlink',
  liveRelationKey: 'source:concept:descriptor-forward',
  liveRelationStatus: 'active-live',
  liveContentStatus: 'content-complete',
  liveRelationIssues: [],
});

const orphaned = row('orphaned', {
  relationAuthority: 'live-backlink',
  liveRelationKey: 'source:concept:descriptor-reverse',
  liveRelationStatus: 'orphaned-by-live-relation',
  liveContentStatus: 'content-complete',
  liveRelationIssues: [],
});

const duplicateAndIncomplete = row('duplicate-incomplete', {
  relationAuthority: 'live-backlink',
  liveRelationKey: 'source:concept:definition-forward',
  liveRelationStatus: 'duplicate-live-relation',
  liveContentStatus: 'content-incomplete',
  liveRelationIssues: [],
});

const legacyUnavailable = row('legacy', {
  relationAuthority: 'live-backlink',
  liveRelationStatus: 'legacy-relation-unavailable',
  liveContentStatus: 'content-complete',
  liveRelationIssues: [],
});

const contentIncomplete = row('incomplete', {
  relationAuthority: 'live-backlink',
  liveRelationKey: 'source:concept:definition-reverse',
  liveRelationStatus: 'active-live',
  liveContentStatus: 'content-incomplete',
  liveRelationIssues: [],
});

const blockingIssue = row('blocking', {
  relationAuthority: 'live-backlink',
  liveRelationKey: 'source:concept:descriptor-forward',
  liveRelationStatus: 'active-live',
  liveContentStatus: 'content-complete',
  liveRelationIssues: [{ code: 'invalid-source-grammar', severity: 'blocking' }],
});

describe('CdfBrowserDiagnostics', () => {
  it('keeps only active-live content-complete CDF rows in normal Browser visibility', () => {
    expect(isBrowserCdfNormalVisible(active)).toBe(true);
    expect(isBrowserCdfNormalVisible(orphaned)).toBe(false);
    expect(isBrowserCdfNormalVisible(contentIncomplete)).toBe(false);
    expect(isBrowserCdfNormalVisible(blockingIssue)).toBe(false);
    expect(isBrowserCdfNormalVisible({ id: 'plain', meta: {} })).toBe(true);
  });

  it('shows relation abnormal status as primary and content incomplete as secondary', () => {
    const diagnostic = resolveBrowserCdfDiagnostic(duplicateAndIncomplete);

    expect(diagnostic?.primary).toMatchObject({
      kind: 'relation',
      code: 'duplicate-live-relation',
    });
    expect(diagnostic?.secondary).toMatchObject({
      kind: 'content',
      code: 'content-incomplete',
    });
  });

  it('labels content-incomplete as content abnormal rather than relation broken', () => {
    const diagnostic = resolveBrowserCdfDiagnostic(contentIncomplete);

    expect(diagnostic?.primary).toMatchObject({
      kind: 'content',
      code: 'content-incomplete',
    });
    expect(diagnostic?.actions.map((action) => action.id)).toEqual(['cdf-open-structured-editor']);
  });

  it('filters Browser rows by CDF abnormal presets', () => {
    const rows = [active, orphaned, duplicateAndIncomplete, legacyUnavailable, contentIncomplete, blockingIssue];

    expect(applyBrowserCdfDiagnosticVisibility(rows).map((candidate) => candidate.id))
      .toEqual(['active']);
    expect(applyBrowserCdfDiagnosticVisibility(rows, 'cdf-abnormal').map((candidate) => candidate.id))
      .toEqual(['orphaned', 'duplicate-incomplete', 'legacy', 'incomplete', 'blocking']);
    expect(applyBrowserCdfDiagnosticVisibility(rows, 'cdf-content-incomplete').map((candidate) => candidate.id))
      .toEqual(['duplicate-incomplete', 'incomplete']);
  });

  it('provides state-specific abnormal action ids', () => {
    expect(resolveBrowserCdfDiagnostic(orphaned)?.actions.map((action) => action.id)).toEqual([
      'open',
      'cdf-rescan-source',
      'delete-card',
      'cdf-keep-paused',
    ]);
    expect(resolveBrowserCdfDiagnostic(duplicateAndIncomplete)?.actions.map((action) => action.id)).toEqual([
      'cdf-view-canonical',
      'delete-card',
      'cdf-keep-duplicate-paused',
    ]);
    expect(resolveBrowserCdfDiagnostic(legacyUnavailable)?.actions.map((action) => action.id)).toEqual([
      'open',
      'cdf-attempt-live-migrate',
      'cdf-mark-retained',
    ]);
  });

  it('matches status-specific presets without treating warning-only CDF rows as abnormal', () => {
    const warningOnly = row('warning', {
      relationAuthority: 'live-backlink',
      liveRelationKey: 'source:concept:descriptor-forward',
      liveRelationStatus: 'active-live',
      liveContentStatus: 'content-complete',
      liveRelationIssues: [{ code: 'duplicate-ref', severity: 'warning' }],
    });

    expect(matchesBrowserCdfDiagnosticPreset(orphaned, 'cdf-orphaned')).toBe(true);
    expect(matchesBrowserCdfDiagnosticPreset(duplicateAndIncomplete, 'cdf-duplicate')).toBe(true);
    expect(matchesBrowserCdfDiagnosticPreset(legacyUnavailable, 'cdf-legacy-unavailable')).toBe(true);
    expect(matchesBrowserCdfDiagnosticPreset(warningOnly, 'cdf-abnormal')).toBe(false);
  });
});

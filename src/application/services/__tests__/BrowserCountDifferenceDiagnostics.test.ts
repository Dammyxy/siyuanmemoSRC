import { describe, expect, it, vi } from 'vitest';
import {
  createBrowserCountDifferenceDiagnostic,
  type BrowserCountDifferenceEvidence,
} from '../BrowserCountDifferenceDiagnostics';

const browserEvidence = (overrides: Partial<BrowserCountDifferenceEvidence['browser']> = {}): BrowserCountDifferenceEvidence['browser'] => ({
  status: 'available',
  cards: [
    { id: 'card-1', blockId: 'block-1', cardType: 'item', sourceExists: true },
    { id: 'card-2', blockId: 'block-2', cardType: 'concept', sourceExists: true },
  ],
  total: 2,
  ...overrides,
});

const nativeEvidence = (overrides: Partial<BrowserCountDifferenceEvidence['native']> = {}): BrowserCountDifferenceEvidence['native'] => ({
  status: 'available',
  cards: [
    { blockId: 'block-1', cardId: 'riff-1', type: 'p' },
    { blockId: 'block-2', cardId: 'riff-2', type: 'p' },
    { blockId: 'block-3', cardId: 'riff-3', type: 'p' },
  ],
  total: 3,
  ...overrides,
});

describe('BrowserCountDifferenceDiagnostics', () => {
  it('reports native and Browser totals without changing Browser operational totals', () => {
    const diagnostic = createBrowserCountDifferenceDiagnostic({
      native: nativeEvidence(),
      browser: browserEvidence(),
    });

    expect(diagnostic.status).toBe('difference');
    expect(diagnostic.nativeTotal).toBe(3);
    expect(diagnostic.browserManageableTotal).toBe(2);
    expect(diagnostic.differenceTotal).toBe(1);
    expect(diagnostic.browserOperationalTotal).toBe(2);
  });

  it('groups count differences by stable content-free reason codes', () => {
    const diagnostic = createBrowserCountDifferenceDiagnostic({
      native: nativeEvidence({
        cards: [
          { blockId: 'block-1', cardId: 'riff-1', type: 'p' },
          { blockId: 'missing-index', cardId: 'riff-missing-index', type: 'p' },
          { blockId: 'missing-source', cardId: 'riff-missing-source', type: 'p' },
          { blockId: 'unsupported', cardId: 'riff-unsupported', type: 'widget' },
          { blockId: 'pending', cardId: 'riff-pending', type: 'p' },
          { blockId: '', cardId: 'riff-unresolved', type: 'p' },
        ],
        total: 6,
      }),
      browser: browserEvidence({
        cards: [
          { id: 'card-1', blockId: 'block-1', cardType: 'item', sourceExists: true },
          { id: 'card-source-missing', blockId: 'missing-source', cardType: 'item', sourceExists: false },
          { id: 'card-pending', blockId: 'pending', cardType: 'item', sourceExists: null },
        ],
        pendingProjectionBlockIds: ['pending'],
        total: 3,
      }),
      unsupportedNativeBlockTypes: ['widget'],
    });

    expect(diagnostic.groups.map((group) => [group.reason, group.count])).toEqual([
      ['missing-plugin-index', 1],
      ['missing-source-block', 1],
      ['unsupported-card-shape', 1],
      ['sync-projection-not-complete', 1],
      ['unresolved-difference', 1],
    ]);
  });

  it('bounds samples and never exposes content fields', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const diagnostic = createBrowserCountDifferenceDiagnostic({
      native: nativeEvidence({
        cards: Array.from({ length: 7 }, (_, index) => ({
          blockId: `native-only-${index}`,
          cardId: `riff-${index}`,
          type: 'p',
          content: `secret question ${index}`,
          markdown: `secret markdown ${index}`,
          kramdown: `secret kramdown ${index}`,
          answer: `secret answer ${index}`,
        })),
        total: 7,
      }),
      browser: browserEvidence({ cards: [], total: 0 }),
      sampleLimit: 3,
    });

    expect(diagnostic.groups[0].sampleIds).toEqual(['native-only-0', 'native-only-1', 'native-only-2']);
    expect(JSON.stringify(diagnostic)).not.toContain('secret');
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('keeps unavailable evidence explicit instead of treating it as zero', () => {
    const nativeUnavailable = createBrowserCountDifferenceDiagnostic({
      native: { status: 'unavailable', reason: 'native api down' },
      browser: browserEvidence(),
    });
    expect(nativeUnavailable.status).toBe('unavailable');
    expect(nativeUnavailable.unavailable).toEqual([{ source: 'native', reason: 'native api down' }]);
    expect(nativeUnavailable.nativeTotal).toBeNull();
    expect(nativeUnavailable.differenceTotal).toBeNull();

    const browserUnavailable = createBrowserCountDifferenceDiagnostic({
      native: nativeEvidence(),
      browser: { status: 'unavailable', reason: 'backend unavailable' },
    });
    expect(browserUnavailable.status).toBe('unavailable');
    expect(browserUnavailable.unavailable).toEqual([{ source: 'browser', reason: 'backend unavailable' }]);
    expect(browserUnavailable.browserManageableTotal).toBeNull();
    expect(browserUnavailable.differenceTotal).toBeNull();
  });
});

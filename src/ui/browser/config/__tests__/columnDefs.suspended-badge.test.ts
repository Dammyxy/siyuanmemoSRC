import { describe, expect, it } from 'vitest';
import type { RowClassParams } from 'ag-grid-community';
import { createColumnDefs, getBrowserRowClass, renderBrowserStateCell } from '../columnDefs';
import type { BrowserCard } from '../../types';

function makeCard(overrides: Partial<BrowserCard> = {}): BrowserCard {
  return {
    id: 'card-1',
    fsrsCardId: 'card-1',
    blockId: 'block-1',
    deckId: 'deck',
    content: 'Card',
    fullContent: 'Card',
    rootId: 'doc',
    state: 2,
    stateLabel: 'Review',
    due: new Date('2026-01-01T00:00:00Z'),
    dueFormatted: '',
    stability: 1,
    difficulty: 1,
    retrievability: 0,
    reps: 0,
    lapses: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    lastReview: null,
    lastReviewFormatted: '',
    interval: 0,
    firstReview: null,
    firstReviewFormatted: '',
    priority: 50,
    suspended: false,
    tags: [],
    note: '',
    cardType: 'item',
    ...overrides,
  };
}

describe('browser column suspended badge', () => {
  const t = (key: string, fallback: string) => (
    ({
      cdfContentIncomplete: '内容不完整',
      cdfRelationDuplicate: '重复关系',
      suspendedBadge: '暂停中',
    } as Record<string, string>)[key] || fallback
  );

  it('renders suspended badge only from the unified row suspended flag', () => {
    expect(renderBrowserStateCell(makeCard({ suspended: true }), t)).toContain('暂停中');
    expect(renderBrowserStateCell(makeCard({ suspended: false, meta: { suspended: true } } as Partial<BrowserCard>), t))
      .not.toContain('暂停中');
  });

  it('adds the suspended row class only for suspended browser cards', () => {
    expect(getBrowserRowClass({ data: makeCard({ suspended: true }) } as RowClassParams<BrowserCard>))
      .toBe('card-browser-grid__row--suspended');
    expect(getBrowserRowClass({ data: makeCard({ suspended: false }) } as RowClassParams<BrowserCard>))
      .toBe('');
  });

  it('wires the state column renderer through createColumnDefs', () => {
    const stateColumn = createColumnDefs(t).find((column) => column.field === 'stateLabel');
    const rendered = stateColumn?.cellRenderer?.({ data: makeCard({ suspended: true }) });
    const renderedFromNode = stateColumn?.cellRenderer?.({
      data: undefined,
      node: { data: makeCard({ suspended: true }) },
    });
    expect(rendered instanceof HTMLElement ? rendered.outerHTML : rendered).toContain('暂停中');
    expect(renderedFromNode instanceof HTMLElement ? renderedFromNode.outerHTML : renderedFromNode).toContain('暂停中');
    expect(stateColumn?.valueGetter?.({ data: makeCard({ state: 2 }) })).toBe('复习');
  });

  it('renders relation abnormal CDF badge before secondary content badge', () => {
    const rendered = renderBrowserStateCell(makeCard({
      meta: {
        relationAuthority: 'live-backlink',
        liveRelationKey: 'source:concept:descriptor-forward',
        liveRelationStatus: 'duplicate-live-relation',
        liveContentStatus: 'content-incomplete',
        liveRelationIssues: [],
      },
    }), t);

    expect(rendered).toContain('card-browser-grid__cdf-badge--relation');
    expect(rendered).toContain('重复关系');
    expect(rendered).toContain('card-browser-grid__cdf-badge--content');
    expect(rendered).toContain('内容不完整');
    expect(rendered.indexOf('重复关系')).toBeLessThan(rendered.indexOf('内容不完整'));
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearRuntimePerformanceDiagnostics,
  copyRuntimePerformanceDiagnosticsReport,
  getRuntimePerformanceDiagnosticsReport,
  incrementRuntimePerformanceCounter,
  measureRuntimePerformance,
  recordRuntimePerformanceSpan,
  setRuntimePerformanceDiagnosticsEnabled,
} from '@/utils/runtimePerformanceDiagnostics';

describe('runtimePerformanceDiagnostics', () => {
  afterEach(() => {
    setRuntimePerformanceDiagnosticsEnabled(false, { reset: true });
    vi.unstubAllGlobals();
  });

  it('does not record spans or counters while disabled', () => {
    recordRuntimePerformanceSpan('daily-editing', 'transaction.dispatch', 25, {
      transactionCount: 2,
    });
    incrementRuntimePerformanceCounter('daily-editing', 'transactions', 2);

    const report = getRuntimePerformanceDiagnosticsReport();

    expect(report.enabled).toBe(false);
    expect(report.events).toHaveLength(0);
    expect(report.counters).toEqual({});
    expect(report.stats).toEqual({});
  });

  it('records spans, counters, and percentile summaries while enabled', () => {
    setRuntimePerformanceDiagnosticsEnabled(true, { reset: true });

    recordRuntimePerformanceSpan('review', 'grade.feedback', 10);
    recordRuntimePerformanceSpan('review', 'grade.feedback', 30);
    incrementRuntimePerformanceCounter('review', 'graded', 2);

    const report = getRuntimePerformanceDiagnosticsReport();

    expect(report.enabled).toBe(true);
    expect(report.events).toHaveLength(2);
    expect(report.counters).toEqual({ 'review.graded': 2 });
    expect(report.stats['review.grade.feedback']).toMatchObject({
      count: 2,
      min: 10,
      max: 30,
      p50: 10,
      p95: 30,
    });
  });

  it('normalizes performance.now timestamps after the renderer has been open for more than one hour', () => {
    setRuntimePerformanceDiagnosticsEnabled(true, { reset: true });

    const startedAt = 4_200_000;
    recordRuntimePerformanceSpan('daily-editing', 'ws-main.message', 50, undefined, {
      startedAt,
      endedAt: startedAt + 50,
    });

    const event = getRuntimePerformanceDiagnosticsReport().events[0];
    expect(event.startedAt).toBeGreaterThan(performance.timeOrigin);
    expect(event.endedAt).toBeGreaterThan(performance.timeOrigin);
    expect(event.startedAt).toBeCloseTo(performance.timeOrigin + startedAt, 0);
  });

  it('measures synchronous and asynchronous work', async () => {
    setRuntimePerformanceDiagnosticsEnabled(true, { reset: true });

    const syncResult = measureRuntimePerformance('browser', 'rows.sync', () => 'ok');
    const asyncResult = await measureRuntimePerformance('browser', 'rows.async', async () => 42);

    const report = getRuntimePerformanceDiagnosticsReport();

    expect(syncResult).toBe('ok');
    expect(asyncResult).toBe(42);
    expect(report.stats['browser.rows.sync'].count).toBe(1);
    expect(report.stats['browser.rows.async'].count).toBe(1);
  });

  it('sanitizes metadata and bounds the event buffer', () => {
    setRuntimePerformanceDiagnosticsEnabled(true, { reset: true, maxEvents: 2 });

    recordRuntimePerformanceSpan('autocard', 'candidate.read', 9, {
      blockId: '20260507112233-abcdefg',
      kramdown: 'secret note body',
      promptText: 'secret prompt',
      apiToken: 'secret token',
      cardPayload: 'secret card payload',
      nested: { value: 'not copied' },
      veryLong: 'x'.repeat(180),
    });
    recordRuntimePerformanceSpan('autocard', 'candidate.read', 2);
    recordRuntimePerformanceSpan('autocard', 'candidate.read', 3);

    const report = getRuntimePerformanceDiagnosticsReport();

    expect(report.events).toHaveLength(2);
    expect(report.events[0].durationMs).toBe(2);
    expect(report.events[1].metadata).toBeUndefined();
    expect(report.stats['autocard.candidate.read'].count).toBe(3);
    expect(report.slowestEvents).toHaveLength(3);
    expect(report.slowestEvents[0].metadata).toMatchObject({
      blockId: '20260507112233-abcdefg',
      kramdown: '[redacted]',
      promptText: '[redacted]',
      apiToken: '[redacted]',
      cardPayload: '[redacted]',
      nested: '[object]',
    });
    expect(String(report.slowestEvents[0].metadata?.veryLong).length).toBeLessThanOrEqual(123);
  });

  it('clears session diagnostics without changing enabled state', () => {
    setRuntimePerformanceDiagnosticsEnabled(true, { reset: true });
    recordRuntimePerformanceSpan('startup', 'application-context.create', 12);
    incrementRuntimePerformanceCounter('startup', 'phase', 1);

    clearRuntimePerformanceDiagnostics();

    const report = getRuntimePerformanceDiagnosticsReport();
    expect(report.enabled).toBe(true);
    expect(report.events).toHaveLength(0);
    expect(report.counters).toEqual({});
    expect(report.stats).toEqual({});
  });

  it('keeps Browser and source-existence diagnostics event names stable and metadata sanitized', () => {
    setRuntimePerformanceDiagnosticsEnabled(true, { reset: true });

    const events = [
      ['browser', 'open.shell-attached'],
      ['browser', 'open.first-rows-visible'],
      ['browser', 'search.reload-scheduled'],
      ['browser', 'force-refresh.total'],
      ['browser', 'grid.first-data-rendered'],
      ['browser', 'grid.model-updated'],
      ['browser', 'grid.filter-changed'],
      ['browser', 'grid.sort-reload-scheduled'],
      ['source-existence', 'visible-rows-patch.apply'],
      ['autocard', 'candidate.prefilter-no-op'],
      ['autocard', 'siyuan.get-block-kramdown'],
      ['autocard', 'siyuan.get-block-attrs'],
      ['autocard', 'execute-envelope.planner-decision'],
      ['daily-editing', 'kernel-action-pump.native-riff-upsert-background'],
    ] as const;

    for (const [path, operation] of events) {
      recordRuntimePerformanceSpan(path, operation, 1, {
        blockContent: 'secret body',
        queryLength: 12,
        rowCount: 50,
        sortCount: 1,
      });
    }

    const report = getRuntimePerformanceDiagnosticsReport();
    for (const [path, operation] of events) {
      expect(report.stats[`${path}.${operation}`]?.count).toBe(1);
    }
    expect(report.events[0].metadata).toMatchObject({
      blockContent: '[redacted]',
      queryLength: 12,
      rowCount: 50,
      sortCount: 1,
    });
  });

  it('returns the report when clipboard copy is blocked by focus permissions', async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException('Document is not focused.', 'NotAllowedError'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    setRuntimePerformanceDiagnosticsEnabled(true, { reset: true });
    recordRuntimePerformanceSpan('browser', 'open.first-rows-visible', 12);

    await expect(copyRuntimePerformanceDiagnosticsReport()).resolves.toMatchObject({
      enabled: true,
      eventCount: 1,
    });
    expect(writeText).toHaveBeenCalledTimes(1);
  });
});

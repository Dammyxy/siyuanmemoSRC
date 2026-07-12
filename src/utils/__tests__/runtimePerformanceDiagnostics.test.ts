import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  beginStartupPerformanceAttempt,
  clearRuntimePerformanceDiagnostics,
  copyRuntimePerformanceDiagnosticsReport,
  buildStartupSlowProfileReport,
  getRuntimePerformanceDiagnosticsReport,
  incrementRuntimePerformanceCounter,
  measureRuntimePerformance,
  recordRuntimePerformanceSpan,
  reportStartupSlowProfile,
  resetStartupPerformanceAttempt,
  setRuntimePerformanceDiagnosticsEnabled,
  startRuntimePerformanceSpan,
} from '@/utils/runtimePerformanceDiagnostics';

describe('runtimePerformanceDiagnostics', () => {
  afterEach(() => {
    resetStartupPerformanceAttempt();
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

  it('builds a sanitized slow-start profile from top startup spans', () => {
    setRuntimePerformanceDiagnosticsEnabled(true, { reset: true });

    recordRuntimePerformanceSpan('startup', 'backend-worker.load', 900, {
      cardContent: 'secret card body',
      cardCount: 120,
    });
    recordRuntimePerformanceSpan('browser', 'open.first-rows-visible', 3000);
    recordRuntimePerformanceSpan('startup', 'worker-storage-maintenance', 1500, {
      sqlPayload: 'select * from blocks',
      repairedCardCount: 2,
    });
    recordRuntimePerformanceSpan('startup', 'settings-service.init', 20);

    const profile = buildStartupSlowProfileReport(getRuntimePerformanceDiagnosticsReport(), {
      startupDurationMs: 5200,
      thresholdMs: 5000,
      maxSpans: 2,
    });

    expect(profile).toMatchObject({
      kind: 'startup-slow-profile',
      startupDurationMs: 5200,
      thresholdMs: 5000,
      spanCount: 2,
    });
    expect(profile?.slowestSpans.map((span) => span.operation)).toEqual([
      'worker-storage-maintenance',
      'backend-worker.load',
    ]);
    expect(profile?.slowestSpans[0].metadata).toMatchObject({
      sqlPayload: '[redacted]',
      repairedCardCount: 2,
    });
    expect(profile?.slowestSpans[1].metadata).toMatchObject({
      cardContent: '[redacted]',
      cardCount: 120,
    });
  });

  it('keeps fast startup quiet', () => {
    setRuntimePerformanceDiagnosticsEnabled(true, { reset: true });
    recordRuntimePerformanceSpan('startup', 'backend-worker.load', 900);
    const warn = vi.fn();

    const profile = reportStartupSlowProfile({
      startupDurationMs: 1200,
      thresholdMs: 5000,
      logger: { warn },
    });

    expect(profile).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('records bounded startup spans for slow startup when full diagnostics are disabled', () => {
    beginStartupPerformanceAttempt();
    recordRuntimePerformanceSpan('startup', 'plugin.onload', 5200, {
      frontend: 'desktop',
      cardContent: 'secret card body',
    });
    recordRuntimePerformanceSpan('startup', 'application-context.create', 3400, {
      cardCount: 120,
    });
    recordRuntimePerformanceSpan('browser', 'open.first-rows-visible', 9000);
    const warn = vi.fn();

    const profile = reportStartupSlowProfile({
      startupDurationMs: 5200,
      thresholdMs: 5000,
      logger: { warn },
    });
    const report = getRuntimePerformanceDiagnosticsReport();

    expect(report.enabled).toBe(false);
    expect(report.events).toHaveLength(0);
    expect(profile).toMatchObject({
      kind: 'startup-slow-profile',
      startupDurationMs: 5200,
      spanCount: 2,
    });
    expect(profile?.slowestSpans.map((span) => span.operation)).toEqual([
      'plugin.onload',
      'application-context.create',
    ]);
    expect(profile?.slowestSpans[0].metadata).toEqual({
      frontend: 'desktop',
      cardContent: '[redacted]',
    });
    expect(warn).toHaveBeenCalledWith('[STARTUP SLOW PROFILE]', profile);
  });

  it('discards startup-attempt spans for fast startup while diagnostics are disabled', () => {
    beginStartupPerformanceAttempt();
    recordRuntimePerformanceSpan('startup', 'plugin.onload', 1200);
    const warn = vi.fn();

    const profile = reportStartupSlowProfile({
      startupDurationMs: 1200,
      thresholdMs: 5000,
      logger: { warn },
    });

    expect(profile).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    beginStartupPerformanceAttempt();
    recordRuntimePerformanceSpan('startup', 'application-context.create', 100);
    const nextProfile = reportStartupSlowProfile({
      startupDurationMs: 5100,
      thresholdMs: 5000,
      logger: { warn },
    });
    expect(nextProfile?.slowestSpans.map((span) => span.operation)).toEqual([
      'application-context.create',
    ]);
  });

  it('captures failed startup attempts after ApplicationContext creation closes', () => {
    beginStartupPerformanceAttempt();
    const finishApplicationContext = startRuntimePerformanceSpan('startup', 'application-context.create', {
      frontend: 'desktop',
    });
    finishApplicationContext({ status: 'created' });
    recordRuntimePerformanceSpan('startup', 'plugin.onload', 5300, {
      status: 'failed',
      errorName: 'Error',
    }, {
      ok: false,
      errorName: 'Error',
    });

    const profile = reportStartupSlowProfile({
      startupDurationMs: 5300,
      thresholdMs: 5000,
      logger: { warn: vi.fn() },
    });

    expect(profile?.slowestSpans.some((span) => (
      span.operation === 'plugin.onload'
      && span.ok === false
      && span.errorName === 'Error'
      && span.metadata?.status === 'failed'
    ))).toBe(true);
    expect(profile?.slowestSpans.some((span) => span.operation === 'application-context.create')).toBe(true);
  });

  it('bounds, resets, and redacts startup-only diagnostics metadata', () => {
    beginStartupPerformanceAttempt({ maxSpans: 2 });
    recordRuntimePerformanceSpan('startup', 'settings-service.init', 10, {
      cardText: 'secret card text',
      blockContent: 'secret block body',
      sqlPayload: 'select * from blocks',
      requestBody: '{"secret":true}',
      nestedError: { message: 'secret nested error' },
      unknownNested: { value: 'do not copy' },
      unknownScalar: 'not allow-listed',
      cardCount: 42,
      phase: 'settings',
    });
    recordRuntimePerformanceSpan('startup', 'unlisted.operation', 30);
    recordRuntimePerformanceSpan('startup', 'plugin.onload', 20);

    const profile = reportStartupSlowProfile({
      startupDurationMs: 6000,
      thresholdMs: 5000,
      maxSpans: 5,
      logger: { warn: vi.fn() },
    });

    expect(profile).toMatchObject({
      truncated: true,
      droppedSpanCount: 1,
      spanCount: 2,
    });
    expect(profile?.slowestSpans.map((span) => span.operation)).toEqual([
      'startup.unlisted-operation',
      'plugin.onload',
    ]);

    beginStartupPerformanceAttempt();
    recordRuntimePerformanceSpan('startup', 'settings-service.init', 10, {
      cardText: 'secret card text',
      blockContent: 'secret block body',
      sqlPayload: 'select * from blocks',
      requestBody: '{"secret":true}',
      nestedError: { message: 'secret nested error' },
      unknownNested: { value: 'do not copy' },
      unknownScalar: 'not allow-listed',
      cardCount: 42,
      phase: 'settings',
    });
    const redactionProfile = reportStartupSlowProfile({
      startupDurationMs: 6000,
      thresholdMs: 5000,
      logger: { warn: vi.fn() },
    });

    expect(redactionProfile?.slowestSpans[0].metadata).toEqual({
      cardText: '[redacted]',
      blockContent: '[redacted]',
      sqlPayload: '[redacted]',
      requestBody: '[redacted]',
      nestedError: '[redacted]',
      cardCount: 42,
      phase: 'settings',
    });
  });
});

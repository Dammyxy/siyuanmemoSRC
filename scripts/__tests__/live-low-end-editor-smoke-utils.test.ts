import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore cjs import
import {
  classifyPhaseRisk,
  classifyPluginOverlap,
  dedupeEvents,
  maskId,
  sanitizeForOutput,
  summarizePhase,
} from '../live-low-end-editor-smoke-utils.cjs';

describe('live-low-end-editor-smoke-utils', () => {
  it('masks ids and redacts sensitive content fields without losing counts', () => {
    const sanitized = sanitizeForOutput({
      docId: '20260507123456-abcdefg',
      blockIds: ['20260507123456-hijklmn'],
      typedChars: 42,
      kramdown: 'secret note body',
      markdown: 'secret markdown',
      prompt: 'secret prompt',
      answer: 'secret answer',
      cardContent: 'secret card',
      nested: {
        content: 'nested body',
        count: 3,
      },
    });

    expect(sanitized).toEqual({
      docId: '2026...defg',
      blockIds: ['2026...klmn'],
      typedChars: 42,
      kramdown: '[redacted]',
      markdown: '[redacted]',
      prompt: '[redacted]',
      answer: '[redacted]',
      cardContent: '[redacted]',
      nested: {
        content: '[redacted]',
        count: 3,
      },
    });
    expect(maskId('abc')).toBe('abc');
  });

  it('classifies editor phases by renderer, input, scroll, heap and plugin delta thresholds', () => {
    expect(classifyPhaseRisk({
      longtaskMaxMs: 40,
      totalBlockingEstimateMs: 0,
      inputDelayP95Ms: 30,
      inputDelayMaxMs: 60,
      scrollFrameGapP95Ms: 32,
      heapUsageRatio: 0.4,
      pluginDeltaPercent: 10,
    }).risk).toBe('green');

    expect(classifyPhaseRisk({
      longtaskMaxMs: 160,
      totalBlockingEstimateMs: 180,
      inputDelayP95Ms: 70,
      inputDelayMaxMs: 140,
      scrollFrameGapP95Ms: 80,
      heapUsageRatio: 0.72,
      pluginDeltaPercent: 35,
    }).risk).toBe('yellow');

    const red = classifyPhaseRisk({
      longtaskMaxMs: 280,
      totalBlockingEstimateMs: 520,
      inputDelayP95Ms: 120,
      inputDelayMaxMs: 300,
      scrollFrameGapP95Ms: 140,
      heapUsageRatio: 0.9,
      pluginDeltaPercent: 55,
    });
    expect(red.risk).toBe('red');
    expect(red.reasons).toEqual(expect.arrayContaining([
      'renderer-longtask-red',
      'input-delay-red',
      'plugin-delta-red',
    ]));
  });

  it('maps longtask overlap to the nearest plugin owner and keeps no-overlap as baseline', () => {
    const stallWindows = [{ startedAt: 1_000, endedAt: 1_260, durationMs: 260, source: 'renderer.longtask' }];
    const events = [
      { path: 'autocard', operation: 'siyuan.get-block-kramdown', startedAt: 900, endedAt: 1_050, durationMs: 150 },
      { path: 'daily-editing', operation: 'kernel-action-pump.native-riff-upsert', startedAt: 1_070, endedAt: 1_400, durationMs: 330 },
      { path: 'relay', operation: 'submit-and-wait', startedAt: 1_900, endedAt: 2_500, durationMs: 600 },
    ];

    const overlap = classifyPluginOverlap({ events, stallWindows, toleranceMs: 50 });
    expect(overlap.owner).toBe('Riff sync');
    expect(overlap.firstOwner).toBe('AutoCard');
    expect(overlap.overlaps.map((item: { owner: string }) => item.owner)).toEqual([
      'AutoCard',
      'Riff sync',
    ]);
    expect(overlap.overlaps[0].stallOverlapCount).toBe(1);

    const noOverlap = classifyPluginOverlap({
      events: [{ path: 'autocard', operation: 'candidate.process-settled', startedAt: 2_000, endedAt: 2_100, durationMs: 100 }],
      stallWindows,
      toleranceMs: 50,
    });
    expect(noOverlap.owner).toBe('SiYuan baseline/system/unknown');
    expect(noOverlap.firstOwner).toBeNull();
    expect(noOverlap.overlaps).toEqual([]);
  });

  it('summarizes phase events with renderer, plugin, input, scroll and heap signals', () => {
    const summary = summarizePhase({
      phaseStartedAt: 1_000,
      phaseEndedAt: 2_000,
      runtimeEvents: [
        { path: 'renderer', operation: 'longtask', startedAt: 1_100, endedAt: 1_240, durationMs: 140 },
        { path: 'daily-editing', operation: 'kernel-action-pump.poll-once', startedAt: 1_150, endedAt: 1_260, durationMs: 110 },
      ],
      localEvents: {
        inputDelays: [20, 80, 160],
        scrollFrameGaps: [16, 40, 90],
      },
      heapBefore: { usedJSHeapSize: 100, totalJSHeapSize: 200, jsHeapSizeLimit: 1_000 },
      heapAfter: { usedJSHeapSize: 180, totalJSHeapSize: 260, jsHeapSizeLimit: 1_000 },
    });

    expect(summary.longtaskMaxMs).toBe(140);
    expect(summary.totalBlockingEstimateMs).toBe(90);
    expect(summary.inputDelayP95Ms).toBe(160);
    expect(summary.scrollFrameGapP95Ms).toBe(90);
    expect(summary.heapDeltaUsedBytes).toBe(80);
    expect(summary.pluginEventCount).toBe(1);
    expect(summary.overlap.owner).toBe('KernelTransactionActionPump');
  });

  it('deduplicates repeated runtime and local probe events before overlap counting', () => {
    const duplicate = { path: 'renderer', operation: 'longtask', startedAt: 1_100, endedAt: 1_240, durationMs: 140 };
    expect(dedupeEvents([duplicate, { ...duplicate }])).toHaveLength(1);

    const summary = summarizePhase({
      phaseStartedAt: 1_000,
      phaseEndedAt: 2_000,
      runtimeEvents: [
        duplicate,
        { ...duplicate },
        { path: 'relay', operation: 'submit-and-wait', startedAt: 1_120, endedAt: 1_220, durationMs: 100 },
      ],
    });

    expect(summary.longtaskCount).toBe(1);
    expect(summary.overlap.overlaps).toHaveLength(1);
    expect(summary.overlap.overlaps[0].stallOverlapCount).toBe(1);
  });

  it('uses timed input samples for overlap and ignores untimed samples for ownership', () => {
    const untimed = summarizePhase({
      phaseStartedAt: 1_000,
      phaseEndedAt: 2_000,
      runtimeEvents: [
        { path: 'daily-editing', operation: 'ws-main.message', startedAt: 1_000, endedAt: 1_010, durationMs: 10 },
      ],
      localEvents: {
        inputDelays: [120],
      },
    });

    expect(untimed.inputDelayP95Ms).toBe(120);
    expect(untimed.overlap.owner).toBe('SiYuan baseline/system/unknown');

    const timed = summarizePhase({
      phaseStartedAt: 1_000,
      phaseEndedAt: 2_000,
      runtimeEvents: [
        { path: 'daily-editing', operation: 'ws-main.message', startedAt: 1_420, endedAt: 1_430, durationMs: 10 },
      ],
      localEvents: {
        inputDelays: [{ startedAt: 1_400, endedAt: 1_520, durationMs: 120 }],
      },
    });

    expect(timed.inputDelayP95Ms).toBe(120);
    expect(timed.overlap.owner).toBe('TransactionWebSocketService');
  });

  it('groups one plugin span across multiple stall windows', () => {
    const overlap = classifyPluginOverlap({
      events: [{ path: 'relay', operation: 'submit-and-wait', startedAt: 1_000, endedAt: 1_800, durationMs: 800 }],
      stallWindows: [
        { startedAt: 1_050, endedAt: 1_160, durationMs: 110, source: 'renderer.longtask' },
        { startedAt: 1_500, endedAt: 1_620, durationMs: 120, source: 'input-delay:1' },
      ],
      toleranceMs: 0,
    });

    expect(overlap.overlaps).toHaveLength(1);
    expect(overlap.overlaps[0].stallOverlapCount).toBe(2);
    expect(overlap.overlaps[0].stallSources).toEqual(['renderer.longtask', 'input-delay:1']);
  });
});

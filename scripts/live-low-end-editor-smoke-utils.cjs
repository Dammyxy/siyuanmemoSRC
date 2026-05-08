const DEFAULT_THRESHOLDS = Object.freeze({
  inputDelayP95YellowMs: 50,
  inputDelayP95RedMs: 100,
  inputDelayMaxYellowMs: 100,
  inputDelayMaxRedMs: 250,
  scrollFrameGapP95YellowMs: 50,
  scrollFrameGapP95RedMs: 100,
  longtaskMaxYellowMs: 100,
  longtaskMaxRedMs: 250,
  totalBlockingYellowMs: 150,
  totalBlockingRedMs: 500,
  heapUsageYellowRatio: 0.7,
  heapUsageRedRatio: 0.85,
  pluginDeltaYellowPercent: 20,
  pluginDeltaRedPercent: 50,
});

function round(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

function percentile(values, ratio) {
  const finite = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (finite.length === 0) return 0;
  const index = Math.min(finite.length - 1, Math.max(0, Math.ceil(finite.length * ratio) - 1));
  return finite[index];
}

function maskId(value) {
  if (typeof value !== 'string') return value;
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function isSensitiveKey(key) {
  return /(authorization|token|secret|body|content|kramdown|markdown|prompt|answer|cardcontent|cardpayload|notetext|blocktext|documenttext|plaintext|html)/i
    .test(String(key || ''));
}

function isIdKey(key) {
  return /(^id$|id$|ids$)/i.test(String(key || ''));
}

function sanitizeForOutput(value, key = '') {
  if (value == null) return value;
  if (isSensitiveKey(key)) return '[redacted]';
  if (typeof value === 'string') {
    return isIdKey(key) ? maskId(value) : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForOutput(item, key));
  }
  if (typeof value === 'object') {
    const sanitized = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      sanitized[entryKey] = sanitizeForOutput(entryValue, entryKey);
    }
    return sanitized;
  }
  return String(value);
}

function classifyPhaseRisk(metrics, thresholds = DEFAULT_THRESHOLDS) {
  const reasons = [];
  let risk = 'green';
  const mark = (nextRisk, reason) => {
    reasons.push(reason);
    if (nextRisk === 'red' || risk !== 'red') {
      risk = nextRisk;
    }
  };

  if ((metrics.longtaskMaxMs || 0) > thresholds.longtaskMaxRedMs) {
    mark('red', 'renderer-longtask-red');
  } else if ((metrics.longtaskMaxMs || 0) > thresholds.longtaskMaxYellowMs) {
    mark('yellow', 'renderer-longtask-yellow');
  }

  if ((metrics.totalBlockingEstimateMs || 0) > thresholds.totalBlockingRedMs) {
    mark('red', 'tbt-red');
  } else if ((metrics.totalBlockingEstimateMs || 0) > thresholds.totalBlockingYellowMs) {
    mark('yellow', 'tbt-yellow');
  }

  if ((metrics.inputDelayP95Ms || 0) > thresholds.inputDelayP95RedMs || (metrics.inputDelayMaxMs || 0) > thresholds.inputDelayMaxRedMs) {
    mark('red', 'input-delay-red');
  } else if ((metrics.inputDelayP95Ms || 0) > thresholds.inputDelayP95YellowMs || (metrics.inputDelayMaxMs || 0) > thresholds.inputDelayMaxYellowMs) {
    mark('yellow', 'input-delay-yellow');
  }

  if ((metrics.scrollFrameGapP95Ms || 0) > thresholds.scrollFrameGapP95RedMs) {
    mark('red', 'scroll-gap-red');
  } else if ((metrics.scrollFrameGapP95Ms || 0) > thresholds.scrollFrameGapP95YellowMs) {
    mark('yellow', 'scroll-gap-yellow');
  }

  if ((metrics.heapUsageRatio || 0) > thresholds.heapUsageRedRatio) {
    mark('red', 'heap-pressure-red');
  } else if ((metrics.heapUsageRatio || 0) > thresholds.heapUsageYellowRatio) {
    mark('yellow', 'heap-pressure-yellow');
  }

  if ((metrics.pluginDeltaPercent || 0) > thresholds.pluginDeltaRedPercent) {
    mark('red', 'plugin-delta-red');
  } else if ((metrics.pluginDeltaPercent || 0) > thresholds.pluginDeltaYellowPercent) {
    mark('yellow', 'plugin-delta-yellow');
  }

  return { risk, reasons };
}

function eventOwner(event) {
  const path = String(event?.path || '').toLowerCase();
  const operation = String(event?.operation || '').toLowerCase();
  const handlerName = String(event?.metadata?.handlerName || '').toLowerCase();
  const text = `${path}.${operation}.${handlerName}`;

  if (path === 'autocard' || text.includes('autocard')) return 'AutoCard';
  if (text.includes('native-riff')) return 'Riff sync';
  if (text.includes('kerneltransactioningesthandler') || text.includes('kernel-transaction-ingest') || text.includes('kernel.transaction.ingest')) return 'KernelTransactionIngestHandler';
  if (text.includes('kernel-action-pump') || text.includes('kerneltransactionactionpump') || text.includes('kernel.transaction.dequeue')) return 'KernelTransactionActionPump';
  if (path === 'relay' || text.includes('relay') || text.includes('ensure-writable')) return 'writer relay';
  if (text.includes('backend') || text.includes('worker')) return 'backend worker';
  if (path === 'browser' || text.includes('browser') || text.includes('ag grid') || text.includes('ag-grid') || text.includes('snapshot')) return 'Browser residue';
  if (path === 'source-existence' || text.includes('source-existence')) return 'Browser residue';
  if (path === 'daily-editing' || text.includes('ws-main') || text.includes('transactions')) return 'TransactionWebSocketService';
  return 'unknown';
}

function overlapsWindow(event, window, toleranceMs) {
  const startedAt = Number(event.startedAt);
  const endedAt = Number(event.endedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return false;
  return endedAt >= (window.startedAt - toleranceMs) && startedAt <= (window.endedAt + toleranceMs);
}

function classifyPluginOverlap({ events = [], stallWindows = [], toleranceMs = 250 }) {
  const overlapsByEvent = new Map();
  for (const window of stallWindows) {
    for (const event of events) {
      if (event.path === 'renderer') continue;
      if (!overlapsWindow(event, window, toleranceMs)) continue;
      const key = eventDedupeKey(event);
      const existing = overlapsByEvent.get(key) || {
        owner: eventOwner(event),
        path: event.path,
        operation: event.operation,
        durationMs: round(Number(event.durationMs || 0)),
        startedAt: event.startedAt,
        endedAt: event.endedAt,
        stallSources: [],
        stallOverlapCount: 0,
      };
      if (!existing.stallSources.includes(window.source)) {
        existing.stallSources.push(window.source);
      }
      existing.stallOverlapCount += 1;
      overlapsByEvent.set(key, existing);
    }
  }

  const overlaps = Array.from(overlapsByEvent.values());
  overlaps.sort((a, b) => Number(a.startedAt || 0) - Number(b.startedAt || 0));
  const dominant = overlaps.slice().sort((a, b) => Number(b.durationMs || 0) - Number(a.durationMs || 0))[0];
  return {
    owner: dominant?.owner || 'SiYuan baseline/system/unknown',
    firstOwner: overlaps[0]?.owner || null,
    overlaps,
  };
}

function inPhase(event, startedAt, endedAt) {
  const eventStart = Number(event.startedAt);
  const eventEnd = Number(event.endedAt);
  return Number.isFinite(eventStart) && Number.isFinite(eventEnd) && eventEnd >= startedAt && eventStart <= endedAt;
}

function buildHeapSummary(heapBefore, heapAfter) {
  const beforeUsed = Number(heapBefore?.usedJSHeapSize || 0);
  const afterUsed = Number(heapAfter?.usedJSHeapSize || 0);
  const afterLimit = Number(heapAfter?.jsHeapSizeLimit || 0);
  return {
    heapBeforeUsedBytes: beforeUsed,
    heapAfterUsedBytes: afterUsed,
    heapDeltaUsedBytes: afterUsed - beforeUsed,
    heapUsageRatio: afterLimit > 0 ? afterUsed / afterLimit : 0,
  };
}

function sampleDuration(sample) {
  if (typeof sample === 'number') return sample;
  return Number(sample?.durationMs || 0);
}

function sampleToWindow(sample, index, sourcePrefix, thresholdMs) {
  const durationMs = sampleDuration(sample);
  if (!(durationMs > thresholdMs)) return null;
  if (typeof sample === 'number') return null;
  const startedAt = Number(sample.startedAt);
  const endedAt = Number(sample.endedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return null;
  return {
    startedAt,
    endedAt,
    durationMs,
    source: `${sourcePrefix}:${index}`,
  };
}

function sampleDurations(samples) {
  return (samples || []).map(sampleDuration).filter((value) => Number.isFinite(value));
}

function eventDedupeKey(event) {
  return [
    event?.path || '',
    event?.operation || '',
    round(Number(event?.startedAt || 0)),
    round(Number(event?.endedAt || 0)),
    round(Number(event?.durationMs || 0)),
  ].join('|');
}

function dedupeEvents(events) {
  const seen = new Set();
  const deduped = [];
  for (const event of events || []) {
    const key = eventDedupeKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(event);
  }
  return deduped;
}

function summarizePhase({
  phaseStartedAt,
  phaseEndedAt,
  runtimeEvents = [],
  localEvents = {},
  heapBefore = null,
  heapAfter = null,
  rendererStateBefore = null,
  rendererStateAfter = null,
}) {
  const events = dedupeEvents(runtimeEvents.filter((event) => inPhase(event, phaseStartedAt, phaseEndedAt)));
  const longtasks = events.filter((event) => event.path === 'renderer' && event.operation === 'longtask');
  const stallWindows = [
    ...longtasks.map((event) => ({
      startedAt: Number(event.startedAt),
      endedAt: Number(event.endedAt),
      durationMs: Number(event.durationMs || 0),
      source: 'renderer.longtask',
    })),
  ];
  const pluginEvents = events.filter((event) => event.path !== 'renderer');
  const heap = buildHeapSummary(heapBefore, heapAfter);
  const inputDelaySamples = localEvents.inputDelays || [];
  const scrollFrameGapSamples = localEvents.scrollFrameGaps || [];
  const inputDelays = sampleDurations(inputDelaySamples);
  const scrollFrameGaps = sampleDurations(scrollFrameGapSamples);
  const inputDelayWindows = inputDelaySamples
    .map((sample, index) => sampleToWindow(sample, index, 'input-delay', DEFAULT_THRESHOLDS.inputDelayP95YellowMs))
    .filter(Boolean);
  const scrollGapWindows = scrollFrameGapSamples
    .map((sample, index) => sampleToWindow(sample, index, 'scroll-gap', DEFAULT_THRESHOLDS.scrollFrameGapP95YellowMs))
    .filter(Boolean);
  stallWindows.push(...inputDelayWindows, ...scrollGapWindows);
  const metrics = {
    eventCount: events.length,
    pluginEventCount: pluginEvents.length,
    longtaskCount: longtasks.length,
    longtaskMaxMs: round(longtasks.reduce((max, event) => Math.max(max, Number(event.durationMs || 0)), 0)),
    totalBlockingEstimateMs: round(longtasks.reduce((sum, event) => sum + Math.max(0, Number(event.durationMs || 0) - 50), 0)),
    inputDelayP95Ms: round(percentile(inputDelays, 0.95)),
    inputDelayMaxMs: round(Math.max(0, ...inputDelays)),
    scrollFrameGapP95Ms: round(percentile(scrollFrameGaps, 0.95)),
    scrollFrameGapMaxMs: round(Math.max(0, ...scrollFrameGaps)),
    ...heap,
  };
  const risk = classifyPhaseRisk(metrics);
  return {
    ...metrics,
    risk: risk.risk,
    riskReasons: risk.reasons,
    rendererStateBefore,
    rendererStateAfter,
    overlap: classifyPluginOverlap({ events, stallWindows }),
    slowestPluginEvents: pluginEvents
      .slice()
      .sort((a, b) => Number(b.durationMs || 0) - Number(a.durationMs || 0))
      .slice(0, 8)
      .map((event) => sanitizeForOutput({
        owner: eventOwner(event),
        path: event.path,
        operation: event.operation,
        durationMs: round(Number(event.durationMs || 0)),
        metadata: event.metadata || {},
      })),
  };
}

module.exports = {
  DEFAULT_THRESHOLDS,
  classifyPhaseRisk,
  classifyPluginOverlap,
  dedupeEvents,
  eventOwner,
  maskId,
  percentile,
  round,
  sanitizeForOutput,
  summarizePhase,
};

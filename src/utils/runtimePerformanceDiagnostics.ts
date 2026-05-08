import { createLogger } from '@/utils/logger';

const logger = createLogger('RuntimePerf');

const SESSION_FLAG_KEY = 'siyuanmemo.runtimePerformanceDiagnostics.enabled';
const DEFAULT_MAX_EVENTS = 500;
const DEFAULT_MAX_SLOWEST_EVENTS = 40;
const MAX_METADATA_KEYS = 24;
const MAX_METADATA_STRING_LENGTH = 120;

type JsonValue = string | number | boolean | null;

export type RuntimePerformanceMetadata = Record<string, unknown>;

export type SanitizedRuntimePerformanceMetadata = Record<string, JsonValue>;

export interface RuntimePerformanceEvent {
  id: number;
  type: 'span';
  path: string;
  operation: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  ok: boolean;
  traceId?: string;
  metadata?: SanitizedRuntimePerformanceMetadata;
  errorName?: string;
}

export interface RuntimePerformanceStats {
  avg: number;
  min: number;
  max: number;
  count: number;
  p50: number;
  p95: number;
}

export interface RuntimePerformanceReport {
  enabled: boolean;
  generatedAt: string;
  sessionStartedAt: string;
  maxEvents: number;
  eventCount: number;
  events: RuntimePerformanceEvent[];
  slowestEvents: RuntimePerformanceEvent[];
  counters: Record<string, number>;
  stats: Record<string, RuntimePerformanceStats>;
}

interface RuntimePerformanceState {
  enabled: boolean;
  nextEventId: number;
  sessionStartedAt: number;
  maxEvents: number;
  events: RuntimePerformanceEvent[];
  slowestEvents: RuntimePerformanceEvent[];
  counters: Map<string, number>;
  timings: Map<string, number[]>;
  longTaskObserver?: PerformanceObserver;
  globalsInstalled: boolean;
}

export interface RuntimePerformanceEnableOptions {
  reset?: boolean;
  maxEvents?: number;
}

export interface RuntimePerformanceSpanOptions {
  startedAt?: number;
  endedAt?: number;
  ok?: boolean;
  traceId?: string;
  errorName?: string;
}

type RuntimePerformanceEndSpan = (
  metadata?: RuntimePerformanceMetadata,
  options?: Omit<RuntimePerformanceSpanOptions, 'startedAt' | 'endedAt'>
) => void;

type RuntimePerformanceGlobal = {
  enable: () => RuntimePerformanceReport;
  disable: () => RuntimePerformanceReport;
  clear: () => RuntimePerformanceReport;
  report: () => RuntimePerformanceReport;
  copyReport: () => Promise<RuntimePerformanceReport>;
};

const state: RuntimePerformanceState = {
  enabled: false,
  nextEventId: 1,
  sessionStartedAt: Date.now(),
  maxEvents: DEFAULT_MAX_EVENTS,
  events: [],
  slowestEvents: [],
  counters: new Map(),
  timings: new Map(),
  globalsInstalled: false,
};

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function wallClockFromPerformance(value: number): number {
  if (
    typeof performance !== 'undefined'
    && typeof performance.timeOrigin === 'number'
    && value < 1_000_000_000_000
  ) {
    return performance.timeOrigin + value;
  }
  return value;
}

function normalizeLabel(value: string, fallback: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return fallback;
  return trimmed.length > MAX_METADATA_STRING_LENGTH
    ? `${trimmed.slice(0, MAX_METADATA_STRING_LENGTH)}...`
    : trimmed;
}

function isSensitiveMetadataKey(key: string): boolean {
  return /(answer|body|content|html|kramdown|markdown|prompt|secret|text|token)/i.test(key);
}

function sanitizeMetadataValue(key: string, value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  if (isSensitiveMetadataKey(key)) return '[redacted]';
  if (value === null) return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.length > MAX_METADATA_STRING_LENGTH
      ? `${value.slice(0, MAX_METADATA_STRING_LENGTH)}...`
      : value;
  }
  if (Array.isArray(value)) return `[array:${value.length}]`;
  if (typeof value === 'object') return '[object]';
  if (typeof value === 'bigint') return value.toString();
  return String(value);
}

function sanitizeMetadata(metadata?: RuntimePerformanceMetadata): SanitizedRuntimePerformanceMetadata | undefined {
  if (!metadata) return undefined;

  const sanitized: SanitizedRuntimePerformanceMetadata = {};
  for (const [key, value] of Object.entries(metadata).slice(0, MAX_METADATA_KEYS)) {
    const cleanValue = sanitizeMetadataValue(key, value);
    if (cleanValue !== undefined) {
      sanitized[normalizeLabel(key, 'metadata')] = cleanValue;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function metricKey(path: string, operation: string): string {
  return `${path}.${operation}`;
}

function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function summarize(values: number[]): RuntimePerformanceStats {
  if (values.length === 0) {
    return { avg: 0, min: 0, max: 0, count: 0, p50: 0, p95: 0 };
  }

  const sum = values.reduce((total, value) => total + value, 0);
  return {
    avg: sum / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    count: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
  };
}

function rememberEvent(event: RuntimePerformanceEvent): void {
  state.events.push(event);
  while (state.events.length > state.maxEvents) {
    state.events.shift();
  }

  state.slowestEvents.push(event);
  state.slowestEvents.sort((a, b) => b.durationMs - a.durationMs);
  if (state.slowestEvents.length > DEFAULT_MAX_SLOWEST_EVENTS) {
    state.slowestEvents.length = DEFAULT_MAX_SLOWEST_EVENTS;
  }
}

function rememberTiming(path: string, operation: string, durationMs: number): void {
  const key = metricKey(path, operation);
  const timings = state.timings.get(key) ?? [];
  timings.push(durationMs);
  if (timings.length > 1000) {
    timings.shift();
  }
  state.timings.set(key, timings);
}

function resetRuntimePerformanceState(): void {
  state.nextEventId = 1;
  state.sessionStartedAt = Date.now();
  state.events = [];
  state.slowestEvents = [];
  state.counters.clear();
  state.timings.clear();
}

function writeSessionFlag(enabled: boolean): void {
  try {
    const storage = (globalThis as { sessionStorage?: Storage }).sessionStorage;
    if (!storage) return;
    if (enabled) {
      storage.setItem(SESSION_FLAG_KEY, '1');
    } else {
      storage.removeItem(SESSION_FLAG_KEY);
    }
  } catch {
    // Session storage may be unavailable in restricted renderers.
  }
}

function readSessionFlag(): boolean {
  try {
    const storage = (globalThis as { sessionStorage?: Storage }).sessionStorage;
    return storage?.getItem(SESSION_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function installLongTaskObserver(): void {
  if (!state.enabled || state.longTaskObserver) return;
  const PerformanceObserverCtor = (globalThis as { PerformanceObserver?: typeof PerformanceObserver })
    .PerformanceObserver;
  if (!PerformanceObserverCtor) return;

  try {
    const observer = new PerformanceObserverCtor((list) => {
      for (const entry of list.getEntries()) {
        recordRuntimePerformanceSpan('renderer', 'longtask', entry.duration, {
          entryType: entry.entryType,
          name: entry.name,
        }, {
          startedAt: entry.startTime,
          endedAt: entry.startTime + entry.duration,
        });
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
    state.longTaskObserver = observer;
  } catch {
    // Long task observation is best-effort and browser-dependent.
  }
}

function disconnectLongTaskObserver(): void {
  state.longTaskObserver?.disconnect();
  state.longTaskObserver = undefined;
}

export function isRuntimePerformanceDiagnosticsEnabled(): boolean {
  return state.enabled;
}

export function setRuntimePerformanceDiagnosticsEnabled(
  enabled: boolean,
  options: RuntimePerformanceEnableOptions = {}
): void {
  state.enabled = enabled;
  if (options.maxEvents !== undefined) {
    state.maxEvents = Math.max(1, Math.floor(options.maxEvents));
  }
  if (options.reset) {
    resetRuntimePerformanceState();
  }
  writeSessionFlag(enabled);

  if (enabled) {
    installLongTaskObserver();
  } else {
    disconnectLongTaskObserver();
  }
}

export function initializeRuntimePerformanceDiagnosticsFromSession(): boolean {
  const enabled = readSessionFlag();
  setRuntimePerformanceDiagnosticsEnabled(enabled, { reset: false });
  return enabled;
}

export function clearRuntimePerformanceDiagnostics(): void {
  resetRuntimePerformanceState();
}

export function recordRuntimePerformanceSpan(
  pathInput: string,
  operationInput: string,
  durationMsInput: number,
  metadata?: RuntimePerformanceMetadata,
  options: RuntimePerformanceSpanOptions = {}
): void {
  if (!state.enabled) return;

  const path = normalizeLabel(pathInput, 'unknown');
  const operation = normalizeLabel(operationInput, 'operation');
  const durationMs = Math.max(0, Number.isFinite(durationMsInput) ? durationMsInput : 0);
  const endedAt = options.endedAt ?? nowMs();
  const startedAt = options.startedAt ?? endedAt - durationMs;
  const event: RuntimePerformanceEvent = {
    id: state.nextEventId++,
    type: 'span',
    path,
    operation,
    startedAt: wallClockFromPerformance(startedAt),
    endedAt: wallClockFromPerformance(endedAt),
    durationMs,
    ok: options.ok ?? !options.errorName,
    traceId: options.traceId ? normalizeLabel(options.traceId, 'trace') : undefined,
    metadata: sanitizeMetadata(metadata),
    errorName: options.errorName ? normalizeLabel(options.errorName, 'Error') : undefined,
  };

  rememberEvent(event);
  rememberTiming(path, operation, durationMs);
}

export function startRuntimePerformanceSpan(
  path: string,
  operation: string,
  metadata?: RuntimePerformanceMetadata
): RuntimePerformanceEndSpan {
  if (!state.enabled) {
    return () => undefined;
  }

  const startedAt = nowMs();
  return (endMetadata?: RuntimePerformanceMetadata, options: Omit<RuntimePerformanceSpanOptions, 'startedAt' | 'endedAt'> = {}) => {
    const endedAt = nowMs();
    recordRuntimePerformanceSpan(
      path,
      operation,
      endedAt - startedAt,
      { ...metadata, ...endMetadata },
      { ...options, startedAt, endedAt }
    );
  };
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return Boolean(value && typeof (value as { then?: unknown }).then === 'function');
}

export function measureRuntimePerformance<T>(
  path: string,
  operation: string,
  fn: () => T,
  metadata?: RuntimePerformanceMetadata
): T {
  if (!state.enabled) {
    return fn();
  }

  const startedAt = nowMs();
  try {
    const result = fn();
    if (isPromiseLike(result)) {
      return result
        .then((value) => {
          const endedAt = nowMs();
          recordRuntimePerformanceSpan(path, operation, endedAt - startedAt, metadata, {
            startedAt,
            endedAt,
          });
          return value;
        })
        .catch((error) => {
          const endedAt = nowMs();
          recordRuntimePerformanceSpan(path, operation, endedAt - startedAt, metadata, {
            startedAt,
            endedAt,
            ok: false,
            errorName: error instanceof Error ? error.name : 'Error',
          });
          throw error;
        }) as T;
    }

    const endedAt = nowMs();
    recordRuntimePerformanceSpan(path, operation, endedAt - startedAt, metadata, {
      startedAt,
      endedAt,
    });
    return result;
  } catch (error) {
    const endedAt = nowMs();
    recordRuntimePerformanceSpan(path, operation, endedAt - startedAt, metadata, {
      startedAt,
      endedAt,
      ok: false,
      errorName: error instanceof Error ? error.name : 'Error',
    });
    throw error;
  }
}

export function incrementRuntimePerformanceCounter(path: string, name: string, delta = 1): void {
  if (!state.enabled) return;

  const key = metricKey(normalizeLabel(path, 'unknown'), normalizeLabel(name, 'counter'));
  const safeDelta = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  state.counters.set(key, (state.counters.get(key) ?? 0) + safeDelta);
}

export function createRuntimePerformanceTraceId(prefix: string): string {
  return `${normalizeLabel(prefix, 'trace')}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function getRuntimePerformanceDiagnosticsReport(): RuntimePerformanceReport {
  const counters: Record<string, number> = {};
  for (const [key, value] of state.counters.entries()) {
    counters[key] = value;
  }

  const stats: Record<string, RuntimePerformanceStats> = {};
  for (const [key, values] of state.timings.entries()) {
    stats[key] = summarize(values);
  }

  return {
    enabled: state.enabled,
    generatedAt: new Date().toISOString(),
    sessionStartedAt: new Date(state.sessionStartedAt).toISOString(),
    maxEvents: state.maxEvents,
    eventCount: state.events.length,
    events: state.events.map((event) => ({ ...event })),
    slowestEvents: state.slowestEvents.map((event) => ({ ...event })),
    counters,
    stats,
  };
}

export function printRuntimePerformanceDiagnosticsReport(): RuntimePerformanceReport {
  const report = getRuntimePerformanceDiagnosticsReport();
  logger.info('[RUNTIME PERF REPORT]', report);
  return report;
}

export async function copyRuntimePerformanceDiagnosticsReport(): Promise<RuntimePerformanceReport> {
  const report = getRuntimePerformanceDiagnosticsReport();
  const text = JSON.stringify(report, null, 2);
  const clipboard = (globalThis.navigator as Navigator | undefined)?.clipboard;
  if (clipboard?.writeText) {
    await clipboard.writeText(text);
  } else {
    logger.info('[RUNTIME PERF REPORT JSON]', text);
  }
  return report;
}

export function installRuntimePerformanceDiagnosticsGlobal(): void {
  if (state.globalsInstalled) return;
  const target = globalThis as typeof globalThis & {
    window?: Record<string, unknown>;
    siyuanMemoRuntimePerformance?: RuntimePerformanceGlobal;
  };
  const globalApi: RuntimePerformanceGlobal = {
    enable: () => {
      setRuntimePerformanceDiagnosticsEnabled(true, { reset: true });
      return printRuntimePerformanceDiagnosticsReport();
    },
    disable: () => {
      setRuntimePerformanceDiagnosticsEnabled(false, { reset: false });
      return printRuntimePerformanceDiagnosticsReport();
    },
    clear: () => {
      clearRuntimePerformanceDiagnostics();
      return printRuntimePerformanceDiagnosticsReport();
    },
    report: () => printRuntimePerformanceDiagnosticsReport(),
    copyReport: () => copyRuntimePerformanceDiagnosticsReport(),
  };

  target.siyuanMemoRuntimePerformance = globalApi;
  if (target.window) {
    target.window.siyuanMemoRuntimePerformance = globalApi;
  }
  state.globalsInstalled = true;
}

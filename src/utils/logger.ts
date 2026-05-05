/**
 * 插件统一日志内核
 *
 * 目标：
 * - 所有日志通过统一入口输出
 * - 支持按级别过滤
 * - 不修改宿主全局 console，避免污染其他思源插件日志
 */

type ConsoleMethod = 'trace' | 'debug' | 'info' | 'log' | 'warn' | 'error';
type LogLevel = ConsoleMethod | 'silent';

const PRIORITY: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  log: 30,
  warn: 40,
  error: 50,
  silent: 99,
};

const nativeConsole: Record<ConsoleMethod, (...args: unknown[]) => void> = {
  trace: console.trace.bind(console),
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

function isDevEnv(): boolean {
  return Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
}

let globalLevel: LogLevel = isDevEnv() ? 'debug' : 'warn';
function canEmit(method: ConsoleMethod, localLevel?: LogLevel): boolean {
  const effectiveLevel = localLevel ?? globalLevel;
  return PRIORITY[method] >= PRIORITY[effectiveLevel];
}

function emitNative(method: ConsoleMethod, args: unknown[]): void {
  const sink = nativeConsole[method] ?? nativeConsole.log;
  sink(...args);
}

export class Logger {
  private readonly prefix: string;
  private readonly localLevel?: LogLevel;

  constructor(tag?: string, level?: LogLevel) {
    this.prefix = tag ? `[SiYuanMemo][${tag}]` : '[SiYuanMemo]';
    this.localLevel = level;
  }

  private emit(method: ConsoleMethod, args: unknown[]): void {
    if (!canEmit(method, this.localLevel)) {
      return;
    }
    emitNative(method, [this.prefix, ...args]);
  }

  trace(...args: unknown[]): void {
    this.emit('trace', args);
  }

  debug(...args: unknown[]): void {
    this.emit('debug', args);
  }

  info(...args: unknown[]): void {
    this.emit('info', args);
  }

  log(...args: unknown[]): void {
    this.emit('log', args);
  }

  warn(...args: unknown[]): void {
    this.emit('warn', args);
  }

  error(...args: unknown[]): void {
    this.emit('error', args);
  }
}

export function setGlobalLogLevel(level: LogLevel): void {
  globalLevel = level;
}

export function getGlobalLogLevel(): LogLevel {
  return globalLevel;
}

export function applyDebugLogPreference(enabled: boolean): void {
  setGlobalLogLevel(enabled ? 'debug' : 'warn');
}

/**
 * 兼容旧调用点。
 *
 * 思源多个插件共享同一个 renderer，全局 patch console 会把其他插件的
 * `console.error` 也改成 `[SiYuanMemo]` 前缀，导致跨插件错误误归因。
 * SiYuanMemo 运行时代码应显式使用 `createLogger()`。
 */
export function installConsoleBridge(): void {
  // Intentionally no-op: never patch host console in a shared SiYuan renderer.
}

export const logger = new Logger();

export function createLogger(tag: string): Logger {
  return new Logger(tag);
}

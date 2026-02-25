/**
 * 插件统一日志内核
 *
 * 目标：
 * - 所有日志通过统一入口输出
 * - 支持按级别过滤
 * - 支持将 legacy console.* 自动桥接到 logger
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
  return Boolean((import.meta as any)?.env?.DEV);
}

let globalLevel: LogLevel = isDevEnv() ? 'debug' : 'warn';
let bridgeInstalled = false;

function canEmit(method: ConsoleMethod, localLevel?: LogLevel): boolean {
  const effectiveLevel = localLevel ?? globalLevel;
  return PRIORITY[method] >= PRIORITY[effectiveLevel];
}

function emitNative(method: ConsoleMethod, args: unknown[]): void {
  const sink = nativeConsole[method] ?? nativeConsole.log;
  sink(...args);
}

function isAlreadyPrefixed(args: unknown[]): boolean {
  const first = args[0];
  return typeof first === 'string' && first.startsWith('[SiYuanMemo]');
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

/**
 * 安装 console 桥接：
 * - 把遗留 console.* 收敛到 logger
 * - 已带 [SiYuanMemo] 前缀的日志保持原样输出（避免重复前缀）
 */
export function installConsoleBridge(): void {
  if (bridgeInstalled) {
    return;
  }

  bridgeInstalled = true;

  const methods: ConsoleMethod[] = ['trace', 'debug', 'info', 'log', 'warn', 'error'];
  for (const method of methods) {
    (console as any)[method] = (...args: unknown[]) => {
      if (!canEmit(method)) {
        return;
      }

      if (isAlreadyPrefixed(args)) {
        emitNative(method, args);
        return;
      }

      logger[method](...args);
    };
  }
}

export const logger = new Logger();

export function createLogger(tag: string): Logger {
  return new Logger(tag);
}

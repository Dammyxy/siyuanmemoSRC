import { afterEach, describe, expect, it, vi } from 'vitest';

const originalConsole = {
  trace: console.trace,
  debug: console.debug,
  info: console.info,
  log: console.log,
  warn: console.warn,
  error: console.error,
};

async function loadLogger() {
  vi.resetModules();
  return import('@/utils/logger');
}

describe('logger', () => {
  afterEach(() => {
    console.trace = originalConsole.trace;
    console.debug = originalConsole.debug;
    console.info = originalConsole.info;
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('does not patch host console methods when enabling debug logs', async () => {
    const originalError = console.error;
    const originalWarn = console.warn;
    const { applyDebugLogPreference, getGlobalLogLevel } = await loadLogger();

    applyDebugLogPreference(true);

    expect(getGlobalLogLevel()).toBe('debug');
    expect(console.error).toBe(originalError);
    expect(console.warn).toBe(originalWarn);
  });

  it('keeps SiYuanMemo prefixes on explicit logger calls only', async () => {
    const warn = vi.fn();
    console.warn = warn;
    const { createLogger, setGlobalLogLevel } = await loadLogger();
    setGlobalLogLevel('warn');

    createLogger('Unit').warn('owned warning');

    expect(warn).toHaveBeenCalledWith('[SiYuanMemo][Unit]', 'owned warning');
  });
});

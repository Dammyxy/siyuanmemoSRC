/**
 * 动态禁用调试日志
 * 
 * 使用方法：
 * 1. 在插件初始化时设置：
 *    (window as any).FSRS_DISABLE_LOGS = true;
 * 
 * 2. 或者在浏览器控制台执行：
 *    window.FSRS_DISABLE_LOGS = true;
 * 
 * 3. 使用全局方法切换：
 *    window.toggleFSRSLogs(true);  // 启用日志
 *    window.toggleFSRSLogs(false); // 禁用日志
 */

// 🆕 默认禁用日志（除非明确设置为 false）
if ((window as any).FSRS_DISABLE_LOGS === undefined) {
  (window as any).FSRS_DISABLE_LOGS = true;
}

// 保存原始方法
const originalLog = console.log;
const originalDebug = console.debug;
const originalInfo = console.info;
const originalWarn = console.warn;
const originalError = console.error;

// 动态拦截日志
console.log = function(...args: any[]) {
  // 动态检查是否禁用日志
  if ((window as any).FSRS_DISABLE_LOGS === true) {
    if (typeof args[0] === 'string' && (
      args[0].startsWith('[SiYuanMemo]') || 
      args[0].includes('[SiYuanMemo][')
    )) {
      return; // 忽略
    }
  }
  originalLog.apply(console, args);
};

console.debug = function(...args: any[]) {
  if ((window as any).FSRS_DISABLE_LOGS === true) {
    if (typeof args[0] === 'string' && (
      args[0].startsWith('[SiYuanMemo]') || 
      args[0].includes('[SiYuanMemo][')
    )) {
      return; // 忽略
    }
  }
  originalDebug.apply(console, args);
};

console.info = function(...args: any[]) {
  if ((window as any).FSRS_DISABLE_LOGS === true) {
    if (typeof args[0] === 'string' && (
      args[0].startsWith('[SiYuanMemo]') || 
      args[0].includes('[SiYuanMemo][')
    )) {
      return; // 忽略
    }
  }
  originalInfo.apply(console, args);
};

console.warn = function(...args: any[]) {
  if ((window as any).FSRS_DISABLE_LOGS === true) {
    if (typeof args[0] === 'string' && (
      args[0].startsWith('[SiYuanMemo]') || 
      args[0].includes('[SiYuanMemo][')
    )) {
      return; // 忽略
    }
  }
  originalWarn.apply(console, args);
};

console.error = function(...args: any[]) {
  if ((window as any).FSRS_DISABLE_LOGS === true) {
    if (typeof args[0] === 'string' && (
      args[0].startsWith('[SiYuanMemo]') || 
      args[0].includes('[SiYuanMemo][')
    )) {
      return; // 忽略
    }
  }
  originalError.apply(console, args);
};

// 提供全局方法来切换日志
(window as any).toggleFSRSLogs = (enabled: boolean) => {
  (window as any).FSRS_DISABLE_LOGS = !enabled;
  const message = enabled ? 'Debug logs enabled' : 'Debug logs disabled';
  originalLog.call(console, `[SiYuanMemo] ${message}`);
};

// 初始化时显示状态（使用原始 console.log）
if ((window as any).FSRS_DISABLE_LOGS === true) {
  originalLog.call(console, '[SiYuanMemo] Debug logs disabled by default');
}


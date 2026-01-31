/**
 * 快速禁用所有调试日志
 * 
 * 使用方法：
 * 1. 在需要禁用日志的文件顶部导入：
 *    import '@/utils/disableLogs';
 * 
 * 2. 或者在浏览器控制台执行：
 *    window.FSRS_DISABLE_LOGS = true;
 */

// 检查是否禁用日志
const shouldDisableLogs = 
  // 环境变量
  import.meta.env.VITE_ENABLE_LOGS === 'false' ||
  // 全局变量
  (window as any).FSRS_DISABLE_LOGS === true;

if (shouldDisableLogs) {
  // 保存原始方法
  const originalLog = console.log;
  const originalDebug = console.debug;
  const originalInfo = console.info;

  // 只拦截 [FSRS] 开头的日志
  console.log = function(...args: any[]) {
    if (typeof args[0] === 'string' && args[0].startsWith('[FSRS]')) {
      return; // 忽略
    }
    originalLog.apply(console, args);
  };

  console.debug = function(...args: any[]) {
    if (typeof args[0] === 'string' && args[0].startsWith('[FSRS]')) {
      return; // 忽略
    }
    originalDebug.apply(console, args);
  };

  console.info = function(...args: any[]) {
    if (typeof args[0] === 'string' && args[0].startsWith('[FSRS]')) {
      return; // 忽略
    }
    originalInfo.apply(console, args);
  };

  console.log('[FSRS] Debug logs disabled');
}

// 提供全局方法来切换日志
(window as any).toggleFSRSLogs = (enabled: boolean) => {
  (window as any).FSRS_DISABLE_LOGS = !enabled;
  console.log(`[FSRS] Logs ${enabled ? 'enabled' : 'disabled'}. Please reload the plugin.`);
};

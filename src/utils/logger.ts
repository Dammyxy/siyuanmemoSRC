/**
 * 插件日志工具
 * 
 * 特性：
 * - 统一的日志接口，自动添加 [SiYuanMemo] 前缀
 * - 开发环境：所有日志正常输出
 * - 生产环境：由 Vite/Terser 自动移除（见 vite.config.ts）
 * - 不劫持全局 console 对象
 * 
 * 使用方法：
 * ```typescript
 * import { logger } from '@/utils/logger';
 * 
 * logger.log('普通日志');
 * logger.debug('调试信息');
 * logger.info('提示信息');
 * logger.warn('警告信息');
 * logger.error('错误信息', error);
 * ```
 * 
 * 带模块标签的日志：
 * ```typescript
 * import { createLogger } from '@/utils/logger';
 * 
 * const logger = createLogger('ModuleName');
 * logger.log('模块日志'); // 输出: [SiYuanMemo][ModuleName] 模块日志
 * ```
 * 
 * 日志级别说明：
 * - log/debug/info: 开发环境输出，生产环境自动移除
 * - warn/error: 所有环境都输出，用于重要提示
 */
class Logger {
  private readonly prefix: string;
  
  constructor(tag?: string) {
    this.prefix = tag ? `[SiYuanMemo][${tag}]` : '[SiYuanMemo]';
  }
  
  /**
   * 普通日志
   * 生产环境会被 Terser 移除
   */
  log(...args: any[]): void {
    console.log(this.prefix, ...args);
  }
  
  /**
   * 调试日志
   * 生产环境会被 Terser 移除
   */
  debug(...args: any[]): void {
    console.debug(this.prefix, ...args);
  }
  
  /**
   * 信息日志
   * 生产环境会被 Terser 移除
   */
  info(...args: any[]): void {
    console.info(this.prefix, ...args);
  }
  
  /**
   * 警告日志
   * 生产环境保留，用于重要提示
   */
  warn(...args: any[]): void {
    console.warn(this.prefix, ...args);
  }
  
  /**
   * 错误日志
   * 生产环境保留，用于错误报告
   */
  error(...args: any[]): void {
    console.error(this.prefix, ...args);
  }
}

// 导出默认 logger 实例
export const logger = new Logger();

/**
 * 创建带标签的 logger 实例
 * @param tag 模块标签，如 'StorageManager'
 * @returns Logger 实例
 * 
 * @example
 * const logger = createLogger('MyModule');
 * logger.log('Hello'); // 输出: [SiYuanMemo][MyModule] Hello
 */
export function createLogger(tag: string): Logger {
  return new Logger(tag);
}

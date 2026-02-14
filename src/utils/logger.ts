/**
 * 统一的日志管理工具
 * 
 * 使用方法：
 * import { logger } from '@/utils/logger';
 * logger.log('My message', data);
 * logger.warn('Warning', data);
 * logger.error('Error', error);
 * 
 * 控制日志输出：
 * - 开发模式：所有日志都输出
 * - 生产模式：只输出 error 和 warn
 * - 可以通过 logger.setEnabled(false) 完全禁用
 */

export type LogLevel = 'debug' | 'log' | 'info' | 'warn' | 'error';

class Logger {
  private enabled: boolean = true;
  private isDevelopment: boolean = import.meta.env.DEV;
  private prefix: string = '[SiyuanMemo]';

  /**
   * 设置是否启用日志
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * 检查是否应该输出日志
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.enabled) return false;
    
    // 生产模式只输出 warn 和 error
    if (!this.isDevelopment) {
      return level === 'warn' || level === 'error';
    }
    
    // 开发模式输出所有日志
    return true;
  }

  /**
   * 格式化日志前缀
   */
  private formatPrefix(level: LogLevel, tag?: string): string {
    const parts = [this.prefix];
    if (tag) parts.push(`[${tag}]`);
    return parts.join(' ');
  }

  /**
   * Debug 日志（仅开发模式）
   */
  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatPrefix('debug'), message, ...args);
    }
  }

  /**
   * 普通日志
   */
  log(message: string, ...args: any[]): void {
    if (this.shouldLog('log')) {
      console.log(this.formatPrefix('log'), message, ...args);
    }
  }

  /**
   * 信息日志
   */
  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info(this.formatPrefix('info'), message, ...args);
    }
  }

  /**
   * 警告日志（生产模式也会输出）
   */
  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatPrefix('warn'), message, ...args);
    }
  }

  /**
   * 错误日志（生产模式也会输出）
   */
  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatPrefix('error'), message, ...args);
    }
  }

  /**
   * 分组日志
   */
  group(label: string): void {
    if (this.shouldLog('log')) {
      console.group(this.formatPrefix('log') + ' ' + label);
    }
  }

  /**
   * 结束分组
   */
  groupEnd(): void {
    if (this.shouldLog('log')) {
      console.groupEnd();
    }
  }

  /**
   * 创建带标签的日志器
   */
  withTag(tag: string): TaggedLogger {
    return new TaggedLogger(this, tag);
  }
}

/**
 * 带标签的日志器
 */
class TaggedLogger {
  constructor(
    private logger: Logger,
    private tag: string
  ) {}

  debug(message: string, ...args: any[]): void {
    this.logger.debug(`[${this.tag}] ${message}`, ...args);
  }

  log(message: string, ...args: any[]): void {
    this.logger.log(`[${this.tag}] ${message}`, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.logger.info(`[${this.tag}] ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.logger.warn(`[${this.tag}] ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.logger.error(`[${this.tag}] ${message}`, ...args);
  }

  group(label: string): void {
    this.logger.group(`[${this.tag}] ${label}`);
  }

  groupEnd(): void {
    this.logger.groupEnd();
  }
}

// 导出单例
export const logger = new Logger();

// 导出便捷方法
export const createLogger = (tag: string) => logger.withTag(tag);

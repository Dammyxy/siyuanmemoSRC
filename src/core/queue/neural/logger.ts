/**
 * Logger - 神经队列日志工具
 * 
 * 提供结构化日志记录功能。
 * 
 * Requirements: 9.2, 9.5, 9.6
 */

/**
 * 日志级别
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

/**
 * 错误日志接口
 */
export interface ErrorLog {
  timestamp: number;
  level: LogLevel;
  component: string;
  operation: string;
  cardId?: string;
  error: Error | string;
  context?: Record<string, any>;
}

/**
 * 神经队列日志记录器
 */
export class NeuralQueueLogger {
  private static readonly PREFIX = '[NeuralQueue]';
  private static readonly enabled = true; // 可以通过配置控制

  /**
   * 记录错误日志
   */
  static error(log: Omit<ErrorLog, 'timestamp' | 'level'>): void {
    if (!this.enabled) return;

    const fullLog: ErrorLog = {
      ...log,
      timestamp: Date.now(),
      level: LogLevel.ERROR,
    };

    console.error(
      `${this.PREFIX} [${log.component}] ${log.operation}`,
      {
        cardId: log.cardId,
        error: log.error,
        context: log.context,
      }
    );

    // 可以在这里添加日志持久化逻辑
    this.persistLog(fullLog);
  }

  /**
   * 记录警告日志
   */
  static warn(component: string, operation: string, message: string, context?: Record<string, any>): void {
    if (!this.enabled) return;

    console.warn(
      `${this.PREFIX} [${component}] ${operation}: ${message}`,
      context
    );
  }

  /**
   * 记录信息日志
   */
  static info(component: string, operation: string, message: string, context?: Record<string, any>): void {
    if (!this.enabled) return;

    console.log(
      `${this.PREFIX} [${component}] ${operation}: ${message}`,
      context
    );
  }

  /**
   * 记录调试日志
   */
  static debug(component: string, operation: string, message: string, context?: Record<string, any>): void {
    if (!this.enabled) return;

    console.debug(
      `${this.PREFIX} [${component}] ${operation}: ${message}`,
      context
    );
  }

  /**
   * 持久化日志（可选）
   * 
   * @param log 日志对象
   * @private
   */
  private static persistLog(log: ErrorLog): void {
    // TODO: 实现日志持久化
    // 可以保存到 localStorage 或发送到服务器
    try {
      const logs = this.getPersistedLogs();
      logs.push(log);
      
      // 只保留最近 100 条日志
      if (logs.length > 100) {
        logs.shift();
      }
      
      localStorage.setItem('neural-queue-logs', JSON.stringify(logs));
    } catch (error) {
      // 忽略持久化错误
      console.error('Failed to persist log:', error);
    }
  }

  /**
   * 获取持久化的日志
   */
  static getPersistedLogs(): ErrorLog[] {
    try {
      const logsJson = localStorage.getItem('neural-queue-logs');
      if (!logsJson) return [];
      return JSON.parse(logsJson);
    } catch {
      return [];
    }
  }

  /**
   * 清除持久化的日志
   */
  static clearPersistedLogs(): void {
    try {
      localStorage.removeItem('neural-queue-logs');
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  }
}

/**
 * 便捷的日志记录函数
 */
export const logger = {
  error: (log: Omit<ErrorLog, 'timestamp' | 'level'>) => NeuralQueueLogger.error(log),
  warn: (component: string, operation: string, message: string, context?: Record<string, any>) =>
    NeuralQueueLogger.warn(component, operation, message, context),
  info: (component: string, operation: string, message: string, context?: Record<string, any>) =>
    NeuralQueueLogger.info(component, operation, message, context),
  debug: (component: string, operation: string, message: string, context?: Record<string, any>) =>
    NeuralQueueLogger.debug(component, operation, message, context),
};

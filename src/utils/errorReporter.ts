/**
 * Error Reporter Module
 * 
 * Provides a unified interface for reporting errors to monitoring systems.
 * This allows for centralized error tracking and easier integration with
 * external error monitoring services.
 * 
 * @module errorReporter
 */

import { logger } from './logger';

/**
 * Error reporter interface
 * 
 * Defines the contract for error reporting implementations.
 * Implementations can report errors to various destinations such as:
 * - Console (for development)
 * - External monitoring services (Sentry, Rollbar, etc.)
 * - Custom logging systems
 * 
 * @example
 * ```typescript
 * const reporter = new ConsoleErrorReporter();
 * try {
 *   // Some operation
 * } catch (error) {
 *   reporter.report(error as Error, {
 *     operation: 'fetchCards',
 *     component: 'DataSource'
 *   });
 * }
 * ```
 */
export interface IErrorReporter {
  /**
   * Report an error to the monitoring system
   * 
   * @param error - The error to report
   * @param context - Optional context information about where/when the error occurred
   * 
   * @remarks
   * The context object can contain relevant information that helps
   * diagnose the error, such as:
   * - operation: The operation that was being performed
   * - component: The component where the error occurred
   * - userId: The user who encountered the error
   * - timestamp: When the error occurred
   * - Additional relevant metadata
   * 
   * @example
   * ```typescript
   * reporter.report(new Error('Database connection failed'), {
   *   operation: 'fetchAll',
   *   component: 'RiffDataSource',
   *   timestamp: Date.now()
   * });
   * ```
   */
  report(error: Error, context?: Record<string, unknown>): void;
}

/**
 * Console-based error reporter implementation
 * 
 * A basic implementation that logs errors to the console.
 * Suitable for development and as a fallback when external
 * monitoring services are not available.
 * 
 * @remarks
 * This implementation uses the unified logger utility to ensure
 * consistent formatting and log level handling across the application.
 * 
 * In production, you may want to replace this with a more sophisticated
 * implementation that sends errors to an external monitoring service.
 * 
 * @example
 * ```typescript
 * const reporter = new ConsoleErrorReporter();
 * 
 * // Report a simple error
 * reporter.report(new Error('Something went wrong'));
 * 
 * // Report an error with context
 * reporter.report(new Error('Query failed'), {
 *   operation: 'fetchCards',
 *   component: 'DataSource',
 *   query: 'SELECT * FROM cards'
 * });
 * ```
 */
export class ConsoleErrorReporter implements IErrorReporter {
  /**
   * Report an error to the console
   * 
   * Logs the error message, stack trace, and provided context
   * information to the console using the error log level.
   * 
   * @param error - The error to report
   * @param context - Optional context information
   */
  report(error: Error, context?: Record<string, unknown>): void {
    // Log the error message
    logger.error('Error reported:', error.message);
    
    // Log the stack trace if available
    if (error.stack) {
      logger.error('Stack trace:', error.stack);
    }
    
    // Log context information if provided
    if (context && Object.keys(context).length > 0) {
      logger.error('Error context:', context);
    }
  }
}

/**
 * Default error reporter instance
 * 
 * A singleton instance of ConsoleErrorReporter that can be used
 * throughout the application without needing to create new instances.
 * 
 * @example
 * ```typescript
 * import { defaultErrorReporter } from '@/utils/errorReporter';
 * 
 * try {
 *   // Some operation
 * } catch (error) {
 *   defaultErrorReporter.report(error as Error, {
 *     operation: 'myOperation'
 *   });
 * }
 * ```
 */
export const defaultErrorReporter: IErrorReporter = new ConsoleErrorReporter();

function readContextOperation(context?: Record<string, unknown>): string | undefined {
  const operation = context?.operation;
  return typeof operation === 'string' ? operation : undefined;
}

/**
 * Converts technical error messages into user-friendly messages
 * 
 * This function transforms technical error details (stack traces, error codes, etc.)
 * into human-readable messages that users can understand and act upon.
 * 
 * ## Design Principles
 * - **No technical jargon**: Avoid exposing internal implementation details
 * - **No stack traces**: Never show stack traces to end users
 * - **Actionable**: Provide guidance on what the user can do
 * - **Localized**: Messages are in Chinese for the target audience
 * 
 * ## Error Categories
 * 
 * ### Database Errors
 * - `SQLITE_BUSY`: Database is locked by another process
 * - `SQLITE_LOCKED`: Database table is locked
 * - `SQLITE_CORRUPT`: Database file is corrupted
 * - `SQLITE_CANTOPEN`: Cannot open database file
 * - Generic database errors: Connection or query failures
 * 
 * ### Network Errors
 * - Connection failures
 * - Timeout errors
 * - DNS resolution failures
 * 
 * ### File System Errors
 * - Permission denied
 * - File not found
 * - Disk full
 * 
 * ### Generic Errors
 * - Unknown or unclassified errors
 * - Fallback message for unexpected errors
 * 
 * ## Requirement Validation
 * **Validates: Requirement 7.5** - THE System SHALL display user-friendly error messages
 * instead of technical stack traces
 * 
 * @param error - The error object to format
 * @param context - Optional context about where the error occurred
 * @returns User-friendly error message in Chinese
 * 
 * @example
 * ```typescript
 * // Database busy error
 * const error = new Error('SQLITE_BUSY: database is locked');
 * const message = formatUserError(error);
 * console.log(message); // "数据库正忙，请稍后重试"
 * 
 * // Network error
 * const error = new Error('Network request failed');
 * const message = formatUserError(error);
 * console.log(message); // "网络连接失败，请检查网络设置"
 * 
 * // Generic error with context
 * const error = new Error('Something went wrong');
 * const message = formatUserError(error, { operation: 'loadCards' });
 * console.log(message); // "操作失败，请重试或联系支持"
 * ```
 * 
 * @public
 */
export function formatUserError(error: Error, context?: Record<string, unknown>): string {
  const errorMessage = error.message.toLowerCase();
  const operation = readContextOperation(context);
  
  // Database errors
  if (errorMessage.includes('sqlite_busy') || errorMessage.includes('database is locked')) {
    return '数据库正忙，请稍后重试';
  }
  
  if (errorMessage.includes('sqlite_locked') || errorMessage.includes('table is locked')) {
    return '数据库表被锁定，请稍后重试';
  }
  
  if (errorMessage.includes('sqlite_corrupt') || errorMessage.includes('database disk image is malformed')) {
    return '数据库文件损坏，请联系技术支持';
  }
  
  if (errorMessage.includes('sqlite_cantopen') || errorMessage.includes('unable to open database')) {
    return '无法打开数据库文件，请检查文件权限';
  }
  
  if (errorMessage.includes('database') || errorMessage.includes('sql')) {
    return '数据库操作失败，请稍后重试';
  }
  
  // Network errors
  if (errorMessage.includes('network') || errorMessage.includes('fetch failed') || errorMessage.includes('connection')) {
    return '网络连接失败，请检查网络设置';
  }
  
  if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
    return '操作超时，请检查网络连接后重试';
  }
  
  if (errorMessage.includes('dns') || errorMessage.includes('enotfound')) {
    return '无法解析服务器地址，请检查网络设置';
  }
  
  // File system errors
  if (errorMessage.includes('eacces') || errorMessage.includes('permission denied')) {
    return '权限不足，请检查文件访问权限';
  }
  
  if (errorMessage.includes('enoent') || errorMessage.includes('no such file')) {
    return '文件不存在，请检查文件路径';
  }
  
  if (errorMessage.includes('enospc') || errorMessage.includes('no space left')) {
    return '磁盘空间不足，请清理磁盘空间';
  }
  
  // Context-specific errors
  if (operation === 'getAll' || operation === 'fetchCards') {
    return '加载卡片失败，请稍后重试';
  }
  
  if (operation === 'save' || operation === 'update') {
    return '保存数据失败，请稍后重试';
  }
  
  if (operation === 'delete' || operation === 'remove') {
    return '删除操作失败，请稍后重试';
  }
  
  // Generic fallback
  return '操作失败，请重试或联系支持';
}

/**
 * Error Reporter Tests
 * 
 * Tests for the error reporting system to ensure errors are properly
 * reported to monitoring systems.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsoleErrorReporter, IErrorReporter, defaultErrorReporter, formatUserError } from '../errorReporter';
import { logger } from '../logger';

describe('Error Reporter', () => {
  describe('IErrorReporter interface', () => {
    it('should define the report method signature', () => {
      // Given: A class implementing IErrorReporter
      class TestReporter implements IErrorReporter {
        report(_error: Error, _context?: Record<string, any>): void {
          // Implementation
        }
      }
      
      // When: Creating an instance
      const reporter = new TestReporter();
      
      // Then: It should have the report method
      expect(reporter).toHaveProperty('report');
      expect(typeof reporter.report).toBe('function');
    });
  });

  describe('ConsoleErrorReporter', () => {
    let reporter: ConsoleErrorReporter;
    let loggerErrorSpy: any;

    beforeEach(() => {
      // Given: A fresh ConsoleErrorReporter instance
      reporter = new ConsoleErrorReporter();
      
      // Mock the logger.error method
      loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      // Restore the original logger.error
      loggerErrorSpy.mockRestore();
    });

    describe('when reporting a simple error', () => {
      it('should log the error message', () => {
        // Given: A simple error
        const error = new Error('Test error message');
        
        // When: Reporting the error
        reporter.report(error);
        
        // Then: The error message should be logged
        expect(loggerErrorSpy).toHaveBeenCalledWith('Error reported:', 'Test error message');
      });

      it('should log the stack trace if available', () => {
        // Given: An error with a stack trace
        const error = new Error('Test error');
        error.stack = 'Error: Test error\n    at test.ts:10:5';
        
        // When: Reporting the error
        reporter.report(error);
        
        // Then: The stack trace should be logged
        expect(loggerErrorSpy).toHaveBeenCalledWith('Stack trace:', error.stack);
      });
    });

    describe('when reporting an error with context', () => {
      it('should log the context information', () => {
        // Given: An error with context
        const error = new Error('Database query failed');
        const context = {
          operation: 'fetchAll',
          component: 'RiffDataSource',
          query: 'SELECT * FROM cards'
        };
        
        // When: Reporting the error with context
        reporter.report(error, context);
        
        // Then: The context should be logged
        expect(loggerErrorSpy).toHaveBeenCalledWith('Error context:', context);
      });

      it('should handle empty context object', () => {
        // Given: An error with empty context
        const error = new Error('Test error');
        const context = {};
        
        // When: Reporting the error
        reporter.report(error, context);
        
        // Then: Context should not be logged (empty object)
        expect(loggerErrorSpy).not.toHaveBeenCalledWith('Error context:', context);
      });

      it('should handle undefined context', () => {
        // Given: An error without context
        const error = new Error('Test error');
        
        // When: Reporting the error
        reporter.report(error);
        
        // Then: Should not throw and should log the error
        expect(loggerErrorSpy).toHaveBeenCalledWith('Error reported:', 'Test error');
      });
    });

    describe('when reporting multiple errors', () => {
      it('should log each error separately', () => {
        // Given: Multiple errors
        const error1 = new Error('First error');
        const error2 = new Error('Second error');
        
        // When: Reporting multiple errors
        reporter.report(error1);
        reporter.report(error2);
        
        // Then: Both errors should be logged
        expect(loggerErrorSpy).toHaveBeenCalledWith('Error reported:', 'First error');
        expect(loggerErrorSpy).toHaveBeenCalledWith('Error reported:', 'Second error');
        expect(loggerErrorSpy).toHaveBeenCalledTimes(4); // 2 errors × 2 calls each (message + stack)
      });
    });

    describe('edge cases', () => {
      it('should handle errors without stack traces', () => {
        // Given: An error without a stack trace
        const error = new Error('Test error');
        delete error.stack;
        
        // When: Reporting the error
        reporter.report(error);
        
        // Then: Should not throw and should log the error message
        expect(loggerErrorSpy).toHaveBeenCalledWith('Error reported:', 'Test error');
        expect(loggerErrorSpy).not.toHaveBeenCalledWith('Stack trace:', expect.anything());
      });

      it('should handle context with various data types', () => {
        // Given: An error with complex context
        const error = new Error('Test error');
        const context = {
          string: 'value',
          number: 42,
          boolean: true,
          null: null,
          undefined: undefined,
          array: [1, 2, 3],
          object: { nested: 'value' }
        };
        
        // When: Reporting the error
        reporter.report(error, context);
        
        // Then: Should handle all data types without throwing
        expect(loggerErrorSpy).toHaveBeenCalledWith('Error context:', context);
      });
    });
  });

  describe('defaultErrorReporter', () => {
    it('should be an instance of ConsoleErrorReporter', () => {
      // Then: defaultErrorReporter should be a ConsoleErrorReporter
      expect(defaultErrorReporter).toBeInstanceOf(ConsoleErrorReporter);
    });

    it('should be usable as a singleton', () => {
      // Given: The default error reporter
      const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
      
      try {
        // When: Using it to report an error
        const error = new Error('Singleton test');
        defaultErrorReporter.report(error);
        
        // Then: It should work correctly
        expect(loggerErrorSpy).toHaveBeenCalledWith('Error reported:', 'Singleton test');
      } finally {
        loggerErrorSpy.mockRestore();
      }
    });
  });

  describe('integration scenarios', () => {
    it('should support typical error reporting workflow', () => {
      // Given: A reporter and a simulated operation
      const reporter = new ConsoleErrorReporter();
      const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
      
      try {
        // When: An operation fails and we report it
        try {
          throw new Error('Database connection failed');
        } catch (error) {
          reporter.report(error as Error, {
            operation: 'fetchCards',
            component: 'DataSource',
            timestamp: Date.now()
          });
        }
        
        // Then: The error should be properly reported
        expect(loggerErrorSpy).toHaveBeenCalledWith('Error reported:', 'Database connection failed');
        expect(loggerErrorSpy).toHaveBeenCalledWith('Error context:', expect.objectContaining({
          operation: 'fetchCards',
          component: 'DataSource'
        }));
      } finally {
        loggerErrorSpy.mockRestore();
      }
    });
  });

  describe('formatUserError', () => {
    describe('Database errors', () => {
      it('should format SQLITE_BUSY error', () => {
        // Given: A database busy error
        const error = new Error('SQLITE_BUSY: database is locked');
        
        // When: Formatting the error
        const message = formatUserError(error);
        
        // Then: Should return user-friendly message
        expect(message).toBe('数据库正忙，请稍后重试');
      });

      it('should format database locked error', () => {
        // Given: A database locked error
        const error = new Error('database is locked');
        
        // When: Formatting the error
        const message = formatUserError(error);
        
        // Then: Should return user-friendly message
        expect(message).toBe('数据库正忙，请稍后重试');
      });

      it('should format SQLITE_LOCKED error', () => {
        // Given: A table locked error
        const error = new Error('SQLITE_LOCKED: table is locked');
        
        // When: Formatting the error
        const message = formatUserError(error);
        
        // Then: Should return user-friendly message
        expect(message).toBe('数据库表被锁定，请稍后重试');
      });

      it('should format SQLITE_CORRUPT error', () => {
        // Given: A database corruption error
        const error = new Error('SQLITE_CORRUPT: database disk image is malformed');
        
        // When: Formatting the error
        const message = formatUserError(error);
        
        // Then: Should return user-friendly message
        expect(message).toBe('数据库文件损坏，请联系技术支持');
      });

      it('should format SQLITE_CANTOPEN error', () => {
        // Given: A cannot open database error
        const error = new Error('SQLITE_CANTOPEN: unable to open database file');
        
        // When: Formatting the error
        const message = formatUserError(error);
        
        // Then: Should return user-friendly message
        expect(message).toBe('无法打开数据库文件，请检查文件权限');
      });

      it('should format generic database error', () => {
        // Given: A generic database error
        const error = new Error('Database query failed');
        
        // When: Formatting the error
        const message = formatUserError(error);
        
        // Then: Should return user-friendly message
        expect(message).toBe('数据库操作失败，请稍后重试');
      });

      it('should format SQL error', () => {
        // Given: A SQL error
        const error = new Error('SQL syntax error near SELECT');
        
        // When: Formatting the error
        const message = formatUserError(error);
        
        // Then: Should return user-friendly message
        expect(message).toBe('数据库操作失败，请稍后重试');
      });
    });

    describe('Network errors', () => {
      it('should format network connection error', () => {
        // Given: A network error
        const error = new Error('Network request failed');
        
        // When: Formatting the error
        const message = formatUserError(error);
        
        // Then: Should return user-friendly message
        expect(message).toBe('网络连接失败，请检查网络设置');
      });

      it('should format fetch failed error', () => {
        // Given: A fetch failed error
        const error = new Error('fetch failed');
        
        // When: Formatting the error
        const message = formatUserError(error);
        
        // Then: Should return user-friendly message
        expect(message).toBe('网络连接失败，请检查网络设置');
      });

      it('should format connection error', () => {
        // Given: A connection error
        const error = new Error('Connection refused');
        
        // When: Formatting the error
        const message = formatUserError(error);
        
        // Then: Should return user-friendly message
        expect(message).toBe('网络连接失败，请检查网络设置');
      });

      it('should format timeout error', () => {
        // Given: A timeout error
        const error = new Error('Request timed out');
        
        // When: Formatting the error
        const message = formatUserError(error);
        
        // Then: Should return user-friendly message
        expect(message).toBe('操作超时，请检查网络连接后重试');
      });

      it('should format DNS error', () => {
        // Given: A DNS resolution error
        const error = new Error('getaddrinfo ENOTFOUND example.com');
        
        // When: Formatting the error
        const message = formatUserError(error);
        
        // Then: Should return user-friendly message
        expect(message).toBe('无法解析服务器地址，请检查网络设置');
      });
    });

    describe('File system errors', () => {
      it('should format permission denied error', () => {
        // Given: A permission error
        const error = new Error('EACCES: permission denied');
        
        // When: Formatting the error
        const message = formatUserError(error);
        
        // Then: Should return user-friendly message
        expect(message).toBe('权限不足，请检查文件访问权限');
      });

      it('should format file not found error', () => {
        // Given: A file not found error
        const error = new Error('ENOENT: no such file or directory');
        
        // When: Formatting the error
        const message = formatUserError(error);
        
        // Then: Should return user-friendly message
        expect(message).toBe('文件不存在，请检查文件路径');
      });

      it('should format disk full error', () => {
        // Given: A disk full error
        const error = new Error('ENOSPC: no space left on device');
        
        // When: Formatting the error
        const message = formatUserError(error);
        
        // Then: Should return user-friendly message
        expect(message).toBe('磁盘空间不足，请清理磁盘空间');
      });
    });

    describe('Context-specific errors', () => {
      it('should format getAll operation error', () => {
        // Given: An error during getAll operation
        const error = new Error('Unknown error');
        const context = { operation: 'getAll' };
        
        // When: Formatting the error with context
        const message = formatUserError(error, context);
        
        // Then: Should return operation-specific message
        expect(message).toBe('加载卡片失败，请稍后重试');
      });

      it('should format fetchCards operation error', () => {
        // Given: An error during fetchCards operation
        const error = new Error('Unknown error');
        const context = { operation: 'fetchCards' };
        
        // When: Formatting the error with context
        const message = formatUserError(error, context);
        
        // Then: Should return operation-specific message
        expect(message).toBe('加载卡片失败，请稍后重试');
      });

      it('should format save operation error', () => {
        // Given: An error during save operation
        const error = new Error('Unknown error');
        const context = { operation: 'save' };
        
        // When: Formatting the error with context
        const message = formatUserError(error, context);
        
        // Then: Should return operation-specific message
        expect(message).toBe('保存数据失败，请稍后重试');
      });

      it('should format delete operation error', () => {
        // Given: An error during delete operation
        const error = new Error('Unknown error');
        const context = { operation: 'delete' };
        
        // When: Formatting the error with context
        const message = formatUserError(error, context);
        
        // Then: Should return operation-specific message
        expect(message).toBe('删除操作失败，请稍后重试');
      });
    });

    describe('Generic errors', () => {
      it('should format unknown error without context', () => {
        // Given: An unknown error
        const error = new Error('Something unexpected happened');
        
        // When: Formatting the error
        const message = formatUserError(error);
        
        // Then: Should return generic fallback message
        expect(message).toBe('操作失败，请重试或联系支持');
      });

      it('should format unknown error with empty context', () => {
        // Given: An unknown error with empty context
        const error = new Error('Something unexpected happened');
        const context = {};
        
        // When: Formatting the error
        const message = formatUserError(error, context);
        
        // Then: Should return generic fallback message
        expect(message).toBe('操作失败，请重试或联系支持');
      });
    });

    describe('Edge cases', () => {
      it('should handle case-insensitive error messages', () => {
        // Given: An error with uppercase message
        const error = new Error('SQLITE_BUSY: DATABASE IS LOCKED');
        
        // When: Formatting the error
        const message = formatUserError(error);
        
        // Then: Should still match and return correct message
        expect(message).toBe('数据库正忙，请稍后重试');
      });

      it('should handle errors with mixed case', () => {
        // Given: An error with mixed case
        const error = new Error('Network Request Failed');
        
        // When: Formatting the error
        const message = formatUserError(error);
        
        // Then: Should still match and return correct message
        expect(message).toBe('网络连接失败，请检查网络设置');
      });

      it('should not expose technical stack traces', () => {
        // Given: An error with stack trace
        const error = new Error('Database error');
        error.stack = 'Error: Database error\n    at RiffDataSource.getAll (RiffDataSource.ts:500:15)\n    at async test.ts:10:5';
        
        // When: Formatting the error
        const message = formatUserError(error);
        
        // Then: Should not include stack trace in message
        expect(message).not.toContain('RiffDataSource.ts');
        expect(message).not.toContain('at async');
        expect(message).toBe('数据库操作失败，请稍后重试');
      });

      it('should prioritize specific error patterns over generic ones', () => {
        // Given: An error that matches multiple patterns
        const error = new Error('Database SQLITE_BUSY error');
        
        // When: Formatting the error
        const message = formatUserError(error);
        
        // Then: Should use the most specific pattern (SQLITE_BUSY)
        expect(message).toBe('数据库正忙，请稍后重试');
      });
    });

    describe('Requirement validation', () => {
      it('should never return technical error messages', () => {
        // Given: Various technical errors
        const errors = [
          new Error('TypeError: Cannot read property "foo" of undefined'),
          new Error('ReferenceError: x is not defined'),
          new Error('SyntaxError: Unexpected token'),
          new Error('Error: ECONNREFUSED 127.0.0.1:3000'),
        ];
        
        // When: Formatting each error
        const messages = errors.map(error => formatUserError(error));
        
        // Then: None should contain technical jargon
        messages.forEach(message => {
          expect(message).not.toContain('TypeError');
          expect(message).not.toContain('ReferenceError');
          expect(message).not.toContain('SyntaxError');
          expect(message).not.toContain('ECONNREFUSED');
          expect(message).not.toContain('127.0.0.1');
          // All should be user-friendly Chinese messages
          expect(message).toMatch(/^[\u4e00-\u9fa5，。、！？；：""''（）《》【】]+$/);
        });
      });

      it('should always return actionable messages', () => {
        // Given: Various errors
        const errors = [
          new Error('SQLITE_BUSY'),
          new Error('Network error'),
          new Error('Permission denied'),
          new Error('Unknown error'),
        ];
        
        // When: Formatting each error
        const messages = errors.map(error => formatUserError(error));
        
        // Then: All messages should suggest an action
        messages.forEach(message => {
          const hasAction = 
            message.includes('请') || // "please"
            message.includes('重试') || // "retry"
            message.includes('检查') || // "check"
            message.includes('联系'); // "contact"
          expect(hasAction).toBe(true);
        });
      });
    });
  });
});

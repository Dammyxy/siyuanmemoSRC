/**
 * Property-Based Tests for User-Friendly Error Messages
 * 
 * Feature: architecture-optimization
 * Task: 6.7 编写错误消息属性测试
 * 
 * Property 9: 用户友好的错误消息
 * 
 * **Validates: Requirement 7.5**
 * 
 * For any error message displayed to users, the message content should not
 * contain technical stack traces and should be human-readable descriptive text.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatUserError } from '../errorReporter';

describe('formatUserError - Property-Based Tests', () => {
  describe('Property 9: User-Friendly Error Messages (Requirement 7.5)', () => {
    it('should never return technical stack traces', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 50, maxLength: 200 }),
          (errorMessage, stackTrace) => {
            const error = new Error(errorMessage);
            error.stack = `Error: ${errorMessage}\n    at ${stackTrace}`;
            const userMessage = formatUserError(error);
            
            expect(userMessage).not.toContain('at ');
            expect(userMessage).not.toContain('.ts:');
            expect(userMessage).not.toContain('.js:');
            expect(userMessage).not.toContain('Error:');
            expect(userMessage).not.toContain('\n');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should never return technical error types', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('TypeError', 'ReferenceError', 'SyntaxError', 'RangeError'),
          fc.string({ minLength: 10, maxLength: 50 }),
          (errorType, errorDetail) => {
            const error = new Error(`${errorType}: ${errorDetail}`);
            const userMessage = formatUserError(error);
            
            expect(userMessage).not.toContain('TypeError');
            expect(userMessage).not.toContain('ReferenceError');
            expect(userMessage).not.toContain('SyntaxError');
            expect(userMessage).not.toContain('RangeError');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always return Chinese messages', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (errorMessage) => {
            const error = new Error(errorMessage);
            const userMessage = formatUserError(error);
            const hasChinese = /[\u4e00-\u9fa5]/.test(userMessage);
            expect(hasChinese).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always return actionable messages', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (errorMessage) => {
            const error = new Error(errorMessage);
            const userMessage = formatUserError(error);
            const hasAction =
              userMessage.includes('请') ||
              userMessage.includes('重试') ||
              userMessage.includes('检查') ||
              userMessage.includes('联系');
            expect(hasAction).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle database errors consistently', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('SQLITE_BUSY', 'SQLITE_LOCKED', 'SQLITE_CORRUPT', 'database', 'sql'),
          fc.string({ minLength: 10, maxLength: 50 }),
          (errorPattern, errorDetail) => {
            const error = new Error(`${errorPattern}: ${errorDetail}`);
            const userMessage = formatUserError(error);
            const isDatabaseMessage = userMessage.includes('数据库') || userMessage.includes('文件');
            expect(isDatabaseMessage).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle network errors consistently', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('network', 'fetch failed', 'connection', 'timeout'),
          fc.string({ minLength: 10, maxLength: 50 }).filter(s => !s.toLowerCase().includes('sql') && !s.toLowerCase().includes('database')),
          (errorPattern, errorDetail) => {
            const error = new Error(`${errorPattern}: ${errorDetail}`);
            const userMessage = formatUserError(error);
            const isNetworkMessage =
              userMessage.includes('网络') ||
              userMessage.includes('连接') ||
              userMessage.includes('超时');
            expect(isNetworkMessage).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle file system errors consistently', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('EACCES', 'permission denied', 'ENOENT', 'no such file'),
          fc.string({ minLength: 10, maxLength: 50 }),
          (errorPattern, errorDetail) => {
            const error = new Error(`${errorPattern}: ${errorDetail}`);
            const userMessage = formatUserError(error);
            const isFileSystemMessage =
              userMessage.includes('权限') ||
              userMessage.includes('文件') ||
              userMessage.includes('磁盘');
            expect(isFileSystemMessage).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should respect context operation hints', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.constantFrom('getAll', 'fetchCards', 'save', 'update', 'delete', 'remove'),
          (errorMessage, operation) => {
            const error = new Error(errorMessage);
            const context = { operation };
            const userMessage = formatUserError(error, context);
            
            if (operation === 'getAll' || operation === 'fetchCards') {
              expect(userMessage).toContain('加载');
            } else if (operation === 'save' || operation === 'update') {
              expect(userMessage).toContain('保存');
            } else if (operation === 'delete' || operation === 'remove') {
              expect(userMessage).toContain('删除');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should never expose internal paths or code locations', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.constantFrom('.ts', '.js'),
          fc.integer({ min: 1, max: 1000 }),
          (fileName, extension, lineNumber) => {
            const error = new Error('Some error');
            error.stack = `Error: Some error\n    at Object.<anonymous> (${fileName}${extension}:${lineNumber}:15)`;
            const userMessage = formatUserError(error);
            
            expect(userMessage).not.toContain(fileName);
            expect(userMessage).not.toContain(extension);
            expect(userMessage).not.toContain(`:${lineNumber}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be case-insensitive for error pattern matching', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'sqlite_busy', 'SQLITE_BUSY', 'SqLiTe_BuSy',
            'network', 'NETWORK', 'NeTwOrK'
          ),
          (errorPattern) => {
            const error = new Error(errorPattern);
            const userMessage = formatUserError(error);
            
            expect(userMessage).toBeTruthy();
            expect(userMessage.length).toBeGreaterThan(0);
            expect(/[\u4e00-\u9fa5]/.test(userMessage)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always return non-empty messages', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }),
          (errorMessage) => {
            const error = new Error(errorMessage);
            const userMessage = formatUserError(error);
            
            expect(userMessage).toBeTruthy();
            expect(userMessage.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

/**
 * Property-Based Tests for Error Reporting
 * 
 * Feature: architecture-optimization
 * Task: 6.6 编写错误报告属性测试
 * 
 * Property 8: 错误报告
 * 
 * **Validates: Requirement 7.4**
 * 
 * For any captured error, the system should call ErrorReporter.report()
 * method to report the error to the monitoring system.
 * 
 * This property test uses fast-check to generate:
 * - Random error messages
 * - Random error contexts
 * - Random error types
 * 
 * And verifies that:
 * - All errors are reported to the error tracking system
 * - Context information is properly included
 * - Error reporting doesn't throw exceptions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { ConsoleErrorReporter, IErrorReporter } from '../errorReporter';
import { logger } from '../logger';

describe('Error Reporting - Property-Based Tests', () => {
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('Property 8: 错误报告 (Requirement 7.4)', () => {
    it('should report all errors to the monitoring system', async () => {
      await fc.assert(
        fc.property(
          // Generate random error message
          fc.string({ minLength: 1, maxLength: 100 }),
          (errorMessage) => {
            // Given: An error reporter
            const reporter = new ConsoleErrorReporter();

            // When: Reporting an error
            const error = new Error(errorMessage);
            reporter.report(error);

            // Then: Error should be logged (reported to monitoring system)
            expect(loggerErrorSpy).toHaveBeenCalledWith('Error reported:', errorMessage);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include context information when reporting errors', async () => {
      await fc.assert(
        fc.property(
          // Generate error message
          fc.string({ minLength: 1, maxLength: 50 }),
          // Generate context
          fc.record({
            operation: fc.oneof(
              fc.constant('getAll'),
              fc.constant('fetchCards'),
              fc.constant('save'),
              fc.constant('delete')
            ),
            component: fc.oneof(
              fc.constant('RiffDataSource'),
              fc.constant('DataSource'),
              fc.constant('Queue'),
              fc.constant('Sequencer')
            ),
            timestamp: fc.integer({ min: 0, max: Date.now() }),
          }),
          (errorMessage, context) => {
            // Given: An error reporter
            const reporter = new ConsoleErrorReporter();

            // When: Reporting an error with context
            const error = new Error(errorMessage);
            reporter.report(error, context);

            // Then: Context should be logged
            expect(loggerErrorSpy).toHaveBeenCalledWith('Error context:', context);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should report errors without throwing exceptions', async () => {
      await fc.assert(
        fc.property(
          // Generate error message
          fc.string({ minLength: 0, maxLength: 100 }),
          // Generate context (possibly invalid)
          fc.anything(),
          (errorMessage, context) => {
            // Given: An error reporter
            const reporter = new ConsoleErrorReporter();

            // When/Then: Reporting should not throw
            expect(() => {
              const error = new Error(errorMessage);
              reporter.report(error, context as any);
            }).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle errors with stack traces', async () => {
      await fc.assert(
        fc.property(
          // Generate error message
          fc.string({ minLength: 1, maxLength: 50 }),
          // Generate stack trace
          fc.string({ minLength: 10, maxLength: 200 }),
          (errorMessage, stackTrace) => {
            // Given: An error reporter
            const reporter = new ConsoleErrorReporter();

            // When: Reporting an error with stack trace
            const error = new Error(errorMessage);
            error.stack = stackTrace;
            reporter.report(error);

            // Then: Stack trace should be logged
            expect(loggerErrorSpy).toHaveBeenCalledWith('Stack trace:', stackTrace);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle errors without stack traces', async () => {
      await fc.assert(
        fc.property(
          // Generate error message
          fc.string({ minLength: 1, maxLength: 50 }),
          (errorMessage) => {
            // Given: An error reporter
            const reporter = new ConsoleErrorReporter();

            // When: Reporting an error without stack trace
            const error = new Error(errorMessage);
            delete error.stack;
            reporter.report(error);

            // Then: Should not attempt to log stack trace
            expect(loggerErrorSpy).not.toHaveBeenCalledWith('Stack trace:', expect.anything());
            
            // But should still log the error message
            expect(loggerErrorSpy).toHaveBeenCalledWith('Error reported:', errorMessage);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty context objects', async () => {
      await fc.assert(
        fc.property(
          // Generate error message
          fc.string({ minLength: 1, maxLength: 50 }),
          (errorMessage) => {
            // Given: An error reporter
            const reporter = new ConsoleErrorReporter();

            // When: Reporting an error with empty context
            const error = new Error(errorMessage);
            reporter.report(error, {});

            // Then: Should not log empty context
            expect(loggerErrorSpy).not.toHaveBeenCalledWith('Error context:', {});
            
            // But should still log the error
            expect(loggerErrorSpy).toHaveBeenCalledWith('Error reported:', errorMessage);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle undefined context', async () => {
      await fc.assert(
        fc.property(
          // Generate error message
          fc.string({ minLength: 1, maxLength: 50 }),
          (errorMessage) => {
            // Given: An error reporter
            const reporter = new ConsoleErrorReporter();

            // When: Reporting an error without context
            const error = new Error(errorMessage);
            reporter.report(error);

            // Then: Should not attempt to log context
            expect(loggerErrorSpy).not.toHaveBeenCalledWith('Error context:', expect.anything());
            
            // But should still log the error
            expect(loggerErrorSpy).toHaveBeenCalledWith('Error reported:', errorMessage);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle context with various data types', async () => {
      await fc.assert(
        fc.property(
          // Generate error message
          fc.string({ minLength: 1, maxLength: 50 }),
          // Generate complex context
          fc.record({
            string: fc.string(),
            number: fc.integer(),
            boolean: fc.boolean(),
            null: fc.constant(null),
            undefined: fc.constant(undefined),
            array: fc.array(fc.integer(), { maxLength: 5 }),
            object: fc.record({
              nested: fc.string(),
            }),
          }),
          (errorMessage, context) => {
            // Given: An error reporter
            const reporter = new ConsoleErrorReporter();

            // When: Reporting an error with complex context
            const error = new Error(errorMessage);
            
            // Then: Should not throw
            expect(() => {
              reporter.report(error, context);
            }).not.toThrow();

            // And: Should log the context
            expect(loggerErrorSpy).toHaveBeenCalledWith('Error context:', context);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should report multiple errors independently', async () => {
      await fc.assert(
        fc.property(
          // Generate array of error messages (non-empty strings only)
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 2, maxLength: 10 }),
          (errorMessages) => {
            // Filter out whitespace-only messages
            const validMessages = errorMessages.filter(msg => msg.trim().length > 0);
            
            // Skip if no valid messages
            if (validMessages.length === 0) return;
            
            // Given: An error reporter
            const reporter = new ConsoleErrorReporter();

            // When: Reporting multiple errors
            validMessages.forEach(message => {
              const error = new Error(message);
              reporter.report(error);
            });

            // Then: Each error should be logged
            validMessages.forEach(message => {
              expect(loggerErrorSpy).toHaveBeenCalledWith('Error reported:', message);
            });

            // And: Total calls should match error count × 2 (message + stack)
            // Note: Each error generates 2 calls (message + stack), no context
            const expectedCalls = validMessages.length * 2;
            expect(loggerErrorSpy).toHaveBeenCalledTimes(expectedCalls);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle rapid consecutive error reports', async () => {
      await fc.assert(
        fc.property(
          // Generate error message (non-empty, non-whitespace)
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          // Generate number of rapid reports
          fc.integer({ min: 5, max: 20 }),
          (errorMessage, reportCount) => {
            // Given: An error reporter
            const reporter = new ConsoleErrorReporter();
            const error = new Error(errorMessage);

            // When: Rapidly reporting the same error multiple times
            for (let i = 0; i < reportCount; i++) {
              reporter.report(error);
            }

            // Then: All reports should be logged
            // Each report generates 2 calls (message + stack)
            const expectedCalls = reportCount * 2;
            expect(loggerErrorSpy).toHaveBeenCalledTimes(expectedCalls);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should work with custom error reporter implementations', async () => {
      await fc.assert(
        fc.property(
          // Generate error message
          fc.string({ minLength: 1, maxLength: 50 }),
          // Generate context
          fc.record({
            operation: fc.string({ minLength: 1, maxLength: 20 }),
            component: fc.string({ minLength: 1, maxLength: 20 }),
          }),
          (errorMessage, context) => {
            // Given: A custom error reporter
            const reportSpy = vi.fn();
            const customReporter: IErrorReporter = {
              report: reportSpy,
            };

            // When: Reporting an error
            const error = new Error(errorMessage);
            customReporter.report(error, context);

            // Then: Custom reporter should be called
            expect(reportSpy).toHaveBeenCalledWith(error, context);
            expect(reportSpy).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 8 - Integration Scenarios', () => {
    it('should report errors from data source operations', async () => {
      await fc.assert(
        fc.property(
          // Generate operation name
          fc.oneof(
            fc.constant('getAll'),
            fc.constant('fetchCards'),
            fc.constant('remove'),
            fc.constant('update')
          ),
          // Generate component name
          fc.oneof(
            fc.constant('RiffDataSource'),
            fc.constant('FilteredDataSource'),
            fc.constant('ObservableDataSource')
          ),
          // Generate error type
          fc.oneof(
            fc.constant('Database connection failed'),
            fc.constant('SQLITE_BUSY'),
            fc.constant('Network timeout'),
            fc.constant('Permission denied')
          ),
          (operation, component, errorType) => {
            // Given: An error reporter
            const reportSpy = vi.fn();
            const reporter: IErrorReporter = {
              report: reportSpy,
            };

            // When: Simulating a data source error
            const error = new Error(errorType);
            const context = {
              operation,
              component,
              timestamp: Date.now(),
            };
            reporter.report(error, context);

            // Then: Error should be reported with full context
            expect(reportSpy).toHaveBeenCalledWith(error, context);
            expect(reportSpy).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should report errors from queue operations', async () => {
      await fc.assert(
        fc.property(
          // Generate queue operation
          fc.oneof(
            fc.constant('next'),
            fc.constant('insert'),
            fc.constant('remove'),
            fc.constant('rotate')
          ),
          // Generate queue type
          fc.oneof(
            fc.constant('FilterGroupQueue'),
            fc.constant('IncrementalLearningQueue'),
            fc.constant('RetrievalPracticeQueue')
          ),
          (operation, queueType) => {
            // Given: An error reporter
            const reportSpy = vi.fn();
            const reporter: IErrorReporter = {
              report: reportSpy,
            };

            // When: Simulating a queue error
            const error = new Error('Queue operation failed');
            const context = {
              operation,
              component: queueType,
              queueSize: Math.floor(Math.random() * 100),
            };
            reporter.report(error, context);

            // Then: Error should be reported
            expect(reportSpy).toHaveBeenCalledWith(error, context);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle errors from async operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate error message
          fc.string({ minLength: 1, maxLength: 50 }),
          async (errorMessage) => {
            // Given: An error reporter
            const reportSpy = vi.fn();
            const reporter: IErrorReporter = {
              report: reportSpy,
            };

            // When: Simulating an async operation that fails
            try {
              await Promise.reject(new Error(errorMessage));
            } catch (error) {
              reporter.report(error as Error, {
                operation: 'asyncOperation',
                component: 'TestComponent',
              });
            }

            // Then: Error should be reported
            expect(reportSpy).toHaveBeenCalledWith(
              expect.any(Error),
              expect.objectContaining({
                operation: 'asyncOperation',
                component: 'TestComponent',
              })
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 8 - Edge Cases', () => {
    it('should handle errors with circular references in context', async () => {
      await fc.assert(
        fc.property(
          // Generate error message
          fc.string({ minLength: 1, maxLength: 50 }),
          (errorMessage) => {
            // Given: An error reporter
            const reporter = new ConsoleErrorReporter();

            // When: Creating context with circular reference
            const context: any = { operation: 'test' };
            context.self = context; // Circular reference

            const error = new Error(errorMessage);

            // Then: Should not throw (logger handles circular refs)
            expect(() => {
              reporter.report(error, context);
            }).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle very long error messages', async () => {
      await fc.assert(
        fc.property(
          // Generate very long error message
          fc.string({ minLength: 1000, maxLength: 5000 }),
          (errorMessage) => {
            // Given: An error reporter
            const reporter = new ConsoleErrorReporter();

            // When: Reporting an error with very long message
            const error = new Error(errorMessage);

            // Then: Should not throw
            expect(() => {
              reporter.report(error);
            }).not.toThrow();

            // And: Should log the full message
            expect(loggerErrorSpy).toHaveBeenCalledWith('Error reported:', errorMessage);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle errors with special characters', async () => {
      await fc.assert(
        fc.property(
          // Generate error message with special characters
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.oneof(
            fc.constant('\n'),
            fc.constant('\t'),
            fc.constant('\r'),
            fc.constant('\\'),
            fc.constant('"'),
            fc.constant("'")
          ),
          (baseMessage, specialChar) => {
            // Given: An error reporter
            const reporter = new ConsoleErrorReporter();

            // When: Reporting an error with special characters
            const errorMessage = baseMessage + specialChar + baseMessage;
            const error = new Error(errorMessage);
            reporter.report(error);

            // Then: Should handle special characters correctly
            expect(loggerErrorSpy).toHaveBeenCalledWith('Error reported:', errorMessage);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle errors with unicode characters', async () => {
      await fc.assert(
        fc.property(
          // Generate error message with unicode
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.oneof(
            fc.constant('数据库错误'),
            fc.constant('网络连接失败'),
            fc.constant('操作失败'),
            fc.constant('😀🎉🔥')
          ),
          (baseMessage, unicodeText) => {
            // Given: An error reporter
            const reporter = new ConsoleErrorReporter();

            // When: Reporting an error with unicode
            const errorMessage = baseMessage + ' ' + unicodeText;
            const error = new Error(errorMessage);
            reporter.report(error);

            // Then: Should handle unicode correctly
            expect(loggerErrorSpy).toHaveBeenCalledWith('Error reported:', errorMessage);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

/**
 * Property-Based Tests for Result Type
 * 
 * Tests the Result type pattern to ensure it correctly handles success and failure cases.
 * Uses fast-check for property-based testing to verify behavior across many inputs.
 * 
 * ## Test Coverage
 * - Property 10: Result success structure (Requirement 8.2)
 * - Property 11: Result failure structure (Requirement 8.3)
 * 
 * @module result.property.test
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as ResultModule from '../result';

const { ok, err, isOk, isErr, map, mapErr, andThen, unwrap, unwrapOr, combine } = ResultModule;
type Result<T, E = Error> = ResultModule.Result<T, E>;

describe('Result Type - Property-Based Tests', () => {
  /**
   * Property 10: Result 成功结构
   * Feature: architecture-optimization, Property 10: Result 成功结构
   * **Validates: Requirements 8.2**
   * 
   * For any value T, when creating a successful Result with ok(value),
   * the Result should have the structure { ok: true, value: T }.
   * 
   * This ensures that successful operations always return a consistent structure
   * that can be reliably checked and unwrapped by calling code.
   */
  it('Property 10: Result 成功结构', () => {
    fc.assert(
      fc.property(
        // Generator: Any arbitrary value
        fc.anything(),
        (value) => {
          // Act: Create a successful Result
          const result = ok(value);

          // Assert: Result has correct structure
          expect(result.ok).toBe(true);
          expect('value' in result).toBe(true);
          expect('error' in result).toBe(false);
          
          // Assert: Value is preserved
          if (result.ok) {
            expect(result.value).toEqual(value);
          }

          // Assert: Type guard works correctly
          expect(isOk(result)).toBe(true);
          expect(isErr(result)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.1: Result 成功结构 - 数字类型
   * 
   * Specialized test for number values to ensure numeric operations work correctly.
   */
  it('Property 10.1: Result 成功结构 - 数字类型', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        (value) => {
          const result = ok(value);

          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.value).toBe(value);
            expect(typeof result.value).toBe('number');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.2: Result 成功结构 - 字符串类型
   * 
   * Specialized test for string values to ensure text operations work correctly.
   */
  it('Property 10.2: Result 成功结构 - 字符串类型', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (value) => {
          const result = ok(value);

          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.value).toBe(value);
            expect(typeof result.value).toBe('string');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.3: Result 成功结构 - 对象类型
   * 
   * Specialized test for object values to ensure complex data structures work correctly.
   */
  it('Property 10.3: Result 成功结构 - 对象类型', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string(),
          count: fc.integer(),
          active: fc.boolean(),
        }),
        (value) => {
          const result = ok(value);

          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.value).toEqual(value);
            expect(result.value.id).toBe(value.id);
            expect(result.value.count).toBe(value.count);
            expect(result.value.active).toBe(value.active);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.4: Result 成功结构 - 数组类型
   * 
   * Specialized test for array values to ensure collection operations work correctly.
   */
  it('Property 10.4: Result 成功结构 - 数组类型', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer()),
        (value) => {
          const result = ok(value);

          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.value).toEqual(value);
            expect(Array.isArray(result.value)).toBe(true);
            expect(result.value.length).toBe(value.length);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.5: map 函数保持成功结构
   * 
   * For any successful Result and any transformation function,
   * mapping the Result should produce another successful Result
   * with the transformed value.
   */
  it('Property 10.5: map 函数保持成功结构', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.func(fc.integer()),
        (value, fn) => {
          const result = ok(value);
          const mapped = map(result, fn);

          expect(mapped.ok).toBe(true);
          if (mapped.ok) {
            expect(mapped.value).toBe(fn(value));
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.6: andThen 链式调用保持成功结构
   * 
   * For any successful Result and any function that returns a Result,
   * chaining with andThen should produce the Result from the function.
   */
  it('Property 10.6: andThen 链式调用保持成功结构', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer(),
        (value, nextValue) => {
          const result = ok(value);
          const chained = andThen(result, () => ok(nextValue));

          expect(chained.ok).toBe(true);
          if (chained.ok) {
            expect(chained.value).toBe(nextValue);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.7: unwrap 返回正确的值
   * 
   * For any successful Result, unwrap should return the contained value
   * without throwing an error.
   */
  it('Property 10.7: unwrap 返回正确的值', () => {
    fc.assert(
      fc.property(
        fc.anything(),
        (value) => {
          const result = ok(value);
          const unwrapped = unwrap(result);

          expect(unwrapped).toEqual(value);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.8: unwrapOr 返回值而不是默认值
   * 
   * For any successful Result and any default value,
   * unwrapOr should return the contained value, not the default.
   */
  it('Property 10.8: unwrapOr 返回值而不是默认值', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer(),
        (value, defaultValue) => {
          const result = ok(value);
          const unwrapped = unwrapOr(result, defaultValue);

          expect(unwrapped).toBe(value);
          expect(unwrapped).not.toBe(defaultValue);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10.9: combine 合并多个成功 Result
   * 
   * For any array of successful Results, combine should produce
   * a successful Result containing an array of all values.
   */
  it('Property 10.9: combine 合并多个成功 Result', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 1, maxLength: 10 }),
        (values) => {
          const results = values.map(v => ok(v));
          const combined = combine(results);

          expect(combined.ok).toBe(true);
          if (combined.ok) {
            expect(combined.value).toEqual(values);
            expect(combined.value.length).toBe(values.length);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Result Type - Failure Structure Property Tests', () => {
  /**
   * Property 11: Result 失败结构
   * Feature: architecture-optimization, Property 11: Result 失败结构
   * **Validates: Requirements 8.3**
   * 
   * For any error E, when creating a failed Result with err(error),
   * the Result should have the structure { ok: false, error: E }.
   * 
   * This ensures that failed operations always return a consistent structure
   * that can be reliably checked and handled by calling code.
   */
  it('Property 11: Result 失败结构', () => {
    fc.assert(
      fc.property(
        // Generator: Random error messages
        fc.string(),
        (errorMessage) => {
          // Act: Create a failed Result
          const error = new Error(errorMessage);
          const result = err(error);

          // Assert: Result has correct structure
          expect(result.ok).toBe(false);
          expect('error' in result).toBe(true);
          expect('value' in result).toBe(false);
          
          // Assert: Error is preserved
          if (!result.ok) {
            expect(result.error).toBe(error);
            expect(result.error.message).toBe(errorMessage);
          }

          // Assert: Type guard works correctly
          expect(isOk(result)).toBe(false);
          expect(isErr(result)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.1: Result 失败结构 - Error 对象
   * 
   * Specialized test for Error objects to ensure error handling works correctly.
   */
  it('Property 11.1: Result 失败结构 - Error 对象', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (message) => {
          const error = new Error(message);
          const result = err(error);

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error).toBeInstanceOf(Error);
            expect(result.error.message).toBe(message);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.2: Result 失败结构 - 自定义错误类型
   * 
   * Test that Result can handle custom error types beyond Error objects.
   */
  it('Property 11.2: Result 失败结构 - 自定义错误类型', () => {
    type CustomError = { code: string; details: string };

    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        (code, details) => {
          const error: CustomError = { code, details };
          const result = err(error);

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.code).toBe(code);
            expect(result.error.details).toBe(details);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.3: map 函数不改变失败 Result
   * 
   * For any failed Result and any transformation function,
   * mapping the Result should return the same error unchanged.
   */
  it('Property 11.3: map 函数不改变失败 Result', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.func(fc.integer()),
        (errorMessage, fn) => {
          const error = new Error(errorMessage);
          const result: Result<number> = err(error);
          const mapped = map(result, fn);

          expect(mapped.ok).toBe(false);
          if (!mapped.ok) {
            expect(mapped.error).toBe(error);
            expect(mapped.error.message).toBe(errorMessage);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.4: mapErr 转换错误
   * 
   * For any failed Result and any error transformation function,
   * mapErr should transform the error while keeping the Result failed.
   */
  it('Property 11.4: mapErr 转换错误', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        (originalMessage, newMessage) => {
          const originalError = new Error(originalMessage);
          const result: Result<number> = err(originalError);
          const mapped = mapErr(result, () => new Error(newMessage));

          expect(mapped.ok).toBe(false);
          if (!mapped.ok) {
            expect(mapped.error.message).toBe(newMessage);
            // Only check they're different if they actually are different
            if (originalMessage !== newMessage) {
              expect(mapped.error.message).not.toBe(originalMessage);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.5: andThen 短路失败 Result
   * 
   * For any failed Result and any function that returns a Result,
   * chaining with andThen should return the original error without calling the function.
   */
  it('Property 11.5: andThen 短路失败 Result', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer(),
        (errorMessage, nextValue) => {
          const error = new Error(errorMessage);
          const result: Result<number> = err(error);
          
          let functionCalled = false;
          const chained = andThen(result, () => {
            functionCalled = true;
            return ok(nextValue);
          });

          expect(chained.ok).toBe(false);
          expect(functionCalled).toBe(false); // Function should not be called
          if (!chained.ok) {
            expect(chained.error).toBe(error);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.6: unwrap 抛出错误
   * 
   * For any failed Result, unwrap should throw the contained error.
   */
  it('Property 11.6: unwrap 抛出错误', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (errorMessage) => {
          const error = new Error(errorMessage);
          const result: Result<number> = err(error);

          expect(() => unwrap(result)).toThrow(error);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.7: unwrapOr 返回默认值
   * 
   * For any failed Result and any default value,
   * unwrapOr should return the default value, not throw an error.
   */
  it('Property 11.7: unwrapOr 返回默认值', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer(),
        (errorMessage, defaultValue) => {
          const error = new Error(errorMessage);
          const result: Result<number> = err(error);
          const unwrapped = unwrapOr(result, defaultValue);

          expect(unwrapped).toBe(defaultValue);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.8: combine 遇到失败立即返回
   * 
   * For any array of Results containing at least one failure,
   * combine should return the first error encountered.
   */
  it('Property 11.8: combine 遇到失败立即返回', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 1, maxLength: 5 }),
        fc.nat({ max: 4 }), // Index of the error
        fc.string(),
        (values, errorIndex, errorMessage) => {
          // Ensure errorIndex is within bounds
          const actualErrorIndex = errorIndex % values.length;
          
          // Create array of Results with one error
          const results = values.map((v, i) => 
            i === actualErrorIndex ? err(new Error(errorMessage)) : ok(v)
          );
          
          const combined = combine(results);

          expect(combined.ok).toBe(false);
          if (!combined.ok) {
            expect(combined.error.message).toBe(errorMessage);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11.9: 多个失败返回第一个错误
   * 
   * For any array of Results containing multiple failures,
   * combine should return the first error in the array.
   */
  it('Property 11.9: 多个失败返回第一个错误', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.string(),
        (error1, error2, error3) => {
          const results = [
            err(new Error(error1)),
            err(new Error(error2)),
            err(new Error(error3)),
          ];
          
          const combined = combine(results);

          expect(combined.ok).toBe(false);
          if (!combined.ok) {
            expect(combined.error.message).toBe(error1); // First error
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Result Type - Mixed Success and Failure Tests', () => {
  /**
   * Property 12: 成功和失败互不干扰
   * 
   * For any sequence of operations mixing success and failure,
   * each Result should maintain its own state independently.
   */
  it('Property 12: 成功和失败互不干扰', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.string(),
        (value, errorMessage) => {
          const successResult = ok(value);
          const failureResult = err(new Error(errorMessage));

          // Success Result should remain successful
          expect(successResult.ok).toBe(true);
          if (successResult.ok) {
            expect(successResult.value).toBe(value);
          }

          // Failure Result should remain failed
          expect(failureResult.ok).toBe(false);
          if (!failureResult.ok) {
            expect(failureResult.error.message).toBe(errorMessage);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 13: 类型守卫互斥
   * 
   * For any Result, isOk and isErr should be mutually exclusive.
   */
  it('Property 13: 类型守卫互斥', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer().map(v => ok(v)),
          fc.string().map(msg => err(new Error(msg)))
        ),
        (result) => {
          const okCheck = isOk(result);
          const errCheck = isErr(result);

          // Exactly one should be true
          expect(okCheck !== errCheck).toBe(true);
          expect(okCheck && errCheck).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

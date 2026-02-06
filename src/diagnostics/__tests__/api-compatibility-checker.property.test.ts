/**
 * API Compatibility Checker Tests
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ApiCompatibilityChecker } from '../validators/ApiCompatibilityChecker';
import type { ApiClassSignature, ApiMethodSignature } from '../types';

describe('ApiCompatibilityChecker', () => {
    /**
     * Feature: queue-architecture-diagnosis, Property 17: API 兼容性保持
     *
     * 对于任何公共 API 方法，当新旧签名一致时，兼容性检查应该通过。
     */
    it('Feature: queue-architecture-diagnosis, Property 17: API compatibility preserved for identical signatures', () => {
        const checker = new ApiCompatibilityChecker();

        const methodArb = fc.record({
            name: fc.string({ minLength: 1, maxLength: 12 }),
            parameters: fc.array(fc.string({ minLength: 1, maxLength: 8 }), { maxLength: 3 }),
            returnType: fc.string({ minLength: 1, maxLength: 12 }),
        }) as fc.Arbitrary<ApiMethodSignature>;

        fc.assert(
            fc.property(
                fc.array(methodArb, { minLength: 1, maxLength: 5 }),
                (methods) => {
                    const oldClasses: ApiClassSignature[] = [
                        { className: 'TestQueue', methods },
                    ];
                    const newClasses: ApiClassSignature[] = [
                        { className: 'TestQueue', methods },
                    ];

                    const result = checker.compareClassApis(oldClasses, newClasses);
                    expect(result.isCompatible).toBe(true);
                    expect(result.summary.breakingChanges).toBe(0);
                }
            ),
            { numRuns: 50 }
        );
    });

    it('should detect breaking changes in method signatures', () => {
        const checker = new ApiCompatibilityChecker();

        const oldClasses: ApiClassSignature[] = [
            {
                className: 'RetrievalPracticeQueue',
                methods: [
                    { name: 'getAllCards', parameters: [], returnType: 'Promise<FSRSCard[]>' },
                    { name: 'addCard', parameters: ['string'], returnType: 'Promise<void>' },
                ],
            },
        ];

        const newClasses: ApiClassSignature[] = [
            {
                className: 'RetrievalPracticeQueue',
                methods: [
                    { name: 'getAllCards', parameters: [], returnType: 'Promise<FSRSCard[]>' },
                    { name: 'addCard', parameters: ['number'], returnType: 'Promise<void>' },
                ],
            },
        ];

        const result = checker.compareClassApis(oldClasses, newClasses);
        expect(result.isCompatible).toBe(false);
        expect(result.summary.breakingChanges).toBeGreaterThan(0);
        expect(result.issues.some(issue => issue.methodName === 'addCard')).toBe(true);
    });
});


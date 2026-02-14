/**
 * ApiCompatibilityChecker report tests
 */

import { describe, it, expect } from 'vitest';
import { ApiCompatibilityChecker } from '../validators/ApiCompatibilityChecker';
import type { ApiCompatibilityResult } from '../types';

describe('ApiCompatibilityChecker report', () => {
    it('should generate compatibility report summary', () => {
        const checker = new ApiCompatibilityChecker();
        const result: ApiCompatibilityResult = {
            isCompatible: false,
            issues: [
                {
                    className: 'TestQueue',
                    methodName: 'getAllCards',
                    issue: 'Method signature changed',
                    severity: 'error',
                    oldSignature: 'getAllCards() => Promise<FSRSCard[]>',
                    newSignature: 'getAllCards() => Promise<any[]>',
                },
            ],
            summary: {
                comparedClasses: 1,
                comparedMethods: 1,
                breakingChanges: 1,
                warnings: 0,
            },
        };

        const report = checker.generateCompatibilityReport(result);
        expect(report).toContain('# 队列 API 兼容性报告');
        expect(report).toContain('破坏性变更');
        expect(report).toContain('TestQueue');
        expect(report).toContain('getAllCards');
    });
});


/**
 * Feature: queue-architecture-diagnosis, Property 10-11: Runtime validation
 *
 * Property 10: 类型不匹配错误报告
 * Property 11: 消费者类型验证
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuntimeTypeValidator, TypeMismatchError } from '../type-guards';
import { fc, PROPERTY_TEST_CONFIG } from './setup';

describe('RuntimeTypeValidator Properties', () => {
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
        process.env.NODE_ENV = 'development';
    });

    afterEach(() => {
        process.env.NODE_ENV = originalEnv;
    });

    it('Property 10: Type mismatch error reporting', () => {
        const invalidArray = fc.array(fc.oneof(fc.integer(), fc.string(), fc.boolean()), { minLength: 1 });
        const nonArray = fc.oneof(fc.integer(), fc.string(), fc.boolean());

        fc.assert(
            fc.property(invalidArray, nonArray, (arrValue, nonArrayValue) => {
                const validator = new RuntimeTypeValidator();

                expect(() => validator.validateQueueReturnType('Queue', 'getAllCards', arrValue))
                    .toThrow(TypeMismatchError);

                expect(() => validator.validateQueueReturnType('Queue', 'getAllCards', nonArrayValue))
                    .toThrow(TypeMismatchError);
            }),
            PROPERTY_TEST_CONFIG
        );
    });

    it('Property 11: Consumer type validation', () => {
        const invalidValues = fc.array(fc.oneof(fc.integer(), fc.string(), fc.boolean()), { minLength: 1, maxLength: 3 });
        fc.assert(
            fc.property(invalidValues, (values) => {
                const validator = new RuntimeTypeValidator();
                expect(() => validator.validateConsumerCardType('Consumer', values))
                    .toThrow(TypeMismatchError);
            }),
            PROPERTY_TEST_CONFIG
        );
    });
});

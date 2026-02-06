/**
 * Feature: queue-architecture-diagnosis, Property 5-7: Interface validation
 *
 * Property 5: 接口实现完整性
 * Property 6: 缺失方法检测
 * Property 7: 返回类型一致性
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { InterfaceValidator } from '../validators/InterfaceValidator';
import { fc, PROPERTY_TEST_CONFIG } from './setup';

const createTempProject = (files: Record<string, string>): string => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interface-validator-'));
    for (const [relativePath, content] of Object.entries(files)) {
        const filePath = path.join(tempDir, relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf-8');
    }
    return tempDir;
};

describe('InterfaceValidator Properties', () => {
    it('Property 5: Interface implementation completeness', () => {
        return fc.assert(
            fc.asyncProperty(
                fc.array(fc.stringMatching(/^m[0-9]+$/), { minLength: 1, maxLength: 3 }),
                async (methods) => {
                    const interfaceMethods = methods
                        .map(name => `${name}(): Promise<string>;`)
                        .join('\n');

                    const baseMethods = methods
                        .map(name => `async ${name}(): Promise<string> { return ""; }`)
                        .join('\n');

                    const tempDir = createTempProject({
                        'src/types/unified-data-source.ts': `export interface IReviewQueue { ${interfaceMethods} }`,
                        'src/queues/BaseReviewQueue.ts': `
                            import { IReviewQueue } from "../types/unified-data-source";
                            export abstract class BaseReviewQueue implements IReviewQueue { ${baseMethods} }
                        `,
                        'src/queues/SampleQueue.ts': `
                            import { BaseReviewQueue } from "./BaseReviewQueue";
                            export class SampleQueue extends BaseReviewQueue {}
                        `,
                    });

                    const validator = new InterfaceValidator();
                    const result = await validator.validateAllQueues(tempDir);
                    expect(result.errors.length).toBe(0);

                    fs.rmSync(tempDir, { recursive: true, force: true });
                }
            ),
            PROPERTY_TEST_CONFIG
        );
    });

    it('Property 6: Missing method detection', () => {
        return fc.assert(
            fc.asyncProperty(
                fc.array(fc.stringMatching(/^m[0-9]+$/), { minLength: 2, maxLength: 4 }),
                async (methods) => {
                    const [missingMethod] = methods;
                    const interfaceMethods = methods
                        .map(name => `${name}(): Promise<string>;`)
                        .join('\n');

                    const implementedMethods = methods
                        .slice(1)
                        .map(name => `async ${name}(): Promise<string> { return ""; }`)
                        .join('\n');

                    const tempDir = createTempProject({
                        'src/types/unified-data-source.ts': `export interface IReviewQueue { ${interfaceMethods} }`,
                        'src/queues/MissingQueue.ts': `
                            import { IReviewQueue } from "../types/unified-data-source";
                            export class MissingQueue implements IReviewQueue { ${implementedMethods} }
                        `,
                    });

                    const validator = new InterfaceValidator();
                    const result = await validator.validateAllQueues(tempDir);
                    expect(result.errors.some(e => e.methodName === missingMethod)).toBe(true);

                    fs.rmSync(tempDir, { recursive: true, force: true });
                }
            ),
            PROPERTY_TEST_CONFIG
        );
    });

    it('Property 7: Return type consistency', () => {
        return fc.assert(
            fc.asyncProperty(
                fc.stringMatching(/^m[0-9]+$/),
                async (methodName) => {
                    const tempDir = createTempProject({
                        'src/types/unified-data-source.ts': `
                            export interface IReviewQueue { ${methodName}(): Promise<string>; }
                        `,
                        'src/queues/BadQueue.ts': `
                            import { IReviewQueue } from "../types/unified-data-source";
                            export class BadQueue implements IReviewQueue {
                                async ${methodName}(): Promise<number> { return 1; }
                            }
                        `,
                    });

                    const validator = new InterfaceValidator();
                    const result = await validator.validateAllQueues(tempDir);
                    expect(result.errors.some(e => e.methodName === methodName)).toBe(true);

                    fs.rmSync(tempDir, { recursive: true, force: true });
                }
            ),
            PROPERTY_TEST_CONFIG
        );
    });
});

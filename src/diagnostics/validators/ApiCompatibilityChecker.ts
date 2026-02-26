/**
 * API Compatibility Checker
 * API 兼容性检查器
 *
 * 对比旧架构与新架构中同名队列类的公共 API 签名，识别潜在的破坏性变更。
 *
 * @see .kiro/specs/queue-architecture-diagnosis/design.md
 * @see 任务 11.1
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import {
    ApiClassSignature,
    ApiCompatibilityIssue,
    ApiCompatibilityResult,
    ApiMethodSignature,
} from '../types';
import { diagnosticsOutput } from '../utils/output';

type ClassSignatureMap = Map<string, ApiClassSignature>;

export class ApiCompatibilityChecker {
    checkCompatibility(rootDir: string): ApiCompatibilityResult {
        const oldDir = path.join(rootDir, 'src/core/queue/strategies');
        const newDir = path.join(rootDir, 'src/core/queue/domain');

        const oldClasses = this.collectClassApis(oldDir);
        const newClasses = this.collectClassApis(newDir, {
            excludeFileNames: new Set(['queues-index.ts']),
        });

        return this.compareClassApis(oldClasses, newClasses);
    }

    compareClassApis(
        oldClasses: ApiClassSignature[],
        newClasses: ApiClassSignature[]
    ): ApiCompatibilityResult {
        const issues: ApiCompatibilityIssue[] = [];
        const oldMap = this.toClassMap(oldClasses);
        const newMap = this.toClassMap(newClasses);

        let comparedClasses = 0;
        let comparedMethods = 0;
        let breakingChanges = 0;
        let warnings = 0;

        for (const [className, oldClass] of oldMap.entries()) {
            const newClass = newMap.get(className);
            if (!newClass) {
                issues.push({
                    className,
                    issue: 'No corresponding class found in new architecture',
                    severity: 'warning',
                });
                warnings++;
                continue;
            }

            comparedClasses++;

            const newMethods = new Map(
                newClass.methods.map(method => [method.name, method])
            );

            for (const oldMethod of oldClass.methods) {
                comparedMethods++;
                const newMethod = newMethods.get(oldMethod.name);
                if (!newMethod) {
                    issues.push({
                        className,
                        methodName: oldMethod.name,
                        issue: 'Missing method in new architecture',
                        severity: 'error',
                        oldSignature: this.formatMethodSignature(oldMethod),
                    });
                    breakingChanges++;
                    continue;
                }

                const oldSignature = this.formatMethodSignature(oldMethod);
                const newSignature = this.formatMethodSignature(newMethod);
                if (oldSignature !== newSignature) {
                    issues.push({
                        className,
                        methodName: oldMethod.name,
                        issue: 'Method signature changed',
                        severity: 'error',
                        oldSignature,
                        newSignature,
                    });
                    breakingChanges++;
                }
            }

            for (const newMethod of newClass.methods) {
                if (!oldClass.methods.find(method => method.name === newMethod.name)) {
                    issues.push({
                        className,
                        methodName: newMethod.name,
                        issue: 'New method added (non-breaking)',
                        severity: 'warning',
                        newSignature: this.formatMethodSignature(newMethod),
                    });
                    warnings++;
                }
            }
        }

        return {
            isCompatible: breakingChanges === 0,
            issues,
            summary: {
                comparedClasses,
                comparedMethods,
                breakingChanges,
                warnings,
            },
        };
    }

    generateCompatibilityReport(result: ApiCompatibilityResult): string {
        const lines: string[] = [];
        lines.push('# 队列 API 兼容性报告');
        lines.push('');
        lines.push(`**兼容状态**: ${result.isCompatible ? '✅ 兼容' : '❌ 存在破坏性变更'}`);
        lines.push('');
        lines.push('## 摘要');
        lines.push('');
        lines.push('| 指标 | 数量 |');
        lines.push('|------|------|');
        lines.push(`| 对比类数量 | ${result.summary.comparedClasses} |`);
        lines.push(`| 对比方法数量 | ${result.summary.comparedMethods} |`);
        lines.push(`| 破坏性变更 | ${result.summary.breakingChanges} |`);
        lines.push(`| 警告 | ${result.summary.warnings} |`);
        lines.push('');

        if (result.issues.length === 0) {
            lines.push('## 兼容性问题');
            lines.push('');
            lines.push('_未发现兼容性问题_');
            lines.push('');
            return lines.join('\n');
        }

        lines.push('## 兼容性问题');
        lines.push('');
        lines.push('| 严重性 | 类 | 方法 | 问题 | 旧签名 | 新签名 |');
        lines.push('|------|------|------|------|--------|--------|');
        for (const issue of result.issues) {
            lines.push(
                `| ${issue.severity} | ${issue.className} | ${issue.methodName ?? '-'} | ${issue.issue} | ${issue.oldSignature ?? '-'} | ${issue.newSignature ?? '-'} |`
            );
        }
        lines.push('');

        return lines.join('\n');
    }

    saveCompatibilityReport(report: string, outputPath: string): void {
        fs.writeFileSync(outputPath, report, 'utf-8');
        diagnosticsOutput.info(`[ApiCompatibilityChecker] Report saved to: ${outputPath}`);
    }

    private collectClassApis(
        dir: string,
        options: { excludeFileNames?: Set<string> } = {}
    ): ApiClassSignature[] {
        if (!fs.existsSync(dir)) {
            return [];
        }

        const files = this.collectTsFiles(dir, options.excludeFileNames);
        const classes: ApiClassSignature[] = [];

        for (const filePath of files) {
            const content = fs.readFileSync(filePath, 'utf-8');
            const sourceFile = ts.createSourceFile(
                filePath,
                content,
                ts.ScriptTarget.Latest,
                true
            );
            classes.push(...this.extractClassSignatures(sourceFile, filePath));
        }

        return classes;
    }

    private collectTsFiles(dir: string, excludeFileNames?: Set<string>): string[] {
        const files: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === '__tests__') {
                    continue;
                }
                files.push(...this.collectTsFiles(fullPath, excludeFileNames));
                continue;
            }

            if (!entry.name.endsWith('.ts')) {
                continue;
            }

            if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts')) {
                continue;
            }

            if (excludeFileNames?.has(entry.name)) {
                continue;
            }

            files.push(fullPath);
        }

        return files;
    }

    private extractClassSignatures(
        sourceFile: ts.SourceFile,
        filePath: string
    ): ApiClassSignature[] {
        const classes: ApiClassSignature[] = [];

        const visit = (node: ts.Node) => {
            if (ts.isClassDeclaration(node) && node.name) {
                const className = node.name.text;
                if (!this.isExported(node)) {
                    ts.forEachChild(node, visit);
                    return;
                }

                const methods = this.extractMethodSignatures(node, sourceFile);
                classes.push({ className, methods, filePath });
            }
            ts.forEachChild(node, visit);
        };

        visit(sourceFile);
        return classes;
    }

    private extractMethodSignatures(
        classDecl: ts.ClassDeclaration,
        sourceFile: ts.SourceFile
    ): ApiMethodSignature[] {
        const methods: ApiMethodSignature[] = [];

        for (const member of classDecl.members) {
            if (!ts.isMethodDeclaration(member)) {
                continue;
            }

            if (member.name && ts.isIdentifier(member.name)) {
                const name = member.name.text;
                if (name === 'constructor') {
                    continue;
                }

                if (this.isPrivateOrProtected(member)) {
                    continue;
                }

                const parameters = member.parameters.map(param => {
                    const typeText = param.type ? param.type.getText(sourceFile) : 'unknown';
                    return param.questionToken ? `${typeText}?` : typeText;
                });
                const returnType = member.type ? member.type.getText(sourceFile) : 'void';

                methods.push({ name, parameters, returnType });
            }
        }

        return methods;
    }

    private isExported(node: ts.Node): boolean {
        const modifiers = ts.getCombinedModifierFlags(node as ts.Declaration);
        return (modifiers & ts.ModifierFlags.Export) !== 0;
    }

    private isPrivateOrProtected(node: ts.Node): boolean {
        const modifiers = ts.getCombinedModifierFlags(node as ts.Declaration);
        return (
            (modifiers & ts.ModifierFlags.Private) !== 0 ||
            (modifiers & ts.ModifierFlags.Protected) !== 0
        );
    }

    private toClassMap(classes: ApiClassSignature[]): ClassSignatureMap {
        const map = new Map<string, ApiClassSignature>();
        for (const classSig of classes) {
            map.set(classSig.className, classSig);
        }
        return map;
    }

    private formatMethodSignature(method: ApiMethodSignature): string {
        return `${method.name}(${method.parameters.join(', ')}) => ${method.returnType}`;
    }
}

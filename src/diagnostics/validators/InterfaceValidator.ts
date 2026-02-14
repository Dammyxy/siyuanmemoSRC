/**
 * Interface Validator
 * 接口验证器
 *
 * 验证所有队列实现是否符合 IReviewQueue 接口。
 *
 * @see .kiro/specs/queue-architecture-diagnosis/design.md
 * @see 任务 4.3
 */

import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { ValidationResult, ValidationError, ValidationWarning } from '../types';
import { MethodChecker } from './MethodChecker';
import { TypeChecker } from './TypeChecker';

export class InterfaceValidator {
    async validateAllQueues(rootDir: string): Promise<ValidationResult> {
        console.log(`[InterfaceValidator] Starting validation from: ${rootDir}`);

        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        const queueFiles = this.findQueueFiles(rootDir);
        const interfaceFile = path.join(rootDir, 'src/types/unified-data-source.ts');

        const program = ts.createProgram([...queueFiles, interfaceFile], {
            target: ts.ScriptTarget.Latest,
            module: ts.ModuleKind.ESNext,
            allowJs: true,
        });

        const checker = program.getTypeChecker();
        const interfaceType = this.getInterfaceType(program, checker, interfaceFile, 'IReviewQueue');

        if (!interfaceType) {
            errors.push({
                className: 'IReviewQueue',
                methodName: 'IReviewQueue',
                issue: 'IReviewQueue interface not found',
                severity: 'error',
                filePath: interfaceFile,
            });
            return { isValid: false, errors, warnings };
        }

        const methodChecker = new MethodChecker(checker);
        const typeChecker = new TypeChecker(checker);

        for (const filePath of queueFiles) {
            const sourceFile = program.getSourceFile(filePath);
            if (!sourceFile) {
                continue;
            }

            const classDeclarations = this.findQueueClasses(sourceFile);

            for (const classDecl of classDeclarations) {
                const className = classDecl.name?.text ?? 'AnonymousQueueClass';
                const classSymbol = classDecl.name ? checker.getSymbolAtLocation(classDecl.name) : undefined;
                if (!classSymbol) {
                    continue;
                }

                const classType = checker.getDeclaredTypeOfSymbol(classSymbol);
                const implementsInterface = checker.isTypeAssignableTo(classType, interfaceType);

                if (!implementsInterface) {
                    errors.push(this.createError(
                        className,
                        'IReviewQueue',
                        'Class does not implement IReviewQueue',
                        filePath,
                        classDecl
                    ));
                }

                const interfaceMethods = interfaceType.getProperties();

                for (const methodSymbol of interfaceMethods) {
                    const methodName = methodSymbol.getName();
                    const checkResult = methodChecker.checkMethodImplementation(classType, methodName);

                    if (!checkResult.exists) {
                        errors.push(this.createError(
                            className,
                            methodName,
                            'Missing method implementation',
                            filePath,
                            classDecl
                        ));
                        continue;
                    }

                    if (className === 'BaseReviewQueue' && checkResult.isAbstract) {
                        warnings.push({
                            className,
                            message: `BaseReviewQueue should provide default implementation for ${methodName}`,
                            filePath,
                        });
                    }

                    const signatureCheck = typeChecker.checkMethodSignature(
                        classType,
                        interfaceType,
                        methodName
                    );

                    if (!signatureCheck.returnTypeMatches) {
                        errors.push(this.createError(
                            className,
                            methodName,
                            `Return type mismatch: expected ${signatureCheck.expectedReturnTypeText}, got ${signatureCheck.returnTypeText}`,
                            filePath,
                            checkResult.declaration ?? classDecl
                        ));
                    }

                    if (!signatureCheck.parameterTypesMatch) {
                        errors.push(this.createError(
                            className,
                            methodName,
                            'Parameter types mismatch with IReviewQueue',
                            filePath,
                            checkResult.declaration ?? classDecl
                        ));
                    }
                }
            }
        }

        console.log('[InterfaceValidator] Validation complete');

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
        };
    }

    private findQueueFiles(rootDir: string): string[] {
        const queueDir = path.join(rootDir, 'src/queues');
        const files: string[] = [];

        if (!fs.existsSync(queueDir)) {
            return files;
        }

        const entries = fs.readdirSync(queueDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isFile()) {
                continue;
            }

            if (!entry.name.endsWith('.ts')) {
                continue;
            }

            if (entry.name === 'index.ts' || entry.name === 'QueueFactory.ts') {
                continue;
            }

            files.push(path.join(queueDir, entry.name));
        }

        return files;
    }

    private findQueueClasses(sourceFile: ts.SourceFile): ts.ClassDeclaration[] {
        const classes: ts.ClassDeclaration[] = [];

        const visit = (node: ts.Node) => {
            if (ts.isClassDeclaration(node) && node.name) {
                const className = node.name.text;
                if (className.endsWith('Queue') || className === 'BaseReviewQueue') {
                    classes.push(node);
                }
            }
            ts.forEachChild(node, visit);
        };

        visit(sourceFile);
        return classes;
    }

    private getInterfaceType(
        program: ts.Program,
        checker: ts.TypeChecker,
        interfaceFile: string,
        interfaceName: string
    ): ts.Type | null {
        const sourceFile = program.getSourceFile(interfaceFile);
        if (!sourceFile) {
            return null;
        }

        let found: ts.Type | null = null;
        const visit = (node: ts.Node) => {
            if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
                const symbol = checker.getSymbolAtLocation(node.name);
                if (symbol) {
                    found = checker.getDeclaredTypeOfSymbol(symbol);
                }
            }
            ts.forEachChild(node, visit);
        };

        visit(sourceFile);
        return found;
    }

    private createError(
        className: string,
        methodName: string,
        issue: string,
        filePath: string,
        node: ts.Node
    ): ValidationError {
        const sourceFile = node.getSourceFile();
        const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

        return {
            className,
            methodName,
            issue,
            severity: 'error',
            filePath,
            lineNumber,
        };
    }
}

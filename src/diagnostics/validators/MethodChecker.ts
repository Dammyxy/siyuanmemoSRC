/**
 * Method Checker
 * 方法检查器
 *
 * 使用 TypeScript Compiler API 检查方法是否存在与是否为抽象实现。
 *
 * @see .kiro/specs/queue-architecture-diagnosis/design.md
 * @see 任务 4.1
 */

import * as ts from 'typescript';

export interface MethodCheckResult {
    exists: boolean;
    isAbstract: boolean;
    declaration?: ts.Declaration;
}

export class MethodChecker {
    constructor(private readonly checker: ts.TypeChecker) {}

    checkMethodImplementation(classType: ts.Type, methodName: string): MethodCheckResult {
        const prop = this.checker.getPropertyOfType(classType, methodName);
        if (!prop) {
            return { exists: false, isAbstract: false };
        }

        const declarations = prop.getDeclarations() ?? [];
        const abstractDeclarations = declarations.filter(decl =>
            ts.isMethodDeclaration(decl) &&
            decl.modifiers?.some(mod => mod.kind === ts.SyntaxKind.AbstractKeyword)
        );

        return {
            exists: true,
            isAbstract: abstractDeclarations.length === declarations.length && declarations.length > 0,
            declaration: declarations[0],
        };
    }
}

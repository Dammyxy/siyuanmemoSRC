/**
 * Dependency Analyzer
 * 依赖分析器
 *
 * 识别文件依赖关系和共享依赖。
 *
 * @see .kiro/specs/queue-architecture-diagnosis/design.md
 * @see 任务 8.3
 */

import * as fs from 'fs';
import * as ts from 'typescript';
import { Dependency } from '../types';

export class DependencyAnalyzer {
    analyzeFileDependencies(filePath: string): Dependency[] {
        if (!fs.existsSync(filePath)) {
            return [];
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const sourceFile = ts.createSourceFile(
            filePath,
            content,
            ts.ScriptTarget.Latest,
            true
        );

        const deps: Dependency[] = [];

        sourceFile.forEachChild(node => {
            if (ts.isImportDeclaration(node)) {
                const moduleSpecifier = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
                deps.push({
                    from: filePath,
                    to: moduleSpecifier,
                    type: 'import',
                });
            }
        });

        return deps;
    }
}

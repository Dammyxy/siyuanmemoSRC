/**
 * Import Analyzer
 * 导入分析器
 *
 * 使用 TypeScript Compiler API 解析导入语句，识别旧/新架构的使用点。
 *
 * @see .kiro/specs/queue-architecture-diagnosis/design.md
 * @see 任务 2.1
 */

import * as ts from 'typescript';
import { UsagePoint, ArchitectureType } from '../types';

export interface ImportAnalysisResult {
    usages: UsagePoint[];
    importMap: Map<string, ArchitectureType>;
}

export class ImportAnalyzer {
    private readonly OLD_ARCHITECTURE_PREFIX = 'src/core/queue/strategies';
    private readonly NEW_ARCHITECTURE_PREFIX = 'src/queues';

    analyzeImports(fileContent: string, filePath: string): ImportAnalysisResult {
        const usages: UsagePoint[] = [];
        const importMap = new Map<string, ArchitectureType>();

        const sourceFile = ts.createSourceFile(
            filePath,
            fileContent,
            ts.ScriptTarget.Latest,
            true
        );

        const recordImport = (name: string, architecture: ArchitectureType) => {
            if (!importMap.has(name)) {
                importMap.set(name, architecture);
            }
        };

        const visit = (node: ts.Node) => {
            if (ts.isImportDeclaration(node)) {
                const moduleSpecifier = node.moduleSpecifier.getText(sourceFile);
                const cleanModuleSpecifier = moduleSpecifier.replace(/['"]/g, '');

                let architecture: ArchitectureType | null = null;
                if (cleanModuleSpecifier.includes(this.OLD_ARCHITECTURE_PREFIX)) {
                    architecture = 'old';
                }
                if (cleanModuleSpecifier.includes(this.NEW_ARCHITECTURE_PREFIX)) {
                    architecture = architecture ? 'mixed' : 'new';
                }

                if (architecture && architecture !== 'mixed') {
                    usages.push({
                        filePath,
                        lineNumber: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                        codeSnippet: node.getText(sourceFile),
                        usageType: 'import',
                        architecture,
                    });

                    const clause = node.importClause;
                    if (clause?.name) {
                        recordImport(clause.name.getText(sourceFile), architecture);
                    }
                    if (clause?.namedBindings) {
                        if (ts.isNamespaceImport(clause.namedBindings)) {
                            recordImport(clause.namedBindings.name.getText(sourceFile), architecture);
                        }
                        if (ts.isNamedImports(clause.namedBindings)) {
                            clause.namedBindings.elements.forEach(element => {
                                recordImport(element.name.getText(sourceFile), architecture);
                            });
                        }
                    }
                }
            }

            ts.forEachChild(node, visit);
        };

        visit(sourceFile);

        return { usages, importMap };
    }
}

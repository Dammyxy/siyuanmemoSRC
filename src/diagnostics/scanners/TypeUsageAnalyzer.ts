/**
 * Type Usage Analyzer
 * 类型使用分析器
 *
 * 识别 QueueItem / FSRSCard 类型注解和队列类实例化位置。
 *
 * @see .kiro/specs/queue-architecture-diagnosis/design.md
 * @see 任务 2.3
 */

import * as ts from 'typescript';
import { ArchitectureType, UsagePoint } from '../types';

export class TypeUsageAnalyzer {
    private readonly OLD_ARCHITECTURE_PREFIX = 'src/core/queue/strategies';
    private readonly NEW_ARCHITECTURE_PREFIX = 'src/core/queue/domain';

    analyze(
        fileContent: string,
        filePath: string,
        importMap: Map<string, ArchitectureType>
    ): UsagePoint[] {
        const usages: UsagePoint[] = [];

        const sourceFile = ts.createSourceFile(
            filePath,
            fileContent,
            ts.ScriptTarget.Latest,
            true
        );

        const getArchitectureFromIdentifier = (identifier: string): ArchitectureType | null => {
            const mapped = importMap.get(identifier);
            if (mapped) {
                return mapped;
            }

            if (filePath.includes(this.OLD_ARCHITECTURE_PREFIX)) {
                return 'old';
            }

            if (filePath.includes(this.NEW_ARCHITECTURE_PREFIX)) {
                return 'new';
            }

            return null;
        };

        const recordUsage = (
            node: ts.Node,
            architecture: ArchitectureType,
            usageType: UsagePoint['usageType'],
            queueType?: string
        ) => {
            usages.push({
                filePath,
                lineNumber: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                codeSnippet: node.getText(sourceFile),
                usageType,
                architecture,
                queueType,
            });
        };

        const extractTypeName = (typeName: ts.EntityName): string => {
            if (ts.isIdentifier(typeName)) {
                return typeName.text;
            }
            return typeName.right.text;
        };

        const visit = (node: ts.Node) => {
            if (ts.isTypeReferenceNode(node)) {
                const typeName = extractTypeName(node.typeName);
                if (typeName === 'QueueItem' || typeName === 'FSRSCard') {
                    recordUsage(node, 'new', 'type-annotation');
                }
            }

            if (ts.isNewExpression(node)) {
                const expression = node.expression;
                let className: string | null = null;
                if (ts.isIdentifier(expression)) {
                    className = expression.text;
                } else if (ts.isPropertyAccessExpression(expression)) {
                    className = expression.name.text;
                }

                if (className) {
                    const architecture = getArchitectureFromIdentifier(className) ?? 'mixed';
                    recordUsage(node, architecture, 'instantiation', className);
                }
            }

            ts.forEachChild(node, visit);
        };

        visit(sourceFile);

        return usages;
    }
}

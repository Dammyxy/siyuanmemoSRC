/**
 * Priority Calculator
 * 优先级计算器
 *
 * 根据风险和影响计算迁移优先级。
 *
 * @see .kiro/specs/queue-architecture-diagnosis/design.md
 * @see 任务 8.2
 */

import { ImpactLevel, RiskLevel } from '../types';
import { UsagePoint } from '../types';

export class PriorityCalculator {
    calculateImpact(usage: UsagePoint): ImpactLevel {
        switch (usage.usageType) {
            case 'instantiation':
                return 'high';
            case 'type-annotation':
                return 'low';
            default:
                return 'medium';
        }
    }

    calculatePriority(risk: RiskLevel, impact: ImpactLevel): number {
        const riskScore = risk === 'low' ? 3 : risk === 'medium' ? 2 : 1;
        const impactScore = impact === 'high' ? 3 : impact === 'medium' ? 2 : 1;
        return riskScore * 10 + impactScore;
    }
}

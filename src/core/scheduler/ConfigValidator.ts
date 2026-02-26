import type { PostponeConfig, AdvanceConfig, SpreadConfig } from '@/types/reschedule';
import { RescheduleErrorCode, type RescheduleError } from '@/types/reschedule-error';

/**
 * 配置验证器
 * 验证重新调度配置的有效性
 */
export class ConfigValidator {
    /**
     * 验证 Postpone 配置
     */
    static validatePostponeConfig(config: PostponeConfig): RescheduleError | null {
        // 验证 delayFactor
        if (typeof config.delayFactor !== 'number' || isNaN(config.delayFactor)) {
            return {
                code: RescheduleErrorCode.INVALID_CONFIG,
                message: 'delayFactor must be a valid number',
                details: { field: 'delayFactor', value: config.delayFactor }
            };
        }

        if (config.delayFactor < 0.1 || config.delayFactor > 10.0) {
            return {
                code: RescheduleErrorCode.INVALID_CONFIG,
                message: 'delayFactor must be between 0.1 and 10.0',
                details: { field: 'delayFactor', value: config.delayFactor }
            };
        }

        // 验证 minInterval
        if (typeof config.minInterval !== 'number' || isNaN(config.minInterval)) {
            return {
                code: RescheduleErrorCode.INVALID_CONFIG,
                message: 'minInterval must be a valid number',
                details: { field: 'minInterval', value: config.minInterval }
            };
        }

        if (config.minInterval < 1) {
            return {
                code: RescheduleErrorCode.INVALID_CONFIG,
                message: 'minInterval must be at least 1',
                details: { field: 'minInterval', value: config.minInterval }
            };
        }

        // 验证 maxInterval
        if (typeof config.maxInterval !== 'number' || isNaN(config.maxInterval)) {
            return {
                code: RescheduleErrorCode.INVALID_CONFIG,
                message: 'maxInterval must be a valid number',
                details: { field: 'maxInterval', value: config.maxInterval }
            };
        }

        if (config.maxInterval < config.minInterval) {
            return {
                code: RescheduleErrorCode.INVALID_CONFIG,
                message: 'maxInterval must be greater than or equal to minInterval',
                details: { minInterval: config.minInterval, maxInterval: config.maxInterval }
            };
        }

        // 验证跳过条件的阈值
        if (config.skipConditions.skipByPriority?.enabled) {
            const threshold = config.skipConditions.skipByPriority.threshold;
            if (typeof threshold !== 'number' || isNaN(threshold) || threshold < 0 || threshold > 100) {
                return {
                    code: RescheduleErrorCode.INVALID_CONFIG,
                    message: 'skipByPriority threshold must be between 0 and 100',
                    details: { field: 'skipByPriority.threshold', value: threshold }
                };
            }
        }

        if (config.skipConditions.skipByInterval?.enabled) {
            const threshold = config.skipConditions.skipByInterval.threshold;
            if (typeof threshold !== 'number' || isNaN(threshold) || threshold < 0) {
                return {
                    code: RescheduleErrorCode.INVALID_CONFIG,
                    message: 'skipByInterval threshold must be a positive number',
                    details: { field: 'skipByInterval.threshold', value: threshold }
                };
            }
        }

        if (config.skipConditions.skipByRetrievability?.enabled) {
            const threshold = config.skipConditions.skipByRetrievability.threshold;
            if (typeof threshold !== 'number' || isNaN(threshold) || threshold < 0 || threshold > 1) {
                return {
                    code: RescheduleErrorCode.INVALID_CONFIG,
                    message: 'skipByRetrievability threshold must be between 0 and 1',
                    details: { field: 'skipByRetrievability.threshold', value: threshold }
                };
            }
        }

        if (config.skipConditions.skipByAFactor?.enabled) {
            const threshold = config.skipConditions.skipByAFactor.threshold;
            if (typeof threshold !== 'number' || isNaN(threshold) || threshold < 1.2 || threshold > 6.0) {
                return {
                    code: RescheduleErrorCode.INVALID_CONFIG,
                    message: 'skipByAFactor threshold must be between 1.2 and 6.0',
                    details: { field: 'skipByAFactor.threshold', value: threshold }
                };
            }
        }

        if (config.skipConditions.skipByPostponeCount?.enabled) {
            const threshold = config.skipConditions.skipByPostponeCount.threshold;
            if (typeof threshold !== 'number' || isNaN(threshold) || threshold < 0) {
                return {
                    code: RescheduleErrorCode.INVALID_CONFIG,
                    message: 'skipByPostponeCount threshold must be a positive number',
                    details: { field: 'skipByPostponeCount.threshold', value: threshold }
                };
            }
        }

        // 验证 skipTopNElements
        if (config.skipTopNElements !== undefined) {
            if (typeof config.skipTopNElements !== 'number' || isNaN(config.skipTopNElements) || config.skipTopNElements < 0) {
                return {
                    code: RescheduleErrorCode.INVALID_CONFIG,
                    message: 'skipTopNElements must be a non-negative number',
                    details: { field: 'skipTopNElements', value: config.skipTopNElements }
                };
            }
        }

        // 验证 includeNonOutstanding
        if (config.includeNonOutstanding !== undefined) {
            if (typeof config.includeNonOutstanding !== 'boolean') {
                return {
                    code: RescheduleErrorCode.INVALID_CONFIG,
                    message: 'includeNonOutstanding must be a boolean',
                    details: { field: 'includeNonOutstanding', value: config.includeNonOutstanding }
                };
            }
        }

        return null;
    }

    /**
     * 验证 Advance 配置
     */
    static validateAdvanceConfig(config: AdvanceConfig): RescheduleError | null {
        // 验证 maxDays
        if (typeof config.maxDays !== 'number' || isNaN(config.maxDays)) {
            return {
                code: RescheduleErrorCode.INVALID_CONFIG,
                message: 'maxDays must be a valid number',
                details: { field: 'maxDays', value: config.maxDays }
            };
        }

        if (config.maxDays < 1 || config.maxDays > 365) {
            return {
                code: RescheduleErrorCode.INVALID_CONFIG,
                message: 'maxDays must be between 1 and 365',
                details: { field: 'maxDays', value: config.maxDays }
            };
        }

        // 验证布尔值
        if (typeof config.randomize !== 'boolean') {
            return {
                code: RescheduleErrorCode.INVALID_CONFIG,
                message: 'randomize must be a boolean',
                details: { field: 'randomize', value: config.randomize }
            };
        }

        if (typeof config.handleOverdueCards !== 'boolean') {
            return {
                code: RescheduleErrorCode.INVALID_CONFIG,
                message: 'handleOverdueCards must be a boolean',
                details: { field: 'handleOverdueCards', value: config.handleOverdueCards }
            };
        }

        return null;
    }

    /**
     * 验证 Spread 配置
     */
    static validateSpreadConfig(config: SpreadConfig): RescheduleError | null {
        // 验证 collectingPeriod
        if (typeof config.collectingPeriod !== 'number' || isNaN(config.collectingPeriod)) {
            return {
                code: RescheduleErrorCode.INVALID_CONFIG,
                message: 'collectingPeriod must be a valid number',
                details: { field: 'collectingPeriod', value: config.collectingPeriod }
            };
        }

        if (config.collectingPeriod < 1 || config.collectingPeriod > 365) {
            return {
                code: RescheduleErrorCode.INVALID_CONFIG,
                message: 'collectingPeriod must be between 1 and 365',
                details: { field: 'collectingPeriod', value: config.collectingPeriod }
            };
        }

        // 验证 reschedulingPeriod
        if (typeof config.reschedulingPeriod !== 'number' || isNaN(config.reschedulingPeriod)) {
            return {
                code: RescheduleErrorCode.INVALID_CONFIG,
                message: 'reschedulingPeriod must be a valid number',
                details: { field: 'reschedulingPeriod', value: config.reschedulingPeriod }
            };
        }

        if (config.reschedulingPeriod < 1 || config.reschedulingPeriod > 365) {
            return {
                code: RescheduleErrorCode.INVALID_CONFIG,
                message: 'reschedulingPeriod must be between 1 and 365',
                details: { field: 'reschedulingPeriod', value: config.reschedulingPeriod }
            };
        }

        // 验证 considerFutureRepetitions
        if (typeof config.considerFutureRepetitions !== 'boolean') {
            return {
                code: RescheduleErrorCode.INVALID_CONFIG,
                message: 'considerFutureRepetitions must be a boolean',
                details: { field: 'considerFutureRepetitions', value: config.considerFutureRepetitions }
            };
        }

        // 验证 collectAllCards（可选）
        if (config.collectAllCards !== undefined && typeof config.collectAllCards !== 'boolean') {
            return {
                code: RescheduleErrorCode.INVALID_CONFIG,
                message: 'collectAllCards must be a boolean',
                details: { field: 'collectAllCards', value: config.collectAllCards }
            };
        }

        // 验证 sortingCriterion
        const validCriteria = ['random', 'by-priority', 'by-interval', 'by-lateness', 'by-easiness', 'by-recency'];
        if (!validCriteria.includes(config.sortingCriterion)) {
            return {
                code: RescheduleErrorCode.INVALID_CONFIG,
                message: `sortingCriterion must be one of: ${validCriteria.join(', ')}`,
                details: { field: 'sortingCriterion', value: config.sortingCriterion }
            };
        }

        // 验证 maxCardsPerDay（可选）
        if (config.maxCardsPerDay !== undefined) {
            if (
                typeof config.maxCardsPerDay !== 'number'
                || isNaN(config.maxCardsPerDay)
                || config.maxCardsPerDay < 1
                || config.maxCardsPerDay > 1000
            ) {
                return {
                    code: RescheduleErrorCode.INVALID_CONFIG,
                    message: 'maxCardsPerDay must be between 1 and 1000',
                    details: { field: 'maxCardsPerDay', value: config.maxCardsPerDay }
                };
            }
        }

        return null;
    }
}

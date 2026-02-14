/**
 * Parameter Optimizer Service
 * 
 * 使用 @open-spaced-repetition/binding 优化 FSRS 参数。
 * 
 * 功能：
 * - 从复习历史优化 FSRS 参数
 * - 支持进度回调
 * - 转换数据格式（ReviewLog → FSRSBindingItem）
 * 
 * @see https://github.com/open-spaced-repetition/fsrs-rs
 */

import type { ReviewLog } from '@/types';
import type { FSRSParameters } from '@/types';

// 动态导入类型（仅用于类型检查）
type FSRSBindingItem = any;
type FSRSBindingReview = any;
type ComputeParametersOptions = {
    enableShortTerm?: boolean;
    numRelearningSteps?: number;
    timeout?: number;
    progress?: (current: number, total: number) => void;
};

/**
 * 参数优化配置
 */
export interface OptimizationConfig {
    /** 是否启用短期记忆模式 */
    enableShortTerm?: boolean;
    /** 重新学习步骤数量 */
    numRelearningSteps?: number;
    /** 超时时间（毫秒） */
    timeout?: number;
    /** 进度回调函数 */
    progress?: (current: number, total: number) => void;
}

/**
 * 参数优化结果
 */
export interface OptimizationResult {
    /** 优化后的权重参数（19个） */
    weights: number[];
    /** 优化耗时（毫秒） */
    duration: number;
    /** 使用的复习记录数量 */
    reviewCount: number;
}

/**
 * 参数优化器
 * 
 * 使用用户的复习历史数据优化 FSRS 参数，提高算法的预测准确性。
 * 
 * 工作流程：
 * 1. 收集用户的复习历史（ReviewLog）
 * 2. 按卡片分组并排序
 * 3. 转换为 FSRSBindingItem 格式
 * 4. 调用 binding 包的 computeParameters 进行优化
 * 5. 返回优化后的参数
 * 
 * 注意事项：
 * - 需要足够的复习历史数据（建议至少 100 条记录）
 * - 优化过程可能耗时较长（取决于数据量）
 * - 支持通过进度回调中止优化
 */
export class ParameterOptimizer {
    /**
     * 优化 FSRS 参数
     * 
     * @param reviewLogs - 复习历史记录
     * @param config - 优化配置
     * @returns 优化结果
     * @throws 如果数据不足或优化失败
     */
    async optimize(
        reviewLogs: ReviewLog[],
        config: OptimizationConfig = {}
    ): Promise<OptimizationResult> {
        const startTime = Date.now();

        // 动态导入 binding 包（只在实际使用时加载）
        let computeParameters: any;
        let FSRSBindingItem: any;
        let FSRSBindingReview: any;

        try {
            const binding = await import('@open-spaced-repetition/binding');
            computeParameters = binding.computeParameters;
            FSRSBindingItem = binding.FSRSBindingItem;
            FSRSBindingReview = binding.FSRSBindingReview;
        } catch (error) {
            throw new Error(
                'Failed to load parameter optimization module. ' +
                'Please ensure @open-spaced-repetition/binding is properly installed. ' +
                `Error: ${error instanceof Error ? error.message : String(error)}`
            );
        }

        // 验证数据
        if (!reviewLogs || reviewLogs.length === 0) {
            throw new Error('No review logs provided for optimization');
        }

        // 转换数据格式
        const fsrsItems = this.convertToFSRSItems(reviewLogs, FSRSBindingItem, FSRSBindingReview);

        if (fsrsItems.length === 0) {
            throw new Error('No valid review data after conversion. Need at least 2 reviews per card.');
        }

        // 调用 binding 包进行优化
        const weights = await computeParameters(fsrsItems, {
            enableShortTerm: config.enableShortTerm ?? false,
            numRelearningSteps: config.numRelearningSteps ?? 1,
            timeout: config.timeout,
            progress: config.progress,
        });

        const duration = Date.now() - startTime;

        return {
            weights,
            duration,
            reviewCount: reviewLogs.length,
        };
    }

    /**
     * 将复习日志转换为 FSRSBindingItem 数组
     * 
     * 转换步骤：
     * 1. 按卡片 ID 分组
     * 2. 按复习时间排序
     * 3. 计算相邻复习之间的天数间隔
     * 4. 创建 FSRSBindingReview 和 FSRSBindingItem
     * 
     * 数据要求：
     * - 每张卡片至少需要 2 条复习记录
     * - 复习记录必须包含 rating 和 review 时间戳
     * - 忽略机械练习（isDrill = true）的记录
     * 
     * @param reviewLogs - 复习历史记录
     * @param FSRSBindingItem - FSRSBindingItem 构造函数
     * @param FSRSBindingReview - FSRSBindingReview 构造函数
     * @returns FSRSBindingItem 数组
     */
    private convertToFSRSItems(
        reviewLogs: ReviewLog[],
        FSRSBindingItem: any,
        FSRSBindingReview: any
    ): FSRSBindingItem[] {
        // 过滤掉机械练习的记录
        const validLogs = reviewLogs.filter(log => !log.isDrill);

        // 按卡片 ID 分组
        const groupedByCard = this.groupByCardId(validLogs);

        const fsrsItems: FSRSBindingItem[] = [];

        // 为每张卡片创建 FSRSBindingItem
        for (const [cardId, logs] of Object.entries(groupedByCard)) {
            // 按时间排序
            const sortedLogs = logs.sort((a, b) => a.review - b.review);

            // 至少需要 2 条记录
            if (sortedLogs.length < 2) {
                continue;
            }

            // 创建 FSRSBindingReview 数组
            const reviews: FSRSBindingReview[] = [];
            let prevReviewTime = sortedLogs[0].review;

            for (let i = 0; i < sortedLogs.length; i++) {
                const log = sortedLogs[i];
                
                // 计算距离上次复习的天数
                let deltaT = 0;
                if (i > 0) {
                    const daysDiff = (log.review - prevReviewTime) / (1000 * 60 * 60 * 24);
                    deltaT = Math.max(0, Math.floor(daysDiff));
                }

                // 创建 FSRSBindingReview
                // rating: 1=Again, 2=Hard, 3=Good, 4=Easy
                reviews.push(new FSRSBindingReview(log.rating, deltaT));
                prevReviewTime = log.review;
            }

            // 创建 FSRSBindingItem（从第二条记录开始，每条记录创建一个 item）
            // 这样可以让优化器学习每次复习的效果
            for (let idx = 1; idx < reviews.length; idx++) {
                const itemReviews = reviews.slice(0, idx + 1);
                
                // 只保留最后一次复习的 deltaT > 0 的 item
                if (itemReviews[itemReviews.length - 1].deltaT > 0) {
                    fsrsItems.push(new FSRSBindingItem(itemReviews));
                }
            }
        }

        return fsrsItems;
    }

    /**
     * 按卡片 ID 分组复习日志
     * 
     * @param logs - 复习日志数组
     * @returns 按卡片 ID 分组的 Map
     */
    private groupByCardId(logs: ReviewLog[]): Record<string, ReviewLog[]> {
        const grouped: Record<string, ReviewLog[]> = {};

        for (const log of logs) {
            if (!grouped[log.cardId]) {
                grouped[log.cardId] = [];
            }
            grouped[log.cardId].push(log);
        }

        return grouped;
    }

    /**
     * 创建优化后的 FSRSParameters
     * 
     * 将优化结果应用到现有参数配置中。
     * 
     * @param currentParams - 当前参数配置
     * @param optimizationResult - 优化结果
     * @returns 新的参数配置
     */
    createOptimizedParams(
        currentParams: FSRSParameters,
        optimizationResult: OptimizationResult
    ): FSRSParameters {
        return {
            ...currentParams,
            weights: optimizationResult.weights,
        };
    }

    /**
     * 导出参数为 JSON 字符串
     * 
     * 将 FSRS 参数导出为 JSON 格式，方便分享和备份。
     * 
     * @param params - FSRS 参数
     * @returns JSON 字符串
     */
    exportParameters(params: FSRSParameters): string {
        return JSON.stringify(params, null, 2);
    }

    /**
     * 从 JSON 字符串导入参数
     * 
     * 从 JSON 格式导入 FSRS 参数，支持参数验证。
     * 
     * @param json - JSON 字符串
     * @returns FSRS 参数
     * @throws 如果 JSON 格式无效或参数不合法
     */
    importParameters(json: string): FSRSParameters {
        let params: any;
        
        try {
            params = JSON.parse(json);
        } catch (error) {
            throw new Error('Invalid JSON format');
        }

        // 验证必需字段
        if (typeof params.requestRetention !== 'number') {
            throw new Error('Missing or invalid requestRetention');
        }
        if (typeof params.maximumInterval !== 'number') {
            throw new Error('Missing or invalid maximumInterval');
        }
        if (!Array.isArray(params.weights)) {
            throw new Error('Missing or invalid weights array');
        }
        if (params.weights.length !== 19) {
            throw new Error('Weights array must contain exactly 19 elements');
        }
        if (typeof params.enableFuzz !== 'boolean') {
            throw new Error('Missing or invalid enableFuzz');
        }
        if (typeof params.enableShortTerm !== 'boolean') {
            throw new Error('Missing or invalid enableShortTerm');
        }

        // 验证数值范围
        if (params.requestRetention < 0.7 || params.requestRetention > 0.99) {
            throw new Error('requestRetention must be between 0.7 and 0.99');
        }
        if (params.maximumInterval < 1) {
            throw new Error('maximumInterval must be at least 1');
        }

        // 验证 weights 数组中的所有值都是数字
        for (let i = 0; i < params.weights.length; i++) {
            if (typeof params.weights[i] !== 'number' || !isFinite(params.weights[i])) {
                throw new Error(`Invalid weight at index ${i}`);
            }
        }

        // 可选字段验证
        if (params.dayStartHour !== undefined) {
            if (typeof params.dayStartHour !== 'number' || 
                params.dayStartHour < 0 || 
                params.dayStartHour > 23) {
                throw new Error('dayStartHour must be between 0 and 23');
            }
        }

        return params as FSRSParameters;
    }
}

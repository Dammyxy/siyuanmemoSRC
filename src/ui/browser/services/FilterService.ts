/**
 * FilterService - 过滤条件管理服务
 * 
 * 职责：
 * - 管理过滤条件的持久化（localStorage）
 * - 验证过滤条件的有效性
 * - 在 UI 状态和 CardFilter 对象之间转换
 * - 生成过滤条件的摘要文本
 * 
 * @see .kiro/specs/filter-group-queue-ui/requirements.md
 * @see .kiro/specs/filter-group-queue-ui/design.md
 */

import type { CardFilter, NumericRangeFilter, DateRangeFilter } from '@/types/unified-data-source';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 过滤条件启用状态
 */
export interface FilterEnabledState {
    priority: boolean;
    repetitions: boolean;
    lapses: boolean;
    interval: boolean;
    lastReview: boolean;
    nextReview: boolean;
    difficulty: boolean;
    stability: boolean;
    retrievability: boolean;
    cardType: boolean;
    cardStatus: boolean;
    keyword: boolean;
}

/**
 * 过滤条件值
 */
export interface FilterValues {
    priority: { min: number; max: number };
    repetitions: { min: number; max: number };
    lapses: { min: number; max: number };
    interval: { min: number; max: number };
    lastReview: { min: Date; max: Date };
    nextReview: { min: Date; max: Date };
    difficulty: { min: number; max: number };
    stability: { min: number; max: number };
    retrievability: { min: number; max: number };
    cardType: Set<'item' | 'topic'>;
    cardStatus: Set<'new' | 'learning' | 'review' | 'relearning'>;
    keyword: string;
}

/**
 * 过滤对话框状态
 */
export interface FilterDialogState {
    enabled: FilterEnabledState;
    values: FilterValues;
}

/**
 * 验证结果
 */
export interface ValidationResult {
    isValid: boolean;
    errors: Map<string, string>;
}

/**
 * 验证错误类型
 */
export enum FilterValidationError {
    MIN_GREATER_THAN_MAX = 'MIN_GREATER_THAN_MAX',
    VALUE_OUT_OF_RANGE = 'VALUE_OUT_OF_RANGE',
    INVALID_DATE_RANGE = 'INVALID_DATE_RANGE',
    INVALID_NUMBER = 'INVALID_NUMBER',
}

/**
 * 错误消息映射
 */
const ERROR_MESSAGES: Record<FilterValidationError, string> = {
    [FilterValidationError.MIN_GREATER_THAN_MAX]: '最小值不能大于最大值',
    [FilterValidationError.VALUE_OUT_OF_RANGE]: '数值超出允许范围',
    [FilterValidationError.INVALID_DATE_RANGE]: '日期范围无效',
    [FilterValidationError.INVALID_NUMBER]: '请输入有效的数字',
};

/**
 * 数值范围限制
 */
interface NumericRange {
    min: number;
    max: number;
    allowDecimal?: boolean;
}

/**
 * 过滤条件范围配置
 */
const FILTER_RANGES: Record<string, NumericRange> = {
    priority: { min: 0, max: 100 },
    repetitions: { min: 0, max: 999 },
    lapses: { min: 0, max: 999 },
    interval: { min: 0, max: 9999 },
    difficulty: { min: 0, max: 10, allowDecimal: true },
    stability: { min: 0, max: 9999, allowDecimal: true },
    retrievability: { min: 0, max: 1, allowDecimal: true },
};

// ============================================================================
// FilterService 类
// ============================================================================

/**
 * 过滤条件管理服务
 * 
 * 提供过滤条件的持久化、验证和转换功能。
 * 
 * @see 需求 6.1, 8.1, 8.2, 9.1, 9.2, 9.3, 9.4, 9.5, 10.1, 10.2, 10.3, 11.2, 11.3
 */
export class FilterService {
    private readonly STORAGE_KEY = 'filter-group-queue-settings';
    private readonly PRESETS_KEY = 'filter-group-queue-presets';

    /**
     * 保存过滤设置到 localStorage
     * 
     * @param filter 过滤条件
     * @see 需求 8.1
     */
    saveFilter(filter: CardFilter): void {
        try {
            const serialized = this.serializeFilter(filter);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(serialized));
            console.log('[FilterService] Filter saved:', filter);
        } catch (error) {
            console.error('[FilterService] Failed to save filter:', error);
            // 不抛出错误，仅记录日志（需求 8.4）
        }
    }

    /**
     * 从 localStorage 加载过滤设置
     * 
     * @returns 过滤条件，如果不存在或加载失败则返回 null
     * @see 需求 8.2
     */
    loadFilter(): CardFilter | null {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (!stored) {
                return null;
            }

            const parsed = JSON.parse(stored);
            const filter = this.deserializeFilter(parsed);
            console.log('[FilterService] Filter loaded:', filter);
            return filter;
        } catch (error) {
            console.error('[FilterService] Failed to load filter:', error);
            // 不抛出错误，返回 null（需求 8.4）
            return null;
        }
    }

    /**
     * 保存预设列表到 localStorage
     * 
     * @param presets 预设列表
     */
    savePresets(presets: Array<{ name: string; filter: CardFilter }>): void {
        try {
            const serialized = presets.map(p => ({
                name: p.name,
                filter: this.serializeFilter(p.filter),
            }));
            localStorage.setItem(this.PRESETS_KEY, JSON.stringify(serialized));
            console.log('[FilterService] Presets saved:', presets.length);
        } catch (error) {
            console.error('[FilterService] Failed to save presets:', error);
        }
    }

    /**
     * 从 localStorage 加载预设列表
     * 
     * @returns 预设列表
     */
    loadPresets(): Array<{ name: string; filter: CardFilter }> {
        try {
            const stored = localStorage.getItem(this.PRESETS_KEY);
            if (!stored) {
                return [];
            }

            const parsed = JSON.parse(stored);
            const presets = parsed.map((p: any) => ({
                name: p.name,
                filter: this.deserializeFilter(p.filter),
            }));
            console.log('[FilterService] Presets loaded:', presets.length);
            return presets;
        } catch (error) {
            console.error('[FilterService] Failed to load presets:', error);
            return [];
        }
    }

    /**
     * 验证过滤条件
     * 
     * @param state 过滤对话框状态
     * @returns 验证结果
     * @see 需求 10.1, 10.2, 10.3
     */
    validateFilter(state: FilterDialogState): ValidationResult {
        const errors = new Map<string, string>();

        // 验证数值范围过滤条件
        const numericFields: Array<keyof FilterEnabledState> = [
            'priority',
            'repetitions',
            'lapses',
            'interval',
            'difficulty',
            'stability',
            'retrievability',
        ];

        for (const field of numericFields) {
            if (!state.enabled[field]) {
                continue;
            }

            const values = state.values[field] as { min: number; max: number };
            const range = FILTER_RANGES[field];

            // 验证最小值不大于最大值
            if (values.min > values.max) {
                errors.set(field, ERROR_MESSAGES[FilterValidationError.MIN_GREATER_THAN_MAX]);
                continue;
            }

            // 验证数值范围
            if (values.min < range.min || values.min > range.max) {
                errors.set(`${field}.min`, ERROR_MESSAGES[FilterValidationError.VALUE_OUT_OF_RANGE]);
            }
            if (values.max < range.min || values.max > range.max) {
                errors.set(`${field}.max`, ERROR_MESSAGES[FilterValidationError.VALUE_OUT_OF_RANGE]);
            }

            // 验证是否为有效数字
            if (isNaN(values.min) || isNaN(values.max)) {
                errors.set(field, ERROR_MESSAGES[FilterValidationError.INVALID_NUMBER]);
            }
        }

        // 验证日期范围过滤条件
        const dateFields: Array<keyof FilterEnabledState> = ['lastReview', 'nextReview'];

        for (const field of dateFields) {
            if (!state.enabled[field]) {
                continue;
            }

            const values = state.values[field] as { min: Date; max: Date };

            // 验证最小日期不晚于最大日期
            if (values.min > values.max) {
                errors.set(field, ERROR_MESSAGES[FilterValidationError.INVALID_DATE_RANGE]);
            }

            // 验证是否为有效日期
            if (!(values.min instanceof Date) || isNaN(values.min.getTime())) {
                errors.set(`${field}.min`, ERROR_MESSAGES[FilterValidationError.INVALID_DATE_RANGE]);
            }
            if (!(values.max instanceof Date) || isNaN(values.max.getTime())) {
                errors.set(`${field}.max`, ERROR_MESSAGES[FilterValidationError.INVALID_DATE_RANGE]);
            }
        }

        return {
            isValid: errors.size === 0,
            errors,
        };
    }

    /**
     * 将 UI 状态转换为 CardFilter 对象
     * 
     * @param state 过滤对话框状态
     * @returns CardFilter 对象
     * @see 需求 9.1, 9.2, 9.3, 9.4, 9.5
     */
    toCardFilter(state: FilterDialogState): CardFilter {
        const filter: CardFilter = {};

        console.log('[FilterService] toCardFilter called with state:', state);

        // 关键词过滤（只要有内容就生效，不需要 enabled 检查）
        if (state.values.keyword && state.values.keyword.trim()) {
            filter.keyword = state.values.keyword.trim();
            console.log('[FilterService] Set keyword to:', filter.keyword);
        }

        // 数值范围过滤条件
        if (state.enabled.priority) {
            filter.priority = {
                min: state.values.priority.min,
                max: state.values.priority.max,
            };
        }

        if (state.enabled.repetitions) {
            filter.repetitions = {
                min: state.values.repetitions.min,
                max: state.values.repetitions.max,
            };
        }

        if (state.enabled.lapses) {
            filter.lapses = {
                min: state.values.lapses.min,
                max: state.values.lapses.max,
            };
        }

        if (state.enabled.interval) {
            filter.interval = {
                min: state.values.interval.min,
                max: state.values.interval.max,
            };
        }

        if (state.enabled.difficulty) {
            filter.difficulty = {
                min: state.values.difficulty.min,
                max: state.values.difficulty.max,
            };
        }

        if (state.enabled.stability) {
            filter.stability = {
                min: state.values.stability.min,
                max: state.values.stability.max,
            };
        }

        if (state.enabled.retrievability) {
            filter.retrievability = {
                min: state.values.retrievability.min,
                max: state.values.retrievability.max,
            };
        }

        // 日期范围过滤条件
        if (state.enabled.lastReview) {
            filter.lastReview = {
                gte: state.values.lastReview.min,
                lte: state.values.lastReview.max,
            };
        }

        if (state.enabled.nextReview) {
            filter.dueDate = {
                gte: state.values.nextReview.min,
                lte: state.values.nextReview.max,
            };
        }

        // 多选过滤条件
        console.log('[FilterService] cardType enabled:', state.enabled.cardType);
        console.log('[FilterService] cardType values:', state.values.cardType);
        console.log('[FilterService] cardType size:', state.values.cardType.size);

        // cardType 和 cardStatus 不需要 enabled 检查，只要 Set 不为空就添加到 filter
        if (state.values.cardType.size > 0) {
            // 如果只选择了一个类型，直接设置
            if (state.values.cardType.size === 1) {
                filter.cardType = Array.from(state.values.cardType)[0] as 'item' | 'topic';
                console.log('[FilterService] Set cardType to:', filter.cardType);
            } else {
                // 如果选择了多个类型，设置为数组
                filter.cardType = Array.from(state.values.cardType);
                console.log('[FilterService] Set cardType to multiple types:', filter.cardType);
            }
        } else {
            console.log('[FilterService] cardType Set is empty');
        }

        console.log('[FilterService] cardStatus enabled:', state.enabled.cardStatus);
        console.log('[FilterService] cardStatus values:', state.values.cardStatus);
        console.log('[FilterService] cardStatus size:', state.values.cardStatus.size);
        
        if (state.values.cardStatus.size > 0) {
            filter.cardStatus = Array.from(state.values.cardStatus) as Array<'new' | 'learning' | 'review' | 'relearning'>;
            console.log('[FilterService] Set cardStatus to:', filter.cardStatus);
        } else {
            console.log('[FilterService] cardStatus Set is empty');
        }

        console.log('[FilterService] Final filter:', filter);
        return filter;
    }

    /**
     * 将 CardFilter 对象转换为 UI 状态
     * 
     * @param filter CardFilter 对象
     * @returns 过滤对话框状态
     * @see 需求 9.1, 9.2, 9.3, 9.4, 9.5
     */
    fromCardFilter(filter: CardFilter): FilterDialogState {
        const state: FilterDialogState = {
            enabled: {
                priority: false,
                repetitions: false,
                lapses: false,
                interval: false,
                lastReview: false,
                nextReview: false,
                difficulty: false,
                stability: false,
                retrievability: false,
                cardType: false,
                cardStatus: false,
                keyword: false,
            },
            values: {
                priority: { min: 0, max: 100 },
                repetitions: { min: 0, max: 999 },
                lapses: { min: 0, max: 999 },
                interval: { min: 0, max: 9999 },
                lastReview: { min: new Date(), max: new Date() },
                nextReview: { min: new Date(), max: new Date() },
                difficulty: { min: 0, max: 10 },
                stability: { min: 0, max: 9999 },
                retrievability: { min: 0, max: 1 },
                cardType: new Set(),
                cardStatus: new Set(),
                keyword: '',
            },
        };

        // 关键词过滤（只要有内容就生效）
        if (filter.keyword && filter.keyword.trim()) {
            state.enabled.keyword = true;
            state.values.keyword = filter.keyword.trim();
        }

        // 数值范围过滤条件
        if (filter.priority) {
            state.enabled.priority = true;
            state.values.priority = {
                min: filter.priority.min ?? 0,
                max: filter.priority.max ?? 100,
            };
        }

        if (filter.repetitions) {
            state.enabled.repetitions = true;
            state.values.repetitions = {
                min: filter.repetitions.min ?? 0,
                max: filter.repetitions.max ?? 999,
            };
        }

        if (filter.lapses) {
            state.enabled.lapses = true;
            state.values.lapses = {
                min: filter.lapses.min ?? 0,
                max: filter.lapses.max ?? 999,
            };
        }

        if (filter.interval) {
            state.enabled.interval = true;
            state.values.interval = {
                min: filter.interval.min ?? 0,
                max: filter.interval.max ?? 9999,
            };
        }

        if (filter.difficulty) {
            state.enabled.difficulty = true;
            state.values.difficulty = {
                min: filter.difficulty.min ?? 0,
                max: filter.difficulty.max ?? 10,
            };
        }

        if (filter.stability) {
            state.enabled.stability = true;
            state.values.stability = {
                min: filter.stability.min ?? 0,
                max: filter.stability.max ?? 9999,
            };
        }

        if (filter.retrievability) {
            state.enabled.retrievability = true;
            state.values.retrievability = {
                min: filter.retrievability.min ?? 0,
                max: filter.retrievability.max ?? 1,
            };
        }

        // 日期范围过滤条件
        if (filter.lastReview) {
            state.enabled.lastReview = true;
            state.values.lastReview = {
                min: filter.lastReview.gte ?? new Date(),
                max: filter.lastReview.lte ?? new Date(),
            };
        }

        if (filter.dueDate) {
            state.enabled.nextReview = true;
            state.values.nextReview = {
                min: filter.dueDate.gte ?? new Date(),
                max: filter.dueDate.lte ?? new Date(),
            };
        }

        // 多选过滤条件
        if (filter.cardType) {
            state.enabled.cardType = true;
            const types = Array.isArray(filter.cardType) ? filter.cardType : [filter.cardType];
            state.values.cardType = new Set(types);
        }

        if (filter.cardStatus && filter.cardStatus.length > 0) {
            state.enabled.cardStatus = true;
            state.values.cardStatus = new Set(filter.cardStatus);
        }

        return state;
    }

    /**
     * 生成过滤条件摘要文本
     * 
     * @param filter CardFilter 对象
     * @returns 摘要文本
     * @see 需求 11.2, 11.3
     */
    generateSummary(filter: CardFilter): string {
        const parts: string[] = [];

        // 关键词过滤
        if (filter.keyword) {
            parts.push(`关键词: "${filter.keyword}"`);
        }

        // 数值范围过滤条件
        if (filter.priority) {
            parts.push(`优先级: ${filter.priority.min ?? 0}-${filter.priority.max ?? 100}`);
        }

        if (filter.repetitions) {
            parts.push(`复习次数: ${filter.repetitions.min ?? 0}-${filter.repetitions.max ?? 999}`);
        }

        if (filter.lapses) {
            parts.push(`遗忘次数: ${filter.lapses.min ?? 0}-${filter.lapses.max ?? 999}`);
        }

        if (filter.interval) {
            parts.push(`间隔天数: ${filter.interval.min ?? 0}-${filter.interval.max ?? 9999}`);
        }

        if (filter.difficulty) {
            parts.push(`难度: ${filter.difficulty.min ?? 0}-${filter.difficulty.max ?? 10}`);
        }

        if (filter.stability) {
            parts.push(`稳定性: ${filter.stability.min ?? 0}-${filter.stability.max ?? 9999}`);
        }

        if (filter.retrievability) {
            parts.push(`可提取性: ${filter.retrievability.min ?? 0}-${filter.retrievability.max ?? 1}`);
        }

        // 日期范围过滤条件
        if (filter.lastReview) {
            const minDate = filter.lastReview.gte ? this.formatDate(filter.lastReview.gte) : '';
            const maxDate = filter.lastReview.lte ? this.formatDate(filter.lastReview.lte) : '';
            parts.push(`上次复习: ${minDate} - ${maxDate}`);
        }

        if (filter.dueDate) {
            const minDate = filter.dueDate.gte ? this.formatDate(filter.dueDate.gte) : '';
            const maxDate = filter.dueDate.lte ? this.formatDate(filter.dueDate.lte) : '';
            parts.push(`下次复习: ${minDate} - ${maxDate}`);
        }

        // 多选过滤条件
        if (filter.cardType) {
            const types = Array.isArray(filter.cardType) ? filter.cardType : [filter.cardType];
            const typeLabels = types.map(t => t === 'item' ? 'Item' : 'Topic');
            parts.push(`卡片类型: ${typeLabels.join(', ')}`);
        }

        if (filter.cardStatus && filter.cardStatus.length > 0) {
            const statusLabels = filter.cardStatus.map(s => {
                switch (s) {
                    case 'new': return '新卡';
                    case 'learning': return '学习中';
                    case 'review': return '复习';
                    case 'relearning': return '重学';
                    default: return s;
                }
            });
            parts.push(`卡片状态: ${statusLabels.join(', ')}`);
        }

        if (parts.length === 0) {
            return '无过滤条件';
        }

        return `已应用 ${parts.length} 个过滤条件: ${parts.join('; ')}`;
    }

    // ========================================================================
    // 私有辅助方法
    // ========================================================================

    /**
     * 序列化过滤条件（用于存储）
     */
    private serializeFilter(filter: CardFilter): any {
        const serialized: any = {};

        // 复制所有字段
        Object.keys(filter).forEach(key => {
            const value = (filter as any)[key];
            
            // 处理日期对象
            if (value && typeof value === 'object') {
                const hasGte = value.gte instanceof Date;
                const hasLte = value.lte instanceof Date;
                
                if (hasGte || hasLte) {
                    serialized[key] = {
                        ...value,
                        ...(hasGte ? { gte: value.gte.toISOString() } : {}),
                        ...(hasLte ? { lte: value.lte.toISOString() } : {}),
                    };
                } else {
                    serialized[key] = value;
                }
            } else {
                serialized[key] = value;
            }
        });

        return serialized;
    }

    /**
     * 反序列化过滤条件（从存储加载）
     */
    private deserializeFilter(serialized: any): CardFilter {
        const filter: CardFilter = {};

        // 复制所有字段
        Object.keys(serialized).forEach(key => {
            const value = serialized[key];
            
            // 处理日期字符串
            if (value && typeof value === 'object') {
                const hasGte = typeof value.gte === 'string';
                const hasLte = typeof value.lte === 'string';
                
                if (hasGte || hasLte) {
                    filter[key as keyof CardFilter] = {
                        ...value,
                        ...(hasGte ? { gte: new Date(value.gte) } : {}),
                        ...(hasLte ? { lte: new Date(value.lte) } : {}),
                    } as any;
                } else {
                    filter[key as keyof CardFilter] = value;
                }
            } else {
                filter[key as keyof CardFilter] = value;
            }
        });

        return filter;
    }

    /**
     * 格式化日期为字符串
     */
    private formatDate(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}

// ============================================================================
// 导出单例实例
// ============================================================================

/**
 * FilterService 单例实例
 */
export const filterService = new FilterService();

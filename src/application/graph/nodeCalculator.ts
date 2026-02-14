/**
 * 节点大小计算工具
 * 
 * 根据节点的引用数和被引用数计算节点大小，
 * 使用加权公式实现节点重要性的可视化。
 * 
 * Requirements: 14.6, 14.7, 14.8
 */

/**
 * 节点大小计算配置
 */
export interface NodeSizeConfig {
    /** 默认节点大小 */
    defaultSize: number;
    /** 引用权重（出链） */
    refWeight: number;
    /** 被引用权重（入链） */
    defWeight: number;
    /** 增长因子 */
    growthFactor: number;
    /** 最大尺寸倍数（相对于默认大小） */
    maxSizeMultiplier: number;
}

/**
 * 默认配置（参考思源原生关系图增强脚本）
 */
export const DEFAULT_NODE_SIZE_CONFIG: NodeSizeConfig = {
    defaultSize: 15,     // 思源原生默认大小
    refWeight: 1.0,      // 引用权重（出链）
    defWeight: 1.2,      // 被引用权重（入链，略高于引用）
    growthFactor: 0.7,   // 增长系数（值越大，差异越明显）
    maxSizeMultiplier: 5.0, // 最大为默认大小的 5 倍
};

/**
 * 计算节点大小（参考思源原生关系图增强脚本）
 * 
 * 使用线性归一化 + 强化对比度的算法：
 * 1. 将引用数和被引用数归一化到 [0, 1] 范围
 * 2. 应用权重系数（被引用权重略高）
 * 3. 使用强化对比度公式增强差异
 * 4. 应用尺寸上限
 * 
 * 特性：
 * - 零引用节点返回默认大小
 * - 被引用数（入链）权重高于引用数（出链）
 * - 强化对比度，让即使很少引用的节点也有明显变化
 * - 实施尺寸上限，避免节点过大
 * 
 * @param refs 引用数（出链数量）
 * @param defs 被引用数（入链数量）
 * @param config 配置选项（可选）
 * @param maxRefs 最大引用数（用于归一化，可选）
 * @param maxDefs 最大被引用数（用于归一化，可选）
 * @returns 计算后的节点大小
 * 
 * @example
 * // 零引用节点
 * calculateNodeSize(0, 0) // 返回 15（默认大小）
 * 
 * @example
 * // 有引用的节点（使用归一化）
 * calculateNodeSize(5, 10, {}, 20, 30) // 基于归一化计算
 * 
 * @example
 * // 自定义配置
 * calculateNodeSize(10, 20, { defaultSize: 20, refWeight: 1, defWeight: 2 })
 */
export function calculateNodeSize(
    refs: number,
    defs: number,
    config: Partial<NodeSizeConfig> = {},
    maxRefs?: number,
    maxDefs?: number
): number {
    // 合并配置
    const finalConfig: NodeSizeConfig = {
        ...DEFAULT_NODE_SIZE_CONFIG,
        ...config,
    };
    
    const {
        defaultSize,
        refWeight,
        defWeight,
        growthFactor,
        maxSizeMultiplier,
    } = finalConfig;
    
    // 处理零引用情况
    if (refs === 0 && defs === 0) {
        return defaultSize;
    }
    
    // 如果提供了最大值，使用归一化计算（思源原生算法）
    if (maxRefs !== undefined && maxDefs !== undefined && (maxRefs > 0 || maxDefs > 0)) {
        // 防止除零
        const safeMaxRefs = Math.max(1, maxRefs);
        const safeMaxDefs = Math.max(1, maxDefs);
        
        // 线性归一化到 [0, 1]
        let refScore = (refs / safeMaxRefs) * refWeight;
        let defScore = (defs / safeMaxDefs) * defWeight;
        
        // 强化对比度 - 让即使很少引用的节点也有明显变化
        // 使用公式: score = 1.5 * score / (score + 0.3)
        const baseGrowth = 1.5;
        if (refs > 0 || defs > 0) {
            refScore = baseGrowth * refScore / (refScore + 0.3);
            defScore = baseGrowth * defScore / (defScore + 0.3);
        }
        
        // 合并得分
        const totalScore = refScore + defScore;
        
        // 指数增长模式，让差异更明显
        const sizeMultiplier = Math.pow(1 + totalScore, growthFactor * 2);
        
        // 应用尺寸上限
        const cappedMultiplier = Math.min(sizeMultiplier, maxSizeMultiplier);
        
        // 计算最终大小
        return Math.round(defaultSize * cappedMultiplier);
    }
    
    // 如果没有提供最大值，使用简单的线性计算（向后兼容）
    const weightedRefs = refs * refWeight + defs * defWeight;
    const sizeMultiplier = 1 + weightedRefs * growthFactor;
    const cappedMultiplier = Math.min(sizeMultiplier, maxSizeMultiplier);
    
    return Math.round(defaultSize * cappedMultiplier);
}

/**
 * 批量计算节点大小
 * 
 * @param nodes 节点数组，每个节点包含 refs 和 defs 属性
 * @param config 配置选项（可选）
 * @returns 节点大小数组
 */
export function calculateNodeSizes(
    nodes: Array<{ refs: number; defs: number }>,
    config: Partial<NodeSizeConfig> = {}
): number[] {
    return nodes.map(node => calculateNodeSize(node.refs, node.defs, config));
}

/**
 * 获取节点大小的统计信息
 * 
 * @param sizes 节点大小数组
 * @returns 统计信息
 */
export function getNodeSizeStats(sizes: number[]): {
    min: number;
    max: number;
    avg: number;
    median: number;
} {
    if (sizes.length === 0) {
        return { min: 0, max: 0, avg: 0, median: 0 };
    }
    
    const sorted = [...sizes].sort((a, b) => a - b);
    const sum = sizes.reduce((acc, size) => acc + size, 0);
    
    return {
        min: sorted[0],
        max: sorted[sorted.length - 1],
        avg: sum / sizes.length,
        median: sorted[Math.floor(sorted.length / 2)],
    };
}

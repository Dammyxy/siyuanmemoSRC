/**
 * WeightedWalkEngine - 加权随机游走引擎
 * 
 * 实现加权随机选择算法，根据关联类型分配权重并进行概率选择。
 * 
 * Requirements: 1.2, 1.3, 1.4, 1.5, 2.3, 2.4
 */

import { AssociationType, WeightedNeighbor } from './types';

/**
 * 权重映射类型
 */
type WeightMap = Record<AssociationType, number>;

/**
 * 默认权重配置
 */
const DEFAULT_WEIGHTS: WeightMap = {
  [AssociationType.REF_LINK]: 10,
  [AssociationType.HIERARCHY]: 5,
  [AssociationType.TAG]: 3,
  [AssociationType.SIBLING]: 1,
  // 🆕 概念卡专用权重
  [AssociationType.BACKLINK]: 15,
  [AssociationType.CONCEPT_LINK]: 8,
  [AssociationType.DESCRIPTOR]: 3,
};

export class WeightedWalkEngine {
  /** 权重映射配置 */
  private readonly weights: WeightMap;

  /**
   * 构造函数
   * @param customWeights 自定义权重配置（可选）
   */
  constructor(customWeights?: Partial<WeightMap>) {
    this.weights = {
      ...DEFAULT_WEIGHTS,
      ...customWeights,
    };
  }

  /**
   * 从候选列表中选择下一个节点
   * 
   * @param candidates 候选节点列表
   * @returns 选中的节点，如果列表为空则返回 null
   */
  selectNext(candidates: WeightedNeighbor[]): WeightedNeighbor | null {
    if (!candidates || candidates.length === 0) {
      return null;
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    return this.weightedRandom(candidates);
  }

  /**
   * 根据关联类型为邻居节点分配权重
   * 
   * @param neighbor 邻居节点（权重可能为 0 或未设置）
   * @returns 分配权重后的邻居节点
   */
  applyWeight(neighbor: WeightedNeighbor): WeightedNeighbor {
    const weight = this.weights[neighbor.associationType] || 0;
    return {
      ...neighbor,
      weight,
    };
  }

  /**
   * 批量为邻居节点分配权重
   * 
   * @param neighbors 邻居节点列表
   * @returns 分配权重后的邻居节点列表
   */
  applyWeights(neighbors: WeightedNeighbor[]): WeightedNeighbor[] {
    return neighbors.map(n => this.applyWeight(n));
  }

  /**
   * 加权随机选择算法
   * 使用累积权重方法进行概率选择
   * 
   * @param items 候选节点列表
   * @returns 选中的节点
   * @private
   */
  private weightedRandom(items: WeightedNeighbor[]): WeightedNeighbor {
    // 计算总权重
    const totalWeight = items.reduce((sum, item) => {
      const weight = Math.max(0, item.weight); // 确保权重非负
      return sum + weight;
    }, 0);

    // 如果总权重为 0，随机选择一个
    if (totalWeight <= 0) {
      const randomIndex = Math.floor(Math.random() * items.length);
      return items[randomIndex];
    }

    // 生成随机数 [0, totalWeight)
    let random = Math.random() * totalWeight;

    // 遍历候选节点，累加权重直到超过随机数
    for (const item of items) {
      const weight = Math.max(0, item.weight);
      if (random < weight) {
        return item;
      }
      random -= weight;
    }

    throw new Error('Weighted random selection invariant violated: no candidate selected');
  }

  /**
   * 获取当前权重配置
   * 
   * @returns 权重配置的副本
   */
  getWeights(): WeightMap {
    return { ...this.weights };
  }

  /**
   * 获取指定关联类型的权重
   * 
   * @param type 关联类型
   * @returns 权重值
   */
  getWeight(type: AssociationType): number {
    return this.weights[type] || 0;
  }
}

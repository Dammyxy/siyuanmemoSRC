/**
 * NeuralQueueConfig - 神经队列配置验证
 * 
 * 提供配置验证和默认值管理。
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { NeuralQueueConfig, DEFAULT_NEURAL_QUEUE_CONFIG } from './types.ts';

/**
 * 配置验证错误
 */
export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * 配置验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 神经队列配置管理器
 */
export class NeuralQueueConfigManager {
  /**
   * 验证配置对象
   * 
   * @param config 配置对象
   * @returns 验证结果
   * Requirements: 10.5
   */
  static validate(config: Partial<NeuralQueueConfig>): ValidationResult {
    const errors: string[] = [];

    // 验证 historyCapacity
    if (config.historyCapacity !== undefined) {
      if (!Number.isInteger(config.historyCapacity)) {
        errors.push('historyCapacity must be an integer');
      } else if (config.historyCapacity < 1 || config.historyCapacity > 1000) {
        errors.push('historyCapacity must be between 1 and 1000');
      }
    }

    // 验证权重值
    if (config.weights) {
      const { refLink, hierarchy, tag, sibling } = config.weights;
      
      if (refLink !== undefined && (refLink < 0 || !Number.isFinite(refLink))) {
        errors.push('weights.refLink must be a non-negative number');
      }
      if (hierarchy !== undefined && (hierarchy < 0 || !Number.isFinite(hierarchy))) {
        errors.push('weights.hierarchy must be a non-negative number');
      }
      if (tag !== undefined && (tag < 0 || !Number.isFinite(tag))) {
        errors.push('weights.tag must be a non-negative number');
      }
      if (sibling !== undefined && (sibling < 0 || !Number.isFinite(sibling))) {
        errors.push('weights.sibling must be a non-negative number');
      }
    }

    // 验证查询限制
    if (config.queryLimits) {
      const { contextCards, tagCards } = config.queryLimits;
      
      if (contextCards !== undefined) {
        if (!Number.isInteger(contextCards) || contextCards < 1) {
          errors.push('queryLimits.contextCards must be a positive integer');
        }
      }
      if (tagCards !== undefined) {
        if (!Number.isInteger(tagCards) || tagCards < 1) {
          errors.push('queryLimits.tagCards must be a positive integer');
        }
      }
    }

    // 验证功能开关
    if (config.features) {
      const { enableTagAssociation, enableSiblingAssociation } = config.features;
      
      if (enableTagAssociation !== undefined && typeof enableTagAssociation !== 'boolean') {
        errors.push('features.enableTagAssociation must be a boolean');
      }
      if (enableSiblingAssociation !== undefined && typeof enableSiblingAssociation !== 'boolean') {
        errors.push('features.enableSiblingAssociation must be a boolean');
      }
    }

    // 验证 FSRS 集成策略
    if (config.fsrsIntegration !== undefined) {
      if (config.fsrsIntegration !== 'none' && config.fsrsIntegration !== 'minimal') {
        errors.push('fsrsIntegration must be "none" or "minimal"');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 验证配置并抛出异常（如果无效）
   * 
   * @param config 配置对象
   * @throws ConfigValidationError 如果配置无效
   */
  static validateOrThrow(config: Partial<NeuralQueueConfig>): void {
    const result = this.validate(config);
    if (!result.valid) {
      throw new ConfigValidationError(
        `Invalid configuration:\n${result.errors.map(e => `  - ${e}`).join('\n')}`
      );
    }
  }

  /**
   * 合并配置（使用默认值填充缺失项）
   * 
   * @param config 部分配置对象
   * @returns 完整的配置对象
   * Requirements: 10.1, 10.2, 10.3, 10.4
   */
  static merge(config?: Partial<NeuralQueueConfig>): NeuralQueueConfig {
    if (!config) {
      return { ...DEFAULT_NEURAL_QUEUE_CONFIG };
    }

    return {
      historyCapacity: config.historyCapacity ?? DEFAULT_NEURAL_QUEUE_CONFIG.historyCapacity,
      weights: {
        refLink: config.weights?.refLink ?? DEFAULT_NEURAL_QUEUE_CONFIG.weights.refLink,
        hierarchy: config.weights?.hierarchy ?? DEFAULT_NEURAL_QUEUE_CONFIG.weights.hierarchy,
        tag: config.weights?.tag ?? DEFAULT_NEURAL_QUEUE_CONFIG.weights.tag,
        sibling: config.weights?.sibling ?? DEFAULT_NEURAL_QUEUE_CONFIG.weights.sibling,
      },
      queryLimits: {
        contextCards: config.queryLimits?.contextCards ?? DEFAULT_NEURAL_QUEUE_CONFIG.queryLimits.contextCards,
        tagCards: config.queryLimits?.tagCards ?? DEFAULT_NEURAL_QUEUE_CONFIG.queryLimits.tagCards,
      },
      features: {
        enableTagAssociation: config.features?.enableTagAssociation ?? DEFAULT_NEURAL_QUEUE_CONFIG.features.enableTagAssociation,
        enableSiblingAssociation: config.features?.enableSiblingAssociation ?? DEFAULT_NEURAL_QUEUE_CONFIG.features.enableSiblingAssociation,
      },
      fsrsIntegration: config.fsrsIntegration ?? DEFAULT_NEURAL_QUEUE_CONFIG.fsrsIntegration,
    };
  }

  /**
   * 获取默认配置
   * 
   * @returns 默认配置的副本
   */
  static getDefault(): NeuralQueueConfig {
    return { ...DEFAULT_NEURAL_QUEUE_CONFIG };
  }
}

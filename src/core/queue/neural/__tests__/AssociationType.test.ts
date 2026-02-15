/**
 * AssociationType 扩展测试
 * 
 * 验证新增的概念卡专用关联类型
 */

import { describe, it, expect } from 'vitest';
import { AssociationType, DEFAULT_NEURAL_QUEUE_CONFIG } from '../types';

describe('AssociationType - 概念卡扩展', () => {
  describe('枚举值定义', () => {
    it('应该包含所有现有的关联类型', () => {
      expect(AssociationType.REF_LINK).toBe('ref');
      expect(AssociationType.HIERARCHY).toBe('context');
      expect(AssociationType.TAG).toBe('tag');
      expect(AssociationType.SIBLING).toBe('sibling');
    });

    it('应该包含新增的概念卡专用关联类型', () => {
      expect(AssociationType.BACKLINK).toBe('backlink');
      expect(AssociationType.CONCEPT_LINK).toBe('concept');
      expect(AssociationType.DESCRIPTOR).toBe('descriptor');
    });
  });

  describe('默认权重配置', () => {
    it('应该为现有类型配置正确的权重', () => {
      expect(DEFAULT_NEURAL_QUEUE_CONFIG.weights.refLink).toBe(10);
      expect(DEFAULT_NEURAL_QUEUE_CONFIG.weights.hierarchy).toBe(5);
      expect(DEFAULT_NEURAL_QUEUE_CONFIG.weights.tag).toBe(3);
      expect(DEFAULT_NEURAL_QUEUE_CONFIG.weights.sibling).toBe(1);
    });

    it('应该为新增类型配置正确的权重', () => {
      // 反向链接权重最高（隐式定义）
      expect(DEFAULT_NEURAL_QUEUE_CONFIG.weights.backlink).toBe(15);
      // 概念间链接权重中等
      expect(DEFAULT_NEURAL_QUEUE_CONFIG.weights.conceptLink).toBe(8);
      // 描述符卡权重较低（显式定义）
      expect(DEFAULT_NEURAL_QUEUE_CONFIG.weights.descriptor).toBe(3);
    });

    it('反向链接权重应该高于其他所有类型', () => {
      const { weights } = DEFAULT_NEURAL_QUEUE_CONFIG;
      expect(weights.backlink).toBeGreaterThan(weights.refLink);
      expect(weights.backlink).toBeGreaterThan(weights.conceptLink);
      expect(weights.backlink).toBeGreaterThan(weights.hierarchy);
      expect(weights.backlink).toBeGreaterThan(weights.descriptor);
    });

    it('概念间链接权重应该高于描述符卡', () => {
      const { weights } = DEFAULT_NEURAL_QUEUE_CONFIG;
      expect(weights.conceptLink).toBeGreaterThan(weights.descriptor);
    });
  });

  describe('权重优先级验证', () => {
    it('应该遵循隐式定义优先的设计理念', () => {
      const { weights } = DEFAULT_NEURAL_QUEUE_CONFIG;
      
      // 隐式定义（反向链接）> 概念关联 > 显式定义（描述符）
      expect(weights.backlink).toBeGreaterThan(weights.conceptLink);
      expect(weights.conceptLink).toBeGreaterThan(weights.descriptor);
    });

    it('权重排序应该符合设计文档', () => {
      const { weights } = DEFAULT_NEURAL_QUEUE_CONFIG;
      const sortedWeights = [
        { type: 'backlink', weight: weights.backlink },
        { type: 'refLink', weight: weights.refLink },
        { type: 'conceptLink', weight: weights.conceptLink },
        { type: 'hierarchy', weight: weights.hierarchy },
        { type: 'descriptor', weight: weights.descriptor },
        { type: 'tag', weight: weights.tag },
        { type: 'sibling', weight: weights.sibling },
      ].sort((a, b) => b.weight - a.weight);

      // 验证排序顺序
      expect(sortedWeights[0].type).toBe('backlink'); // 15
      expect(sortedWeights[1].type).toBe('refLink');  // 10
      expect(sortedWeights[2].type).toBe('conceptLink'); // 8
      expect(sortedWeights[3].type).toBe('hierarchy'); // 5
    });
  });

  describe('类型安全性', () => {
    it('所有关联类型应该是有效的枚举值', () => {
      const allTypes = Object.values(AssociationType);
      expect(allTypes).toContain('ref');
      expect(allTypes).toContain('context');
      expect(allTypes).toContain('tag');
      expect(allTypes).toContain('sibling');
      expect(allTypes).toContain('backlink');
      expect(allTypes).toContain('concept');
      expect(allTypes).toContain('descriptor');
    });

    it('枚举应该包含7个类型', () => {
      const allTypes = Object.values(AssociationType);
      expect(allTypes.length).toBe(7);
    });
  });
});

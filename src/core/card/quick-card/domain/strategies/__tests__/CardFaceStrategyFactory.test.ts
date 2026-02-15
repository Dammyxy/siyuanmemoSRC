/**
 * CardFaceStrategyFactory 单元测试
 */

import { describe, it, expect } from 'vitest';
import { CardFaceStrategyFactory } from '../CardFaceStrategyFactory';
import { BasicCardStrategy } from '../BasicCardStrategy';
import type { QuickCardType } from '../../types';

describe('CardFaceStrategyFactory', () => {
  describe('create()', () => {
    it('应该为 basic 类型返回 BasicCardStrategy 实例', () => {
      const strategy = CardFaceStrategyFactory.create('basic');
      
      expect(strategy).toBeInstanceOf(BasicCardStrategy);
    });
    
    it('应该为相同类型返回相同的实例（单例模式）', () => {
      const strategy1 = CardFaceStrategyFactory.create('basic');
      const strategy2 = CardFaceStrategyFactory.create('basic');
      
      expect(strategy1).toBe(strategy2);
    });
    
    it('应该返回可用的策略实例', () => {
      const strategy = CardFaceStrategyFactory.create('basic');
      const result = strategy.parse('问题 >> 答案', { symbol: '>>' });
      
      expect(result.front.html).toBe('问题');
      expect(result.back.html).toBe('答案');
    });
    
    it('应该为未知类型抛出错误', () => {
      expect(() => {
        CardFaceStrategyFactory.create('unknown' as QuickCardType);
      }).toThrow('Unknown card type: unknown');
    });
    
    it('应该为 concept 类型返回 ConceptCardStrategy 实例', () => {
      const strategy = CardFaceStrategyFactory.create('concept');
      
      expect(strategy).toBeDefined();
      expect(typeof strategy.parse).toBe('function');
      expect(typeof strategy.shouldHideContent).toBe('function');
    });
    
    it('应该为 descriptor 类型返回 DescriptorCardStrategy 实例', () => {
      const strategy = CardFaceStrategyFactory.create('descriptor');
      
      expect(strategy).toBeDefined();
      expect(typeof strategy.parse).toBe('function');
      expect(typeof strategy.shouldHideContent).toBe('function');
    });
    
    it('应该为 cloze 类型返回 ClozeCardStrategy 实例', () => {
      const strategy = CardFaceStrategyFactory.create('cloze');
      
      expect(strategy).toBeDefined();
      expect(typeof strategy.parse).toBe('function');
      expect(typeof strategy.shouldHideContent).toBe('function');
    });
    
    it('应该为 multiLine 类型返回 MultiLineCardStrategy 实例', () => {
      const strategy = CardFaceStrategyFactory.create('multiLine');
      
      expect(strategy).toBeDefined();
      expect(typeof strategy.parse).toBe('function');
      expect(typeof strategy.shouldHideContent).toBe('function');
    });
  });
  
  describe('策略实例功能验证', () => {
    it('返回的策略应该实现 parse 方法', () => {
      const strategy = CardFaceStrategyFactory.create('basic');
      
      expect(typeof strategy.parse).toBe('function');
    });
    
    it('返回的策略应该实现 shouldHideContent 方法', () => {
      const strategy = CardFaceStrategyFactory.create('basic');
      
      expect(typeof strategy.shouldHideContent).toBe('function');
    });
    
    it('返回的策略的 parse 方法应该返回正确的结构', () => {
      const strategy = CardFaceStrategyFactory.create('basic');
      const result = strategy.parse('测试 >> 内容', { symbol: '>>' });
      
      expect(result).toHaveProperty('front');
      expect(result).toHaveProperty('back');
      expect(result.front).toHaveProperty('html');
      expect(result.front).toHaveProperty('hiddenTypes');
      expect(result.back).toHaveProperty('html');
      expect(result.back).toHaveProperty('hiddenTypes');
    });
    
    it('返回的策略的 shouldHideContent 方法应该返回布尔值', () => {
      const strategy = CardFaceStrategyFactory.create('basic');
      const result = strategy.shouldHideContent('mark', { symbol: '>>' });
      
      expect(typeof result).toBe('boolean');
    });
  });
  
  describe('错误处理', () => {
    it('应该为 null 类型抛出错误', () => {
      expect(() => {
        CardFaceStrategyFactory.create(null as any);
      }).toThrow();
    });
    
    it('应该为 undefined 类型抛出错误', () => {
      expect(() => {
        CardFaceStrategyFactory.create(undefined as any);
      }).toThrow();
    });
    
    it('应该为空字符串抛出错误', () => {
      expect(() => {
        CardFaceStrategyFactory.create('' as QuickCardType);
      }).toThrow();
    });
    
    it('应该为数字类型抛出错误', () => {
      expect(() => {
        CardFaceStrategyFactory.create(123 as any);
      }).toThrow();
    });
    
    it('应该为对象类型抛出错误', () => {
      expect(() => {
        CardFaceStrategyFactory.create({} as any);
      }).toThrow();
    });
  });
  
  describe('性能测试', () => {
    it('应该快速创建策略实例（< 1ms）', () => {
      const startTime = performance.now();
      
      for (let i = 0; i < 1000; i++) {
        CardFaceStrategyFactory.create('basic');
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // 1000 次调用应该在 10ms 内完成
      expect(duration).toBeLessThan(10);
    });
    
    it('应该复用实例而不是每次创建新实例', () => {
      const instances = new Set();
      
      for (let i = 0; i < 100; i++) {
        instances.add(CardFaceStrategyFactory.create('basic'));
      }
      
      // 所有调用应该返回同一个实例
      expect(instances.size).toBe(1);
    });
  });
});

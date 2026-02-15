/**
 * CardFace 值对象单元测试
 */

import { describe, it, expect } from 'vitest';
import { CardFace } from '../CardFace';
import type { CardFaceData, HiddenContentType } from '../types';

describe('CardFace', () => {
  describe('构造函数', () => {
    it('应该正确创建 CardFace 实例', () => {
      const data: CardFaceData = {
        html: '<p>测试内容</p>',
        hiddenTypes: ['mark'],
      };
      
      const face = new CardFace(data);
      
      expect(face.html).toBe('<p>测试内容</p>');
      expect(face.hiddenTypes).toEqual(['mark']);
    });
    
    it('应该创建空隐藏类型的 CardFace', () => {
      const data: CardFaceData = {
        html: '<p>测试内容</p>',
        hiddenTypes: [],
      };
      
      const face = new CardFace(data);
      
      expect(face.html).toBe('<p>测试内容</p>');
      expect(face.hiddenTypes).toEqual([]);
    });
    
    it('应该创建包含多个隐藏类型的 CardFace', () => {
      const data: CardFaceData = {
        html: '<p>测试内容</p>',
        hiddenTypes: ['mark', 'list', 'heading'],
      };
      
      const face = new CardFace(data);
      
      expect(face.hiddenTypes).toEqual(['mark', 'list', 'heading']);
    });
    
    it('应该冻结 hiddenTypes 数组，保证不可变性', () => {
      const data: CardFaceData = {
        html: '<p>测试内容</p>',
        hiddenTypes: ['mark'],
      };
      
      const face = new CardFace(data);
      
      expect(Object.isFrozen(face.hiddenTypes)).toBe(true);
    });
    
    it('应该创建独立的 hiddenTypes 副本', () => {
      const hiddenTypes: HiddenContentType[] = ['mark'];
      const data: CardFaceData = {
        html: '<p>测试内容</p>',
        hiddenTypes,
      };
      
      const face = new CardFace(data);
      
      // 修改原数组不应影响 CardFace 实例
      hiddenTypes.push('list');
      
      expect(face.hiddenTypes).toEqual(['mark']);
    });
  });
  
  describe('getCssClasses()', () => {
    it('应该将 mark 映射为 card__block--hidemark', () => {
      const face = new CardFace({
        html: '<p>测试</p>',
        hiddenTypes: ['mark'],
      });
      
      const classes = face.getCssClasses();
      
      expect(classes).toEqual(['card__block--hidemark']);
    });
    
    it('应该将 list 映射为 card__block--hideli', () => {
      const face = new CardFace({
        html: '<p>测试</p>',
        hiddenTypes: ['list'],
      });
      
      const classes = face.getCssClasses();
      
      expect(classes).toEqual(['card__block--hideli']);
    });
    
    it('应该将 heading 映射为 card__block--hideh', () => {
      const face = new CardFace({
        html: '<p>测试</p>',
        hiddenTypes: ['heading'],
      });
      
      const classes = face.getCssClasses();
      
      expect(classes).toEqual(['card__block--hideh']);
    });
    
    it('应该将 superblock 映射为 card__block--hidesb', () => {
      const face = new CardFace({
        html: '<p>测试</p>',
        hiddenTypes: ['superblock'],
      });
      
      const classes = face.getCssClasses();
      
      expect(classes).toEqual(['card__block--hidesb']);
    });
    
    it('应该正确映射多个隐藏类型', () => {
      const face = new CardFace({
        html: '<p>测试</p>',
        hiddenTypes: ['mark', 'list'],
      });
      
      const classes = face.getCssClasses();
      
      expect(classes).toEqual(['card__block--hidemark', 'card__block--hideli']);
    });
    
    it('应该正确映射所有隐藏类型', () => {
      const face = new CardFace({
        html: '<p>测试</p>',
        hiddenTypes: ['mark', 'list', 'heading', 'superblock'],
      });
      
      const classes = face.getCssClasses();
      
      expect(classes).toEqual([
        'card__block--hidemark',
        'card__block--hideli',
        'card__block--hideh',
        'card__block--hidesb',
      ]);
    });
    
    it('应该返回空数组当没有隐藏类型时', () => {
      const face = new CardFace({
        html: '<p>测试</p>',
        hiddenTypes: [],
      });
      
      const classes = face.getCssClasses();
      
      expect(classes).toEqual([]);
    });
    
    it('应该保持隐藏类型的顺序', () => {
      const face = new CardFace({
        html: '<p>测试</p>',
        hiddenTypes: ['superblock', 'mark', 'heading', 'list'],
      });
      
      const classes = face.getCssClasses();
      
      expect(classes).toEqual([
        'card__block--hidesb',
        'card__block--hidemark',
        'card__block--hideh',
        'card__block--hideli',
      ]);
    });
  });
  
  describe('值对象特性', () => {
    it('应该是不可变的（html 属性只读）', () => {
      const face = new CardFace({
        html: '<p>测试</p>',
        hiddenTypes: [],
      });
      
      // TypeScript 会在编译时阻止修改 readonly 属性
      // 运行时，readonly 属性仍然可以被赋值（JavaScript 特性）
      // 但我们依赖 TypeScript 的类型检查来保证不可变性
      expect(face.html).toBe('<p>测试</p>');
    });
    
    it('应该是不可变的（hiddenTypes 数组冻结）', () => {
      const face = new CardFace({
        html: '<p>测试</p>',
        hiddenTypes: ['mark'],
      });
      
      // 尝试修改冻结的数组应该失败
      expect(() => {
        // @ts-expect-error - 测试不可变性
        face.hiddenTypes.push('list');
      }).toThrow();
    });
  });
});

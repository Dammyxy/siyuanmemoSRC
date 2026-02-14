/**
 * FilterService 单元测试
 * 
 * 测试过滤服务的核心功能：
 * - 验证过滤条件
 * - 转换 UI 状态和 CardFilter
 * - 生成过滤摘要
 * - 持久化过滤设置
 * 
 * @see .kiro/specs/filter-group-queue-ui/requirements.md
 * @see .kiro/specs/filter-group-queue-ui/design.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FilterService } from '../FilterService';
import type { CardFilter } from '../../../../types/unified-data-source';
import type { FilterDialogState } from '../FilterService';

describe('FilterService', () => {
  let service: FilterService;
  
  beforeEach(() => {
    service = new FilterService();
    // 清空 localStorage
    localStorage.clear();
  });
  
  afterEach(() => {
    localStorage.clear();
  });

  describe('验证功能', () => {
    it('应该验证数值范围（最小值不大于最大值）', () => {
      const state: FilterDialogState = {
        enabled: { priority: true, repetitions: false, lapses: false, interval: false, lastReview: false, nextReview: false, difficulty: false, stability: false, retrievability: false, cardType: false, cardStatus: false },
        values: {
          priority: { min: 50, max: 30 }, // 错误：最小值大于最大值
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
        },
      };

      const result = service.validateFilter(state);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.has('priority')).toBe(true);
    });

    it('应该验证日期范围（最小日期不晚于最大日期）', () => {
      const minDate = new Date('2024-01-01');
      const maxDate = new Date('2023-01-01'); // 错误：最小日期晚于最大日期
      
      const state: FilterDialogState = {
        enabled: { priority: false, repetitions: false, lapses: false, interval: false, lastReview: true, nextReview: false, difficulty: false, stability: false, retrievability: false, cardType: false, cardStatus: false },
        values: {
          priority: { min: 0, max: 100 },
          repetitions: { min: 0, max: 999 },
          lapses: { min: 0, max: 999 },
          interval: { min: 0, max: 9999 },
          lastReview: { min: minDate, max: maxDate },
          nextReview: { min: new Date(), max: new Date() },
          difficulty: { min: 0, max: 10 },
          stability: { min: 0, max: 9999 },
          retrievability: { min: 0, max: 1 },
          cardType: new Set(),
          cardStatus: new Set(),
        },
      };

      const result = service.validateFilter(state);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.has('lastReview')).toBe(true);
    });

    it('应该通过有效的过滤条件验证', () => {
      const state: FilterDialogState = {
        enabled: { priority: true, repetitions: true, lapses: false, interval: false, lastReview: false, nextReview: false, difficulty: false, stability: false, retrievability: false, cardType: false, cardStatus: false },
        values: {
          priority: { min: 0, max: 100 },
          repetitions: { min: 0, max: 50 },
          lapses: { min: 0, max: 999 },
          interval: { min: 0, max: 9999 },
          lastReview: { min: new Date(), max: new Date() },
          nextReview: { min: new Date(), max: new Date() },
          difficulty: { min: 0, max: 10 },
          stability: { min: 0, max: 9999 },
          retrievability: { min: 0, max: 1 },
          cardType: new Set(),
          cardStatus: new Set(),
        },
      };

      const result = service.validateFilter(state);
      
      expect(result.isValid).toBe(true);
      expect(result.errors.size).toBe(0);
    });
  });

  describe('UI 状态和 CardFilter 转换', () => {
    it('应该将 UI 状态转换为 CardFilter', () => {
      const state: FilterDialogState = {
        enabled: { priority: true, repetitions: true, lapses: false, interval: false, lastReview: false, nextReview: false, difficulty: false, stability: false, retrievability: false, cardType: false, cardStatus: false },
        values: {
          priority: { min: 10, max: 90 },
          repetitions: { min: 5, max: 50 },
          lapses: { min: 0, max: 999 },
          interval: { min: 0, max: 9999 },
          lastReview: { min: new Date(), max: new Date() },
          nextReview: { min: new Date(), max: new Date() },
          difficulty: { min: 0, max: 10 },
          stability: { min: 0, max: 9999 },
          retrievability: { min: 0, max: 1 },
          cardType: new Set(),
          cardStatus: new Set(),
        },
      };

      const filter = service.toCardFilter(state);
      
      expect(filter.priority).toEqual({ min: 10, max: 90 });
      expect(filter.repetitions).toEqual({ min: 5, max: 50 });
      expect(filter.lapses).toBeUndefined();
    });

    it('应该将 CardFilter 转换为 UI 状态', () => {
      const filter: CardFilter = {
        priority: { min: 10, max: 90 },
        repetitions: { min: 5, max: 50 },
      };

      const state = service.fromCardFilter(filter);
      
      expect(state.enabled.priority).toBe(true);
      expect(state.enabled.repetitions).toBe(true);
      expect(state.enabled.lapses).toBe(false);
      expect(state.values.priority).toEqual({ min: 10, max: 90 });
      expect(state.values.repetitions).toEqual({ min: 5, max: 50 });
    });
  });

  describe('过滤摘要生成', () => {
    it('应该生成空过滤条件的摘要', () => {
      const filter: CardFilter = {};
      const summary = service.generateSummary(filter);
      
      expect(summary).toBe('无过滤条件');
    });

    it('应该生成数值范围过滤条件的摘要', () => {
      const filter: CardFilter = {
        priority: { min: 10, max: 90 },
        repetitions: { min: 5, max: 50 },
      };
      
      const summary = service.generateSummary(filter);
      
      expect(summary).toContain('优先级: 10-90');
      expect(summary).toContain('复习次数: 5-50');
      expect(summary).toContain('已应用 2 个过滤条件');
    });

    it('应该生成多选过滤条件的摘要', () => {
      const filter: CardFilter = {
        cardType: 'item',
        cardStatus: ['memorized', 'pending'],
      };
      
      const summary = service.generateSummary(filter);
      
      expect(summary).toContain('卡片类型: Item');
      expect(summary).toContain('卡片状态');
      expect(summary).toContain('已记忆');
      expect(summary).toContain('待复习');
    });
  });

  describe('持久化功能', () => {
    it('应该保存过滤条件到 localStorage', () => {
      const filter: CardFilter = {
        priority: { min: 10, max: 90 },
      };

      service.saveFilter(filter);
      
      const stored = localStorage.getItem('filter-group-queue-settings');
      expect(stored).toBeTruthy();
      
      const parsed = JSON.parse(stored!);
      expect(parsed.priority).toEqual({ min: 10, max: 90 });
    });

    it('应该从 localStorage 加载过滤条件', () => {
      const filter: CardFilter = {
        priority: { min: 10, max: 90 },
        repetitions: { min: 5, max: 50 },
      };

      service.saveFilter(filter);
      const loaded = service.loadFilter();
      
      expect(loaded).toBeTruthy();
      expect(loaded!.priority).toEqual({ min: 10, max: 90 });
      expect(loaded!.repetitions).toEqual({ min: 5, max: 50 });
    });

    it('应该在 localStorage 为空时返回 null', () => {
      const loaded = service.loadFilter();
      
      expect(loaded).toBeNull();
    });

    it('应该处理日期序列化和反序列化', () => {
      const minDate = new Date('2024-01-01');
      const maxDate = new Date('2024-12-31');
      
      const filter: CardFilter = {
        lastReview: { gte: minDate, lte: maxDate },
      };

      service.saveFilter(filter);
      const loaded = service.loadFilter();
      
      expect(loaded).toBeTruthy();
      expect(loaded!.lastReview).toBeTruthy();
      expect(loaded!.lastReview!.gte).toBeInstanceOf(Date);
      expect(loaded!.lastReview!.lte).toBeInstanceOf(Date);
      expect(loaded!.lastReview!.gte!.getTime()).toBe(minDate.getTime());
      expect(loaded!.lastReview!.lte!.getTime()).toBe(maxDate.getTime());
    });
  });
});

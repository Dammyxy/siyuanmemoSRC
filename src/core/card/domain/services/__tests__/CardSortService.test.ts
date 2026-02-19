/**
 * CardSortService 单元测试
 */

import { describe, it, expect } from 'vitest';
import { CardSortService } from '../CardSortService';
import { CardState } from '../CardScheduleService';
import type { FSRSCard } from '@/types';

describe('CardSortService', () => {
  const service = new CardSortService();
  
  // 测试数据
  const mockCards: Card[] = [
    {
      id: 'card-1',
      blockId: '20240103120000-abc123',
      state: CardState.Review,
      due: new Date('2024-01-15').getTime(),
      stability: 10.0,
      difficulty: 5.0,
      reps: 5,
      lapses: 1,
      scheduledDays: 10,
      lastReview: new Date('2024-01-05').getTime(),
      meta: { priority: 80 },
    } as Card,
    {
      id: 'card-2',
      blockId: '20240101120000-def456',
      state: CardState.New,
      due: new Date('2024-01-10').getTime(),
      stability: 1.0,
      difficulty: 6.0,
      reps: 0,
      lapses: 0,
      scheduledDays: 1,
      lastReview: null,
      meta: { priority: 50 },
    } as Card,
    {
      id: 'card-3',
      blockId: '20240102120000-ghi789',
      state: CardState.Learning,
      due: new Date('2024-01-12').getTime(),
      stability: 2.0,
      difficulty: 4.0,
      reps: 1,
      lapses: 0,
      scheduledDays: 2,
      lastReview: new Date('2024-01-10').getTime(),
      meta: { priority: 90 },
    } as Card,
    {
      id: 'card-4',
      blockId: '20240104120000-jkl012',
      state: CardState.Suspended,
      due: new Date('2024-01-20').getTime(),
      stability: 5.0,
      difficulty: 7.0,
      reps: 3,
      lapses: 2,
      scheduledDays: 5,
      lastReview: new Date('2024-01-15').getTime(),
      meta: { priority: 30 },
    } as Card,
  ];
  
  describe('sort - 单字段排序', () => {
    it('应该按到期时间升序排序', () => {
      const result = service.sort(mockCards, 'due', 'asc');
      expect(result.map(c => c.id)).toEqual(['card-2', 'card-3', 'card-1', 'card-4']);
    });
    
    it('应该按到期时间降序排序', () => {
      const result = service.sort(mockCards, 'due', 'desc');
      expect(result.map(c => c.id)).toEqual(['card-4', 'card-1', 'card-3', 'card-2']);
    });
    
    it('应该按稳定性升序排序', () => {
      const result = service.sort(mockCards, 'stability', 'asc');
      expect(result.map(c => c.id)).toEqual(['card-2', 'card-3', 'card-4', 'card-1']);
    });
    
    it('应该按难度降序排序', () => {
      const result = service.sort(mockCards, 'difficulty', 'desc');
      expect(result.map(c => c.id)).toEqual(['card-4', 'card-2', 'card-1', 'card-3']);
    });
    
    it('应该按优先级降序排序', () => {
      const result = service.sort(mockCards, 'priority', 'desc');
      expect(result.map(c => c.id)).toEqual(['card-3', 'card-1', 'card-2', 'card-4']);
    });
    
    it('应该按复习次数升序排序', () => {
      const result = service.sort(mockCards, 'reps', 'asc');
      expect(result.map(c => c.id)).toEqual(['card-2', 'card-3', 'card-4', 'card-1']);
    });
    
    it('应该按遗忘次数升序排序', () => {
      const result = service.sort(mockCards, 'lapses', 'asc');
      expect(result.map(c => c.id)).toEqual(['card-2', 'card-3', 'card-1', 'card-4']);
    });
    
    it('应该按间隔天数升序排序', () => {
      const result = service.sort(mockCards, 'interval', 'asc');
      expect(result.map(c => c.id)).toEqual(['card-2', 'card-3', 'card-4', 'card-1']);
    });
    
    it('应该按创建时间（块 ID）升序排序', () => {
      const result = service.sort(mockCards, 'created', 'asc');
      expect(result.map(c => c.id)).toEqual(['card-2', 'card-3', 'card-1', 'card-4']);
    });
    
    it('应该按修改时间（lastReview）升序排序', () => {
      const result = service.sort(mockCards, 'modified', 'asc');
      // card-2 的 lastReview 为 null，应该排在最前面
      expect(result[0].id).toBe('card-2');
    });
  });
  
  describe('sortMultiple - 多字段排序', () => {
    it('应该按多个字段依次排序', () => {
      // 先按优先级降序，再按到期时间升序
      const result = service.sortMultiple(mockCards, [
        { field: 'priority', order: 'desc' },
        { field: 'due', order: 'asc' },
      ]);
      
      // 优先级：card-3(90) > card-1(80) > card-2(50) > card-4(30)
      expect(result.map(c => c.id)).toEqual(['card-3', 'card-1', 'card-2', 'card-4']);
    });
    
    it('空排序规则应该返回原数组', () => {
      const result = service.sortMultiple(mockCards, []);
      expect(result).toEqual(mockCards);
    });
  });
  
  describe('快捷排序方法', () => {
    it('sortByDueTime 应该按到期时间排序', () => {
      const result = service.sortByDueTime(mockCards, true);
      expect(result.map(c => c.id)).toEqual(['card-2', 'card-3', 'card-1', 'card-4']);
    });
    
    it('sortByStability 应该按稳定性排序', () => {
      const result = service.sortByStability(mockCards, false);
      expect(result.map(c => c.id)).toEqual(['card-1', 'card-4', 'card-3', 'card-2']);
    });
    
    it('sortByDifficulty 应该按难度排序', () => {
      const result = service.sortByDifficulty(mockCards, true);
      expect(result.map(c => c.id)).toEqual(['card-3', 'card-1', 'card-2', 'card-4']);
    });
    
    it('sortByPriority 应该按优先级排序（默认降序）', () => {
      const result = service.sortByPriority(mockCards);
      expect(result.map(c => c.id)).toEqual(['card-3', 'card-1', 'card-2', 'card-4']);
    });
  });
  
  describe('不可变性', () => {
    it('排序不应该修改原数组', () => {
      const original = [...mockCards];
      service.sort(mockCards, 'due', 'asc');
      expect(mockCards).toEqual(original);
    });
  });
});

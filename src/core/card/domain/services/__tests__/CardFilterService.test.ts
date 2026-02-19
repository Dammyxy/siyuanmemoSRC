/**
 * CardFilterService 单元测试
 */

import { describe, it, expect } from 'vitest';
import { CardFilterService } from '../CardFilterService';
import { CardState } from '../CardScheduleService';
import type { FSRSCard } from '@/types';

describe('CardFilterService', () => {
  const service = new CardFilterService();
  
  // 测试数据
  const mockCards: Card[] = [
    {
      id: 'card-1',
      blockId: '20240101120000-abc123',
      state: CardState.New,
      type: 'concept',
      due: Date.now(),
      stability: 1.0,
      difficulty: 5.0,
      reps: 0,
      lapses: 0,
      lastReview: null,
      meta: {
        content: 'What is DDD?',
        deckId: 'deck-1',
        tags: ['programming', 'architecture'],
      },
    } as Card,
    {
      id: 'card-2',
      blockId: '20240102120000-def456',
      state: CardState.Learning,
      type: 'item',
      due: Date.now(),
      stability: 2.0,
      difficulty: 6.0,
      reps: 1,
      lapses: 0,
      lastReview: Date.now(),
      meta: {
        content: 'DDD and Domain-Driven Design principles',
        deckId: 'deck-1',
        tags: ['programming'],
      },
    } as Card,
    {
      id: 'card-3',
      blockId: '20240103120000-ghi789',
      state: CardState.Review,
      type: 'concept',
      due: Date.now(),
      stability: 10.0,
      difficulty: 4.0,
      reps: 5,
      lapses: 1,
      lastReview: Date.now(),
      meta: {
        content: 'Aggregate Root pattern',
        deckId: 'deck-2',
        tags: ['architecture', 'patterns'],
      },
    } as Card,
    {
      id: 'card-4',
      blockId: '20240104120000-jkl012',
      state: CardState.Suspended,
      type: 'item',
      due: Date.now(),
      stability: 5.0,
      difficulty: 7.0,
      reps: 3,
      lapses: 2,
      lastReview: Date.now(),
      meta: {
        content: 'Repository pattern implementation',
        deckId: 'deck-2',
        tags: ['patterns'],
      },
    } as Card,
  ];
  
  describe('filterByStates', () => {
    it('应该按状态过滤卡片', () => {
      const result = service.filterByStates(mockCards, [CardState.New]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('card-1');
    });
    
    it('应该支持多个状态过滤', () => {
      const result = service.filterByStates(mockCards, [CardState.New, CardState.Learning]);
      expect(result).toHaveLength(2);
      expect(result.map(c => c.id)).toEqual(['card-1', 'card-2']);
    });
    
    it('空状态列表应该返回所有卡片', () => {
      const result = service.filterByStates(mockCards, []);
      expect(result).toHaveLength(4);
    });
  });
  
  describe('filterByCardTypes', () => {
    it('应该按卡片类型过滤', () => {
      const result = service.filterByCardTypes(mockCards, ['concept']);
      expect(result).toHaveLength(2);
      expect(result.map(c => c.id)).toEqual(['card-1', 'card-3']);
    });
    
    it('应该支持多个类型过滤', () => {
      const result = service.filterByCardTypes(mockCards, ['concept', 'item']);
      expect(result).toHaveLength(4);
    });
    
    it('空类型列表应该返回所有卡片', () => {
      const result = service.filterByCardTypes(mockCards, []);
      expect(result).toHaveLength(4);
    });
  });
  
  describe('filterBySearchText', () => {
    it('应该按内容搜索卡片', () => {
      const result = service.filterBySearchText(mockCards, 'DDD');
      expect(result).toHaveLength(2);
      expect(result.map(c => c.id)).toEqual(['card-1', 'card-2']);
    });
    
    it('搜索应该不区分大小写', () => {
      const result = service.filterBySearchText(mockCards, 'ddd');
      expect(result).toHaveLength(2);
    });
    
    it('应该支持按块 ID 搜索', () => {
      const result = service.filterBySearchText(mockCards, 'abc123');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('card-1');
    });
    
    it('空搜索文本应该返回所有卡片', () => {
      const result = service.filterBySearchText(mockCards, '');
      expect(result).toHaveLength(4);
    });
  });
  
  describe('filterByTags', () => {
    it('应该按标签过滤卡片（匹配任意）', () => {
      const result = service.filterByTags(mockCards, ['programming']);
      expect(result).toHaveLength(2);
      expect(result.map(c => c.id)).toEqual(['card-1', 'card-2']);
    });
    
    it('应该支持匹配所有标签', () => {
      const result = service.filterByTags(mockCards, ['programming', 'architecture'], true);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('card-1');
    });
    
    it('空标签列表应该返回所有卡片', () => {
      const result = service.filterByTags(mockCards, []);
      expect(result).toHaveLength(4);
    });
  });
  
  describe('filterByDeckIds', () => {
    it('应该按 Deck ID 过滤卡片', () => {
      const result = service.filterByDeckIds(mockCards, ['deck-1']);
      expect(result).toHaveLength(2);
      expect(result.map(c => c.id)).toEqual(['card-1', 'card-2']);
    });
    
    it('应该支持多个 Deck ID', () => {
      const result = service.filterByDeckIds(mockCards, ['deck-1', 'deck-2']);
      expect(result).toHaveLength(4);
    });
    
    it('空 Deck ID 列表应该返回所有卡片', () => {
      const result = service.filterByDeckIds(mockCards, []);
      expect(result).toHaveLength(4);
    });
  });
  
  describe('countByState', () => {
    it('应该统计指定状态的卡片数量', () => {
      expect(service.countByState(mockCards, CardState.New)).toBe(1);
      expect(service.countByState(mockCards, CardState.Learning)).toBe(1);
      expect(service.countByState(mockCards, CardState.Review)).toBe(1);
      expect(service.countByState(mockCards, CardState.Suspended)).toBe(1);
    });
  });
  
  describe('countByCardType', () => {
    it('应该统计指定类型的卡片数量', () => {
      expect(service.countByCardType(mockCards, 'concept')).toBe(2);
      expect(service.countByCardType(mockCards, 'item')).toBe(2);
    });
  });
  
  describe('applyFilters', () => {
    it('应该组合多个过滤条件', () => {
      const result = service.applyFilters(mockCards, {
        states: [CardState.New, CardState.Learning, CardState.Review],
        cardTypes: ['concept'],
        searchText: 'DDD',
      });
      
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('card-1');
    });
    
    it('空过滤条件应该返回所有卡片', () => {
      const result = service.applyFilters(mockCards, {});
      expect(result).toHaveLength(4);
    });
  });
});

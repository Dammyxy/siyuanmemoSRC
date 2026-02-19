/**
 * CardScheduleService 单元测试
 * 
 * @see .kiro/specs/ddd-refactoring/long-term-improvements.md - 阶段 1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CardScheduleService, CardState } from '../CardScheduleService';
import type { Card } from '@/services/StorageManager';

/**
 * 创建测试卡片的辅助函数
 */
function createCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'test-card-id',
    blockId: 'test-block-id',
    due: Date.now(),
    stability: 1,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    lastReview: Date.now(),
    ...overrides,
  } as Card;
}

describe('CardScheduleService', () => {
  let service: CardScheduleService;
  
  beforeEach(() => {
    service = new CardScheduleService();
  });
  
  describe('isDue', () => {
    it('应该返回 true 当卡片到期时', () => {
      const now = new Date('2024-01-15T10:00:00Z');
      const card = createCard({ 
        due: new Date('2024-01-15T09:00:00Z').getTime() 
      });
      
      expect(service.isDue(card, now)).toBe(true);
    });
    
    it('应该返回 true 当卡片到期时间等于当前时间时', () => {
      const now = new Date('2024-01-15T10:00:00Z');
      const card = createCard({ 
        due: now.getTime() 
      });
      
      expect(service.isDue(card, now)).toBe(true);
    });
    
    it('应该返回 false 当卡片未到期时', () => {
      const now = new Date('2024-01-15T10:00:00Z');
      const card = createCard({ 
        due: new Date('2024-01-15T11:00:00Z').getTime() 
      });
      
      expect(service.isDue(card, now)).toBe(false);
    });
    
    it('应该返回 false 当卡片被暂停时', () => {
      const now = new Date('2024-01-15T10:00:00Z');
      const card = createCard({ 
        due: new Date('2024-01-15T09:00:00Z').getTime(),
        state: CardState.Suspended 
      });
      
      expect(service.isDue(card, now)).toBe(false);
    });
    
    it('应该使用当前时间作为默认值', () => {
      const pastTime = Date.now() - 1000 * 60 * 60; // 1 小时前
      const card = createCard({ due: pastTime });
      
      expect(service.isDue(card)).toBe(true);
    });
  });
  
  describe('filterDueCards', () => {
    it('应该只返回到期的卡片', () => {
      const now = new Date('2024-01-15T10:00:00Z');
      const cards = [
        createCard({ 
          id: '1', 
          due: new Date('2024-01-15T09:00:00Z').getTime() 
        }),
        createCard({ 
          id: '2', 
          due: new Date('2024-01-15T11:00:00Z').getTime() 
        }),
        createCard({ 
          id: '3', 
          due: new Date('2024-01-15T08:00:00Z').getTime() 
        }),
      ];
      
      const dueCards = service.filterDueCards(cards, now);
      
      expect(dueCards).toHaveLength(2);
      expect(dueCards.map(c => c.id)).toEqual(['1', '3']);
    });
    
    it('应该排除暂停的卡片', () => {
      const now = new Date('2024-01-15T10:00:00Z');
      const cards = [
        createCard({ 
          id: '1', 
          due: new Date('2024-01-15T09:00:00Z').getTime() 
        }),
        createCard({ 
          id: '2', 
          due: new Date('2024-01-15T09:00:00Z').getTime(),
          state: CardState.Suspended 
        }),
        createCard({ 
          id: '3', 
          due: new Date('2024-01-15T08:00:00Z').getTime() 
        }),
      ];
      
      const dueCards = service.filterDueCards(cards, now);
      
      expect(dueCards).toHaveLength(2);
      expect(dueCards.map(c => c.id)).toEqual(['1', '3']);
    });
    
    it('应该返回空数组当没有到期卡片时', () => {
      const now = new Date('2024-01-15T10:00:00Z');
      const cards = [
        createCard({ 
          due: new Date('2024-01-15T11:00:00Z').getTime() 
        }),
        createCard({ 
          due: new Date('2024-01-15T12:00:00Z').getTime() 
        }),
      ];
      
      const dueCards = service.filterDueCards(cards, now);
      
      expect(dueCards).toHaveLength(0);
    });
    
    it('应该处理空数组', () => {
      const now = new Date('2024-01-15T10:00:00Z');
      const dueCards = service.filterDueCards([], now);
      
      expect(dueCards).toHaveLength(0);
    });
  });
  
  describe('countDueCards', () => {
    it('应该返回正确的到期卡片数量', () => {
      const now = new Date('2024-01-15T10:00:00Z');
      const cards = [
        createCard({ 
          due: new Date('2024-01-15T09:00:00Z').getTime() 
        }),
        createCard({ 
          due: new Date('2024-01-15T11:00:00Z').getTime() 
        }),
        createCard({ 
          due: new Date('2024-01-15T08:00:00Z').getTime() 
        }),
      ];
      
      expect(service.countDueCards(cards, now)).toBe(2);
    });
    
    it('应该返回 0 当没有到期卡片时', () => {
      const now = new Date('2024-01-15T10:00:00Z');
      const cards = [
        createCard({ 
          due: new Date('2024-01-15T11:00:00Z').getTime() 
        }),
      ];
      
      expect(service.countDueCards(cards, now)).toBe(0);
    });
    
    it('应该返回 0 当卡片列表为空时', () => {
      const now = new Date('2024-01-15T10:00:00Z');
      expect(service.countDueCards([], now)).toBe(0);
    });
  });
  
  describe('isDueInRange', () => {
    it('应该返回 true 当卡片在时间范围内到期时', () => {
      const startTime = new Date('2024-01-15T09:00:00Z');
      const endTime = new Date('2024-01-15T11:00:00Z');
      const card = createCard({ 
        due: new Date('2024-01-15T10:00:00Z').getTime() 
      });
      
      expect(service.isDueInRange(card, startTime, endTime)).toBe(true);
    });
    
    it('应该返回 true 当卡片到期时间等于开始时间时', () => {
      const startTime = new Date('2024-01-15T10:00:00Z');
      const endTime = new Date('2024-01-15T11:00:00Z');
      const card = createCard({ 
        due: startTime.getTime() 
      });
      
      expect(service.isDueInRange(card, startTime, endTime)).toBe(true);
    });
    
    it('应该返回 true 当卡片到期时间等于结束时间时', () => {
      const startTime = new Date('2024-01-15T09:00:00Z');
      const endTime = new Date('2024-01-15T10:00:00Z');
      const card = createCard({ 
        due: endTime.getTime() 
      });
      
      expect(service.isDueInRange(card, startTime, endTime)).toBe(true);
    });
    
    it('应该返回 false 当卡片在时间范围之前到期时', () => {
      const startTime = new Date('2024-01-15T10:00:00Z');
      const endTime = new Date('2024-01-15T11:00:00Z');
      const card = createCard({ 
        due: new Date('2024-01-15T09:00:00Z').getTime() 
      });
      
      expect(service.isDueInRange(card, startTime, endTime)).toBe(false);
    });
    
    it('应该返回 false 当卡片在时间范围之后到期时', () => {
      const startTime = new Date('2024-01-15T09:00:00Z');
      const endTime = new Date('2024-01-15T10:00:00Z');
      const card = createCard({ 
        due: new Date('2024-01-15T11:00:00Z').getTime() 
      });
      
      expect(service.isDueInRange(card, startTime, endTime)).toBe(false);
    });
    
    it('应该返回 false 当卡片被暂停时', () => {
      const startTime = new Date('2024-01-15T09:00:00Z');
      const endTime = new Date('2024-01-15T11:00:00Z');
      const card = createCard({ 
        due: new Date('2024-01-15T10:00:00Z').getTime(),
        state: CardState.Suspended 
      });
      
      expect(service.isDueInRange(card, startTime, endTime)).toBe(false);
    });
  });
  
  describe('filterDueCardsInRange', () => {
    it('应该只返回在时间范围内到期的卡片', () => {
      const startTime = new Date('2024-01-15T09:00:00Z');
      const endTime = new Date('2024-01-15T11:00:00Z');
      const cards = [
        createCard({ 
          id: '1', 
          due: new Date('2024-01-15T08:00:00Z').getTime() 
        }),
        createCard({ 
          id: '2', 
          due: new Date('2024-01-15T10:00:00Z').getTime() 
        }),
        createCard({ 
          id: '3', 
          due: new Date('2024-01-15T12:00:00Z').getTime() 
        }),
        createCard({ 
          id: '4', 
          due: new Date('2024-01-15T09:30:00Z').getTime() 
        }),
      ];
      
      const dueCards = service.filterDueCardsInRange(cards, startTime, endTime);
      
      expect(dueCards).toHaveLength(2);
      expect(dueCards.map(c => c.id)).toEqual(['2', '4']);
    });
  });
  
  describe('sortByDueTime', () => {
    it('应该按到期时间升序排序', () => {
      const cards = [
        createCard({ 
          id: '1', 
          due: new Date('2024-01-15T12:00:00Z').getTime() 
        }),
        createCard({ 
          id: '2', 
          due: new Date('2024-01-15T09:00:00Z').getTime() 
        }),
        createCard({ 
          id: '3', 
          due: new Date('2024-01-15T10:00:00Z').getTime() 
        }),
      ];
      
      const sorted = service.sortByDueTime(cards, true);
      
      expect(sorted.map(c => c.id)).toEqual(['2', '3', '1']);
    });
    
    it('应该按到期时间降序排序', () => {
      const cards = [
        createCard({ 
          id: '1', 
          due: new Date('2024-01-15T09:00:00Z').getTime() 
        }),
        createCard({ 
          id: '2', 
          due: new Date('2024-01-15T12:00:00Z').getTime() 
        }),
        createCard({ 
          id: '3', 
          due: new Date('2024-01-15T10:00:00Z').getTime() 
        }),
      ];
      
      const sorted = service.sortByDueTime(cards, false);
      
      expect(sorted.map(c => c.id)).toEqual(['2', '3', '1']);
    });
    
    it('应该不修改原数组', () => {
      const cards = [
        createCard({ 
          id: '1', 
          due: new Date('2024-01-15T12:00:00Z').getTime() 
        }),
        createCard({ 
          id: '2', 
          due: new Date('2024-01-15T09:00:00Z').getTime() 
        }),
      ];
      
      const originalIds = cards.map(c => c.id);
      service.sortByDueTime(cards);
      
      expect(cards.map(c => c.id)).toEqual(originalIds);
    });
  });
});

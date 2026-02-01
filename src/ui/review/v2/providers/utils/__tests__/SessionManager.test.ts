/**
 * SessionManager 测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../SessionManager';

interface TestCard {
  id: string;
  due: number;
  lapses?: number;
  priority?: number;
}

describe('SessionManager', () => {
  describe('Basic Operations', () => {
    it('should load cards', () => {
      const manager = new SessionManager<TestCard>({
        getDueMs: (card) => card.due,
      });
      
      const cards: TestCard[] = [
        { id: '1', due: 100 },
        { id: '2', due: 200 },
        { id: '3', due: 300 },
      ];
      
      manager.load(cards);
      
      expect(manager.size()).toBe(3);
      expect(manager.isLoaded()).toBe(true);
    });
    
    it('should return cards in sorted order', () => {
      const manager = new SessionManager<TestCard>({
        getDueMs: (card) => card.due,
      });
      
      const cards: TestCard[] = [
        { id: '3', due: 300 },
        { id: '1', due: 100 },
        { id: '2', due: 200 },
      ];
      
      manager.load(cards);
      
      const sorted = manager.getAll();
      expect(sorted[0].id).toBe('1');
      expect(sorted[1].id).toBe('2');
      expect(sorted[2].id).toBe('3');
    });
    
    it('should remove cards', () => {
      const manager = new SessionManager<TestCard>({
        getDueMs: (card) => card.due,
      });
      
      manager.load([
        { id: '1', due: 100 },
        { id: '2', due: 200 },
        { id: '3', due: 300 },
      ]);
      
      const removed = manager.remove(c => c.id === '2');
      
      expect(removed).toBe(true);
      expect(manager.size()).toBe(2);
      expect(manager.find(c => c.id === '2')).toBeNull();
    });
    
    it('should clear session', () => {
      const manager = new SessionManager<TestCard>({
        getDueMs: (card) => card.due,
      });
      
      manager.load([
        { id: '1', due: 100 },
        { id: '2', due: 200 },
      ]);
      
      manager.clear();
      
      expect(manager.size()).toBe(0);
      expect(manager.isLoaded()).toBe(false);
      expect(manager.isEmpty()).toBe(true);
    });
  });
  
  describe('Rotation', () => {
    it('should rotate card to correct position', () => {
      const manager = new SessionManager<TestCard>({
        getDueMs: (card) => card.due,
      });
      
      manager.load([
        { id: '1', due: 100 },
        { id: '2', due: 200 },
        { id: '3', due: 300 },
      ]);
      
      // Remove first card
      const removed = manager.remove(c => c.id === '1');
      expect(removed).toBe(true);
      
      // Rotate it with new due time
      manager.rotate({ id: '1', due: 250 });
      
      // Should be inserted between '2' and '3'
      const sorted = manager.getAll();
      expect(sorted[0].id).toBe('2');
      expect(sorted[1].id).toBe('1');
      expect(sorted[2].id).toBe('3');
    });
    
    it('should rotate card to end when due time is latest', () => {
      const manager = new SessionManager<TestCard>({
        getDueMs: (card) => card.due,
      });
      
      manager.load([
        { id: '1', due: 100 },
        { id: '2', due: 200 },
        { id: '3', due: 300 },
      ]);
      
      manager.remove(c => c.id === '1');
      manager.rotate({ id: '1', due: 400 });
      
      const sorted = manager.getAll();
      expect(sorted[2].id).toBe('1');
    });
  });
  
  describe('Lapse Tracking', () => {
    it('should track lapses when rotating', () => {
      const manager = new SessionManager<TestCard>({
        getDueMs: (card) => card.due,
        getPriority: (card) => (card.lapses || 0) * 10,
      });
      
      const card: TestCard = { id: '1', due: 100, lapses: 0 };
      manager.load([card]);
      
      manager.remove(c => c.id === '1');
      manager.rotateWithLapse(card);
      
      const rotated = manager.find(c => c.id === '1');
      expect(rotated?.lapses).toBe(1);
    });
    
    it('should prioritize cards with more lapses', () => {
      const manager = new SessionManager<TestCard>({
        getDueMs: (card) => card.due,
        getPriority: (card) => -(card.lapses || 0) * 10,  // 使用负数，失败越多越靠前
      });
      
      manager.load([
        { id: '1', due: 100, lapses: 0 },
        { id: '2', due: 100, lapses: 2 },
        { id: '3', due: 100, lapses: 1 },
      ]);
      
      const sorted = manager.getAll();
      // Same due time, sorted by priority (negative lapses)
      // lapses=2 → priority=-20 (first)
      // lapses=1 → priority=-10 (second)
      // lapses=0 → priority=0 (last)
      expect(sorted[0].id).toBe('2');  // lapses: 2, priority: -20
      expect(sorted[1].id).toBe('3');  // lapses: 1, priority: -10
      expect(sorted[2].id).toBe('1');  // lapses: 0, priority: 0
    });
    
    it('should increment lapses on each rotation', () => {
      const manager = new SessionManager<TestCard>({
        getDueMs: (card) => card.due,
        getPriority: (card) => (card.lapses || 0) * 10,
      });
      
      const card: TestCard = { id: '1', due: 100, lapses: 0 };
      manager.load([card]);
      
      // First rotation
      manager.remove(c => c.id === '1');
      manager.rotateWithLapse(card);
      expect(manager.find(c => c.id === '1')?.lapses).toBe(1);
      
      // Second rotation
      manager.remove(c => c.id === '1');
      manager.rotateWithLapse(card);
      expect(manager.find(c => c.id === '1')?.lapses).toBe(2);
      
      // Third rotation
      manager.remove(c => c.id === '1');
      manager.rotateWithLapse(card);
      expect(manager.find(c => c.id === '1')?.lapses).toBe(3);
    });
  });
  
  describe('Statistics', () => {
    it('should calculate stats correctly', () => {
      const manager = new SessionManager<TestCard>({
        getDueMs: (card) => card.due,
      });
      
      manager.load([
        { id: '1', due: 100, lapses: 0 },
        { id: '2', due: 200, lapses: 2 },
        { id: '3', due: 300, lapses: 4 },
      ]);
      
      const stats = manager.getStats();
      
      expect(stats.total).toBe(3);
      expect(stats.avgLapses).toBe(2);  // (0 + 2 + 4) / 3
      expect(stats.maxLapses).toBe(4);
      expect(stats.cardsWithLapses).toBe(2);
    });
    
    it('should handle empty queue', () => {
      const manager = new SessionManager<TestCard>({
        getDueMs: (card) => card.due,
      });
      
      const stats = manager.getStats();
      
      expect(stats.total).toBe(0);
      expect(stats.avgLapses).toBe(0);
      expect(stats.maxLapses).toBe(0);
      expect(stats.cardsWithLapses).toBe(0);
    });
  });
  
  describe('Find', () => {
    it('should find card by predicate', () => {
      const manager = new SessionManager<TestCard>({
        getDueMs: (card) => card.due,
      });
      
      manager.load([
        { id: '1', due: 100 },
        { id: '2', due: 200 },
        { id: '3', due: 300 },
      ]);
      
      const found = manager.find(c => c.id === '2');
      
      expect(found).not.toBeNull();
      expect(found?.id).toBe('2');
    });
    
    it('should return null if card not found', () => {
      const manager = new SessionManager<TestCard>({
        getDueMs: (card) => card.due,
      });
      
      manager.load([
        { id: '1', due: 100 },
      ]);
      
      const found = manager.find(c => c.id === '999');
      
      expect(found).toBeNull();
    });
  });
});

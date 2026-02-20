/**
 * UnifiedStorageManager Data Consistency Tests
 * 
 * Tests for task 1.9: 实现数据一致性验证
 * Validates Requirements: 1.8, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UnifiedStorageManager } from '../UnifiedStorageManager';
import type { FSRSCard, CardType } from '../../../types/card';
import type { IXiuyuan } from '../../xiuyuan/types';

describe('UnifiedStorageManager Data Consistency', () => {
  let storage: UnifiedStorageManager;
  let mockSaveCallback: () => Promise<void>;
  let mockLoadCallback: () => Promise<any>;

  beforeEach(() => {
    storage = new UnifiedStorageManager();
    
    // Mock persistence callbacks
    mockSaveCallback = async (data: any) => {};
    mockLoadCallback = async () => ({
      version: 1,
      xiuyuans: {},
      cards: {},
    });
    
    storage.setPersistenceCallbacks(mockSaveCallback, mockLoadCallback);
  });

  // Helper function to create a test XiuYuan
  const createTestXiuYuan = (id: string = 'xy_test_123'): IXiuyuan => ({
    id,
    blockIDs: ['block-1'],
    templateID: 'builtin-quick-card',
    fields: [
      { name: 'content', blockID: 'block-1' }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Helper function to create a test Card
  const createTestCard = (
    id: string = 'card-1',
    xiuyuanID: string = 'xy_test_123',
    blockId: string = 'block-1'
  ): FSRSCard => ({
    id,
    xiuyuanID,
    blockId,
    due: Date.now() + 86400000,
    stability: 1.0,
    difficulty: 5.0,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: Date.now(),
    elapsedDays: 0,
    scheduledDays: 1,
    learning_step: 0,
    type: 'item' as CardType,
    templateID: 'builtin-quick-card',
    schedulerType: 'fsrs-v6',
    priority: 50,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    meta: {
      xiuyuanID,
      templateID: 'builtin-quick-card',
      ruleIndex: 0,
      frontBlockIDs: [blockId],
      backBlockIDs: [],
      fieldMapping: { content: blockId },
      frontFields: ['content'],
      backFields: [],
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  describe('validateConsistency', () => {
    it('should detect cards with missing xiuyuanID', async () => {
      // Requirement 12.2: Detect cards with missing xiuyuanID references
      const xiuyuan = createTestXiuYuan();
      const card = createTestCard();
      
      await storage.createCard(xiuyuan, card);
      
      // Manually corrupt the card by removing xiuyuanID from meta
      const corruptedCard = storage.getCard(card.id);
      if (corruptedCard) {
        corruptedCard.meta.xiuyuanID = '';
        await storage.updateCard(corruptedCard);
      }
      
      const issues = await storage.validateConsistency();
      
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(issue => issue.includes('has no xiuyuanID'))).toBe(true);
    });

    it('should detect cards referencing non-existent XiuYuans', async () => {
      // Requirement 12.4: Detect cards referencing non-existent XiuYuans
      const xiuyuan = createTestXiuYuan();
      const card = createTestCard();
      
      await storage.createCard(xiuyuan, card);
      
      // Manually delete the XiuYuan without deleting the card
      const allXiuYuans = storage.getAllXiuYuans();
      for (const xy of allXiuYuans) {
        (storage as any).xiuyuans.delete(xy.id);
      }
      
      const issues = await storage.validateConsistency();
      
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(issue => issue.includes('references non-existent XiuYuan'))).toBe(true);
    });

    it('should detect XiuYuans with no associated cards', async () => {
      // Requirement 12.3: Detect XiuYuans with no associated cards
      const xiuyuan = createTestXiuYuan();
      
      // Manually add XiuYuan without cards
      (storage as any).xiuyuans.set(xiuyuan.id, xiuyuan);
      
      const issues = await storage.validateConsistency();
      
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some(issue => issue.includes('has no associated cards'))).toBe(true);
    });

    it('should return empty array for consistent data', async () => {
      // Requirement 12.1: Provide validateConsistency method
      const xiuyuan = createTestXiuYuan();
      const card = createTestCard();
      
      await storage.createCard(xiuyuan, card);
      
      const issues = await storage.validateConsistency();
      
      expect(issues).toEqual([]);
    });

    it('should detect multiple consistency issues', async () => {
      // Create valid data
      const xiuyuan1 = createTestXiuYuan('xy_1');
      const card1 = createTestCard('card-1', 'xy_1');
      await storage.createCard(xiuyuan1, card1);
      
      // Add orphan XiuYuan
      const orphanXiuyuan = createTestXiuYuan('xy_orphan');
      (storage as any).xiuyuans.set(orphanXiuyuan.id, orphanXiuyuan);
      
      // Add card with invalid xiuyuanID
      const orphanCard = createTestCard('card-orphan', 'xy_nonexistent');
      (storage as any).cards.set(orphanCard.id, orphanCard);
      
      const issues = await storage.validateConsistency();
      
      expect(issues.length).toBeGreaterThanOrEqual(2);
      expect(issues.some(issue => issue.includes('has no associated cards'))).toBe(true);
      expect(issues.some(issue => issue.includes('references non-existent XiuYuan'))).toBe(true);
    });
  });

  describe('autoFix', () => {
    it('should remove orphaned cards', async () => {
      // Requirement 12.5: Provide autoFix method
      // Requirement 12.6: Delete orphaned cards
      const xiuyuan = createTestXiuYuan();
      const card = createTestCard();
      
      await storage.createCard(xiuyuan, card);
      
      // Manually delete XiuYuan to create orphan card
      (storage as any).xiuyuans.delete(xiuyuan.id);
      
      // Verify orphan exists
      const issuesBefore = await storage.validateConsistency();
      expect(issuesBefore.length).toBeGreaterThan(0);
      
      // Auto-fix
      const fixedCount = await storage.autoFix();
      
      expect(fixedCount).toBeGreaterThan(0);
      
      // Verify orphan is removed
      expect(storage.getCard(card.id)).toBeUndefined();
      
      const issuesAfter = await storage.validateConsistency();
      expect(issuesAfter).toEqual([]);
    });

    it('should remove empty XiuYuans', async () => {
      // Requirement 12.6: Delete empty XiuYuans
      const xiuyuan = createTestXiuYuan();
      
      // Manually add XiuYuan without cards
      (storage as any).xiuyuans.set(xiuyuan.id, xiuyuan);
      
      // Verify empty XiuYuan exists
      const issuesBefore = await storage.validateConsistency();
      expect(issuesBefore.length).toBeGreaterThan(0);
      
      // Auto-fix
      const fixedCount = await storage.autoFix();
      
      expect(fixedCount).toBeGreaterThan(0);
      
      // Verify empty XiuYuan is removed
      expect(storage.getXiuYuan(xiuyuan.id)).toBeUndefined();
      
      const issuesAfter = await storage.validateConsistency();
      expect(issuesAfter).toEqual([]);
    });

    it('should fix multiple issues at once', async () => {
      // Create valid data
      const xiuyuan1 = createTestXiuYuan('xy_1');
      const card1 = createTestCard('card-1', 'xy_1');
      await storage.createCard(xiuyuan1, card1);
      
      // Add orphan XiuYuan
      const orphanXiuyuan = createTestXiuYuan('xy_orphan');
      (storage as any).xiuyuans.set(orphanXiuyuan.id, orphanXiuyuan);
      
      // Add orphan card
      const orphanCard = createTestCard('card-orphan', 'xy_nonexistent');
      (storage as any).cards.set(orphanCard.id, orphanCard);
      
      // Verify issues exist
      const issuesBefore = await storage.validateConsistency();
      expect(issuesBefore.length).toBeGreaterThanOrEqual(2);
      
      // Auto-fix
      const fixedCount = await storage.autoFix();
      
      expect(fixedCount).toBeGreaterThanOrEqual(2);
      
      // Verify all issues are fixed
      const issuesAfter = await storage.validateConsistency();
      expect(issuesAfter).toEqual([]);
      
      // Verify valid data is preserved
      expect(storage.getCard('card-1')).toBeDefined();
      expect(storage.getXiuYuan('xy_1')).toBeDefined();
    });

    it('should return 0 when no issues exist', async () => {
      const xiuyuan = createTestXiuYuan();
      const card = createTestCard();
      
      await storage.createCard(xiuyuan, card);
      
      const fixedCount = await storage.autoFix();
      
      expect(fixedCount).toBe(0);
    });

    it('should preserve valid data while fixing issues', async () => {
      // Create multiple valid cards
      const xiuyuan1 = createTestXiuYuan('xy_1');
      const card1 = createTestCard('card-1', 'xy_1');
      const card2 = createTestCard('card-2', 'xy_1');
      await storage.createCard(xiuyuan1, card1);
      await storage.createCard(xiuyuan1, card2);
      
      const xiuyuan2 = createTestXiuYuan('xy_2');
      const card3 = createTestCard('card-3', 'xy_2');
      await storage.createCard(xiuyuan2, card3);
      
      // Add orphan data
      const orphanXiuyuan = createTestXiuYuan('xy_orphan');
      (storage as any).xiuyuans.set(orphanXiuyuan.id, orphanXiuyuan);
      
      const orphanCard = createTestCard('card-orphan', 'xy_nonexistent');
      (storage as any).cards.set(orphanCard.id, orphanCard);
      
      // Auto-fix
      await storage.autoFix();
      
      // Verify valid data is preserved
      expect(storage.getCard('card-1')).toBeDefined();
      expect(storage.getCard('card-2')).toBeDefined();
      expect(storage.getCard('card-3')).toBeDefined();
      expect(storage.getXiuYuan('xy_1')).toBeDefined();
      expect(storage.getXiuYuan('xy_2')).toBeDefined();
      
      // Verify orphan data is removed
      expect(storage.getCard('card-orphan')).toBeUndefined();
      expect(storage.getXiuYuan('xy_orphan')).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', async () => {
      // Requirement 1.8: Return statistics information
      const xiuyuan1 = createTestXiuYuan('xy_1');
      const xiuyuan2 = createTestXiuYuan('xy_2');
      
      const card1 = createTestCard('card-1', 'xy_1');
      const card2 = createTestCard('card-2', 'xy_1');
      const card3 = createTestCard('card-3', 'xy_2');
      
      await storage.createCard(xiuyuan1, card1);
      await storage.createCard(xiuyuan1, card2);
      await storage.createCard(xiuyuan2, card3);
      
      const stats = storage.getStats();
      
      expect(stats.totalCards).toBe(3);
      expect(stats.totalXiuYuans).toBe(2);
      expect(stats.cardsByType.item).toBe(3);
      expect(stats.newCards).toBe(3); // All cards have state === 0
    });

    it('should count cards by state correctly', async () => {
      const xiuyuan = createTestXiuYuan();
      
      // Create cards with different states
      const newCard = createTestCard('card-new', xiuyuan.id);
      newCard.state = 0; // New
      
      const learningCard = createTestCard('card-learning', xiuyuan.id);
      learningCard.state = 1; // Learning
      
      const reviewCard = createTestCard('card-review', xiuyuan.id);
      reviewCard.state = 2; // Review
      
      const relearningCard = createTestCard('card-relearning', xiuyuan.id);
      relearningCard.state = 3; // Relearning
      
      await storage.createCard(xiuyuan, newCard);
      await storage.createCard(xiuyuan, learningCard);
      await storage.createCard(xiuyuan, reviewCard);
      await storage.createCard(xiuyuan, relearningCard);
      
      const stats = storage.getStats();
      
      expect(stats.newCards).toBe(1);
      expect(stats.learningCards).toBe(2); // Learning + Relearning
      expect(stats.reviewCards).toBe(1);
    });

    it('should count due cards correctly', async () => {
      const xiuyuan = createTestXiuYuan();
      const now = Date.now();
      
      // Create due card
      const dueCard = createTestCard('card-due', xiuyuan.id);
      dueCard.due = now - 1000; // Past due
      dueCard.state = 2; // Review state
      
      // Create future card
      const futureCard = createTestCard('card-future', xiuyuan.id);
      futureCard.due = now + 86400000; // 1 day in future
      futureCard.state = 2;
      
      await storage.createCard(xiuyuan, dueCard);
      await storage.createCard(xiuyuan, futureCard);
      
      const stats = storage.getStats();
      
      expect(stats.dueCards).toBe(1);
    });

    it('should count cards by type correctly', async () => {
      const xiuyuan = createTestXiuYuan();
      
      const itemCard = createTestCard('card-item', xiuyuan.id);
      itemCard.type = 'item';
      
      const conceptCard = createTestCard('card-concept', xiuyuan.id);
      conceptCard.type = 'concept';
      
      const topicCard = createTestCard('card-topic', xiuyuan.id);
      topicCard.type = 'topic';
      
      await storage.createCard(xiuyuan, itemCard);
      await storage.createCard(xiuyuan, conceptCard);
      await storage.createCard(xiuyuan, topicCard);
      
      const stats = storage.getStats();
      
      expect(stats.cardsByType.item).toBe(1);
      expect(stats.cardsByType.concept).toBe(1);
      expect(stats.cardsByType.topic).toBe(1);
    });

    it('should return zero counts for empty storage', () => {
      const stats = storage.getStats();
      
      expect(stats.totalCards).toBe(0);
      expect(stats.totalXiuYuans).toBe(0);
      expect(stats.dueCards).toBe(0);
      expect(stats.newCards).toBe(0);
      expect(stats.learningCards).toBe(0);
      expect(stats.reviewCards).toBe(0);
    });
  });

  describe('Integration: Consistency validation with CRUD operations', () => {
    it('should maintain consistency after normal CRUD operations', async () => {
      // Create
      const xiuyuan = createTestXiuYuan();
      const card1 = createTestCard('card-1');
      const card2 = createTestCard('card-2');
      
      await storage.createCard(xiuyuan, card1);
      await storage.createCard(xiuyuan, card2);
      
      let issues = await storage.validateConsistency();
      expect(issues).toEqual([]);
      
      // Update
      const updatedCard = { ...card1, priority: 80 };
      await storage.updateCard(updatedCard);
      
      issues = await storage.validateConsistency();
      expect(issues).toEqual([]);
      
      // Delete one card
      await storage.deleteCard(card1.id);
      
      issues = await storage.validateConsistency();
      expect(issues).toEqual([]);
      
      // Delete last card (should cascade delete XiuYuan)
      await storage.deleteCard(card2.id);
      
      issues = await storage.validateConsistency();
      expect(issues).toEqual([]);
    });

    it('should maintain consistency after batch operations', async () => {
      const xiuyuan = createTestXiuYuan();
      const cards = [
        createTestCard('card-1', xiuyuan.id),
        createTestCard('card-2', xiuyuan.id),
        createTestCard('card-3', xiuyuan.id),
      ];
      
      await storage.batchCreateCards(xiuyuan, cards);
      
      const issues = await storage.validateConsistency();
      expect(issues).toEqual([]);
      
      const stats = storage.getStats();
      expect(stats.totalCards).toBe(3);
      expect(stats.totalXiuYuans).toBe(1);
    });
  });
});

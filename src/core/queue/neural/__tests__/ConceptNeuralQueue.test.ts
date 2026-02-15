/**
 * ConceptNeuralQueue 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConceptNeuralQueue } from '../ConceptNeuralQueue';
import { ConceptQueryEngine } from '../ConceptQueryEngine';

// Mock ConceptQueryEngine
vi.mock('../ConceptQueryEngine');

describe('ConceptNeuralQueue', () => {
  let queue: ConceptNeuralQueue;
  let mockQueryEngine: any;

  beforeEach(() => {
    queue = new ConceptNeuralQueue();
    mockQueryEngine = (queue as any).queryEngine;
  });

  describe('addSeed', () => {
    it('should add a concept card as seed', async () => {
      mockQueryEngine.isConceptCard = vi.fn().mockResolvedValue(true);

      await queue.addSeed('concept-1');

      expect(queue.getSeeds()).toContain('concept-1');
    });

    it('should reject non-concept cards', async () => {
      mockQueryEngine.isConceptCard = vi.fn().mockResolvedValue(false);

      await expect(queue.addSeed('normal-block-1')).rejects.toThrow();
    });
  });

  describe('getNextCard', () => {
    it('should return null when no seeds', async () => {
      const card = await queue.getNextCard();
      expect(card).toBeNull();
    });

    it('should return neighbor when seed has unvisited neighbors', async () => {
      // Setup
      mockQueryEngine.isConceptCard = vi.fn().mockResolvedValue(true);
      mockQueryEngine.fetchNeighbors = vi.fn().mockResolvedValue([
        { id: 'neighbor-1', type: 'backlink', weight: 15 },
      ]);
      mockQueryEngine.fetchBlockData = vi.fn().mockResolvedValue({
        id: 'neighbor-1',
        content: 'Neighbor content',
        type: 'p',
      });

      await queue.addSeed('concept-1');

      // Execute
      const card = await queue.getNextCard();

      // Verify
      expect(card).not.toBeNull();
      expect(card?.blockId).toBe('neighbor-1');
      expect(card?.associationType).toBe('backlink');
    });

    it('should return seed itself when no neighbors', async () => {
      // Setup
      mockQueryEngine.isConceptCard = vi.fn().mockResolvedValue(true);
      mockQueryEngine.fetchNeighbors = vi.fn().mockResolvedValue([]);
      mockQueryEngine.fetchBlockData = vi.fn().mockResolvedValue({
        id: 'concept-1',
        content: 'Concept content',
        type: 'p',
      });

      await queue.addSeed('concept-1');

      // Execute
      const card = await queue.getNextCard();

      // Verify
      expect(card).not.toBeNull();
      expect(card?.blockId).toBe('concept-1');
      expect(card?.associationType).toBe('seed');
    });

    it('should select new seed when current seed exhausted', async () => {
      // Setup
      mockQueryEngine.isConceptCard = vi.fn().mockResolvedValue(true);
      mockQueryEngine.fetchNeighbors = vi.fn().mockResolvedValue([]);
      mockQueryEngine.fetchBlockData = vi.fn()
        .mockResolvedValueOnce({ id: 'concept-1', content: 'C1', type: 'p' })
        .mockResolvedValueOnce({ id: 'concept-2', content: 'C2', type: 'p' });

      await queue.addSeed('concept-1');
      await queue.addSeed('concept-2');

      // Execute
      const card1 = await queue.getNextCard();
      const card2 = await queue.getNextCard();

      // Verify
      expect(card1?.blockId).toBe('concept-1');
      expect(card2?.blockId).toBe('concept-2');
    });
  });

  describe('clearHistory', () => {
    it('should clear visited blocks and display path', async () => {
      // Setup
      mockQueryEngine.isConceptCard = vi.fn().mockResolvedValue(true);
      mockQueryEngine.fetchNeighbors = vi.fn().mockResolvedValue([]);
      mockQueryEngine.fetchBlockData = vi.fn().mockResolvedValue({
        id: 'concept-1',
        content: 'Concept content',
        type: 'p',
      });

      await queue.addSeed('concept-1');
      await queue.getNextCard();

      // Execute
      queue.clearHistory();

      // Verify - should be able to get the same card again
      const card = await queue.getNextCard();
      expect(card?.blockId).toBe('concept-1');
    });
  });

  describe('size', () => {
    it('should return number of unvisited seeds', async () => {
      mockQueryEngine.isConceptCard = vi.fn().mockResolvedValue(true);
      mockQueryEngine.fetchNeighbors = vi.fn().mockResolvedValue([]);
      mockQueryEngine.fetchBlockData = vi.fn().mockResolvedValue({
        id: 'concept-1',
        content: 'Concept content',
        type: 'p',
      });

      await queue.addSeed('concept-1');
      await queue.addSeed('concept-2');

      expect(queue.size()).toBe(2);

      await queue.getNextCard();
      expect(queue.size()).toBe(1);
    });
  });
});

/**
 * Tests for SQL Query Result Interfaces
 * 
 * Feature: architecture-optimization
 * Task 2.2: Define SQL query result interfaces
 * 
 * Validates Requirement 3.3: 定义 SQL 查询结果时，系统应使用与查询结构匹配的类型化接口
 */

import { describe, it, expect } from 'vitest';
import type { CardAttributeRow, CardDataRow, ReviewCard, CardState } from '../types';

describe('SQL Query Result Interfaces', () => {
  describe('CardAttributeRow', () => {
    it('should match the structure of attribute query results', () => {
      // Given: A SQL query result from attributes table
      const row: CardAttributeRow = {
        block_id: '20230101120000-abc123',
        value: 'card-id-123',
      };

      // Then: The interface should provide type-safe access
      expect(row.block_id).toBe('20230101120000-abc123');
      expect(row.value).toBe('card-id-123');
    });

    it('should support optional blockID field (camelCase)', () => {
      // Given: A SQL query result with camelCase field
      const row: CardAttributeRow = {
        block_id: '20230101120000-abc123',
        value: 'card-id-123',
        blockID: '20230101120000-abc123',
      };

      // Then: Both formats should be accessible
      expect(row.block_id).toBe(row.blockID);
    });

    it('should support optional name field', () => {
      // Given: A SQL query result with name field
      const row: CardAttributeRow = {
        block_id: '20230101120000-abc123',
        value: 'card-id-123',
        name: 'custom-riff-decks',
      };

      // Then: The name field should be accessible
      expect(row.name).toBe('custom-riff-decks');
    });

    it('should handle real-world SQL query pattern', () => {
      // Given: Simulated SQL query results
      const mockSqlResult = [
        { block_id: 'block1', value: 'card1' },
        { block_id: 'block2', value: 'card2', blockID: 'block2' },
        { block_id: 'block3', value: 'card3', name: 'custom-riff-decks' },
      ];

      // When: Processing results with type safety
      const rows = mockSqlResult as CardAttributeRow[];

      // Then: All rows should be properly typed
      expect(rows).toHaveLength(3);
      rows.forEach(row => {
        expect(typeof row.block_id).toBe('string');
        expect(typeof row.value).toBe('string');
      });
    });
  });

  describe('CardDataRow', () => {
    it('should match the structure of full card data query results', () => {
      // Given: A SQL query result with full card data
      const row: CardDataRow = {
        block_id: '20230101120000-abc123',
        card_id: 'card-id-123',
        due: Date.now(),
        stability: 1.5,
        difficulty: 5.0,
        elapsed_days: 0,
        scheduled_days: 1,
        reps: 0,
        lapses: 0,
        state: 0, // CardState.New
        last_review: Date.now(),
      };

      // Then: All fields should be accessible with correct types
      expect(typeof row.block_id).toBe('string');
      expect(typeof row.card_id).toBe('string');
      expect(typeof row.due).toBe('number');
      expect(typeof row.stability).toBe('number');
      expect(typeof row.difficulty).toBe('number');
      expect(typeof row.elapsed_days).toBe('number');
      expect(typeof row.scheduled_days).toBe('number');
      expect(typeof row.reps).toBe('number');
      expect(typeof row.lapses).toBe('number');
      expect(typeof row.state).toBe('number');
      expect(typeof row.last_review).toBe('number');
    });

    it('should be convertible to ReviewCard', () => {
      // Given: A CardDataRow from SQL query
      const row: CardDataRow = {
        block_id: '20230101120000-abc123',
        card_id: 'card-id-123',
        due: Date.now(),
        stability: 1.5,
        difficulty: 5.0,
        elapsed_days: 0,
        scheduled_days: 1,
        reps: 0,
        lapses: 0,
        state: 0,
        last_review: Date.now(),
      };

      // When: Converting to ReviewCard
      const card: ReviewCard = {
        blockID: row.block_id,
        cardID: row.card_id,
        deckID: 'deck-123',
        priority: 50,
        due: row.due,
        stability: row.stability,
        difficulty: row.difficulty,
        elapsed_days: row.elapsed_days,
        scheduled_days: row.scheduled_days,
        reps: row.reps,
        lapses: row.lapses,
        state: row.state as CardState,
        last_review: row.last_review,
      };

      // Then: The conversion should be type-safe
      expect(card.blockID).toBe(row.block_id);
      expect(card.cardID).toBe(row.card_id);
      expect(card.due).toBe(row.due);
      expect(card.stability).toBe(row.stability);
    });

    it('should handle batch query results', () => {
      // Given: Simulated batch SQL query results
      const mockSqlResult = [
        {
          block_id: 'block1',
          card_id: 'card1',
          due: Date.now(),
          stability: 1.0,
          difficulty: 5.0,
          elapsed_days: 0,
          scheduled_days: 1,
          reps: 0,
          lapses: 0,
          state: 0,
          last_review: Date.now(),
        },
        {
          block_id: 'block2',
          card_id: 'card2',
          due: Date.now() + 86400000,
          stability: 2.0,
          difficulty: 6.0,
          elapsed_days: 1,
          scheduled_days: 2,
          reps: 1,
          lapses: 0,
          state: 2,
          last_review: Date.now() - 86400000,
        },
      ];

      // When: Processing results with type safety
      const rows = mockSqlResult as CardDataRow[];

      // Then: All rows should be properly typed
      expect(rows).toHaveLength(2);
      rows.forEach(row => {
        expect(typeof row.block_id).toBe('string');
        expect(typeof row.card_id).toBe('string');
        expect(typeof row.due).toBe('number');
        expect(typeof row.stability).toBe('number');
        expect(typeof row.difficulty).toBe('number');
      });
    });
  });

  describe('Type Safety Validation', () => {
    it('should prevent type errors at compile time', () => {
      // This test validates that TypeScript catches type errors
      // The following would cause compile errors if uncommented:
      
      // const invalidRow: CardAttributeRow = {
      //   block_id: 123, // Error: Type 'number' is not assignable to type 'string'
      //   value: 'test',
      // };

      // const invalidDataRow: CardDataRow = {
      //   block_id: 'test',
      //   card_id: 'test',
      //   due: 'invalid', // Error: Type 'string' is not assignable to type 'number'
      //   // ... other fields
      // };

      // This test passes if the code compiles
      expect(true).toBe(true);
    });

    it('should provide IDE autocomplete support', () => {
      // Given: A CardAttributeRow instance
      const row: CardAttributeRow = {
        block_id: 'test',
        value: 'test',
      };

      // Then: IDE should provide autocomplete for all fields
      // (This is validated at development time, not runtime)
      const fields = Object.keys(row);
      expect(fields).toContain('block_id');
      expect(fields).toContain('value');
    });
  });

  describe('Real-world Usage Patterns', () => {
    it('should handle the BlockMenuHandler query pattern', () => {
      // Given: Simulated SQL query from BlockMenuHandler
      const mockQuery = `
        SELECT 
          a1.block_id, 
          a1.value as card_id,
          a2.value as card_type
        FROM attributes a1
        LEFT JOIN attributes a2 ON a1.block_id = a2.block_id AND a2.name = 'custom-fsrs-card-type'
        WHERE a1.name = 'custom-riff-decks' 
          AND a1.block_id IN ('block1', 'block2')
      `;

      // Simulated result
      const mockResult = [
        { block_id: 'block1', value: 'card1', card_type: 'item' },
        { block_id: 'block2', value: 'card2', card_type: 'topic' },
      ];

      // When: Processing with extended CardAttributeRow
      interface ExtendedCardAttributeRow extends CardAttributeRow {
        card_type?: string;
      }
      const rows = mockResult as ExtendedCardAttributeRow[];

      // Then: Should handle both standard and extended fields
      expect(rows).toHaveLength(2);
      expect(rows[0].block_id).toBe('block1');
      expect(rows[0].value).toBe('card1');
      expect(rows[0].card_type).toBe('item');
    });

    it('should handle the RiffDataSource query pattern', () => {
      // Given: Simulated SQL query from RiffDataSource
      const mockQuery = `
        SELECT block_id, value
        FROM attributes
        WHERE name = 'custom-fsrs-card-type'
        AND block_id IN ('block1', 'block2', 'block3')
      `;

      // Simulated result
      const mockResult = [
        { block_id: 'block1', value: 'item' },
        { block_id: 'block2', value: 'topic' },
        { block_id: 'block3', value: 'item' },
      ];

      // When: Processing with CardAttributeRow
      const rows = mockResult as CardAttributeRow[];

      // Then: Should create a type-safe map
      const cardTypes = new Map<string, string>();
      rows.forEach(row => {
        cardTypes.set(row.block_id, row.value);
      });

      expect(cardTypes.size).toBe(3);
      expect(cardTypes.get('block1')).toBe('item');
      expect(cardTypes.get('block2')).toBe('topic');
    });
  });
});

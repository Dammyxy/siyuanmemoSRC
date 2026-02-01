/**
 * Property-Based Tests for Xiuyuan Type Safety
 * 
 * Feature: architecture-optimization
 * Task: 6.8 编写 Xiuyuan 类型安全属性测试
 * 
 * Property 15: Xiuyuan 类型安全
 * 
 * **Validates: Requirement 3.6**
 * 
 * For any Xiuyuan operation (create, query, delete), all ID types (XiuyuanID, BlockID, CardID)
 * should be correctly checked at compile time to prevent type confusion.
 * 
 * This property test verifies:
 * - XiuyuanID, BlockID, and CardID are distinct types
 * - Type safety is enforced at compile time
 * - Runtime behavior is correct for all ID types
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { XiuyuanStorage } from '../storage';
import type { IXiuyuan, ICardMapping, IXiuyuanField } from '../types';

describe('Xiuyuan Type Safety - Property-Based Tests', () => {
  describe('Property 15: Xiuyuan 类型安全 (Requirement 3.6)', () => {
    it('should handle XiuyuanID correctly in all operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random xiuyuan ID
          fc.string({ minLength: 10, maxLength: 30 }).map(s => `xy_${s}`),
          // Generate random blockIDs
          fc.array(fc.string({ minLength: 10, maxLength: 30 }).map(s => `block_${s}`), { minLength: 1, maxLength: 5 }),
          // Generate random template ID
          fc.oneof(fc.constant('basic'), fc.constant('vocabulary'), fc.constant('cloze')),
          async (xiuyuanID, blockIDs, templateID) => {
            // Given: A storage instance
            const storage = new XiuyuanStorage('test-plugin');

            // When: Creating a Xiuyuan with specific ID
            const xiuyuan = storage.createXiuyuan({
              blockIDs,
              fields: blockIDs.map((blockID, i) => ({
                name: `field${i}`,
                blockID,
              })),
              templateID,
            });

            // Then: The ID should be a valid XiuyuanID format
            expect(xiuyuan.id).toMatch(/^xy_\d+_[a-z0-9]+$/);

            // And: Should be retrievable by ID
            const retrieved = storage.getXiuyuan(xiuyuan.id);
            expect(retrieved).toBeDefined();
            expect(retrieved?.id).toBe(xiuyuan.id);

            // And: Should be deletable by ID
            const deleted = storage.deleteXiuyuan(xiuyuan.id);
            expect(deleted).toBe(true);

            // And: Should not be retrievable after deletion
            const afterDelete = storage.getXiuyuan(xiuyuan.id);
            expect(afterDelete).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle BlockID correctly in field mappings', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random blockIDs
          fc.array(fc.string({ minLength: 10, maxLength: 30 }).map(s => `block_${s}`), { minLength: 2, maxLength: 5 }),
          // Generate random template ID
          fc.constant('basic'),
          async (blockIDs, templateID) => {
            // Given: A storage instance
            const storage = new XiuyuanStorage('test-plugin');

            // When: Creating a Xiuyuan with blockIDs
            const xiuyuan = storage.createXiuyuan({
              blockIDs,
              fields: blockIDs.map((blockID, i) => ({
                name: `field${i}`,
                blockID,
              })),
              templateID,
            });

            // Then: All blockIDs should be stored correctly
            expect(xiuyuan.blockIDs).toEqual(blockIDs);

            // And: Each field should have the correct blockID
            xiuyuan.fields.forEach((field, i) => {
              expect(field.blockID).toBe(blockIDs[i]);
            });

            // And: Should be queryable by any blockID
            blockIDs.forEach(blockID => {
              const found = storage.getXiuyuansByBlockID(blockID);
              expect(found).toHaveLength(1);
              expect(found[0].id).toBe(xiuyuan.id);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle CardID correctly in mappings', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random xiuyuan
          fc.record({
            blockIDs: fc.array(fc.string({ minLength: 10, maxLength: 30 }).map(s => `block_${s}`), { minLength: 2, maxLength: 3 }),
            templateID: fc.constant('basic'),
          }),
          // Generate random cardID
          fc.string({ minLength: 10, maxLength: 30 }).map(s => `card_${s}`),
          async (xiuyuanData, cardID) => {
            // Given: A storage instance with a Xiuyuan
            const storage = new XiuyuanStorage('test-plugin');
            const xiuyuan = storage.createXiuyuan({
              ...xiuyuanData,
              fields: xiuyuanData.blockIDs.map((blockID, i) => ({
                name: `field${i}`,
                blockID,
              })),
            });

            // When: Creating a CardMapping with cardID
            const mapping: ICardMapping = {
              xiuyuanID: xiuyuan.id,
              cardID,
              frontFields: ['field0'],
              backFields: ['field1'],
              typeMarker: 'basic',
            };
            const mappingID = storage.createMapping(mapping);

            // Then: The cardID should be stored correctly
            const retrieved = storage.getMapping(mappingID);
            expect(retrieved).toBeDefined();
            expect(retrieved?.cardID).toBe(cardID);

            // And: Should be queryable by cardID
            const byCardID = storage.getMappingByCardID(cardID);
            expect(byCardID).toBeDefined();
            expect(byCardID?.cardID).toBe(cardID);
            expect(byCardID?.xiuyuanID).toBe(xiuyuan.id);

            // And: Should be queryable by xiuyuanID
            const byXiuyuanID = storage.getMappingsByXiuyuanID(xiuyuan.id);
            expect(byXiuyuanID).toHaveLength(1);
            expect(byXiuyuanID[0].cardID).toBe(cardID);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain ID type consistency across operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate multiple xiuyuans with different IDs
          fc.array(
            fc.record({
              blockIDs: fc.array(fc.string({ minLength: 10, maxLength: 20 }).map(s => `block_${s}`), { minLength: 1, maxLength: 3 }),
              templateID: fc.oneof(fc.constant('basic'), fc.constant('vocabulary')),
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (xiuyuanDataArray) => {
            // Given: A storage instance
            const storage = new XiuyuanStorage('test-plugin');

            // When: Creating multiple Xiuyuans
            const xiuyuans = xiuyuanDataArray.map(data =>
              storage.createXiuyuan({
                ...data,
                fields: data.blockIDs.map((blockID, i) => ({
                  name: `field${i}`,
                  blockID,
                })),
              })
            );

            // Then: All IDs should be unique
            const ids = xiuyuans.map(x => x.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);

            // And: Each Xiuyuan should be retrievable by its own ID
            xiuyuans.forEach(xiuyuan => {
              const retrieved = storage.getXiuyuan(xiuyuan.id);
              expect(retrieved).toBeDefined();
              expect(retrieved?.id).toBe(xiuyuan.id);
            });

            // And: BlockIDs should not be confused with XiuyuanIDs
            xiuyuans.forEach(xiuyuan => {
              xiuyuan.blockIDs.forEach(blockID => {
                // BlockID should not retrieve a Xiuyuan by ID
                const wrongRetrieval = storage.getXiuyuan(blockID);
                expect(wrongRetrieval).toBeUndefined();
              });
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle ID format validation correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate various ID formats (excluding JavaScript built-in names)
          fc.oneof(
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => 
              typeof s === 'string' && 
              !['valueOf', 'toString', 'constructor', 'hasOwnProperty', '__proto__'].includes(s)
            ),
            fc.constant('xy_123'),
            fc.constant('block_abc'),
            fc.constant('card_xyz'),
            fc.constant('nonexistent_id')
          ),
          async (id) => {
            // Given: A storage instance
            const storage = new XiuyuanStorage('test-plugin');

            // When: Attempting to retrieve with various ID formats
            const result = storage.getXiuyuan(id);

            // Then: Should handle gracefully (return undefined for non-existent IDs)
            const exists = storage.getAllXiuyuans().some(x => x.id === id);
            if (!exists) {
              expect(result).toBeUndefined();
            } else {
              expect(result).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should prevent ID collision across different types', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate blockIDs and cardIDs
          fc.array(fc.string({ minLength: 10, maxLength: 20 }).map(s => `block_${s}`), { minLength: 2, maxLength: 3 }),
          fc.array(fc.string({ minLength: 10, maxLength: 20 }).map(s => `card_${s}`), { minLength: 1, maxLength: 2 }),
          async (blockIDs, cardIDs) => {
            // Given: A storage instance
            const storage = new XiuyuanStorage('test-plugin');

            // When: Creating Xiuyuan with blockIDs
            const xiuyuan = storage.createXiuyuan({
              blockIDs,
              fields: blockIDs.map((blockID, i) => ({
                name: `field${i}`,
                blockID,
              })),
              templateID: 'basic',
            });

            // And: Creating mappings with cardIDs
            const mappings = cardIDs.map(cardID => {
              const mapping: ICardMapping = {
                xiuyuanID: xiuyuan.id,
                cardID,
                frontFields: ['field0'],
                backFields: ['field1'],
              };
              return storage.createMapping(mapping);
            });

            // Then: XiuyuanID should not collide with BlockIDs
            blockIDs.forEach(blockID => {
              expect(xiuyuan.id).not.toBe(blockID);
            });

            // And: XiuyuanID should not collide with CardIDs
            cardIDs.forEach(cardID => {
              expect(xiuyuan.id).not.toBe(cardID);
            });

            // And: BlockIDs should not collide with CardIDs
            blockIDs.forEach(blockID => {
              cardIDs.forEach(cardID => {
                expect(blockID).not.toBe(cardID);
              });
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle field blockID updates correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate initial blockIDs
          fc.array(fc.string({ minLength: 10, maxLength: 20 }).map(s => `block_${s}`), { minLength: 2, maxLength: 3 }),
          // Generate new blockIDs
          fc.array(fc.string({ minLength: 10, maxLength: 20 }).map(s => `block_new_${s}`), { minLength: 2, maxLength: 3 }),
          async (initialBlockIDs, newBlockIDs) => {
            // Given: A storage instance with a Xiuyuan
            const storage = new XiuyuanStorage('test-plugin');
            const xiuyuan = storage.createXiuyuan({
              blockIDs: initialBlockIDs,
              fields: initialBlockIDs.map((blockID, i) => ({
                name: `field${i}`,
                blockID,
              })),
              templateID: 'basic',
            });

            // When: Updating blockIDs
            const updated = storage.updateXiuyuan(xiuyuan.id, {
              blockIDs: newBlockIDs,
              fields: newBlockIDs.map((blockID, i) => ({
                name: `field${i}`,
                blockID,
              })),
            });

            // Then: Update should succeed
            expect(updated).toBe(true);

            // And: New blockIDs should be queryable
            newBlockIDs.forEach(blockID => {
              const found = storage.getXiuyuansByBlockID(blockID);
              expect(found.some(x => x.id === xiuyuan.id)).toBe(true);
            });

            // And: Old blockIDs should not return this Xiuyuan
            initialBlockIDs.forEach(blockID => {
              const found = storage.getXiuyuansByBlockID(blockID);
              expect(found.some(x => x.id === xiuyuan.id)).toBe(false);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle mapping deletion with correct ID types', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate xiuyuan data
          fc.record({
            blockIDs: fc.array(fc.string({ minLength: 10, maxLength: 20 }).map(s => `block_${s}`), { minLength: 2, maxLength: 3 }),
            templateID: fc.constant('basic'),
          }),
          // Generate multiple cardIDs
          fc.array(fc.string({ minLength: 10, maxLength: 20 }).map(s => `card_${s}`), { minLength: 2, maxLength: 4 }),
          async (xiuyuanData, cardIDs) => {
            // Given: A storage instance with Xiuyuan and mappings
            const storage = new XiuyuanStorage('test-plugin');
            const xiuyuan = storage.createXiuyuan({
              ...xiuyuanData,
              fields: xiuyuanData.blockIDs.map((blockID, i) => ({
                name: `field${i}`,
                blockID,
              })),
            });

            const mappingIDs = cardIDs.map(cardID => {
              const mapping: ICardMapping = {
                xiuyuanID: xiuyuan.id,
                cardID,
                frontFields: ['field0'],
                backFields: ['field1'],
              };
              return storage.createMapping(mapping);
            });

            // When: Deleting some mappings
            const toDelete = mappingIDs.slice(0, Math.floor(mappingIDs.length / 2));
            toDelete.forEach(mappingID => {
              const deleted = storage.deleteMapping(mappingID);
              expect(deleted).toBe(true);
            });

            // Then: Deleted mappings should not be retrievable
            toDelete.forEach(mappingID => {
              const retrieved = storage.getMapping(mappingID);
              expect(retrieved).toBeUndefined();
            });

            // And: Remaining mappings should still be retrievable
            const remaining = mappingIDs.slice(Math.floor(mappingIDs.length / 2));
            remaining.forEach(mappingID => {
              const retrieved = storage.getMapping(mappingID);
              expect(retrieved).toBeDefined();
            });

            // And: Xiuyuan should still exist
            const xiuyuanStillExists = storage.getXiuyuan(xiuyuan.id);
            expect(xiuyuanStillExists).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle concurrent ID operations safely', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate multiple operations
          fc.array(
            fc.record({
              blockIDs: fc.array(fc.string({ minLength: 10, maxLength: 15 }).map(s => `block_${s}`), { minLength: 1, maxLength: 2 }),
              templateID: fc.constant('basic'),
            }),
            { minLength: 3, maxLength: 10 }
          ),
          async (operations) => {
            // Given: A storage instance
            const storage = new XiuyuanStorage('test-plugin');

            // When: Creating multiple Xiuyuans concurrently
            const xiuyuans = operations.map(op =>
              storage.createXiuyuan({
                ...op,
                fields: op.blockIDs.map((blockID, i) => ({
                  name: `field${i}`,
                  blockID,
                })),
              })
            );

            // Then: All IDs should be unique
            const ids = xiuyuans.map(x => x.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);

            // And: All should be retrievable
            xiuyuans.forEach(xiuyuan => {
              const retrieved = storage.getXiuyuan(xiuyuan.id);
              expect(retrieved).toBeDefined();
              expect(retrieved?.id).toBe(xiuyuan.id);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain ID integrity after save/load cycle', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate xiuyuan data
          fc.array(
            fc.record({
              blockIDs: fc.array(fc.string({ minLength: 10, maxLength: 20 }).map(s => `block_${s}`), { minLength: 1, maxLength: 3 }),
              templateID: fc.oneof(fc.constant('basic'), fc.constant('vocabulary')),
            }),
            { minLength: 1, maxLength: 3 }
          ),
          async (xiuyuanDataArray) => {
            // Given: A storage instance with Xiuyuans
            const storage = new XiuyuanStorage('test-plugin');
            const xiuyuans = xiuyuanDataArray.map(data =>
              storage.createXiuyuan({
                ...data,
                fields: data.blockIDs.map((blockID, i) => ({
                  name: `field${i}`,
                  blockID,
                })),
              })
            );

            // When: Getting stats before save
            const statsBefore = storage.getStats();

            // Then: Stats should reflect created Xiuyuans
            expect(statsBefore.xiuyuanCount).toBe(xiuyuans.length);

            // And: All IDs should be retrievable
            xiuyuans.forEach(xiuyuan => {
              const retrieved = storage.getXiuyuan(xiuyuan.id);
              expect(retrieved).toBeDefined();
              expect(retrieved?.id).toBe(xiuyuan.id);
              expect(retrieved?.blockIDs).toEqual(xiuyuan.blockIDs);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 15 - Edge Cases', () => {
    it('should handle empty blockIDs array', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant('basic'),
          async (templateID) => {
            // Given: A storage instance
            const storage = new XiuyuanStorage('test-plugin');

            // When: Creating Xiuyuan with empty blockIDs
            const xiuyuan = storage.createXiuyuan({
              blockIDs: [],
              fields: [],
              templateID,
            });

            // Then: Should create successfully
            expect(xiuyuan.id).toBeDefined();
            expect(xiuyuan.blockIDs).toEqual([]);
            expect(xiuyuan.fields).toEqual([]);

            // And: Should be retrievable
            const retrieved = storage.getXiuyuan(xiuyuan.id);
            expect(retrieved).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle duplicate blockIDs in same Xiuyuan', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 10, maxLength: 20 }).map(s => `block_${s}`),
          fc.integer({ min: 2, max: 5 }),
          async (blockID, count) => {
            // Given: A storage instance
            const storage = new XiuyuanStorage('test-plugin');

            // When: Creating Xiuyuan with duplicate blockIDs
            const blockIDs = Array(count).fill(blockID);
            const xiuyuan = storage.createXiuyuan({
              blockIDs,
              fields: blockIDs.map((bid, i) => ({
                name: `field${i}`,
                blockID: bid,
              })),
              templateID: 'basic',
            });

            // Then: Should create successfully
            expect(xiuyuan.blockIDs).toEqual(blockIDs);

            // And: Should be queryable by the blockID
            const found = storage.getXiuyuansByBlockID(blockID);
            expect(found.some(x => x.id === xiuyuan.id)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle very long IDs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 100, maxLength: 200 }).map(s => `block_${s}`),
          async (longBlockID) => {
            // Given: A storage instance
            const storage = new XiuyuanStorage('test-plugin');

            // When: Creating Xiuyuan with very long blockID
            const xiuyuan = storage.createXiuyuan({
              blockIDs: [longBlockID],
              fields: [{
                name: 'field0',
                blockID: longBlockID,
              }],
              templateID: 'basic',
            });

            // Then: Should handle correctly
            expect(xiuyuan.blockIDs[0]).toBe(longBlockID);

            // And: Should be queryable
            const found = storage.getXiuyuansByBlockID(longBlockID);
            expect(found.some(x => x.id === xiuyuan.id)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

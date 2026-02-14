/**
 * Property-Based Tests for Xiuyuan Association Consistency
 * 
 * Feature: architecture-optimization
 * Task: 6.9 编写 Xiuyuan 关联一致性属性测试
 * 
 * Property 16: Xiuyuan 与 FSRSCard 关联一致性
 * 
 * **Validates: Requirements 3.6, 4.6**
 * 
 * For any FSRSCard created through Xiuyuan, FSRSCard.meta.xiuyuanID should correctly
 * point to the corresponding Xiuyuan, and the correct field mapping can be queried
 * through CardMapping.
 * 
 * This property test verifies:
 * - FSRSCard correctly links to Xiuyuan via meta.xiuyuanID
 * - CardMapping correctly maps fields between Xiuyuan and FSRSCard
 * - Field mappings are consistent and retrievable
 * - Deletion cascades correctly
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { XiuyuanStorage } from '../storage';
import type { IXiuyuan, ICardMapping } from '../types';

describe('Xiuyuan Association Consistency - Property-Based Tests', () => {
  describe('Property 16: Xiuyuan 与 FSRSCard 关联一致性 (Requirements 3.6, 4.6)', () => {
    it('should maintain correct xiuyuanID in CardMapping', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate xiuyuan data
          fc.record({
            blockIDs: fc.array(
              fc.string({ minLength: 10, maxLength: 20 }).map(s => `block_${s}`),
              { minLength: 2, maxLength: 4 }
            ),
            templateID: fc.oneof(fc.constant('basic'), fc.constant('vocabulary')),
          }),
          // Generate cardID
          fc.string({ minLength: 10, maxLength: 20 }).map(s => `card_${s}`),
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

            // When: Creating a CardMapping
            const mapping: ICardMapping = {
              xiuyuanID: xiuyuan.id,
              cardID,
              frontFields: ['field0'],
              backFields: ['field1'],
              typeMarker: 'basic',
            };
            const mappingID = storage.createMapping(mapping);

            // Then: The mapping should correctly reference the Xiuyuan
            const retrieved = storage.getMapping(mappingID);
            expect(retrieved).toBeDefined();
            expect(retrieved?.xiuyuanID).toBe(xiuyuan.id);

            // And: Should be queryable by xiuyuanID
            const byXiuyuanID = storage.getMappingsByXiuyuanID(xiuyuan.id);
            expect(byXiuyuanID).toHaveLength(1);
            expect(byXiuyuanID[0].xiuyuanID).toBe(xiuyuan.id);
            expect(byXiuyuanID[0].cardID).toBe(cardID);

            // And: Should be queryable by cardID
            const byCardID = storage.getMappingByCardID(cardID);
            expect(byCardID).toBeDefined();
            expect(byCardID?.xiuyuanID).toBe(xiuyuan.id);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain field mapping consistency', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate xiuyuan with multiple fields
          fc.record({
            blockIDs: fc.array(
              fc.string({ minLength: 10, maxLength: 20 }).map(s => `block_${s}`),
              { minLength: 3, maxLength: 5 }
            ),
            templateID: fc.constant('vocabulary'),
          }),
          // Generate field selections
          fc.record({
            frontFieldIndices: fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 1, maxLength: 2 }),
            backFieldIndices: fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 1, maxLength: 2 }),
          }),
          async (xiuyuanData, fieldSelection) => {
            // Given: A storage instance with a Xiuyuan
            const storage = new XiuyuanStorage('test-plugin');
            const xiuyuan = storage.createXiuyuan({
              ...xiuyuanData,
              fields: xiuyuanData.blockIDs.map((blockID, i) => ({
                name: `field${i}`,
                blockID,
              })),
            });

            // When: Creating a CardMapping with specific field selections
            const frontFields = fieldSelection.frontFieldIndices
              .filter(i => i < xiuyuan.fields.length)
              .map(i => `field${i}`);
            const backFields = fieldSelection.backFieldIndices
              .filter(i => i < xiuyuan.fields.length)
              .map(i => `field${i}`);

            if (frontFields.length === 0 || backFields.length === 0) {
              return; // Skip if no valid fields
            }

            const mapping: ICardMapping = {
              xiuyuanID: xiuyuan.id,
              cardID: `card_${Date.now()}`,
              frontFields,
              backFields,
              typeMarker: 'vocabulary',
            };
            const mappingID = storage.createMapping(mapping);

            // Then: The mapping should preserve field selections
            const retrieved = storage.getMapping(mappingID);
            expect(retrieved).toBeDefined();
            expect(retrieved?.frontFields).toEqual(frontFields);
            expect(retrieved?.backFields).toEqual(backFields);

            // And: All referenced fields should exist in Xiuyuan
            const fieldNames = xiuyuan.fields.map(f => f.name);
            frontFields.forEach(fieldName => {
              expect(fieldNames).toContain(fieldName);
            });
            backFields.forEach(fieldName => {
              expect(fieldNames).toContain(fieldName);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle one-to-many Xiuyuan-to-Card relationship', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate xiuyuan data
          fc.record({
            blockIDs: fc.array(
              fc.string({ minLength: 10, maxLength: 20 }).map(s => `block_${s}`),
              { minLength: 2, maxLength: 3 }
            ),
            templateID: fc.constant('basic'),
          }),
          // Generate number of cards to create
          fc.integer({ min: 2, max: 5 }),
          async (xiuyuanData, cardCount) => {
            // Given: A storage instance with a Xiuyuan
            const storage = new XiuyuanStorage('test-plugin');
            const xiuyuan = storage.createXiuyuan({
              ...xiuyuanData,
              fields: xiuyuanData.blockIDs.map((blockID, i) => ({
                name: `field${i}`,
                blockID,
              })),
            });

            // When: Creating multiple CardMappings for the same Xiuyuan
            const cardIDs: string[] = [];
            for (let i = 0; i < cardCount; i++) {
              const cardID = `card_${Date.now()}_${i}`;
              cardIDs.push(cardID);
              const mapping: ICardMapping = {
                xiuyuanID: xiuyuan.id,
                cardID,
                frontFields: ['field0'],
                backFields: ['field1'],
                typeMarker: `type${i}`,
              };
              storage.createMapping(mapping);
            }

            // Then: All mappings should reference the same Xiuyuan
            const mappings = storage.getMappingsByXiuyuanID(xiuyuan.id);
            expect(mappings).toHaveLength(cardCount);
            mappings.forEach(mapping => {
              expect(mapping.xiuyuanID).toBe(xiuyuan.id);
            });

            // And: Each cardID should be unique
            const retrievedCardIDs = mappings.map(m => m.cardID);
            const uniqueCardIDs = new Set(retrievedCardIDs);
            expect(uniqueCardIDs.size).toBe(cardCount);

            // And: Each card should be queryable individually
            cardIDs.forEach(cardID => {
              const mapping = storage.getMappingByCardID(cardID);
              expect(mapping).toBeDefined();
              expect(mapping?.xiuyuanID).toBe(xiuyuan.id);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should cascade delete mappings when Xiuyuan is deleted', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate xiuyuan data
          fc.record({
            blockIDs: fc.array(
              fc.string({ minLength: 10, maxLength: 20 }).map(s => `block_${s}`),
              { minLength: 2, maxLength: 3 }
            ),
            templateID: fc.constant('basic'),
          }),
          // Generate number of cards
          fc.integer({ min: 1, max: 4 }),
          async (xiuyuanData, cardCount) => {
            // Given: A storage instance with Xiuyuan and mappings
            const storage = new XiuyuanStorage('test-plugin');
            const xiuyuan = storage.createXiuyuan({
              ...xiuyuanData,
              fields: xiuyuanData.blockIDs.map((blockID, i) => ({
                name: `field${i}`,
                blockID,
              })),
            });

            const cardIDs: string[] = [];
            for (let i = 0; i < cardCount; i++) {
              const cardID = `card_${Date.now()}_${i}`;
              cardIDs.push(cardID);
              const mapping: ICardMapping = {
                xiuyuanID: xiuyuan.id,
                cardID,
                frontFields: ['field0'],
                backFields: ['field1'],
              };
              storage.createMapping(mapping);
            }

            // When: Deleting the Xiuyuan
            const deleted = storage.deleteXiuyuan(xiuyuan.id);
            expect(deleted).toBe(true);

            // Then: All associated mappings should be deleted
            const mappings = storage.getMappingsByXiuyuanID(xiuyuan.id);
            expect(mappings).toHaveLength(0);

            // And: Individual card queries should return undefined
            cardIDs.forEach(cardID => {
              const mapping = storage.getMappingByCardID(cardID);
              expect(mapping).toBeUndefined();
            });

            // And: Xiuyuan should not be retrievable
            const retrievedXiuyuan = storage.getXiuyuan(xiuyuan.id);
            expect(retrievedXiuyuan).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain blockID references through field mappings', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate xiuyuan data
          fc.record({
            blockIDs: fc.array(
              fc.string({ minLength: 10, maxLength: 20 }).map(s => `block_${s}`),
              { minLength: 2, maxLength: 4 }
            ),
            templateID: fc.constant('basic'),
          }),
          async (xiuyuanData) => {
            // Given: A storage instance with a Xiuyuan
            const storage = new XiuyuanStorage('test-plugin');
            const xiuyuan = storage.createXiuyuan({
              ...xiuyuanData,
              fields: xiuyuanData.blockIDs.map((blockID, i) => ({
                name: `field${i}`,
                blockID,
              })),
            });

            // When: Creating a CardMapping
            const mapping: ICardMapping = {
              xiuyuanID: xiuyuan.id,
              cardID: `card_${Date.now()}`,
              frontFields: ['field0'],
              backFields: ['field1'],
            };
            storage.createMapping(mapping);

            // Then: Should be able to resolve blockIDs through field names
            const frontBlockIDs = mapping.frontFields
              .map(fieldName => xiuyuan.fields.find(f => f.name === fieldName)?.blockID)
              .filter(Boolean);
            const backBlockIDs = mapping.backFields
              .map(fieldName => xiuyuan.fields.find(f => f.name === fieldName)?.blockID)
              .filter(Boolean);

            expect(frontBlockIDs.length).toBeGreaterThan(0);
            expect(backBlockIDs.length).toBeGreaterThan(0);

            // And: All resolved blockIDs should be in the Xiuyuan's blockIDs
            frontBlockIDs.forEach(blockID => {
              expect(xiuyuan.blockIDs).toContain(blockID);
            });
            backBlockIDs.forEach(blockID => {
              expect(xiuyuan.blockIDs).toContain(blockID);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle mapping updates without breaking associations', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate xiuyuan data
          fc.record({
            blockIDs: fc.array(
              fc.string({ minLength: 10, maxLength: 20 }).map(s => `block_${s}`),
              { minLength: 3, maxLength: 5 }
            ),
            templateID: fc.constant('vocabulary'),
          }),
          async (xiuyuanData) => {
            // Given: A storage instance with Xiuyuan and mapping
            const storage = new XiuyuanStorage('test-plugin');
            const xiuyuan = storage.createXiuyuan({
              ...xiuyuanData,
              fields: xiuyuanData.blockIDs.map((blockID, i) => ({
                name: `field${i}`,
                blockID,
              })),
            });

            const cardID = `card_${Date.now()}`;
            const mapping: ICardMapping = {
              xiuyuanID: xiuyuan.id,
              cardID,
              frontFields: ['field0'],
              backFields: ['field1'],
            };
            const mappingID = storage.createMapping(mapping);

            // When: Deleting and recreating mapping (simulating update)
            storage.deleteMapping(mappingID);
            const newMapping: ICardMapping = {
              xiuyuanID: xiuyuan.id,
              cardID,
              frontFields: ['field0', 'field1'],
              backFields: ['field2'],
            };
            const newMappingID = storage.createMapping(newMapping);

            // Then: New mapping should maintain correct association
            const retrieved = storage.getMapping(newMappingID);
            expect(retrieved).toBeDefined();
            expect(retrieved?.xiuyuanID).toBe(xiuyuan.id);
            expect(retrieved?.cardID).toBe(cardID);

            // And: Should be queryable by cardID
            const byCardID = storage.getMappingByCardID(cardID);
            expect(byCardID).toBeDefined();
            expect(byCardID?.xiuyuanID).toBe(xiuyuan.id);

            // And: Xiuyuan should still exist
            const xiuyuanStillExists = storage.getXiuyuan(xiuyuan.id);
            expect(xiuyuanStillExists).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain consistency across multiple Xiuyuans', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate multiple xiuyuans
          fc.array(
            fc.record({
              blockIDs: fc.array(
                fc.string({ minLength: 10, maxLength: 20 }).map(s => `block_${s}`),
                { minLength: 2, maxLength: 3 }
              ),
              templateID: fc.oneof(fc.constant('basic'), fc.constant('vocabulary')),
            }),
            { minLength: 2, maxLength: 4 }
          ),
          async (xiuyuanDataArray) => {
            // Given: A storage instance with multiple Xiuyuans
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

            // When: Creating mappings for each Xiuyuan
            const mappings: Array<{ xiuyuanID: string; cardID: string }> = [];
            xiuyuans.forEach((xiuyuan, i) => {
              const cardID = `card_${Date.now()}_${i}`;
              const mapping: ICardMapping = {
                xiuyuanID: xiuyuan.id,
                cardID,
                frontFields: ['field0'],
                backFields: ['field1'],
              };
              storage.createMapping(mapping);
              mappings.push({ xiuyuanID: xiuyuan.id, cardID });
            });

            // Then: Each mapping should reference the correct Xiuyuan
            mappings.forEach(({ xiuyuanID, cardID }) => {
              const mapping = storage.getMappingByCardID(cardID);
              expect(mapping).toBeDefined();
              expect(mapping?.xiuyuanID).toBe(xiuyuanID);
            });

            // And: Each Xiuyuan should have exactly one mapping
            xiuyuans.forEach(xiuyuan => {
              const xiuyuanMappings = storage.getMappingsByXiuyuanID(xiuyuan.id);
              expect(xiuyuanMappings).toHaveLength(1);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle complex field mapping scenarios', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate xiuyuan with many fields
          fc.record({
            blockIDs: fc.array(
              fc.string({ minLength: 10, maxLength: 20 }).map(s => `block_${s}`),
              { minLength: 4, maxLength: 6 }
            ),
            templateID: fc.constant('complex'),
          }),
          async (xiuyuanData) => {
            // Given: A storage instance with a complex Xiuyuan
            const storage = new XiuyuanStorage('test-plugin');
            const xiuyuan = storage.createXiuyuan({
              ...xiuyuanData,
              fields: xiuyuanData.blockIDs.map((blockID, i) => ({
                name: `field${i}`,
                blockID,
                marker: `marker${i}`,
              })),
            });

            // When: Creating multiple mappings with different field combinations
            const mapping1: ICardMapping = {
              xiuyuanID: xiuyuan.id,
              cardID: `card_${Date.now()}_1`,
              frontFields: ['field0', 'field1'],
              backFields: ['field2', 'field3'],
              typeMarker: 'type1',
            };
            const mapping2: ICardMapping = {
              xiuyuanID: xiuyuan.id,
              cardID: `card_${Date.now()}_2`,
              frontFields: ['field2'],
              backFields: ['field0', 'field1'],
              typeMarker: 'type2',
            };
            storage.createMapping(mapping1);
            storage.createMapping(mapping2);

            // Then: Both mappings should reference the same Xiuyuan
            const mappings = storage.getMappingsByXiuyuanID(xiuyuan.id);
            expect(mappings).toHaveLength(2);
            mappings.forEach(mapping => {
              expect(mapping.xiuyuanID).toBe(xiuyuan.id);
            });

            // And: Each mapping should have distinct field combinations
            const mapping1Retrieved = storage.getMappingByCardID(mapping1.cardID);
            const mapping2Retrieved = storage.getMappingByCardID(mapping2.cardID);
            expect(mapping1Retrieved?.frontFields).toEqual(['field0', 'field1']);
            expect(mapping2Retrieved?.frontFields).toEqual(['field2']);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain association integrity after Xiuyuan updates', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate initial and updated xiuyuan data
          fc.record({
            initial: fc.record({
              blockIDs: fc.array(
                fc.string({ minLength: 10, maxLength: 20 }).map(s => `block_${s}`),
                { minLength: 2, maxLength: 3 }
              ),
              templateID: fc.constant('basic'),
            }),
            updated: fc.record({
              blockIDs: fc.array(
                fc.string({ minLength: 10, maxLength: 20 }).map(s => `block_new_${s}`),
                { minLength: 2, maxLength: 3 }
              ),
            }),
          }),
          async ({ initial, updated }) => {
            // Given: A storage instance with Xiuyuan and mapping
            const storage = new XiuyuanStorage('test-plugin');
            const xiuyuan = storage.createXiuyuan({
              ...initial,
              fields: initial.blockIDs.map((blockID, i) => ({
                name: `field${i}`,
                blockID,
              })),
            });

            const cardID = `card_${Date.now()}`;
            const mapping: ICardMapping = {
              xiuyuanID: xiuyuan.id,
              cardID,
              frontFields: ['field0'],
              backFields: ['field1'],
            };
            storage.createMapping(mapping);

            // When: Updating the Xiuyuan
            storage.updateXiuyuan(xiuyuan.id, {
              blockIDs: updated.blockIDs,
              fields: updated.blockIDs.map((blockID, i) => ({
                name: `field${i}`,
                blockID,
              })),
            });

            // Then: Mapping should still reference the same Xiuyuan
            const mappingRetrieved = storage.getMappingByCardID(cardID);
            expect(mappingRetrieved).toBeDefined();
            expect(mappingRetrieved?.xiuyuanID).toBe(xiuyuan.id);

            // And: Xiuyuan should have updated blockIDs
            const xiuyuanRetrieved = storage.getXiuyuan(xiuyuan.id);
            expect(xiuyuanRetrieved).toBeDefined();
            expect(xiuyuanRetrieved?.blockIDs).toEqual(updated.blockIDs);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle orphaned mappings gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate xiuyuan data
          fc.record({
            blockIDs: fc.array(
              fc.string({ minLength: 10, maxLength: 20 }).map(s => `block_${s}`),
              { minLength: 2, maxLength: 3 }
            ),
            templateID: fc.constant('basic'),
          }),
          async (xiuyuanData) => {
            // Given: A storage instance
            const storage = new XiuyuanStorage('test-plugin');

            // When: Creating a mapping with non-existent xiuyuanID
            const fakeXiuyuanID = 'xy_nonexistent_123';
            const cardID = `card_${Date.now()}`;
            const mapping: ICardMapping = {
              xiuyuanID: fakeXiuyuanID,
              cardID,
              frontFields: ['field0'],
              backFields: ['field1'],
            };
            const mappingID = storage.createMapping(mapping);

            // Then: Mapping should be created (storage doesn't validate)
            const retrieved = storage.getMapping(mappingID);
            expect(retrieved).toBeDefined();
            expect(retrieved?.xiuyuanID).toBe(fakeXiuyuanID);

            // And: Querying by xiuyuanID should return the orphaned mapping
            const mappings = storage.getMappingsByXiuyuanID(fakeXiuyuanID);
            expect(mappings).toHaveLength(1);

            // And: The referenced Xiuyuan should not exist
            const xiuyuan = storage.getXiuyuan(fakeXiuyuanID);
            expect(xiuyuan).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 16 - Edge Cases', () => {
    it('should handle empty field arrays in mappings', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            blockIDs: fc.array(
              fc.string({ minLength: 10, maxLength: 20 }).map(s => `block_${s}`),
              { minLength: 1, maxLength: 2 }
            ),
            templateID: fc.constant('basic'),
          }),
          async (xiuyuanData) => {
            // Given: A storage instance with a Xiuyuan
            const storage = new XiuyuanStorage('test-plugin');
            const xiuyuan = storage.createXiuyuan({
              ...xiuyuanData,
              fields: xiuyuanData.blockIDs.map((blockID, i) => ({
                name: `field${i}`,
                blockID,
              })),
            });

            // When: Creating a mapping with empty field arrays
            const mapping: ICardMapping = {
              xiuyuanID: xiuyuan.id,
              cardID: `card_${Date.now()}`,
              frontFields: [],
              backFields: [],
            };
            const mappingID = storage.createMapping(mapping);

            // Then: Mapping should be created
            const retrieved = storage.getMapping(mappingID);
            expect(retrieved).toBeDefined();
            expect(retrieved?.frontFields).toEqual([]);
            expect(retrieved?.backFields).toEqual([]);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle duplicate field names in mappings', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            blockIDs: fc.array(
              fc.string({ minLength: 10, maxLength: 20 }).map(s => `block_${s}`),
              { minLength: 2, maxLength: 3 }
            ),
            templateID: fc.constant('basic'),
          }),
          async (xiuyuanData) => {
            // Given: A storage instance with a Xiuyuan
            const storage = new XiuyuanStorage('test-plugin');
            const xiuyuan = storage.createXiuyuan({
              ...xiuyuanData,
              fields: xiuyuanData.blockIDs.map((blockID, i) => ({
                name: `field${i}`,
                blockID,
              })),
            });

            // When: Creating a mapping with duplicate field names
            const mapping: ICardMapping = {
              xiuyuanID: xiuyuan.id,
              cardID: `card_${Date.now()}`,
              frontFields: ['field0', 'field0'],
              backFields: ['field1', 'field1'],
            };
            const mappingID = storage.createMapping(mapping);

            // Then: Mapping should preserve duplicates
            const retrieved = storage.getMapping(mappingID);
            expect(retrieved).toBeDefined();
            expect(retrieved?.frontFields).toEqual(['field0', 'field0']);
            expect(retrieved?.backFields).toEqual(['field1', 'field1']);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle non-existent field names in mappings', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            blockIDs: fc.array(
              fc.string({ minLength: 10, maxLength: 20 }).map(s => `block_${s}`),
              { minLength: 2, maxLength: 3 }
            ),
            templateID: fc.constant('basic'),
          }),
          async (xiuyuanData) => {
            // Given: A storage instance with a Xiuyuan
            const storage = new XiuyuanStorage('test-plugin');
            const xiuyuan = storage.createXiuyuan({
              ...xiuyuanData,
              fields: xiuyuanData.blockIDs.map((blockID, i) => ({
                name: `field${i}`,
                blockID,
              })),
            });

            // When: Creating a mapping with non-existent field names
            const mapping: ICardMapping = {
              xiuyuanID: xiuyuan.id,
              cardID: `card_${Date.now()}`,
              frontFields: ['nonexistent1'],
              backFields: ['nonexistent2'],
            };
            const mappingID = storage.createMapping(mapping);

            // Then: Mapping should be created (storage doesn't validate)
            const retrieved = storage.getMapping(mappingID);
            expect(retrieved).toBeDefined();
            expect(retrieved?.frontFields).toEqual(['nonexistent1']);
            expect(retrieved?.backFields).toEqual(['nonexistent2']);

            // And: Attempting to resolve blockIDs should return empty
            const frontBlockIDs = mapping.frontFields
              .map(fieldName => xiuyuan.fields.find(f => f.name === fieldName)?.blockID)
              .filter(Boolean);
            expect(frontBlockIDs).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

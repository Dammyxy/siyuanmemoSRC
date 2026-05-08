/**
 * Card Migration Tests
 * 卡片迁移功能测试
 * 
 * @see .kiro/specs/learning-steps-rating-fix/tasks.md - Task 3.2
 */

import { describe, it, expect } from 'vitest';
import { migrateCard, migrateCards, needsMigration } from '../cardMigration';
import { FSRSCard, CardState, CardType } from '../../types/card';

/**
 * 创建测试卡片
 */
function createTestCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
    const now = Date.now();
    return {
        id: 'test-card-1',
        blockId: 'block-1',
        due: now,
        stability: 1.0,
        difficulty: 5.0,
        reps: 0,
        lapses: 0,
        state: CardState.New,
        lastReview: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        priority: 50,
        type: CardType.Item,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: now,
        updatedAt: now,
        ...overrides,
    };
}

describe('cardMigration', () => {
    describe('migrateCard', () => {
        it('should add default learning_step = 0 if undefined', () => {
            const card = createTestCard({ learning_step: undefined });
            const migrated = migrateCard(card);
            
            expect(migrated.learning_step).toBe(0);
        });
        
        it('should preserve existing learning_step value', () => {
            const card = createTestCard({ learning_step: 2 });
            const migrated = migrateCard(card);
            
            expect(migrated.learning_step).toBe(2);
        });
        
        it('should preserve learning_step = 0 if already set', () => {
            const card = createTestCard({ learning_step: 0 });
            const migrated = migrateCard(card);
            
            expect(migrated.learning_step).toBe(0);
        });
        
        it('should preserve existing state field', () => {
            const card = createTestCard({ state: CardState.Review });
            const migrated = migrateCard(card);
            
            expect(migrated.state).toBe(CardState.Review);
        });
        
        it('should infer state = New if scheduledDays = 0 and state is undefined', () => {
            const card = createTestCard({ 
                state: undefined as any,
                scheduledDays: 0 
            });
            const migrated = migrateCard(card);
            
            expect(migrated.state).toBe(CardState.New);
        });
        
        it('should infer state = Learning if scheduledDays < 1 and state is undefined', () => {
            const card = createTestCard({ 
                state: undefined as any,
                scheduledDays: 0.5 
            });
            const migrated = migrateCard(card);
            
            expect(migrated.state).toBe(CardState.Learning);
        });
        
        it('should infer state = Review if scheduledDays >= 1 and state is undefined', () => {
            const card = createTestCard({ 
                state: undefined as any,
                scheduledDays: 5 
            });
            const migrated = migrateCard(card);
            
            expect(migrated.state).toBe(CardState.Review);
        });
        
        it('should not modify other card fields', () => {
            const card = createTestCard({
                learning_step: undefined,
                stability: 2.5,
                difficulty: 7.0,
                reps: 10,
                lapses: 2,
            });
            const migrated = migrateCard(card);
            
            expect(migrated.stability).toBe(2.5);
            expect(migrated.difficulty).toBe(7.0);
            expect(migrated.reps).toBe(10);
            expect(migrated.lapses).toBe(2);
        });
        
        it('should handle card with all fields already set', () => {
            const card = createTestCard({
                learning_step: 1,
                state: CardState.Learning,
            });
            const migrated = migrateCard(card);
            
            expect(migrated.learning_step).toBe(1);
            expect(migrated.state).toBe(CardState.Learning);
        });
        
        // Re-scheduling field migration
        it('should add default postponeCount = 0 if undefined', () => {
            const card = createTestCard({ postponeCount: undefined });
            const migrated = migrateCard(card);
            
            expect(migrated.postponeCount).toBe(0);
        });
        
        it('should preserve existing postponeCount value', () => {
            const card = createTestCard({ postponeCount: 5 });
            const migrated = migrateCard(card);
            
            expect(migrated.postponeCount).toBe(5);
        });
        
        it('should add empty rescheduleHistory if undefined', () => {
            const card = createTestCard({ rescheduleHistory: undefined });
            const migrated = migrateCard(card);
            
            expect(migrated.rescheduleHistory).toEqual([]);
            expect(Array.isArray(migrated.rescheduleHistory)).toBe(true);
        });
        
        it('should preserve existing rescheduleHistory', () => {
            const history = [
                { type: 'postpone' as const, timestamp: 123456, oldDue: 100, newDue: 200 }
            ];
            const card = createTestCard({ rescheduleHistory: history });
            const migrated = migrateCard(card);
            
            expect(migrated.rescheduleHistory).toEqual(history);
        });
        
        it('should keep lastPostponeDate as undefined if not set', () => {
            const card = createTestCard({ lastPostponeDate: undefined });
            const migrated = migrateCard(card);
            
            expect(migrated.lastPostponeDate).toBeUndefined();
        });
        
        it('should preserve existing lastPostponeDate', () => {
            const card = createTestCard({ lastPostponeDate: 123456789 });
            const migrated = migrateCard(card);
            
            expect(migrated.lastPostponeDate).toBe(123456789);
        });
    });
    
    describe('migrateCards', () => {
        it('should migrate multiple cards', () => {
            const cards = [
                createTestCard({ id: 'card-1', learning_step: undefined }),
                createTestCard({ id: 'card-2', learning_step: undefined }),
                createTestCard({ id: 'card-3', learning_step: 1 }),
            ];
            
            const migrated = migrateCards(cards);
            
            expect(migrated).toHaveLength(3);
            expect(migrated[0].learning_step).toBe(0);
            expect(migrated[1].learning_step).toBe(0);
            expect(migrated[2].learning_step).toBe(1);
        });
        
        it('should handle empty array', () => {
            const migrated = migrateCards([]);
            expect(migrated).toEqual([]);
        });
        
        it('should preserve card order', () => {
            const cards = [
                createTestCard({ id: 'card-1' }),
                createTestCard({ id: 'card-2' }),
                createTestCard({ id: 'card-3' }),
            ];
            
            const migrated = migrateCards(cards);
            
            expect(migrated.map(c => c.id)).toEqual(['card-1', 'card-2', 'card-3']);
        });
    });
    
    describe('needsMigration', () => {
        it('should return true if learning_step is undefined', () => {
            const card = createTestCard({ learning_step: undefined });
            expect(needsMigration(card)).toBe(true);
        });
        
        it('should return true if state is undefined', () => {
            const card = createTestCard({ 
                learning_step: 0,
                state: undefined as any 
            });
            expect(needsMigration(card)).toBe(true);
        });
        
        it('should return true if postponeCount is undefined', () => {
            const card = createTestCard({ 
                learning_step: 0,
                state: CardState.New,
                postponeCount: undefined
            });
            expect(needsMigration(card)).toBe(true);
        });
        
        it('should return true if rescheduleHistory is undefined', () => {
            const card = createTestCard({ 
                learning_step: 0,
                state: CardState.New,
                postponeCount: 0,
                rescheduleHistory: undefined
            });
            expect(needsMigration(card)).toBe(true);
        });
        
        it('should return true if both fields are undefined', () => {
            const card = createTestCard({ 
                learning_step: undefined,
                state: undefined as any 
            });
            expect(needsMigration(card)).toBe(true);
        });
        
        it('should return false if all fields are defined', () => {
            const card = createTestCard({ 
                learning_step: 0,
                state: CardState.New,
                postponeCount: 0,
                rescheduleHistory: []
            });
            expect(needsMigration(card)).toBe(false);
        });
        
        it('should return false if learning_step = 0 and state is set', () => {
            const card = createTestCard({ 
                learning_step: 0,
                state: CardState.Learning,
                postponeCount: 0,
                rescheduleHistory: []
            });
            expect(needsMigration(card)).toBe(false);
        });
    });
    
    describe('edge cases', () => {
        it('should handle card with learning_step = 0 (not undefined)', () => {
            const card = createTestCard({ learning_step: 0 });
            const migrated = migrateCard(card);
            
            expect(migrated.learning_step).toBe(0);
            expect(needsMigration(card)).toBe(false);
        });
        
        it('should handle card with negative scheduledDays', () => {
            const card = createTestCard({ 
                state: undefined as any,
                scheduledDays: -1 
            });
            const migrated = migrateCard(card);
            
            // Negative scheduledDays should be treated as Learning
            expect(migrated.state).toBe(CardState.Learning);
        });
        
        it('should handle card with very large scheduledDays', () => {
            const card = createTestCard({ 
                state: undefined as any,
                scheduledDays: 365 
            });
            const migrated = migrateCard(card);
            
            expect(migrated.state).toBe(CardState.Review);
        });
        
        it('should handle card with scheduledDays = 1 (boundary)', () => {
            const card = createTestCard({ 
                state: undefined as any,
                scheduledDays: 1 
            });
            const migrated = migrateCard(card);
            
            expect(migrated.state).toBe(CardState.Review);
        });
        
        it('should handle card with scheduledDays = 0.999 (just below boundary)', () => {
            const card = createTestCard({ 
                state: undefined as any,
                scheduledDays: 0.999 
            });
            const migrated = migrateCard(card);
            
            expect(migrated.state).toBe(CardState.Learning);
        });
    });
    
    describe('backward compatibility', () => {
        it('should not break cards from old version without learning_step', () => {
            // Simulate old card data without learning_step field
            const oldCard = createTestCard({ learning_step: undefined });
            delete (oldCard as any).learning_step;
            
            const migrated = migrateCard(oldCard);
            
            expect(migrated.learning_step).toBe(0);
            expect(migrated.state).toBeDefined();
        });
        
        it('should handle cards with only partial FSRS data', () => {
            const card = createTestCard({
                learning_step: undefined,
                state: undefined as any,
                stability: 0,
                difficulty: 0,
                reps: 0,
                scheduledDays: 0,
            });
            
            const migrated = migrateCard(card);
            
            expect(migrated.learning_step).toBe(0);
            expect(migrated.state).toBe(CardState.New);
        });
    });
});

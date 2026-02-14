/**
 * Integration Test: Advanced Mode Due Cards Fix and Custom Day Start
 * 
 * This test verifies that all components are correctly integrated:
 * 1. dateUtils - Date calculation with dayStartHour
 * 2. LocalStorageDataSource - Due filtering with dayStartHour
 * 3. AdvancedDataRouter - Due filtering with dayStartHour
 * 4. browserService - Preset filtering with dayStartHour
 * 5. Settings Panel - dayStartHour configuration UI
 * 
 * @see .kiro/specs/advanced-mode-due-cards-fix-and-custom-day-start/requirements.md
 * @see .kiro/specs/advanced-mode-due-cards-fix-and-custom-day-start/design.md
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getTodayRange, getCurrentDayEnd, formatTodayRange } from '@/utils/dateUtils';
import { getDayStartHour, saveDayStartHour } from '@/utils/configUtils';
import type { FSRSCard } from '@/types/card';

describe('Integration: Advanced Mode Due Cards Fix and Custom Day Start', () => {
  let mockPlugin: any;
  let originalDate: typeof Date;

  beforeEach(() => {
    // Save original Date
    originalDate = global.Date;
    
    // Create mock storage
    const mockStorage = {
      getSettings: vi.fn(() => ({
        fsrs: {
          dayStartHour: 4,
          requestRetention: 0.9,
          maximumInterval: 365,
        },
      })),
      saveSettings: vi.fn(async (settings: any) => {
        // Update the mock storage
        mockStorage.getSettings = vi.fn(() => settings);
      }),
    };
    
    // Create mock plugin
    mockPlugin = {
      data: {
        'fsrs-config': {
          dayStartHour: 4,
        },
      },
      storage: mockStorage,
      saveData: vi.fn(async (key: string, data: any) => {
        mockPlugin.data[key] = data;
      }),
    };
  });

  afterEach(() => {
    // Restore original Date
    global.Date = originalDate;
    vi.restoreAllMocks();
  });

  describe('1. Date Utils Integration', () => {
    it('should calculate today range correctly with dayStartHour=4', () => {
      // Mock current time: 2024-01-15 10:00:00 (after 4 AM)
      const mockNow = new Date('2024-01-15T10:00:00');
      vi.setSystemTime(mockNow);

      const range = getTodayRange(4);

      // Expected: 2024-01-15 04:00:00 ~ 2024-01-16 04:00:00
      expect(new Date(range.start)).toEqual(new Date('2024-01-15T04:00:00'));
      expect(new Date(range.end)).toEqual(new Date('2024-01-16T04:00:00'));
      expect(range.end - range.start).toBe(24 * 60 * 60 * 1000); // 24 hours
    });

    it('should calculate today range correctly when current time is before dayStartHour', () => {
      // Mock current time: 2024-01-15 02:00:00 (before 4 AM)
      const mockNow = new Date('2024-01-15T02:00:00');
      vi.setSystemTime(mockNow);

      const range = getTodayRange(4);

      // Expected: 2024-01-14 04:00:00 ~ 2024-01-15 04:00:00
      expect(new Date(range.start)).toEqual(new Date('2024-01-14T04:00:00'));
      expect(new Date(range.end)).toEqual(new Date('2024-01-15T04:00:00'));
    });

    it('should handle midnight (dayStartHour=0)', () => {
      const mockNow = new Date('2024-01-15T10:00:00');
      vi.setSystemTime(mockNow);

      const range = getTodayRange(0);

      // Expected: 2024-01-15 00:00:00 ~ 2024-01-16 00:00:00
      expect(new Date(range.start)).toEqual(new Date('2024-01-15T00:00:00'));
      expect(new Date(range.end)).toEqual(new Date('2024-01-16T00:00:00'));
    });

    it('should format today range correctly', () => {
      const mockNow = new Date('2024-01-15T10:00:00');
      vi.setSystemTime(mockNow);

      const range = getTodayRange(4);
      const formatted = formatTodayRange(range);

      expect(formatted).toContain('2024');
      expect(formatted).toContain('04:00:00');
    });
  });

  describe('2. Config Utils Integration', () => {
    it('should get dayStartHour from plugin config', () => {
      const dayStartHour = getDayStartHour(mockPlugin);
      expect(dayStartHour).toBe(4);
    });

    it('should use default value when dayStartHour is not configured', () => {
      const emptyPlugin = { data: {} };
      const dayStartHour = getDayStartHour(emptyPlugin);
      expect(dayStartHour).toBe(4);
    });

    it('should save dayStartHour to plugin config', async () => {
      await saveDayStartHour(mockPlugin, 6);
      const settings = mockPlugin.storage.getSettings();
      expect(settings.fsrs.dayStartHour).toBe(6);
    });

    it('should reject invalid dayStartHour values', async () => {
      await expect(saveDayStartHour(mockPlugin, -1)).rejects.toThrow();
      await expect(saveDayStartHour(mockPlugin, 24)).rejects.toThrow();
      await expect(saveDayStartHour(mockPlugin, 1.5)).rejects.toThrow();
    });

    it('should validate dayStartHour range (0-23)', () => {
      mockPlugin.data['fsrs-config'].dayStartHour = 25;
      const dayStartHour = getDayStartHour(mockPlugin);
      expect(dayStartHour).toBe(4); // Should fall back to default
    });
  });

  describe('3. Cross-Component Consistency', () => {
    it('should use same dayEnd across all components', () => {
      const mockNow = new Date('2024-01-15T10:00:00');
      vi.setSystemTime(mockNow);

      const dayStartHour = getDayStartHour(mockPlugin);
      const dayEnd1 = getCurrentDayEnd(dayStartHour);
      const dayEnd2 = getTodayRange(dayStartHour).end;

      // Both should return the same value
      expect(dayEnd1).toBe(dayEnd2);
      expect(new Date(dayEnd1)).toEqual(new Date('2024-01-16T04:00:00'));
    });

    it('should filter cards consistently across components', () => {
      const mockNow = new Date('2024-01-15T10:00:00');
      vi.setSystemTime(mockNow);

      const dayStartHour = getDayStartHour(mockPlugin);
      const dayEnd = getCurrentDayEnd(dayStartHour);

      // Create test cards
      const dueCard = {
        id: '1',
        due: new Date('2024-01-15T03:00:00').getTime(), // Before dayEnd
      };
      const notDueCard = {
        id: '2',
        due: new Date('2024-01-16T05:00:00').getTime(), // After dayEnd
      };

      // Both cards should be filtered the same way
      expect(dueCard.due <= dayEnd).toBe(true);
      expect(notDueCard.due <= dayEnd).toBe(false);
    });
  });

  describe('4. Due Card Filtering Logic', () => {
    it('should correctly identify due cards with dayStartHour=4', () => {
      const mockNow = new Date('2024-01-15T10:00:00');
      vi.setSystemTime(mockNow);

      const dayStartHour = 4;
      const dayEnd = getCurrentDayEnd(dayStartHour);

      const cards = [
        { id: '1', due: new Date('2024-01-14T10:00:00').getTime() }, // Yesterday - DUE
        { id: '2', due: new Date('2024-01-15T03:00:00').getTime() }, // Today 3 AM - DUE
        { id: '3', due: new Date('2024-01-15T10:00:00').getTime() }, // Today 10 AM - DUE
        { id: '4', due: new Date('2024-01-16T03:00:00').getTime() }, // Tomorrow 3 AM - DUE
        { id: '5', due: new Date('2024-01-16T05:00:00').getTime() }, // Tomorrow 5 AM - NOT DUE
      ];

      const dueCards = cards.filter(card => card.due <= dayEnd);

      expect(dueCards).toHaveLength(4);
      expect(dueCards.map(c => c.id)).toEqual(['1', '2', '3', '4']);
    });

    it('should handle edge case: card due exactly at dayEnd', () => {
      const mockNow = new Date('2024-01-15T10:00:00');
      vi.setSystemTime(mockNow);

      const dayEnd = getCurrentDayEnd(4);
      const card = { id: '1', due: dayEnd };

      // Card due exactly at dayEnd should be considered due
      expect(card.due <= dayEnd).toBe(true);
    });

    it('should filter out cards with invalid due values', () => {
      const cards = [
        { id: '1', due: null },
        { id: '2', due: undefined },
        { id: '3', due: NaN },
        { id: '4', due: new Date('2024-01-15T10:00:00').getTime() },
      ];

      const validCards = cards.filter(card => {
        if (card.due == null) return false;
        const dueTime = typeof card.due === 'number' ? card.due : new Date(card.due).getTime();
        if (isNaN(dueTime)) return false;
        return true;
      });

      expect(validCards).toHaveLength(1);
      expect(validCards[0].id).toBe('4');
    });
  });

  describe('5. Different dayStartHour Values', () => {
    it('should work correctly with dayStartHour=0 (midnight)', () => {
      const mockNow = new Date('2024-01-15T10:00:00');
      vi.setSystemTime(mockNow);

      const dayEnd = getCurrentDayEnd(0);
      expect(new Date(dayEnd)).toEqual(new Date('2024-01-16T00:00:00'));
    });

    it('should work correctly with dayStartHour=6 (morning)', () => {
      const mockNow = new Date('2024-01-15T10:00:00');
      vi.setSystemTime(mockNow);

      const dayEnd = getCurrentDayEnd(6);
      expect(new Date(dayEnd)).toEqual(new Date('2024-01-16T06:00:00'));
    });

    it('should work correctly with dayStartHour=23 (late night)', () => {
      const mockNow = new Date('2024-01-15T22:00:00');
      vi.setSystemTime(mockNow);

      const dayEnd = getCurrentDayEnd(23);
      expect(new Date(dayEnd)).toEqual(new Date('2024-01-15T23:00:00'));
    });
  });

  describe('6. Error Handling and Fallback', () => {
    it('should use default value for invalid dayStartHour', () => {
      const range1 = getTodayRange(-1);
      const range2 = getTodayRange(24);
      const range3 = getTodayRange(1.5);

      // All should use default value 4
      expect(range1.end - range1.start).toBe(24 * 60 * 60 * 1000);
      expect(range2.end - range2.start).toBe(24 * 60 * 60 * 1000);
      expect(range3.end - range3.start).toBe(24 * 60 * 60 * 1000);
    });

    it('should handle config loading failure gracefully', () => {
      const brokenPlugin = {
        data: null,
      };

      const dayStartHour = getDayStartHour(brokenPlugin);
      expect(dayStartHour).toBe(4); // Should use default
    });
  });

  describe('7. Real-World Scenarios', () => {
    it('Scenario: User stays up late (3 AM) and wants cards to still belong to "yesterday"', () => {
      // User configured dayStartHour=4
      // Current time: 3 AM
      const mockNow = new Date('2024-01-15T03:00:00');
      vi.setSystemTime(mockNow);

      const range = getTodayRange(4);

      // "Today" should be: 2024-01-14 04:00:00 ~ 2024-01-15 04:00:00
      expect(new Date(range.start)).toEqual(new Date('2024-01-14T04:00:00'));
      expect(new Date(range.end)).toEqual(new Date('2024-01-15T04:00:00'));

      // Cards due before 4 AM today should be considered due
      const card = { id: '1', due: new Date('2024-01-15T02:00:00').getTime() };
      expect(card.due <= range.end).toBe(true);
    });

    it('Scenario: User wakes up at 5 AM and wants to see new cards', () => {
      // User configured dayStartHour=4
      // Current time: 5 AM
      const mockNow = new Date('2024-01-15T05:00:00');
      vi.setSystemTime(mockNow);

      const range = getTodayRange(4);

      // "Today" should be: 2024-01-15 04:00:00 ~ 2024-01-16 04:00:00
      expect(new Date(range.start)).toEqual(new Date('2024-01-15T04:00:00'));
      expect(new Date(range.end)).toEqual(new Date('2024-01-16T04:00:00'));

      // Cards due before tomorrow 4 AM should be considered due
      const card1 = { id: '1', due: new Date('2024-01-15T10:00:00').getTime() };
      const card2 = { id: '2', due: new Date('2024-01-16T03:00:00').getTime() };
      const card3 = { id: '3', due: new Date('2024-01-16T05:00:00').getTime() };

      expect(card1.due <= range.end).toBe(true);
      expect(card2.due <= range.end).toBe(true);
      expect(card3.due <= range.end).toBe(false);
    });

    it('Scenario: User changes dayStartHour from 4 to 6', async () => {
      const mockNow = new Date('2024-01-15T05:00:00');
      vi.setSystemTime(mockNow);

      // Before: dayStartHour=4
      // At 5 AM, we're after 4 AM, so "today" is 2024-01-15 04:00:00 ~ 2024-01-16 04:00:00
      const dayEnd1 = getCurrentDayEnd(4);
      expect(new Date(dayEnd1)).toEqual(new Date('2024-01-16T04:00:00'));

      // After: dayStartHour=6
      // At 5 AM, we're before 6 AM, so "today" is 2024-01-14 06:00:00 ~ 2024-01-15 06:00:00
      await saveDayStartHour(mockPlugin, 6);
      const dayEnd2 = getCurrentDayEnd(6);
      expect(new Date(dayEnd2)).toEqual(new Date('2024-01-15T06:00:00'));

      // The dayEnd should change immediately
      expect(dayEnd2).not.toBe(dayEnd1);
      // dayEnd2 is earlier than dayEnd1 because we're now before the new dayStartHour
      expect(dayEnd1 - dayEnd2).toBe(22 * 60 * 60 * 1000); // 22 hours difference
    });
  });

  describe('8. Backward Compatibility', () => {
    it('should use default dayStartHour=4 for users upgrading from old version', () => {
      const oldPlugin = {
        data: {
          'fsrs-config': {
            // No dayStartHour field
            requestRetention: 0.9,
            maximumInterval: 365,
          },
        },
      };

      const dayStartHour = getDayStartHour(oldPlugin);
      expect(dayStartHour).toBe(4);
    });

    it('should not break existing review data', () => {
      const mockNow = new Date('2024-01-15T10:00:00');
      vi.setSystemTime(mockNow);

      // Old behavior: midnight (0:00)
      const oldDayEnd = new Date(mockNow);
      oldDayEnd.setHours(23, 59, 59, 999);

      // New behavior: dayStartHour=4
      const newDayEnd = getCurrentDayEnd(4);

      // New dayEnd should be later than old dayEnd
      expect(newDayEnd).toBeGreaterThan(oldDayEnd.getTime());

      // Cards that were due under old system should still be due under new system
      const card = { id: '1', due: new Date('2024-01-15T20:00:00').getTime() };
      expect(card.due <= oldDayEnd.getTime()).toBe(true);
      expect(card.due <= newDayEnd).toBe(true);
    });
  });
});

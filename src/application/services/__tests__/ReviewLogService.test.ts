/**
 * ReviewLogService 单元测试
 * 
 * @description
 * 测试 ReviewLogService 的日志添加、查询和按月分片存储功能。
 * 
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReviewLogService } from '../ReviewLogService';
import type { IFileService } from '../../../infrastructure/services/FileService';
import type { DrillLogV2, ReviewLog } from '@/types/review';
import type { RescheduleLog } from '@/types/scheduler';
import { CardState, Rating } from '@/types/card';

describe('ReviewLogService', () => {
  let service: ReviewLogService;
  let mockFileService: IFileService;
  let mockStorage: Map<string, any>;

  beforeEach(() => {
    // 创建内存存储模拟文件系统
    mockStorage = new Map();

    // 创建 mock FileService
    mockFileService = {
      readJSON: vi.fn(async (fileName: string) => {
        return mockStorage.get(fileName) || null;
      }),
      writeJSON: vi.fn(async (fileName: string, data: any) => {
        mockStorage.set(fileName, data);
      }),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      readMsgpack: vi.fn(),
      writeMsgpack: vi.fn()
    };

    // 创建服务实例
    service = new ReviewLogService(mockFileService);
  });

  describe('addReviewLog', () => {
    it('should add review log to correct monthly file', async () => {
      const log: ReviewLog = {
        id: 'log-1',
        cardId: 'card-1',
        rating: Rating.Good,
        state: CardState.Review,
        scheduledDays: 10,
        elapsedDays: 10,
        review: new Date('2024-03-15').getTime(),
        stability: 5.0,
        difficulty: 5.0
      };

      await service.addReviewLog(log);

      // 验证文件服务被调用
      expect(mockFileService.writeJSON).toHaveBeenCalledWith(
        'review-logs/2024-03.json',
        expect.objectContaining({
          reviewLogs: [log],
          rescheduleLogs: []
        })
      );
    });

    it('should append to existing logs without overwriting', async () => {
      const existingLog: ReviewLog = {
        id: 'log-1',
        cardId: 'card-1',
        rating: Rating.Good,
        state: CardState.Review,
        scheduledDays: 10,
        elapsedDays: 10,
        review: new Date('2024-03-10').getTime(),
        stability: 5.0,
        difficulty: 5.0
      };

      const newLog: ReviewLog = {
        id: 'log-2',
        cardId: 'card-2',
        rating: Rating.Easy,
        state: CardState.Review,
        scheduledDays: 15,
        elapsedDays: 15,
        review: new Date('2024-03-15').getTime(),
        stability: 6.0,
        difficulty: 4.0
      };

      // 预先存储一个日志
      mockStorage.set('review-logs/2024-03.json', {
        reviewLogs: [existingLog],
        rescheduleLogs: []
      });

      await service.addReviewLog(newLog);

      // 验证两个日志都存在
      const data = mockStorage.get('review-logs/2024-03.json');
      expect(data.reviewLogs).toHaveLength(2);
      expect(data.reviewLogs).toContainEqual(existingLog);
      expect(data.reviewLogs).toContainEqual(newLog);
    });

    it('should handle logs from different months separately', async () => {
      const marchLog: ReviewLog = {
        id: 'log-1',
        cardId: 'card-1',
        rating: Rating.Good,
        state: CardState.Review,
        scheduledDays: 10,
        elapsedDays: 10,
        review: new Date('2024-03-15').getTime(),
        stability: 5.0,
        difficulty: 5.0
      };

      const aprilLog: ReviewLog = {
        id: 'log-2',
        cardId: 'card-2',
        rating: Rating.Easy,
        state: CardState.Review,
        scheduledDays: 15,
        elapsedDays: 15,
        review: new Date('2024-04-15').getTime(),
        stability: 6.0,
        difficulty: 4.0
      };

      await service.addReviewLog(marchLog);
      await service.addReviewLog(aprilLog);

      // 验证分别存储到不同文件
      expect(mockStorage.has('review-logs/2024-03.json')).toBe(true);
      expect(mockStorage.has('review-logs/2024-04.json')).toBe(true);

      const marchData = mockStorage.get('review-logs/2024-03.json');
      const aprilData = mockStorage.get('review-logs/2024-04.json');

      expect(marchData.reviewLogs).toHaveLength(1);
      expect(marchData.reviewLogs[0]).toEqual(marchLog);

      expect(aprilData.reviewLogs).toHaveLength(1);
      expect(aprilData.reviewLogs[0]).toEqual(aprilLog);
    });
  });

  describe('addRescheduleLog', () => {
    it('should add reschedule log to correct monthly file', async () => {
      const log: RescheduleLog = {
        ts: new Date('2024-03-15').getTime(),
        action: 'postpone',
        source: 'browser',
        targets: ['card-1'],
        result: {
          updated: 1,
          skipped: 0
        },
        sample: [{
          cardId: 'card-1',
          oldDue: '2024-03-15',
          newDue: '2024-03-20'
        }]
      };

      await service.addRescheduleLog(log);

      // 验证文件服务被调用
      expect(mockFileService.writeJSON).toHaveBeenCalledWith(
        'review-logs/2024-03.json',
        expect.objectContaining({
          reviewLogs: [],
          rescheduleLogs: [log]
        })
      );
    });

    it('should append reschedule log to existing file with review logs', async () => {
      const reviewLog: ReviewLog = {
        id: 'log-1',
        cardId: 'card-1',
        rating: Rating.Good,
        state: CardState.Review,
        scheduledDays: 10,
        elapsedDays: 10,
        review: new Date('2024-03-10').getTime(),
        stability: 5.0,
        difficulty: 5.0
      };

      const rescheduleLog: RescheduleLog = {
        ts: new Date('2024-03-15').getTime(),
        action: 'postpone',
        source: 'browser',
        targets: ['card-1'],
        result: {
          updated: 1,
          skipped: 0
        },
        sample: [{
          cardId: 'card-1',
          oldDue: '2024-03-15',
          newDue: '2024-03-20'
        }]
      };

      await service.addReviewLog(reviewLog);
      await service.addRescheduleLog(rescheduleLog);

      const data = mockStorage.get('review-logs/2024-03.json');
      expect(data.reviewLogs).toHaveLength(1);
      expect(data.rescheduleLogs).toHaveLength(1);
      expect(data.reviewLogs[0]).toEqual(reviewLog);
      expect(data.rescheduleLogs[0]).toEqual(rescheduleLog);
    });
  });

  describe('addDrillLogV2', () => {
    it('should add drill-only logs without mixing them into formal review logs', async () => {
      const log: DrillLogV2 = {
        schemaVersion: 2,
        id: 'drill-1',
        cardId: 'card-1',
        rating: Rating.Again,
        reviewedAt: new Date('2024-03-15').getTime(),
        queueType: 'final-drill',
        source: 'queue',
        action: 'moved-to-back',
        isDrill: true,
      };

      await service.addDrillLogV2(log);

      const data = mockStorage.get('review-logs/2024-03.json');
      expect(data.reviewLogs).toEqual([]);
      expect(data.reviewLogsV2).toEqual([]);
      expect(data.drillLogsV2).toEqual([log]);
      await expect(service.getDrillLogsV2(2024, 3)).resolves.toEqual([log]);
    });
  });

  describe('getReviewLogs', () => {
    it('should return empty array when no logs exist', async () => {
      const logs = await service.getReviewLogs(2024, 3);
      expect(logs).toEqual([]);
    });

    it('should return logs for specified month', async () => {
      const log1: ReviewLog = {
        id: 'log-1',
        cardId: 'card-1',
        rating: Rating.Good,
        state: CardState.Review,
        scheduledDays: 10,
        elapsedDays: 10,
        review: new Date('2024-03-10').getTime(),
        stability: 5.0,
        difficulty: 5.0
      };

      const log2: ReviewLog = {
        id: 'log-2',
        cardId: 'card-2',
        rating: Rating.Easy,
        state: CardState.Review,
        scheduledDays: 15,
        elapsedDays: 15,
        review: new Date('2024-03-15').getTime(),
        stability: 6.0,
        difficulty: 4.0
      };

      mockStorage.set('review-logs/2024-03.json', {
        reviewLogs: [log1, log2],
        rescheduleLogs: []
      });

      const logs = await service.getReviewLogs(2024, 3);
      expect(logs).toHaveLength(2);
      expect(logs).toContainEqual(log1);
      expect(logs).toContainEqual(log2);
    });

    it('should format month with leading zero', async () => {
      await service.getReviewLogs(2024, 3);
      expect(mockFileService.readJSON).toHaveBeenCalledWith('review-logs/2024-03.json');
    });

    it('should handle missing reviewLogs field gracefully', async () => {
      mockStorage.set('review-logs/2024-03.json', {
        rescheduleLogs: []
      });

      const logs = await service.getReviewLogs(2024, 3);
      expect(logs).toEqual([]);
    });
  });

  describe('getAllReviewLogs', () => {
    it('should return current month logs', async () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const monthStr = month.toString().padStart(2, '0');

      const log: ReviewLog = {
        id: 'log-1',
        cardId: 'card-1',
        rating: Rating.Good,
        state: CardState.Review,
        scheduledDays: 10,
        elapsedDays: 10,
        review: now.getTime(),
        stability: 5.0,
        difficulty: 5.0
      };

      mockStorage.set(`review-logs/${year}-${monthStr}.json`, {
        reviewLogs: [log],
        rescheduleLogs: []
      });

      const logs = await service.getAllReviewLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toEqual(log);
    });
  });

  describe('monthly file naming', () => {
    it('should use correct file name format YYYY-MM', async () => {
      const log: ReviewLog = {
        id: 'log-1',
        cardId: 'card-1',
        rating: Rating.Good,
        state: CardState.Review,
        scheduledDays: 10,
        elapsedDays: 10,
        review: new Date('2024-01-15').getTime(),
        stability: 5.0,
        difficulty: 5.0
      };

      await service.addReviewLog(log);

      expect(mockFileService.writeJSON).toHaveBeenCalledWith(
        'review-logs/2024-01.json',
        expect.any(Object)
      );
    });

    it('should pad single-digit months with zero', async () => {
      const months = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      
      for (const month of months) {
        const log: ReviewLog = {
          id: `log-${month}`,
          cardId: 'card-1',
          rating: Rating.Good,
          state: CardState.Review,
          scheduledDays: 10,
          elapsedDays: 10,
          review: new Date(`2024-${month.toString().padStart(2, '0')}-15`).getTime(),
          stability: 5.0,
          difficulty: 5.0
        };

        await service.addReviewLog(log);

        const expectedFileName = `review-logs/2024-${month.toString().padStart(2, '0')}.json`;
        expect(mockFileService.writeJSON).toHaveBeenCalledWith(
          expectedFileName,
          expect.any(Object)
        );
      }
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewLogService } from '../ReviewLogService';
import type { IFileService } from '../../../infrastructure/services/FileService';
import type { DrillLogV2, ReviewLog, ReviewLogV2 } from '@/types/review';
import type { RescheduleLog } from '@/types/scheduler';
import { CardState, Rating } from '@/types/card';

describe('ReviewLogService', () => {
  let mockFileService: IFileService;
  let mockStorage: Map<string, unknown>;

  beforeEach(() => {
    mockStorage = new Map();
    mockFileService = {
      readJSON: vi.fn(async (fileName: string) => mockStorage.get(fileName) ?? null),
      writeJSON: vi.fn(async (fileName: string, data: unknown) => {
        mockStorage.set(fileName, data);
      }),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      readMsgpack: vi.fn(),
      writeMsgpack: vi.fn(),
    };
  });

  it('returns explicit unavailable instead of writing renderer JSON fallback', async () => {
    const service = new ReviewLogService(mockFileService);
    const log = buildReviewLog();

    await expect(service.addReviewLog(log)).rejects.toThrow('BACKEND_UNAVAILABLE');
    expect(mockFileService.writeJSON).not.toHaveBeenCalled();
  });

  it('returns explicit unavailable instead of writing renderer SQL fallback', async () => {
    const sqlRepository = {
      addReviewLog: vi.fn(),
      addReviewLogV2: vi.fn(),
      addDrillLogV2: vi.fn(),
      addRescheduleLog: vi.fn(),
      persist: vi.fn(),
    };
    const service = new ReviewLogService(mockFileService, sqlRepository as never);

    await expect(service.addReviewLog(buildReviewLog())).rejects.toThrow('BACKEND_UNAVAILABLE');
    await expect(service.addReviewLogV2(buildReviewLogV2())).rejects.toThrow('BACKEND_UNAVAILABLE');
    await expect(service.addDrillLogV2(buildDrillLogV2())).rejects.toThrow('BACKEND_UNAVAILABLE');
    await expect(service.addRescheduleLog(buildRescheduleLog())).rejects.toThrow('BACKEND_UNAVAILABLE');

    expect(sqlRepository.addReviewLog).not.toHaveBeenCalled();
    expect(sqlRepository.addReviewLogV2).not.toHaveBeenCalled();
    expect(sqlRepository.addDrillLogV2).not.toHaveBeenCalled();
    expect(sqlRepository.addRescheduleLog).not.toHaveBeenCalled();
    expect(sqlRepository.persist).not.toHaveBeenCalled();
  });

  it('keeps legacy monthly JSON reads as compatibility projection reads', async () => {
    const service = new ReviewLogService(mockFileService);
    const reviewLog = buildReviewLog();
    const reviewLogV2 = buildReviewLogV2();
    const drillLogV2 = buildDrillLogV2();
    mockStorage.set('review-logs/2024-03.json', {
      reviewLogs: [reviewLog],
      reviewLogsV2: [reviewLogV2],
      drillLogsV2: [drillLogV2],
      rescheduleLogs: [buildRescheduleLog()],
    });

    await expect(service.getReviewLogs(2024, 3)).resolves.toEqual([reviewLog]);
    await expect(service.getReviewLogsV2(2024, 3)).resolves.toEqual([reviewLogV2]);
    await expect(service.getDrillLogsV2(2024, 3)).resolves.toEqual([drillLogV2]);
    expect(mockFileService.readJSON).toHaveBeenCalledWith('review-logs/2024-03.json');
  });

  it('keeps SQL repository reads but treats the repository as read-only projection', async () => {
    const reviewLog = buildReviewLog();
    const reviewLogV2 = buildReviewLogV2();
    const drillLogV2 = buildDrillLogV2();
    const sqlRepository = {
      getReviewLogs: vi.fn(() => [reviewLog]),
      getReviewLogsV2: vi.fn(() => [reviewLogV2]),
      getDrillLogsV2: vi.fn(() => [drillLogV2]),
      getAllReviewLogs: vi.fn(() => [reviewLog]),
    };
    const service = new ReviewLogService(mockFileService, sqlRepository as never);

    await expect(service.getReviewLogs(2024, 3)).resolves.toEqual([reviewLog]);
    await expect(service.getReviewLogsV2(2024, 3)).resolves.toEqual([reviewLogV2]);
    await expect(service.getDrillLogsV2(2024, 3)).resolves.toEqual([drillLogV2]);
    await expect(service.getAllReviewLogs()).resolves.toEqual([reviewLog]);
    expect(mockFileService.writeJSON).not.toHaveBeenCalled();
  });

  it('returns empty arrays for missing legacy monthly fields', async () => {
    const service = new ReviewLogService(mockFileService);
    mockStorage.set('review-logs/2024-03.json', { rescheduleLogs: [] });

    await expect(service.getReviewLogs(2024, 3)).resolves.toEqual([]);
    await expect(service.getReviewLogsV2(2024, 3)).resolves.toEqual([]);
    await expect(service.getDrillLogsV2(2024, 3)).resolves.toEqual([]);
  });
});

function buildReviewLog(): ReviewLog {
  return {
    id: 'log-1',
    cardId: 'card-1',
    rating: Rating.Good,
    state: CardState.Review,
    scheduledDays: 10,
    elapsedDays: 10,
    review: new Date('2024-03-15').getTime(),
    stability: 5.0,
    difficulty: 5.0,
  };
}

function buildReviewLogV2(): ReviewLogV2 {
  return {
    schemaVersion: 2,
    id: 'review-v2-1',
    attemptId: 'attempt-1',
    cardId: 'card-1',
    rating: Rating.Good,
    reviewedAt: new Date('2024-03-15').getTime(),
    queueMode: 'formal',
    commitPolicy: 'write-schedule',
    isDrill: false,
  } as ReviewLogV2;
}

function buildDrillLogV2(): DrillLogV2 {
  return {
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
}

function buildRescheduleLog(): RescheduleLog {
  return {
    ts: new Date('2024-03-15').getTime(),
    action: 'postpone',
    source: 'browser',
    targets: ['card-1'],
    result: {
      updated: 1,
      skipped: 0,
    },
    sample: [{
      cardId: 'card-1',
      oldDue: '2024-03-15',
      newDue: '2024-03-20',
    }],
  };
}

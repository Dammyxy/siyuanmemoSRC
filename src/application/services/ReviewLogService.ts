/**
 * ReviewLogService - 复习日志服务
 * 
 * @module ReviewLogService
 * @description
 * 管理复习和重新调度日志的兼容读取。
 * 写入已迁移到 backend Review truth / writer-owned command path。
 * 
 * **职责**：
 * - 拒绝 renderer 侧复习/调度日志写入
 * - 按年月查询日志
 * - 查询所有历史日志
 * - 兼容读取按月分片日志文件
 * 
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
 */

import type { IFileService } from '../../infrastructure/services/FileService';
import type { SqlReviewLogRepository } from '@/infrastructure/persistence/sqlite';
import type { DrillLogV2, ReviewLog, ReviewLogV2 } from '@/types/review';
import type { RescheduleLog } from '@/types/scheduler';

/**
 * 月度日志文件结构
 */
interface MonthlyReviewLogs {
  reviewLogs: ReviewLog[];
  reviewLogsV2?: ReviewLogV2[];
  drillLogsV2?: DrillLogV2[];
  rescheduleLogs: RescheduleLog[];
}

/**
 * 复习日志服务接口
 */
export interface IReviewLogService {
  /**
   * 添加复习日志
   * @param log 复习日志
   */
  addReviewLog(log: ReviewLog): Promise<void>;

  /**
   * 添加 SRS v2 正式复习日志
   * @param log SRS v2 复习日志
   */
  addReviewLogV2(log: ReviewLogV2): Promise<void>;

  /**
   * 添加 SRS v2 drill-only 练习日志
   * @param log drill 练习日志
   */
  addDrillLogV2(log: DrillLogV2): Promise<void>;
  
  /**
   * 添加重新调度日志
   * @param log 重新调度日志
   */
  addRescheduleLog(log: RescheduleLog): Promise<void>;
  
  /**
   * 获取指定年月的复习日志
   * @param year 年份
   * @param month 月份（1-12）
   * @returns 复习日志数组
   */
  getReviewLogs(year: number, month: number): Promise<ReviewLog[]>;

  /**
   * 获取指定年月的 SRS v2 复习日志
   */
  getReviewLogsV2(year: number, month: number): Promise<ReviewLogV2[]>;

  /**
   * 获取指定年月的 drill-only 练习日志
   */
  getDrillLogsV2(year: number, month: number): Promise<DrillLogV2[]>;
  
  /**
   * 获取所有复习日志
   * @returns 所有复习日志数组
   */
  getAllReviewLogs(): Promise<ReviewLog[]>;
}

/**
 * 复习日志服务实现
 */
export class ReviewLogService implements IReviewLogService {
  private static readonly WRITE_UNAVAILABLE_PREFIX = 'BACKEND_UNAVAILABLE: ReviewLogService renderer writes are retired';

  constructor(
    private readonly fileService: IFileService,
    private readonly sqlRepository?: SqlReviewLogRepository | null,
  ) {}

  /**
   * 添加复习日志
   */
  async addReviewLog(log: ReviewLog): Promise<void> {
    this.failWrite('addReviewLog', log.cardId);
  }

  /**
   * 添加 SRS v2 复习日志
   */
  async addReviewLogV2(log: ReviewLogV2): Promise<void> {
    this.failWrite('addReviewLogV2', log.cardId);
  }

  /**
   * 添加 SRS v2 drill-only 练习日志
   */
  async addDrillLogV2(log: DrillLogV2): Promise<void> {
    this.failWrite('addDrillLogV2', log.cardId);
  }

  /**
   * 添加重新调度日志
   */
  async addRescheduleLog(log: RescheduleLog): Promise<void> {
    this.failWrite('addRescheduleLog', log.targets?.[0] ?? null);
  }

  /**
   * 获取指定年月的复习日志
   */
  async getReviewLogs(year: number, month: number): Promise<ReviewLog[]> {
    if (this.sqlRepository) {
      return this.sqlRepository.getReviewLogs(year, month);
    }

    const fileName = this.getLogFileName(year, month);
    const data = await this.fileService.readJSON<MonthlyReviewLogs>(fileName);
    
    if (!data) {
      return [];
    }
    
    return data.reviewLogs || [];
  }

  /**
   * 获取指定年月的 SRS v2 复习日志
   */
  async getReviewLogsV2(year: number, month: number): Promise<ReviewLogV2[]> {
    if (this.sqlRepository) {
      return this.sqlRepository.getReviewLogsV2(year, month);
    }

    const fileName = this.getLogFileName(year, month);
    const data = await this.fileService.readJSON<MonthlyReviewLogs>(fileName);

    if (!data) {
      return [];
    }

    return data.reviewLogsV2 || [];
  }

  /**
   * 获取指定年月的 drill-only 练习日志
   */
  async getDrillLogsV2(year: number, month: number): Promise<DrillLogV2[]> {
    if (this.sqlRepository) {
      return this.sqlRepository.getDrillLogsV2(year, month);
    }

    const fileName = this.getLogFileName(year, month);
    const data = await this.fileService.readJSON<MonthlyReviewLogs>(fileName);

    if (!data) {
      return [];
    }

    return data.drillLogsV2 || [];
  }

  /**
   * 获取所有复习日志
   */
  async getAllReviewLogs(): Promise<ReviewLog[]> {
    if (this.sqlRepository) {
      return this.sqlRepository.getAllReviewLogs();
    }

    // 注意：这个方法可能需要扫描所有可能的日志文件
    // 目前简化实现，只返回当前月份的日志
    // 完整实现需要文件系统扫描功能
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    return this.getReviewLogs(year, month);
  }

  private failWrite(method: string, cardId: string | null | undefined): never {
    const suffix = cardId ? ` cardId=${cardId}` : '';
    throw new Error(
      `${ReviewLogService.WRITE_UNAVAILABLE_PREFIX}; ${method} must use backend review.feedback or writer-owned Review truth commands${suffix}`
    );
  }

  /**
   * 获取日志文件名
   */
  private getLogFileName(year: number, month: number): string {
    const monthStr = month.toString().padStart(2, '0');
    return `review-logs/${year}-${monthStr}.json`;
  }
}

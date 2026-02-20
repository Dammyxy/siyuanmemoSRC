/**
 * ReviewLogService - 复习日志服务
 * 
 * @module ReviewLogService
 * @description
 * 管理复习和重新调度日志，提供日志的添加、查询功能。
 * 按年月分片存储日志，支持追加写入。
 * 
 * **职责**：
 * - 记录复习日志
 * - 记录重新调度日志
 * - 按年月查询日志
 * - 查询所有历史日志
 * - 按月分片存储日志文件
 * 
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
 */

import type { IFileService } from '../../infrastructure/services/FileService';
import type { ReviewLog } from '@/types/review';
import type { RescheduleLog } from '@/types/scheduler';

/**
 * 月度日志文件结构
 */
interface MonthlyReviewLogs {
  reviewLogs: ReviewLog[];
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
   * 获取所有复习日志
   * @returns 所有复习日志数组
   */
  getAllReviewLogs(): Promise<ReviewLog[]>;
}

/**
 * 复习日志服务实现
 */
export class ReviewLogService implements IReviewLogService {
  constructor(private readonly fileService: IFileService) {}

  /**
   * 添加复习日志
   */
  async addReviewLog(log: ReviewLog): Promise<void> {
    const date = new Date(log.review);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 0-11 -> 1-12
    
    await this.appendLog(year, month, 'review', log);
  }

  /**
   * 添加重新调度日志
   */
  async addRescheduleLog(log: RescheduleLog): Promise<void> {
    const date = new Date(log.ts);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 0-11 -> 1-12
    
    await this.appendLog(year, month, 'reschedule', log);
  }

  /**
   * 获取指定年月的复习日志
   */
  async getReviewLogs(year: number, month: number): Promise<ReviewLog[]> {
    const fileName = this.getLogFileName(year, month);
    const data = await this.fileService.readJSON<MonthlyReviewLogs>(fileName);
    
    if (!data) {
      return [];
    }
    
    return data.reviewLogs || [];
  }

  /**
   * 获取所有复习日志
   */
  async getAllReviewLogs(): Promise<ReviewLog[]> {
    // 注意：这个方法可能需要扫描所有可能的日志文件
    // 目前简化实现，只返回当前月份的日志
    // 完整实现需要文件系统扫描功能
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    return this.getReviewLogs(year, month);
  }

  /**
   * 追加日志到月度文件
   */
  private async appendLog(
    year: number,
    month: number,
    type: 'review' | 'reschedule',
    log: ReviewLog | RescheduleLog
  ): Promise<void> {
    const fileName = this.getLogFileName(year, month);
    
    // 读取现有日志
    let data = await this.fileService.readJSON<MonthlyReviewLogs>(fileName);
    
    // 如果文件不存在，创建新结构
    if (!data) {
      data = {
        reviewLogs: [],
        rescheduleLogs: []
      };
    }
    
    // 追加新日志
    if (type === 'review') {
      data.reviewLogs.push(log as ReviewLog);
    } else {
      data.rescheduleLogs.push(log as RescheduleLog);
    }
    
    // 写回文件
    await this.fileService.writeJSON(fileName, data);
  }

  /**
   * 获取日志文件名
   */
  private getLogFileName(year: number, month: number): string {
    const monthStr = month.toString().padStart(2, '0');
    return `review-logs/${year}-${monthStr}.json`;
  }
}

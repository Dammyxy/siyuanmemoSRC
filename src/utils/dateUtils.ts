/**
 * 日期工具模块
 * 
 * 提供基于用户配置的dayStartHour的日期计算功能
 */

/**
 * 今天的时间范围
 */
import { createLogger } from '@/utils/logger';

const logger = createLogger('dateUtils');

export interface TodayRange {
  /** 今天的开始时间（时间戳，毫秒） */
  start: number;
  /** 今天的结束时间（时间戳，毫秒） */
  end: number;
}

/**
 * 获取"今天"的时间范围
 * 
 * 根据用户配置的dayStartHour计算"今天"的开始和结束时间。
 * 
 * ## 计算逻辑
 * 
 * 假设 dayStartHour = 4（凌晨4点）：
 * 
 * - 当前时间: 2024-01-15 03:00:00（凌晨3点，早于4点）
 *   - start: 2024-01-14 04:00:00（昨天4点）
 *   - end: 2024-01-15 04:00:00（今天4点）
 *   - 解释：凌晨3点还属于"昨天"
 * 
 * - 当前时间: 2024-01-15 05:00:00（早上5点，晚于4点）
 *   - start: 2024-01-15 04:00:00（今天4点）
 *   - end: 2024-01-16 04:00:00（明天4点）
 *   - 解释：早上5点已经是"今天"
 * 
 * @param dayStartHour - 每日开始时间（小时，0-23），默认4
 * @returns 今天的时间范围
 * 
 * @example
 * ```typescript
 * // 用户配置凌晨4点为新的一天
 * const range = getTodayRange(4);
 * logger.info(new Date(range.start)); // 今天04:00:00
 * logger.info(new Date(range.end));   // 明天04:00:00
 * ```
 */
export function getTodayRange(dayStartHour: number = 4): TodayRange {
  // 1. 验证输入
  if (dayStartHour < 0 || dayStartHour > 23 || !Number.isInteger(dayStartHour)) {
    logger.warn('[SiYuanMemo][dateUtils] Invalid dayStartHour:', dayStartHour, 'using default 4');
    dayStartHour = 4;
  }

  // 2. 获取当前时间
  const now = new Date();
  const currentHour = now.getHours();

  // 3. 计算"今天"的开始时间
  let todayStart: Date;
  
  if (currentHour < dayStartHour) {
    // 当前时间早于dayStartHour，"今天"从昨天的dayStartHour开始
    todayStart = new Date(now);
    todayStart.setDate(todayStart.getDate() - 1); // 回退到昨天
    todayStart.setHours(dayStartHour, 0, 0, 0);
  } else {
    // 当前时间晚于或等于dayStartHour，"今天"从今天的dayStartHour开始
    todayStart = new Date(now);
    todayStart.setHours(dayStartHour, 0, 0, 0);
  }

  // 4. 计算"今天"的结束时间（明天的dayStartHour）
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1); // 加一天

  return {
    start: todayStart.getTime(),
    end: todayEnd.getTime(),
  };
}

/**
 * 获取当前"一天"的结束时间
 * 
 * 这是getTodayRange的简化版本，只返回结束时间。
 * 用于到期判断：card.due <= getCurrentDayEnd()
 * 
 * @param dayStartHour - 每日开始时间（小时，0-23），默认4
 * @returns 当前"一天"的结束时间（时间戳，毫秒）
 * 
 * @example
 * ```typescript
 * const dayEnd = getCurrentDayEnd(4);
 * const isDue = card.due <= dayEnd;
 * ```
 */
export function getCurrentDayEnd(dayStartHour: number = 4): number {
  return getTodayRange(dayStartHour).end;
}

/**
 * 格式化时间范围为可读字符串（用于UI显示）
 * 
 * @param range - 时间范围
 * @returns 格式化的字符串
 * 
 * @example
 * ```typescript
 * const range = getTodayRange(4);
 * const text = formatTodayRange(range);
 * // "2024-01-15 04:00:00 ~ 2024-01-16 04:00:00"
 * ```
 */
export function formatTodayRange(range: TodayRange): string {
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  return `${formatDate(range.start)} ~ ${formatDate(range.end)}`;
}

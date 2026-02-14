/**
 * 验证器工具函数
 * 
 * 提供各种数据验证功能
 */

import {
  DEFAULT_PRIORITY,
  PRIORITY_MIN,
  PRIORITY_MAX,
  DEFAULT_LEECH_THRESHOLD,
  PREVIEW_SIZE_MIN,
  PREVIEW_SIZE_MAX,
} from '../constants';

/**
 * 验证优先级值
 */
export function validatePriority(priority: number | undefined): number {
  if (typeof priority !== 'number') return DEFAULT_PRIORITY;
  if (!Number.isFinite(priority)) return DEFAULT_PRIORITY;
  return Math.max(PRIORITY_MIN, Math.min(PRIORITY_MAX, Math.round(priority)));
}

/**
 * 验证难点阈值
 */
export function validateLeechThreshold(threshold: number | undefined): number {
  if (typeof threshold !== 'number') return DEFAULT_LEECH_THRESHOLD;
  if (!Number.isFinite(threshold)) return DEFAULT_LEECH_THRESHOLD;
  return Math.max(1, Math.floor(threshold));
}

/**
 * 验证预览面板尺寸
 */
export function validatePreviewSize(size: number | undefined): number {
  if (typeof size !== 'number') return PREVIEW_SIZE_MIN;
  if (!Number.isFinite(size)) return PREVIEW_SIZE_MIN;
  return Math.max(PREVIEW_SIZE_MIN, Math.min(PREVIEW_SIZE_MAX, Math.round(size)));
}

/**
 * 验证日期
 */
export function validateDate(date: any): Date | null {
  if (!date) return null;
  if (date instanceof Date) {
    return isNaN(date.getTime()) ? null : date;
  }
  if (typeof date === 'string' || typeof date === 'number') {
    const parsed = new Date(date);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * 验证块 ID
 */
export function validateBlockId(blockId: any): string | null {
  if (typeof blockId !== 'string') return null;
  const cleaned = blockId.trim();
  if (cleaned.length === 0) return null;
  // 思源块 ID 格式：20210101120000-xxxxxxx
  if (!/^\d{14}-[a-z0-9]{7}$/.test(cleaned)) return null;
  return cleaned;
}

/**
 * 验证卡片 ID
 */
export function validateCardId(cardId: any): string | null {
  if (typeof cardId !== 'string') return null;
  const cleaned = cardId.trim();
  if (cleaned.length === 0) return null;
  return cleaned;
}

/**
 * 验证 Deck ID
 */
export function validateDeckId(deckId: any): string | null {
  if (typeof deckId !== 'string') return null;
  const cleaned = deckId.trim();
  if (cleaned.length === 0) return null;
  return cleaned;
}

/**
 * 验证搜索查询
 */
export function validateSearchQuery(query: any): string {
  if (typeof query !== 'string') return '';
  return query.trim();
}

/**
 * 验证标签
 */
export function validateTag(tag: any): string | null {
  if (typeof tag !== 'string') return null;
  const cleaned = tag.trim().replace(/^#+|#+$/g, '');
  if (cleaned.length === 0) return null;
  return cleaned;
}

/**
 * 验证数字范围
 */
export function validateNumberRange(
  value: number | undefined,
  min: number,
  max: number,
  defaultValue: number
): number {
  if (typeof value !== 'number') return defaultValue;
  if (!Number.isFinite(value)) return defaultValue;
  return Math.max(min, Math.min(max, value));
}

/**
 * 验证整数
 */
export function validateInteger(value: any, defaultValue: number = 0): number {
  if (typeof value !== 'number') return defaultValue;
  if (!Number.isFinite(value)) return defaultValue;
  return Math.floor(value);
}

/**
 * 验证正整数
 */
export function validatePositiveInteger(value: any, defaultValue: number = 1): number {
  const int = validateInteger(value, defaultValue);
  return Math.max(1, int);
}

/**
 * 验证百分比（0-1）
 */
export function validatePercentage(value: any, defaultValue: number = 0): number {
  if (typeof value !== 'number') return defaultValue;
  if (!Number.isFinite(value)) return defaultValue;
  return Math.max(0, Math.min(1, value));
}

/**
 * 验证数组
 */
export function validateArray<T>(value: any): T[] {
  if (!Array.isArray(value)) return [];
  return value;
}

/**
 * 验证非空数组
 */
export function validateNonEmptyArray<T>(value: any, defaultValue: T[] = []): T[] {
  if (!Array.isArray(value)) return defaultValue;
  if (value.length === 0) return defaultValue;
  return value;
}

/**
 * 验证对象
 */
export function validateObject<T extends object>(value: any): T | null {
  if (typeof value !== 'object' || value === null) return null;
  if (Array.isArray(value)) return null;
  return value as T;
}

/**
 * 验证布尔值
 */
export function validateBoolean(value: any, defaultValue: boolean = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 1) return true;
  if (value === 0) return false;
  return defaultValue;
}

/**
 * 验证枚举值
 */
export function validateEnum<T extends string>(
  value: any,
  validValues: readonly T[],
  defaultValue: T
): T {
  if (typeof value !== 'string') return defaultValue;
  if (validValues.includes(value as T)) return value as T;
  return defaultValue;
}

/**
 * 验证卡片状态
 */
export function validateCardState(state: any): 0 | 1 | 2 | 3 {
  if (typeof state !== 'number') return 0;
  if (state === 0 || state === 1 || state === 2 || state === 3) return state;
  return 0;
}

/**
 * 验证卡片类型
 */
export function validateCardType(type: any): 'topic' | 'item' | undefined {
  if (type === 'topic') return 'topic';
  if (type === 'item') return 'item';
  return undefined;
}

/**
 * 验证排序字段
 */
export function validateSortField(field: any): string | null {
  if (typeof field !== 'string') return null;
  const validFields = [
    'priority',
    'due',
    'interval',
    'difficulty',
    'retrievability',
    'reps',
    'lapses',
    'stability',
  ];
  if (!validFields.includes(field)) return null;
  return field;
}

/**
 * 验证排序方向
 */
export function validateSortOrder(order: any): 'asc' | 'desc' {
  if (order === 'asc' || order === 'desc') return order;
  return 'asc';
}

/**
 * 批量验证卡片数据
 */
export interface ValidatedCard {
  blockId: string;
  cardId: string;
  deckId: string;
  priority: number;
  state: 0 | 1 | 2 | 3;
  suspended: boolean;
  cardType?: 'topic' | 'item';
}

export function validateCardData(data: any): ValidatedCard | null {
  const blockId = validateBlockId(data?.blockId);
  const cardId = validateCardId(data?.cardId || data?.id);
  const deckId = validateDeckId(data?.deckId);

  if (!blockId || !cardId || !deckId) return null;

  return {
    blockId,
    cardId,
    deckId,
    priority: validatePriority(data?.priority),
    state: validateCardState(data?.state),
    suspended: validateBoolean(data?.suspended, false),
    cardType: validateCardType(data?.cardType),
  };
}

/**
 * 验证 URL
 */
export function validateUrl(url: any): string | null {
  if (typeof url !== 'string') return null;
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

/**
 * 验证 JSON 字符串
 */
export function validateJson<T>(json: any): T | null {
  if (typeof json !== 'string') return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * 清理和验证 HTML
 */
export function sanitizeHtml(html: any): string {
  if (typeof html !== 'string') return '';
  // 移除脚本标签和事件处理器
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]*/gi, '');
}

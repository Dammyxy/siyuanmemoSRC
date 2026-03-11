/**
 * UI 层数据源类型定义
 * 
 * ✅ DDD 架构：重新导出应用层接口，保持向后兼容
 * 
 * @see src/application/interfaces/ICardDataSource.ts - 接口定义
 * @see .kiro/specs/ddd-refactoring/interface-unification-plan.md - 统一方案
 */

import type { BrowserCard } from '../types';

// ✅ 重新导出应用层接口（统一接口定义）
export type { 
  ICardDataSource,
  BrowserActionTarget,
  SortModel,
  FilterModel,
  FetchRowsOptions,
  FetchRowsResult,
  CardBrowserAction,
} from '@/application/interfaces/ICardDataSource';

/**
 * 可查询的数据源能力（用于全结果集选择与批量动作）
 */
export interface IBrowserQueryableDataSource {
  getQueryFingerprint(): string;
  getAllMatchedIds(): Promise<string[]>;
  getRowsByIds(ids: string[]): Promise<BrowserCard[]>;
  getActionTargetsByIds(ids: string[]): Promise<import('@/application/interfaces/ICardDataSource').BrowserActionTarget[]>;
}

export interface IBrowserQuerySessionInvalidation {
  invalidateQuerySession(): void;
}

export function isBrowserQueryableDataSource(
  value: unknown
): value is IBrowserQueryableDataSource {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const target = value as Partial<IBrowserQueryableDataSource>;
  return (
    typeof target.getQueryFingerprint === 'function' &&
    typeof target.getAllMatchedIds === 'function' &&
    typeof target.getRowsByIds === 'function' &&
    typeof target.getActionTargetsByIds === 'function'
  );
}

export function hasQuerySessionInvalidation(
  value: unknown
): value is IBrowserQuerySessionInvalidation {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return typeof (value as Partial<IBrowserQuerySessionInvalidation>).invalidateQuerySession === 'function';
}

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
  SortModel,
  FilterModel,
  FetchRowsOptions,
  FetchRowsResult,
  CardBrowserAction,
} from '@/application/interfaces/ICardDataSource';

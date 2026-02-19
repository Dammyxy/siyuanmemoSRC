# ICardDataSource 接口统一方案

## 问题分析

### 当前状态

有两个 `ICardDataSource` 接口定义：

#### 1. 应用层接口（`src/application/interfaces/ICardDataSource.ts`）

```typescript
export interface ICardDataSource {
  fetchRows(options: FetchRowsOptions): Promise<FetchRowsResult>;
  getSupportedActions(): CardBrowserAction[];
  performAction(actionId: string, cards: BrowserCard[], context?: any): Promise<any>;
  getId(): string;  // ✅ 方法
}

interface FetchRowsOptions {
  sortModel?: any[];
  filterModel?: any;
}

interface FetchRowsResult {
  rows: BrowserCard[];
}
```

#### 2. UI 层接口（`src/ui/browser/datasource/types.ts`）

```typescript
export interface ICardDataSource {
  id: string;  // ✅ 属性
  label: string;
  
  fetchRows(params: {
    sortModel: SortModel[];
    filterModel: FilterModel;
    startRow?: number;
    endRow?: number;
  }): Promise<{ rows: BrowserCard[]; totalCount: number }>;
  
  getSupportedActions(): CardBrowserAction[];
  performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<void>;
  getStats?(): Promise<string>;
}
```

### 差异对比

| 特性 | 应用层接口 | UI 层接口 | 选择 |
|------|-----------|----------|------|
| ID 标识 | `getId()` 方法 | `id` 属性 | ✅ 属性（更简洁） |
| Label | ❌ 无 | `label` 属性 | ✅ 保留（UI 需要） |
| fetchRows 参数 | 简化版 | 完整版（分页） | ✅ 完整版 |
| fetchRows 返回 | 只有 rows | rows + totalCount | ✅ 完整版 |
| performAction 返回 | `Promise<any>` | `Promise<void>` | ✅ void（更明确） |
| getStats | ❌ 无 | 可选方法 | ✅ 保留（有用） |

### DDD 架构原则

**依赖倒置原则（DIP）**：

```
高层模块（应用层）定义接口
  ↓
低层模块（UI 层）实现接口
```

**正确的架构**：

1. ✅ 接口定义在应用层（`src/application/interfaces/`）
2. ✅ UI 层实现应用层接口
3. ✅ 应用层不依赖 UI 层

## 统一方案

### 核心思路

**合并两个接口的优点，定义在应用层**：

1. 使用 UI 层接口的完整功能（分页、totalCount、label）
2. 放在应用层目录（符合 DIP）
3. 删除 UI 层的接口定义
4. 所有实现都使用应用层接口

### 统一后的接口

**文件**：`src/application/interfaces/ICardDataSource.ts`

```typescript
/**
 * ICardDataSource - 卡片数据源接口
 * 
 * 定义数据源的标准契约，UI 层依赖此接口而非具体实现。
 * 这是 DDD 架构中的依赖倒置原则（DIP）的体现。
 * 
 * 职责：
 * - 定义数据获取的标准方法
 * - 定义操作的标准方法
 * - 为不同的数据源实现提供统一接口
 * 
 * 实现类：
 * - DeckDataSource - 全部卡片数据源
 * - QueryDataSource - SQL 查询数据源
 * - QueueDataSource - 队列数据源
 * 
 * @see .kiro/specs/ddd-refactoring/COMPREHENSIVE-DDD-REFACTORING-PLAN.md - 阶段 1
 */

import type { BrowserCard } from '@/ui/browser/types';

/**
 * 排序模型
 */
export interface SortModel {
  /** 列 ID */
  colId: string;
  /** 排序方向 */
  sort: 'asc' | 'desc';
}

/**
 * 过滤模型
 */
export interface FilterModel {
  [key: string]: any;
}

/**
 * 获取数据行的选项
 */
export interface FetchRowsOptions {
  /** 排序模型 */
  sortModel: SortModel[];
  /** 过滤模型 */
  filterModel: FilterModel;
  /** 起始行（可选，用于分页） */
  startRow?: number;
  /** 结束行（可选，用于分页） */
  endRow?: number;
}

/**
 * 获取数据行的结果
 */
export interface FetchRowsResult {
  /** 数据行 */
  rows: BrowserCard[];
  /** 总数量 */
  totalCount: number;
}

/**
 * 卡片浏览器操作
 */
export interface CardBrowserAction {
  /** 操作 ID */
  id: string;
  /** 操作标签 */
  label: string;
  /** 操作图标 */
  icon?: string;
  /** 快捷键 */
  shortcut?: string;
  /** 是否危险操作（显示为红色或需要确认） */
  danger?: boolean;
  /** 是否保持选择（执行后不清除选择） */
  keepSelection?: boolean;
  /** 子菜单 */
  submenu?: CardBrowserAction[];
}

/**
 * 卡片数据源接口
 * 
 * 所有数据源实现都必须实现此接口。
 * UI 层只依赖此接口，不依赖具体实现。
 * 
 * 使用适配器模式统一不同的数据源（Deck、Queue、Query）。
 * 这使得 CardBrowser 无需关心数据来源是 Riff 卡片还是队列。
 */
export interface ICardDataSource {
  /**
   * 数据源唯一标识
   * 
   * 用于标识数据源类型（如 'deck', 'query', 'queue'）。
   */
  readonly id: string;
  
  /**
   * 数据源显示标签
   * 
   * 用于 UI 显示（如 'All Cards', 'SQL Query', 'Retrieval Practice'）。
   */
  readonly label: string;
  
  /**
   * 获取数据行
   * 
   * 支持服务端排序/过滤（如果数据源允许）。
   * 
   * @param options - 获取选项（排序、过滤、分页等）
   * @returns 数据行结果（包含数据和总数）
   * 
   * @example
   * ```typescript
   * const result = await dataSource.fetchRows({
   *   sortModel: [{ colId: 'due', sort: 'asc' }],
   *   filterModel: {},
   *   startRow: 0,
   *   endRow: 100,
   * });
   * console.log(`Loaded ${result.rows.length} of ${result.totalCount} cards`);
   * ```
   */
  fetchRows(options: FetchRowsOptions): Promise<FetchRowsResult>;
  
  /**
   * 获取支持的操作
   * 
   * 返回当前数据源支持的所有操作。
   * 例如：QueueDataSource 可能有 "Remove from Queue"，
   * DeckDataSource 有 "Suspend"。
   * 
   * @returns 操作列表
   * 
   * @example
   * ```typescript
   * const actions = dataSource.getSupportedActions();
   * // [
   * //   { id: 'delete', label: 'Delete', danger: true },
   * //   { id: 'suspend', label: 'Suspend' },
   * // ]
   * ```
   */
  getSupportedActions(): CardBrowserAction[];
  
  /**
   * 执行操作
   * 
   * 对选中的卡片执行指定操作。
   * 
   * @param actionId - 操作 ID
   * @param selectedRows - 选中的卡片
   * @param context - 上下文信息（可选）
   * 
   * @example
   * ```typescript
   * await dataSource.performAction('delete', selectedCards);
   * await dataSource.performAction('suspend', selectedCards, { reason: 'too hard' });
   * ```
   */
  performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<void>;
  
  /**
   * 获取统计信息（可选）
   * 
   * 返回状态栏显示的统计信息。
   * 
   * @returns 统计信息字符串
   * 
   * @example
   * ```typescript
   * const stats = await dataSource.getStats?.();
   * // "100 cards, 20 due today"
   * ```
   */
  getStats?(): Promise<string>;
}
```

## 实施步骤

### 步骤 1：更新应用层接口

✅ 已完成（见上面的统一接口定义）

### 步骤 2：删除 UI 层接口定义

**文件**：`src/ui/browser/datasource/types.ts`

```typescript
// ❌ 删除：ICardDataSource 接口定义
// ✅ 保留：其他类型定义（如果有）

// ✅ 重新导出应用层接口
export type { 
  ICardDataSource,
  SortModel,
  FilterModel,
  FetchRowsOptions,
  FetchRowsResult,
  CardBrowserAction,
} from '@/application/interfaces/ICardDataSource';

// 保留其他 UI 层特有的类型...
```

### 步骤 3：更新所有数据源实现

需要更新的文件：
- `src/ui/browser/datasource/DeckDataSource.ts`
- `src/ui/browser/datasource/QueryDataSource.ts`
- `src/ui/browser/datasource/RetrievalDataSource.ts`
- `src/ui/browser/datasource/FinalDrillDataSource.ts`
- `src/ui/browser/datasource/FilterGroupDataSource.ts`
- 其他数据源...

**修改内容**：

```typescript
// ✅ 导入应用层接口
import type { ICardDataSource, FetchRowsOptions, FetchRowsResult } from '@/application/interfaces/ICardDataSource';

export class DeckDataSource implements ICardDataSource {
  // ✅ 使用属性而不是方法
  readonly id = 'deck';
  readonly label = 'All Cards';
  
  // ✅ 更新方法签名
  async fetchRows(options: FetchRowsOptions): Promise<FetchRowsResult> {
    // 实现...
    return {
      rows: cards,
      totalCount: cards.length,
    };
  }
  
  // ✅ 返回 void 而不是 any
  async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<void> {
    // 实现...
  }
  
  // ✅ 可选方法
  async getStats(): Promise<string> {
    return `${this.cards.length} cards`;
  }
}
```

### 步骤 4：更新应用服务

**文件**：`src/application/services/BrowserApplicationService.ts`

```typescript
// ✅ 使用应用层接口
import type { ICardDataSource } from '../interfaces/ICardDataSource';
```

**文件**：`src/application/interfaces/IBrowserApplicationService.ts`

```typescript
// ✅ 使用应用层接口
import type { ICardDataSource } from './ICardDataSource';
```

### 步骤 5：更新 UI 组件

**文件**：`src/ui/browser/SRSBrowser.vue`

```typescript
// ✅ 使用应用层接口
import type { ICardDataSource } from '@/application/interfaces/ICardDataSource';
```

## 验证清单

- [ ] 更新应用层接口定义
- [ ] 删除 UI 层接口定义（保留重新导出）
- [ ] 更新所有数据源实现
- [ ] 更新应用服务
- [ ] 更新 UI 组件
- [ ] TypeScript 编译通过
- [ ] 运行时测试通过

## DDD 架构符合性

### ✅ 符合依赖倒置原则

```
UI 层 (SRSBrowser.vue, DeckDataSource)
  ↓ 依赖
应用层 (BrowserApplicationService, ICardDataSource)
  ↓ 依赖
领域层 (CardScheduleService, CardFilterService)
```

### ✅ 清晰的职责边界

1. **应用层**：定义接口，协调用例
2. **UI 层**：实现接口，展示数据
3. **领域层**：业务逻辑，不依赖外层

### ✅ 统一的契约

- 所有数据源实现同一接口
- UI 层只依赖接口，不依赖实现
- 易于扩展新的数据源

## 总结

### 核心改进

1. ✅ **统一接口定义**：合并两个接口的优点
2. ✅ **符合 DIP**：接口定义在应用层
3. ✅ **完整功能**：支持分页、统计、标签
4. ✅ **类型安全**：明确的参数和返回类型

### 架构优势

- 清晰的依赖方向
- 易于测试和扩展
- 符合 DDD 原则
- 减少重复代码

这个统一方案既解决了当前的技术问题，又符合 DDD 架构的最佳实践。

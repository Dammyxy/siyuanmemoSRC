# Bug Fix: Module Loading Error - Complete

## 问题

### 错误信息
```
Error: Cannot find module '@/ui/browser/datasource/DeckDataSource'
Require stack:
- electron/js2c/renderer_init
```

### 根本原因

**动态 `require()` 在运行时无法解析路径别名**：

```typescript
// ❌ 问题代码：动态 require
const { DeckDataSource } = require('@/ui/browser/datasource/DeckDataSource');
```

在 Webpack/Vite 打包后，动态 `require()` 无法正确解析 `@/` 路径别名，导致模块加载失败。

## 修复方案

### 核心思路

**将动态 `require()` 改为静态 `import`**：

- 静态 `import` 在编译时解析，打包工具可以正确处理路径别名
- 动态 `require()` 在运行时解析，可能失败

### 修复内容

#### 1. 修改 BrowserApplicationService.ts

**文件**：`src/application/services/BrowserApplicationService.ts`

##### 修改 1：添加静态导入

```typescript
// ✅ 修复：静态导入数据源，避免运行时模块加载失败
import { DeckDataSource } from '@/ui/browser/datasource/DeckDataSource';
import { createQueueDataSource, createQueryDataSource } from '@/ui/browser/utils/dataSourceFactory';
```

##### 修改 2：使用 UI 层的 ICardDataSource 接口

```typescript
// ✅ 修复：使用 UI 层的 ICardDataSource 接口（与数据源实现一致）
import type { ICardDataSource } from '@/ui/browser/datasource/types';
```

**原因**：有两个 `ICardDataSource` 接口定义：
- `src/application/interfaces/ICardDataSource.ts`：应用层接口（有 `getId()` 方法）
- `src/ui/browser/datasource/types.ts`：UI 层接口（有 `id` 属性）

数据源实现使用的是 UI 层接口，所以应用服务也应该使用 UI 层接口。

##### 修改 3：更新 createDataSource 方法

```typescript
createDataSource(options: DataSourceOptions): ICardDataSource {
  const { type, preset, queryText, cardType, queueId, plugin } = options;
  
  if (type === 'deck') {
    // ✅ 修复：使用静态导入，避免运行时模块加载失败
    return new DeckDataSource(
      this.unifiedDataSourceManager,
      { preset, queryText, cardType },
      plugin
    );
  }
  
  if (type === 'queue') {
    // ✅ 修复：使用静态导入
    return createQueueDataSource(
      queueId!,
      this.unifiedDataSourceManager,
      { preset, queryText, cardType },
      plugin
    );
  }
  
  if (type === 'query') {
    // ✅ 修复：使用静态导入
    return createQueryDataSource(queryText!);
  }
  
  throw new Error(`Unknown data source type: ${type}`);
}
```

#### 2. 修改 IBrowserApplicationService.ts

**文件**：`src/application/interfaces/IBrowserApplicationService.ts`

```typescript
// ✅ 修复：使用 UI 层的 ICardDataSource 接口（与数据源实现一致）
import type { ICardDataSource } from '@/ui/browser/datasource/types';
```

## DDD 架构审视

### 问题分析

这个 Bug 暴露了一个**架构不一致**的问题：

1. **两个 ICardDataSource 接口**：
   - 应用层定义了一个接口
   - UI 层定义了另一个接口
   - 数据源实现使用 UI 层接口

2. **依赖方向混乱**：
   - 应用层应该定义接口，UI 层实现
   - 但实际上 UI 层定义了接口，应用层依赖 UI 层

### 当前修复（临时方案）

✅ **快速修复**：使用 UI 层的接口，让系统先跑起来

**理由**：
- 所有数据源实现都使用 UI 层接口
- 修改接口定义影响范围太大
- 先恢复功能，再重构架构

### 长期改进（架构重构）

❌ **架构问题**：应用层依赖 UI 层，违反了依赖倒置原则

**正确的架构**：

```
UI 层 (SRSBrowser.vue)
  ↓ 依赖
应用层 (BrowserApplicationService)
  ↓ 定义接口
  ICardDataSource (应用层接口)
  ↓ 实现
UI 层 (DeckDataSource, QueryDataSource)
```

**改进方案**：

1. **统一接口定义**：
   - 删除 `src/ui/browser/datasource/types.ts` 中的 `ICardDataSource`
   - 使用 `src/application/interfaces/ICardDataSource.ts` 作为唯一接口
   - 所有数据源实现此接口

2. **适配器模式**：
   - 如果 UI 层接口无法改变，创建适配器
   - 适配器实现应用层接口，委托给 UI 层实现

3. **重新设计接口**：
   - 合并两个接口的优点
   - 定义清晰的职责边界

## 验证清单

- [x] 修复模块加载错误
- [x] 使用静态 import 替换动态 require
- [x] 统一使用 UI 层的 ICardDataSource 接口
- [x] TypeScript 编译通过（无错误）
- [ ] 运行时测试（待用户验证）
- [ ] 浏览器功能正常
- [ ] 队列模式正常
- [ ] 非队列模式正常

## 后续工作

### 短期（可选）

- [ ] 添加单元测试验证数据源创建
- [ ] 添加集成测试验证浏览器加载

### 长期（架构改进）

- [ ] 统一 ICardDataSource 接口定义
- [ ] 修正依赖方向（应用层定义接口，UI 层实现）
- [ ] 重构数据源架构，符合 DDD 原则

## 总结

### 修复内容

1. ✅ 将动态 `require()` 改为静态 `import`
2. ✅ 统一使用 UI 层的 `ICardDataSource` 接口
3. ✅ 修复接口类型不匹配问题

### 修复类型

- **技术修复**：模块加载问题
- **临时方案**：使用 UI 层接口
- **无架构变更**：不影响业务逻辑

### 架构债务

- ⚠️ **接口重复**：两个 `ICardDataSource` 定义
- ⚠️ **依赖倒置**：应用层依赖 UI 层
- ⚠️ **需要重构**：长期应该统一接口定义

这个修复让系统恢复正常运行，但暴露了架构不一致的问题，需要在后续重构中解决。

# Xiuyuan 列表模版卡 Meta 字段修复

## 问题描述

卡片浏览器中显示 Xiuyuan 列表模版卡时，`meta` 字段为 `undefined`，导致无法显示同源卡片标记（如 `[1/3]`）。

## 根本原因

所有数据源（DataSource）的 `convertToBrowserCard` 方法都**没有传递 `meta` 字段**！

虽然：
- ✅ `listTemplate.ts` 创建卡片时包含了完整的 meta
- ✅ `StorageManager` 正确保存和加载了 meta
- ✅ `browserService.v2.ts` 的 `transformFSRSCard` 传递了 meta
- ✅ `SRSBrowserAdapter.ts` 的 `convertToBrowserCard` 传递了 meta

但是：
- ❌ `RetrievalDataSource.ts` 的 `convertToBrowserCard` **没有**传递 meta
- ❌ `FinalDrillDataSource.ts` 的 `convertToBrowserCard` **没有**传递 meta
- ❌ `FilterGroupDataSource.ts` 的 `convertToBrowserCard` **没有**传递 meta
- ❌ `IncrementalLearningDataSource.ts` 的 `convertToBrowserCard` **没有**传递 meta

## 修复方案

在所有数据源的 `convertToBrowserCard` 方法的返回对象中添加：

```typescript
return {
  // ... 其他字段
  
  // 🆕 传递完整的 meta 字段（用于 Xiuyuan 卡片识别）
  meta: card.meta,
};
```

## 修复的文件

1. ✅ `src/ui/browser/datasource/RetrievalDataSource.ts`
2. ✅ `src/ui/browser/datasource/FinalDrillDataSource.ts`
3. ✅ `src/ui/browser/datasource/FilterGroupDataSource.ts`
4. ✅ `src/ui/browser/datasource/IncrementalLearningDataSource.ts`

## 测试步骤

### 步骤 1：重新创建 Xiuyuan 卡片

由于旧卡片是在修复前创建的，它们被保存时没有 meta 字段。需要重新创建：

1. 删除旧的 Xiuyuan 列表模版卡
2. 重新在有序列表项上右键 → "创建列表模版卡"
3. 查看控制台日志，确认创建时有 meta：
   ```
   [Xiuyuan] 🔍 Created FSRSCard with meta: { hasMeta: true, xiuyuanID: "xy_...", currentIndex: 0, allChildrenLength: 3 }
   ```

### 步骤 2：验证保存

1. 查看控制台日志，确认保存时有 meta：
   ```
   [StorageManager] 🔍 Saving Xiuyuan cards: { count: 3, samples: [...] }
   ```

### 步骤 3：验证加载

1. 重新加载插件或刷新页面
2. 查看控制台日志，确认加载时有 meta：
   ```
   [StorageManager] 🔍 Loaded Xiuyuan cards from msgpack: { count: 3, samples: [...] }
   ```

### 步骤 4：验证浏览器显示

1. 打开卡片浏览器
2. 切换到"提取练习"队列（或其他包含 Xiuyuan 卡片的队列）
3. 查看控制台日志，确认 meta 存在：
   ```
   [CardBrowser] 🔍 Xiuyuan card in valueFormatter: { hasMeta: true, xiuyuanID: "xy_...", currentIndex: 0, allChildrenLength: 3 }
   [CardBrowser] ✅ Xiuyuan card detected from meta: { xiuyuanID: "xy_...", currentIndex: 0, totalCount: 3, prefix: "[1/3] " }
   ```
4. 确认卡片标题显示为：`[1/3] 子列表项内容`

## 预期结果

修复后，卡片浏览器应该正确显示同源卡片标记：

```
No | Title                              | Prior | Intrv
1  | [1/3] FSRS 是一种间隔重复算法      | 50%   | -
2  | [2/3] 它基于记忆遗忘曲线            | 50%   | -
3  | [3/3] 可以优化复习时间              | 50%   | -
```

而不是：

```
No | Title                              | Prior | Intrv
1  | [1/?] FSRS 是一种间隔重复算法      | 50%   | -
2  | [1/?] 它基于记忆遗忘曲线            | 50%   | -
3  | [1/?] 可以优化复习时间              | 50%   | -
```

## 后续工作

1. ✅ 修复所有数据源的 meta 传递问题
2. ⏳ 测试验证修复效果
3. ⏳ 清理调试日志（可选）
4. ⏳ 实现阶段 4：复习界面渐进式显示

## 技术细节

### 为什么需要 meta 字段？

Xiuyuan 列表模版卡的 meta 字段包含：

```typescript
interface XiuyuanCardMeta {
  xiuyuanID: string;           // Xiuyuan ID
  templateID: string;          // 模板 ID
  ruleIndex: number;           // 规则索引
  frontFields: string[];       // 正面字段
  backFields: string[];        // 背面字段
  fieldMapping: Record<string, string>;  // 字段映射
  frontBlockIDs: string[];     // 正面块 ID 列表
  backBlockIDs: string[];      // 背面块 ID 列表
  
  // 🆕 提示和答案信息
  cue: string;                 // 当前卡片的提示
  answer: string;              // 当前卡片的答案
  
  // 🆕 所有子列表项信息（用于渐进式显示）
  allChildren: Array<{
    id: string;                // 子列表项块 ID
    cue: string;               // 提示
    answer: string;            // 答案
    index: number;             // 索引
  }>;
  currentIndex: number;        // 当前卡片索引
}
```

这些信息用于：
1. 识别同源卡片（来自同一个 Xiuyuan）
2. 显示卡片序号（如 `[1/3]`）
3. 复习时渐进式显示（显示之前的答案 + 当前提示）

### 数据流

```
创建卡片
  ↓
listTemplate.ts (包含 meta)
  ↓
StorageManager.setCard() (保存 meta)
  ↓
StorageManager.saveCards() (序列化 meta)
  ↓
msgpack 文件 (包含 meta)
  ↓
StorageManager.loadCards() (反序列化 meta)
  ↓
StorageManager.getAllCards() (返回 meta)
  ↓
Queue.getCards() (传递 meta)
  ↓
DataSource.convertToBrowserCard() (⚠️ 这里需要传递 meta！)
  ↓
BrowserCard (包含 meta)
  ↓
columnDefs.valueFormatter() (使用 meta 显示标记)
```

## 相关文件

- `src/core/xiuyuan/listTemplate.ts` - 创建逻辑
- `src/core/xiuyuan/cardMeta.ts` - Meta 类型定义
- `src/core/storage/manager.ts` - 存储管理
- `src/ui/browser/datasource/*.ts` - 数据源（已修复）
- `src/ui/browser/config/columnDefs.ts` - 显示逻辑
- `src/ui/browser/types.ts` - BrowserCard 类型定义

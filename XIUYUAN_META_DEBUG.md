# Xiuyuan 列表模版卡 Meta 字段调试指南

## 问题描述

卡片浏览器中显示 Xiuyuan 列表模版卡时，`meta` 字段为 `undefined`，导致无法显示同源卡片标记（如 `[1/3]`）。

## 数据流追踪

### 1. 卡片创建（listTemplate.ts）

```typescript
// ✅ 创建时包含完整的 meta 字段
const meta: XiuyuanCardMeta = {
  xiuyuanID,
  templateID,
  ruleIndex: i,
  frontFields,
  backFields,
  fieldMapping,
  frontBlockIDs,
  backBlockIDs,
  cue: childData.cue,
  answer: childData.answer,
  allChildren: [...],  // 所有子项信息
  currentIndex: i,
};

const fsrsCard: FSRSCard = {
  // ... 其他字段
  meta,  // ✅ meta 字段被设置
};

storageManager.setCard(fsrsCard);
```

**调试日志位置**：`src/core/xiuyuan/listTemplate.ts` 第 135 行

### 2. 存储保存（StorageManager）

```typescript
// ✅ setCard 直接存储整个对象
setCard(card: FSRSCard): void {
  this.cardsCache.set(card.id, card);  // ✅ 包含 meta
  this.isDirty = true;
}

// ✅ saveCards 序列化所有字段
async saveCards(): Promise<void> {
  const cards = this.getAllCards();  // ✅ 从缓存获取
  await this.saveMsgpackData(STORAGE_FILES.CARDS, cards);  // ✅ msgpack 序列化
}
```

**调试日志位置**：
- `src/core/storage/manager.ts` 第 413 行（保存时）
- `src/core/storage/manager.ts` 第 245 行（加载时）

### 3. 数据加载（StorageManager）

```typescript
// ✅ loadCards 反序列化
async loadCards(): Promise<void> {
  const data = await this.loadMsgpackData(STORAGE_FILES.CARDS);
  const cards: FSRSCard[] = Array.isArray(data) ? data : [];
  
  for (const card of cards) {
    const normalizedCard = this.normalizeCard(card);  // ⚠️ 检查点
    this.cardsCache.set(normalizedCard.id, normalizedCard);
  }
}

// ✅ normalizeCard 保留 meta 字段
private normalizeCard(card: any): FSRSCard {
  const normalized: FSRSCard = {
    // ... 其他字段
    ...(card.meta && { meta: card.meta }),  // ✅ 保留 meta
  };
  return migrateCard(normalized);  // ⚠️ 检查点
}
```

**调试日志位置**：`src/core/storage/manager.ts` 第 245 行

### 4. 数据转换（browserService.v2.ts）

```typescript
// ✅ transformFSRSCard 传递 meta
function transformFSRSCard(card: FSRSCard, customAttrs: Record<string, string>): BrowserCard {
  return {
    // ... 其他字段
    meta: card.meta,  // ✅ 传递 meta
  };
}
```

**调试日志位置**：`src/ui/browser/browserService.v2.ts` 第 135 行

### 5. 数据转换（SRSBrowserAdapter.ts）

```typescript
// ✅ convertToBrowserCard 传递 meta
private convertToBrowserCard(card: FSRSCard): BrowserCard {
  return {
    // ... 其他字段
    meta: card.meta,  // ✅ 传递 meta
  };
}
```

**调试日志位置**：`src/ui/browser/SRSBrowserAdapter.ts` 第 409 行

### 6. UI 显示（columnDefs.ts）

```typescript
// ⚠️ 这里是最终检查点
valueFormatter: (params) => {
  const card = params.data;
  const meta = card.meta;  // ⚠️ 如果这里是 undefined，说明数据流中断
  
  if (meta?.xiuyuanID && meta?.allChildren && meta?.currentIndex !== undefined) {
    // ✅ 显示同源卡片标记
    return `[${meta.currentIndex + 1}/${meta.allChildren.length}] ${card.content}`;
  }
}
```

**调试日志位置**：`src/ui/browser/config/columnDefs.ts` 第 47 行

## 调试步骤

### 步骤 1：确认卡片创建时 meta 存在

1. 创建一个新的列表模版卡
2. 查看控制台日志：`[Xiuyuan] 🔍 Created FSRSCard with meta:`
3. 确认输出包含：
   - `hasMeta: true`
   - `xiuyuanID: "xy_..."`
   - `currentIndex: 0, 1, 2...`
   - `allChildrenLength: 3`（或其他数量）

### 步骤 2：确认保存时 meta 存在

1. 查看控制台日志：`[StorageManager] 🔍 Saving Xiuyuan cards:`
2. 确认输出包含：
   - `count: 3`（或其他数量）
   - `samples` 数组中每个卡片都有 `hasMeta: true`

### 步骤 3：确认加载时 meta 存在

1. 重新加载插件或刷新页面
2. 查看控制台日志：`[StorageManager] 🔍 Loaded Xiuyuan cards from msgpack:`
3. 确认输出包含：
   - `count: 3`（或其他数量）
   - `samples` 数组中每个卡片都有 `hasMeta: true`

### 步骤 4：确认转换时 meta 存在

1. 打开卡片浏览器
2. 查看控制台日志：`[transformFSRSCard] 🔍 Xiuyuan card input:`
3. 确认输出包含：
   - `hasMeta: true`
   - `xiuyuanID: "xy_..."`

### 步骤 5：确认 UI 显示时 meta 存在

1. 在卡片浏览器中查看 Xiuyuan 卡片
2. 查看控制台日志：`[CardBrowser] 🔍 Xiuyuan card in valueFormatter:`
3. 确认输出包含：
   - `hasMeta: true`
   - `xiuyuanID: "xy_..."`
   - `currentIndex: 0, 1, 2...`
   - `allChildrenLength: 3`

## 可能的问题点

### 问题 1：msgpack 序列化丢失 meta

**症状**：保存时有 meta，加载时没有

**原因**：msgpack 可能不支持某些复杂对象

**解决方案**：
1. 检查 `saveMsgpackData` 和 `loadMsgpackData` 的实现
2. 确认 meta 对象是纯 JSON 可序列化的（没有函数、循环引用等）

### 问题 2：normalizeCard 移除了 meta

**症状**：加载时有 meta，规范化后没有

**原因**：`normalizeCard` 或 `migrateCard` 可能移除了 meta

**解决方案**：
1. 检查 `normalizeCard` 的实现（已确认保留 meta）
2. 检查 `migrateCard` 的实现（已确认不移除 meta）

### 问题 3：数据源使用了缓存的旧数据

**症状**：新创建的卡片有 meta，但浏览器显示的是旧数据

**原因**：卡片浏览器可能使用了缓存的数据，没有重新加载

**解决方案**：
1. 创建卡片后强制刷新浏览器：`forceRefreshData()`
2. 清除缓存：`invalidateCardCache()`

### 问题 4：使用了错误的数据源

**症状**：某些数据源有 meta，某些没有

**原因**：不同的数据源（browserService.v2.ts vs SRSBrowserAdapter.ts）可能有不同的实现

**解决方案**：
1. 确认当前使用的数据源
2. 检查该数据源的 `transformFSRSCard` 或 `convertToBrowserCard` 实现

## 下一步行动

1. ✅ 已添加所有关键位置的调试日志
2. ⏳ 等待用户测试并提供日志输出
3. ⏳ 根据日志输出定位问题点
4. ⏳ 修复问题
5. ⏳ 清理调试日志

## 预期结果

如果一切正常，应该看到以下日志序列：

```
[Xiuyuan] 🔍 Created FSRSCard with meta: { hasMeta: true, xiuyuanID: "xy_...", currentIndex: 0, allChildrenLength: 3 }
[StorageManager] 🔍 Saving Xiuyuan cards: { count: 3, samples: [...] }
[SiyuanMemo] Saved 3 cards (msgpack)

// 重新加载后
[StorageManager] 🔍 Loaded Xiuyuan cards from msgpack: { count: 3, samples: [...] }
[SiyuanMemo] Loaded 3 cards (msgpack)

// 打开浏览器后
[transformFSRSCard] 🔍 Xiuyuan card input: { hasMeta: true, xiuyuanID: "xy_...", currentIndex: 0 }
[CardBrowser] 🔍 Xiuyuan card in valueFormatter: { hasMeta: true, xiuyuanID: "xy_...", currentIndex: 0, allChildrenLength: 3 }
[CardBrowser] ✅ Xiuyuan card detected from meta: { xiuyuanID: "xy_...", currentIndex: 0, totalCount: 3, prefix: "[1/3] " }
```

如果看到 `hasMeta: false` 或 `meta: undefined`，说明在该步骤之前 meta 字段丢失了。

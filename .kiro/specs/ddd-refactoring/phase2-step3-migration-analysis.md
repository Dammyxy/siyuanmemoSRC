# Phase 2 Step 3: 废弃 API 使用分析

**日期**: 2026-02-19  
**状态**: 🔄 进行中

---

## 📊 废弃 API 使用统计

### 1. plugin.storage（最常用）

#### 高优先级文件（需要立即更新）
1. **src/ui/browser/SRSBrowser.vue** - 2 处
   - `plugin.storage.getSettings()` - 获取设置
   
2. **src/ui/srs/SrsEditorDialog.vue** - 6 处
   - `plugin.storage.setCard()` - 设置卡片
   - `plugin.storage.saveCards()` - 保存卡片
   
3. **src/ui/menu/TopBar.ts** - 1 处
   - `plugin.storage.getAllCards()` - 获取所有卡片

#### 中优先级文件（建议更新）
4. **src/ui/review/v2/ReviewView.vue** - 1 处
   - `plugin.storage.getSettings()` - 获取设置
   
5. **src/ui/browser/datasource/MenuActions.ts** - 1 处
   - `plugin.storage` - 创建 RescheduleService
   
6. **src/ui/browser/datasource/DeckDataSource.ts** - 2 处
   - `plugin.storage.getCard()` - 获取卡片
   - `plugin.storage.updateCard()` - 更新卡片

#### 低优先级文件（可选更新）
7. **src/services/CardService.ts** - 1 处（已有回退逻辑）
8. **src/application/handlers/AutoCardHandler.ts** - 1 处（已有回退逻辑）
9. **src/core/queue/domain/BaseReviewQueue.ts** - 1 处
10. **src/core/box/TransactionObserver.ts** - 2 处
11. **src/core/card/quick-card/infrastructure/QuickCardRepository.ts** - 1 处

### 2. plugin.openXxxDialog()（对话框方法）

#### 高优先级文件
1. **src/ui/RestoreTab.vue** - 4 处
   - `plugin.openReviewDialog()`
   - `plugin.openFinalDrillDialog()`
   - `plugin.openLeechPracticeDialog()`
   - `plugin.openFilterGroupPracticeDialog()`
   
2. **src/ui/menu/TopBar.ts** - 2 处
   - `plugin.openReviewDialog()`
   - `plugin.openFilterGroupPracticeDialog()`
   
3. **src/commands.ts** - 2 处
   - `plugin.openReviewDialog()`
   - `plugin.openFinalDrillDialog()`

### 3. plugin.unifiedDataSourceManager

#### 高优先级文件
1. **src/ui/review/v2/ReviewActions.vue** - 1 处
   - `plugin.unifiedDataSourceManager` - 获取数据源管理器

### 4. 其他废弃访问器

暂未发现大量使用，可以在后续阶段逐步迁移。

---

## 🎯 迁移策略

### 阶段 1: 高优先级文件（立即更新）
更新以下文件，这些是用户最常接触的 UI 组件：
1. SRSBrowser.vue
2. SrsEditorDialog.vue
3. TopBar.ts
4. RestoreTab.vue
5. commands.ts
6. ReviewActions.vue

### 阶段 2: 中优先级文件（建议更新）
更新以下文件，这些是核心功能组件：
1. ReviewView.vue
2. MenuActions.ts
3. DeckDataSource.ts

### 阶段 3: 低优先级文件（可选更新）
这些文件已有回退逻辑或使用频率较低，可以保持现状。

---

## 📝 迁移模式

### 模式 1: 直接访问 storage
**之前**:
```typescript
plugin.storage.getSettings()
plugin.storage.getAllCards()
plugin.storage.setCard(card)
```

**之后**:
```typescript
plugin.getContext().getStorage().getSettings()
plugin.getContext().getStorage().getAllCards()
plugin.getContext().getStorage().setCard(card)
```

### 模式 2: 打开对话框
**之前**:
```typescript
plugin.openReviewDialog()
plugin.openFinalDrillDialog()
```

**之后**:
```typescript
plugin.getContext().getDialogManager().openReviewDialog()
plugin.getContext().getDialogManager().openFinalDrillDialog()
```

### 模式 3: 访问数据源管理器
**之前**:
```typescript
plugin.unifiedDataSourceManager
```

**之后**:
```typescript
plugin.getContext().getUnifiedDataSourceManager()
```

### 模式 4: 使用局部变量优化
如果在同一个函数中多次访问，可以使用局部变量：

**之前**:
```typescript
const settings = plugin.storage.getSettings();
const cards = plugin.storage.getAllCards();
plugin.storage.setCard(card);
```

**之后（优化版）**:
```typescript
const storage = plugin.getContext().getStorage();
const settings = storage.getSettings();
const cards = storage.getAllCards();
storage.setCard(card);
```

---

## ⚠️ 注意事项

### 1. 向后兼容性
- 所有废弃方法仍然保留
- 不会破坏现有功能
- 逐步迁移，降低风险

### 2. 测试策略
- 每更新一个文件，运行诊断检查
- 手动测试相关功能
- 确保无回归问题

### 3. 代码审查
- 检查是否有遗漏的调用点
- 确保迁移的一致性
- 验证代码可读性

---

## 📈 预期成果

### 迁移前
- 使用废弃 API: ~20 处
- DDD 合规度: 92%

### 迁移后
- 使用废弃 API: ~5 处（低优先级文件）
- DDD 合规度: 95%

---

## 🚀 下一步

开始更新高优先级文件：
1. SRSBrowser.vue
2. SrsEditorDialog.vue
3. TopBar.ts
4. RestoreTab.vue
5. commands.ts
6. ReviewActions.vue

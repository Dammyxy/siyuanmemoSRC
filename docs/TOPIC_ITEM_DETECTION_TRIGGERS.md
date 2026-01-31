# Topic/Item 识别功能的触发方式

## 当前的触发方式

### 1. 手动触发（浏览器按钮）✅
**位置**：闪卡浏览器工具栏

**触发方式**：
- 点击工具栏上的"识别 Topic/Item 类型"按钮（图标：`#iconTags`）
- 会弹出确认对话框，询问是否识别所有卡片

**实现文件**：
- `src/ui/browser/CardBrowserToolbar.vue`
- `src/ui/browser/BrowserToolbar.vue`
- `src/ui/browser/composables/useCardActions.ts`

**代码**：
```typescript
// useCardActions.ts
const handleMigrateTopicItem = async () => {
  // 显示确认对话框
  const confirmed = await showConfirmDialog(...);
  
  if (confirmed) {
    // 执行全量识别
    const result = await migrateExistingCards(true);
    
    // 显示结果
    pushMsg(`✅ 识别完成：${result.migrated}/${result.total} 张卡片...`);
  }
};
```

**特点**：
- ✅ 全量识别所有卡片
- ✅ 可以强制重新识别（`forceRemigrate = true`）
- ✅ 显示详细的识别结果统计

---

### 2. 自动触发（插件启动时）✅
**位置**：插件加载时（`onload`）

**触发时机**：
- 插件启动后 2 秒
- 检测到有卡片没有 `custom-fsrs-card-type` 属性

**实现文件**：
- `src/index.ts`
- `src/managers/LifecycleManager.ts`

**代码**：
```typescript
// index.ts (onload)
setTimeout(async () => {
  try {
    const needsMigration = await checkMigrationNeeded();
    
    if (needsMigration) {
      // 显示确认对话框
      const confirmed = confirm('检测到现有卡片需要识别 Topic/Item 类型...');
      
      if (confirmed) {
        const result = await migrateExistingCards();
        pushMsg(`✅ 识别完成！...`);
      }
    }
  } catch (err) {
    console.error('[FSRS] Topic/Item migration check failed:', err);
  }
}, 2000);
```

**特点**：
- ✅ 自动检测是否需要迁移
- ✅ 只在首次使用或有新卡片时触发
- ✅ 需要用户确认

---

### 3. 自动触发（创建新卡片时）✅ 已修复
**位置**：`TransactionObserver` 监听卡片创建事件

**触发时机**：
- 用户创建或编辑块时实时触发
- 使用 2 秒防抖，避免处理部分输入

**启用方式**：
1. 打开插件设置
2. 找到"增量阅读"选项卡
3. 启用"自动制卡（实时监听）"选项
4. 保存设置

**实现文件**：
- `src/core/box/TransactionObserver.ts`
- `src/index.ts` - 初始化 TransactionObserver

**代码**：
```typescript
// index.ts - 初始化
this.transactionObserver = new TransactionObserver(this);
this.transactionObserver.init();

const autoCardEnabled = settings.incremental?.autoCardEnabled || false;
this.transactionObserver.setEnabled(autoCardEnabled);

// TransactionObserver.ts - 监听事件
private handleTransaction = (event: any) => {
  if (!this.enabled) return;
  
  const detail = event.detail as TransactionDetail;
  if (detail.cmd !== 'transactions') return;
  
  detail.data.forEach(data => {
    data.doOperations.forEach(op => {
      if (op.action === 'insert' || op.action === 'update') {
        this.queueBlockCheck(op.id);
      }
    });
  });
}

// 自动检测卡片类型
const cardType = await detectCardType(blockId);

const cardTypeAttrs: Record<string, string> = {
    'custom-fsrs-card-type': cardType,
};

// 如果是 Topic，初始化并存储 A-Factor
if (cardType === 'topic') {
    const aFactor = initializeAFactor(card.priority || 50);
    cardTypeAttrs['custom-fsrs-a-factor'] = aFactor.toString();
    console.log(`[FSRS] Topic card created: blockID=${blockId}, aFactor=${aFactor}`);
} else {
    console.log(`[FSRS] Item card created: blockID=${blockId}`);
}

await setBlockAttrs(blockId, cardTypeAttrs);
```

**特点**：
- ✅ 完全自动，无需用户操作（启用后）
- ✅ 实时识别，创建卡片时立即执行
- ✅ 自动设置 `custom-fsrs-card-type` 属性
- ✅ 自动初始化 Topic 卡片的 A-Factor
- ✅ 2 秒防抖，避免频繁触发
- ⚠️ 默认禁用，需要在设置中手动启用

**修复说明**：
- 之前 `TransactionObserver` 类存在但从未被实例化
- 现已在 `index.ts` 中正确初始化并根据设置启用
- 详见：`docs/FIX_AUTO_CARD_DETECTION.md`

---

## 触发方式对比

| 触发方式 | 时机 | 范围 | 用户交互 | 优点 | 缺点 |
|---------|------|------|---------|------|------|
| **浏览器按钮** | 手动点击 | 全量 | 需要确认 | 可控、可重复执行 | 需要手动操作 |
| **插件启动** | 启动后 2s | 全量 | 需要确认 | 自动检测、首次使用友好 | 只执行一次 |
| **创建卡片** | 创建/编辑时 | 单张 | 无需交互（启用后） | 完全自动、实时、防抖 | 默认禁用，需手动启用 |

---

## 建议的改进方向

### 1. 增量识别（推荐）⭐
**场景**：用户修改了卡片内容，希望重新识别类型

**触发方式**：
- 监听块内容变更事件
- 检测到卡片内容包含 `==...==` 或 `::` 等特征时，自动重新识别

**实现思路**：
```typescript
// 在 TransactionObserver 中监听 updateBlock 事件
if (op.action === 'update' && hasCardAttr(blockId)) {
  // 重新检测卡片类型
  const newType = await detectCardType(blockId);
  const oldType = await getBlockAttr(blockId, 'custom-fsrs-card-type');
  
  if (newType !== oldType) {
    // 类型变化，更新属性
    await setBlockAttrs(blockId, {
      'custom-fsrs-card-type': newType,
    });
    
    // 如果变成 Topic，初始化 A-Factor
    if (newType === 'topic') {
      const aFactor = initializeAFactor(priority);
      await setBlockAttrs(blockId, {
        'custom-fsrs-a-factor': aFactor.toString(),
      });
    }
  }
}
```

**优点**：
- ✅ 自动适应内容变化
- ✅ 无需手动操作
- ✅ 实时更新

**缺点**：
- ⚠️ 可能频繁触发（需要防抖）
- ⚠️ 性能开销（需要优化）

---

### 2. 右键菜单识别
**场景**：用户在编辑器中右键点击卡片，选择"重新识别类型"

**触发方式**：
- 在块菜单中添加"重新识别 Topic/Item"选项
- 点击后立即识别当前卡片

**实现思路**：
```typescript
// 在 BlockMenuHandler 中添加菜单项
menu.addItem({
  icon: 'iconTags',
  label: '重新识别 Topic/Item',
  click: async () => {
    const cardType = await detectCardType(blockId);
    await setBlockAttrs(blockId, {
      'custom-fsrs-card-type': cardType,
    });
    
    if (cardType === 'topic') {
      const aFactor = initializeAFactor(priority);
      await setBlockAttrs(blockId, {
        'custom-fsrs-a-factor': aFactor.toString(),
      });
    }
    
    pushMsg(`✅ 识别完成：${cardType === 'topic' ? 'Topic' : 'Item'}`);
  },
});
```

**优点**：
- ✅ 精确控制
- ✅ 操作简单
- ✅ 适合单张卡片

**缺点**：
- ⚠️ 需要手动操作
- ⚠️ 不适合批量处理

---

### 3. 批量识别（选中卡片）
**场景**：用户在浏览器中选中多张卡片，批量重新识别

**触发方式**：
- 在浏览器右键菜单中添加"重新识别类型"选项
- 只对选中的卡片执行识别

**实现思路**：
```typescript
// 在 DeckDataSource 中添加动作
if (actionId === 'remigrate-card-type') {
  const blockIds = selectedRows.map(r => r.blockId);
  
  for (const blockId of blockIds) {
    const cardType = await detectCardType(blockId);
    await setBlockAttrs(blockId, {
      'custom-fsrs-card-type': cardType,
    });
    
    if (cardType === 'topic') {
      const aFactor = initializeAFactor(priority);
      await setBlockAttrs(blockId, {
        'custom-fsrs-a-factor': aFactor.toString(),
      });
    }
  }
  
  pushMsg(`✅ 识别完成：${blockIds.length} 张卡片`);
}
```

**优点**：
- ✅ 灵活控制范围
- ✅ 适合批量处理
- ✅ 比全量识别更快

**缺点**：
- ⚠️ 需要手动选择
- ⚠️ 需要添加 UI

---

### 4. 定时自动识别
**场景**：后台定期检查并识别未标记的卡片

**触发方式**：
- 每隔一段时间（如 5 分钟）自动检查
- 只识别没有 `custom-fsrs-card-type` 属性的卡片

**实现思路**：
```typescript
// 在插件启动时设置定时器
setInterval(async () => {
  const needsMigration = await checkMigrationNeeded();
  
  if (needsMigration) {
    // 静默执行，不显示对话框
    await migrateExistingCards(false);
    console.log('[FSRS] Auto-migration completed');
  }
}, 5 * 60 * 1000); // 5 分钟
```

**优点**：
- ✅ 完全自动
- ✅ 无需用户操作
- ✅ 适合长期使用

**缺点**：
- ⚠️ 可能影响性能
- ⚠️ 用户不可控

---

## 总结

### 当前已实现的触发方式
1. ✅ **浏览器按钮**：手动全量识别
2. ✅ **插件启动**：自动检测并提示
3. ✅ **创建卡片**：实时自动识别（需在设置中启用）

### 修复记录
- **2026-01-31**：修复 TransactionObserver 未初始化的问题，现在可以正常监听卡片创建和编辑事件
- 详见：`docs/FIX_AUTO_CARD_DETECTION.md`

### 推荐的改进方向
1. ⭐ **增量识别**：监听内容变更，自动重新识别
2. ⭐ **右键菜单**：单张卡片快速识别
3. ⭐ **批量识别**：选中卡片批量识别

### 不推荐的方向
- ❌ **定时自动识别**：可能影响性能，用户不可控

---

## 相关文件

### 触发逻辑
- `src/ui/browser/composables/useCardActions.ts` - 浏览器按钮触发
- `src/index.ts` - 插件启动触发
- `src/core/box/TransactionObserver.ts` - 创建卡片触发

### 识别逻辑
- `src/core/card-builder/detectCardType.ts` - 核心识别算法
- `src/scripts/migrateToTopicItem.ts` - 批量迁移逻辑

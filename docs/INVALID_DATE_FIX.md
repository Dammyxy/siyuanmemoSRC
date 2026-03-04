# 无效日期修复方案

## 问题描述

用户反馈 item 卡片的"上次复习"字段显示为 1月1日（或其他错误日期），这是由于：

1. **Riff API 返回无效日期**：思源的 Riff API 可能返回无效的 `lastReview` 日期字符串（如 `"0001-01-01T00:00:00Z"` 或空字符串）
2. **日期转换未验证**：在从 Riff 同步数据时，代码直接使用 `new Date()` 转换日期，没有验证有效性
3. **本地数据已损坏**：无效的时间戳已经保存到本地 msgpack 文件中

## 修复方案

### 1. 防止新数据损坏（HybridSyncService）

**文件**: `src/services/HybridSyncService.ts`

在 `convertRiffCardToFSRSCard` 方法中添加日期验证：

```typescript
// 🔧 修复：验证 lastReview 日期的有效性
const parseValidDate = (dateStr: string | undefined): number => {
    if (!dateStr) return 0;
    const timestamp = new Date(dateStr).getTime();
    const isValid = timestamp > 0 && !isNaN(timestamp);
    
    if (!isValid && dateStr) {
        console.warn(`[HybridSyncService] Invalid date detected: "${dateStr}" for card ${riffBlock.id}`);
    }
    
    return isValid ? timestamp : 0;
};
```

### 2. 修复已损坏的本地数据（StorageManager）

**文件**: `src/core/storage/manager.ts`

#### 2.1 在 `normalizeCard` 方法中添加验证

```typescript
// 🆕 验证并修复日期字段
const validateTimestamp = (value: any, fieldName: string): number => {
    if (typeof value === 'string') {
        const timestamp = new Date(value).getTime();
        if (!isNaN(timestamp) && timestamp > 0) {
            return timestamp;
        }
        console.warn(`[StorageManager] Invalid date string in ${fieldName}: "${value}"`);
        return 0;
    }
    
    if (typeof value === 'number') {
        if (isNaN(value) || value < 0) {
            console.warn(`[StorageManager] Invalid timestamp in ${fieldName}: ${value}`);
            return 0;
        }
        return value;
    }
    
    return 0;
};
```

#### 2.2 添加手动修复方法

```typescript
async repairInvalidDates(): Promise<{ fixed: number; total: number }> {
    console.log('[StorageManager] 🔧 Starting date repair...');
    
    let fixedCount = 0;
    const totalCount = this.cardsCache.size;
    
    for (const [cardId, card] of this.cardsCache.entries()) {
        let needsFix = false;
        
        // 检查并修复 lastReview
        if (typeof card.lastReview === 'number') {
            if (isNaN(card.lastReview) || card.lastReview < 0) {
                card.lastReview = 0;
                needsFix = true;
            }
        }
        
        // 检查并修复 due
        if (typeof card.due === 'number') {
            if (isNaN(card.due) || card.due < 0) {
                card.due = Date.now();
                needsFix = true;
            }
        }
        
        if (needsFix) {
            card.updatedAt = Date.now();
            this.cardsCache.set(cardId, card);
            fixedCount++;
        }
    }
    
    if (fixedCount > 0) {
        this.isDirty = true;
        await this.saveCards();
    }
    
    return { fixed: fixedCount, total: totalCount };
}
```

### 3. 自动修复（插件初始化）

**文件**: `src/index.ts`

在插件加载时自动运行修复：

```typescript
// 初始化存储
this.storage = new StorageManager(this.name);
await this.storage.init();

// 🆕 自动修复无效日期
try {
  const repairResult = await this.storage.repairInvalidDates();
  if (repairResult.fixed > 0) {
    console.log(`[SiyuanMemo] 🔧 Repaired ${repairResult.fixed}/${repairResult.total} cards`);
    pushMsg(`已修复 ${repairResult.fixed} 张卡片的无效日期`, 3000);
  }
} catch (err) {
  console.error('[SiyuanMemo] Failed to repair invalid dates:', err);
}
```

### 4. 手动修复（设置面板）

**文件**: `src/ui/settings/SettingsPanel.vue`

在"关于"标签页添加修复按钮：

```vue
<div class="form-item">
  <label>{{ t('repairInvalidDates', '修复无效日期') }}</label>
  <div class="form-control">
    <button 
      class="b3-button b3-button--outline" 
      @click="handleRepairDates"
      :disabled="isRepairing"
    >
      {{ isRepairing ? t('repairing', '修复中...') : t('repairNow', '立即修复') }}
    </button>
  </div>
  <p class="form-hint">
    {{ t('repairInvalidDatesHint', '扫描并修复所有卡片中的无效日期') }}
  </p>
</div>
```

## 使用方法

### 自动修复

1. 重新编译插件：`npm run build`
2. 重启思源笔记
3. 插件会在加载时自动检测并修复无效日期
4. 如果有修复，会显示通知消息

### 手动修复

1. 打开插件设置面板
2. 切换到"关于"标签页
3. 找到"数据维护"部分
4. 点击"立即修复"按钮
5. 等待修复完成，查看结果

## 修复效果

- ✅ 无效的 `lastReview` 时间戳会被设置为 `0`
- ✅ 无效的 `due` 时间戳会被设置为当前时间
- ✅ UI 中不再显示错误的日期（如1月1日）
- ✅ 未复习过的卡片会显示"待首次复习"

## 注意事项

1. **数据备份**：修复会直接修改本地数据文件，建议先备份 `data/storage/siyuan-plugin-siyuanmemo/cards.msgpack`
2. **Riff 同步**：修复只影响本地数据，不会修改 Riff 中的数据
3. **自动运行**：每次插件加载时都会自动检测，但只有发现问题时才会修复
4. **性能影响**：修复过程很快，通常在几毫秒内完成

## 测试

已添加单元测试验证修复逻辑：

- `src/services/__tests__/HybridSyncService.test.ts` - 测试 Riff 数据转换时的日期验证
- 测试用例包括：
  - 无效日期字符串（`"0001-01-01T00:00:00Z"`）
  - 空字符串
  - 有效日期字符串

## 相关文件

- `src/services/HybridSyncService.ts` - Riff 数据同步
- `src/core/storage/manager.ts` - 本地数据管理
- `src/index.ts` - 插件初始化
- `src/ui/settings/SettingsPanel.vue` - 设置面板

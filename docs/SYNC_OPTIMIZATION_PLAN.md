# 同步机制优化方案

## 背景

- 用户场景：单设备为主，但需考虑多设备用户
- 卡片数量：>1000张
- 会手动删除Riff卡片
- 需求：数据安全 + 性能优化

## 当前问题

1. 全量同步每24小时执行一次，频率过高
2. 全量同步会删除秀元卡片（因为多卡片共用一个blockId）
3. 打开浏览器时触发增量同步，可能导致卡顿

## 优化方案

### 1. 智能删除逻辑（核心）

**问题**：全量同步时，秀元卡片被误删

**原因**：
```typescript
// 当前逻辑
const toDelete = localCards.filter(card => !riffBlockIds.has(card.blockId));
```

秀元卡片的特点：
- 1个Xiuyuan → N张FSRSCard
- N张卡片共用同一个blockId（代表块）
- Riff中只有1条记录（代表块）

**解决方案**：
```typescript
// 优化后的逻辑
const toDelete = localCards.filter(card => {
    // 1. 在Riff中，保留
    if (riffBlockIds.has(card.blockId)) return false;
    
    // 2. 秀元卡片，保留（通过meta.xiuyuanID识别）
    if (card.meta?.xiuyuanID) {
        console.log(`[HybridSync] Skipping Xiuyuan card: ${card.id}`);
        return false;
    }
    
    // 3. 其他情况，删除
    return true;
});
```

**优点**：
- ✅ 秀元卡片不会被误删
- ✅ 普通卡片仍然可以清理
- ✅ 保持数据一致性

### 2. 降低全量同步频率

**当前**：24小时（86400000ms）
**优化**：7天（604800000ms）

**理由**：
- WebSocket实时监听已经覆盖大部分同步需求
- 增量同步在关键时机触发（启动、打开浏览器、打开复习）
- 全量同步只是"最后保障"，不需要频繁执行
- 7天一次足以清理孤儿卡片

**配置**：
```typescript
fullSync: {
    enabled: true,
    interval: 604800000,  // 7天
    cleanupBlacklist: true
}
```

### 3. 优化增量同步触发时机

**当前触发点**：
- `plugin-start`：插件启动时 ✅ 保留
- `browser-open`：打开卡片浏览器时 ⚠️ 可能导致卡顿
- `review-open`：打开复习界面时 ✅ 保留

**优化方案**：
```typescript
incrementalSync: {
    enabled: true,
    triggers: ['plugin-start', 'review-open'],  // 移除 browser-open
    useBlacklist: true
}
```

**理由**：
- 打开浏览器时不需要同步（WebSocket已经实时同步）
- 减少用户感知的延迟
- 插件启动和打开复习时同步已经足够

### 4. 添加手动全量同步按钮

在设置面板或浏览器中添加"立即全量同步"按钮，让用户可以按需触发。

**使用场景**：
- 怀疑数据不一致时
- 手动删除了大量Riff卡片后
- 切换设备后

## 实施步骤

### 步骤1：修改全量同步删除逻辑

文件：`src/services/HybridSyncService.ts`

```typescript
// 3. 删除：本地有但 Riff 没有（通过 blockId 判断）
this.reportProgress(onProgress, 'full', 'deleting', 3, 7, '正在删除过期卡片...');
const toDelete = localCards.filter(card => {
    // 在Riff中，保留
    if (riffBlockIds.has(card.blockId)) return false;
    
    // 🆕 秀元卡片，保留（多卡片共用一个blockId）
    if (card.meta?.xiuyuanID) {
        console.log(`[HybridSync] Skipping Xiuyuan card: ${card.id} (xiuyuanID: ${card.meta.xiuyuanID})`);
        return false;
    }
    
    // 其他情况，删除
    return true;
});

for (const card of toDelete) {
    this.storage.removeCard(card.id);
}
console.log(`[HybridSync] Deleted ${toDelete.length} cards not in Riff`);
```

### 步骤2：修改默认配置

文件：`src/types/settings.ts`

```typescript
export const DEFAULT_RIFF_CONFIG: RiffIntegrationConfig = {
    mode: 'advanced',
    useLocalScheduler: true,
    
    incrementalSync: {
        enabled: true,
        triggers: ['plugin-start', 'review-open'],  // 移除 browser-open
        useBlacklist: true
    },
    
    fullSync: {
        enabled: true,
        interval: 604800000,  // 7天（而不是24小时）
        cleanupBlacklist: true
    },
    
    deleteSync: {
        enabled: true,
        useBlacklistFallback: true
    }
};
```

### 步骤3：添加手动同步按钮（可选）

在设置面板添加：
```vue
<button @click="triggerFullSync">立即全量同步</button>
```

## 性能对比

### 优化前
- 全量同步：每24小时
- 增量同步：启动 + 浏览器 + 复习（3个触发点）
- 秀元卡片：可能被误删

### 优化后
- 全量同步：每7天（减少83%频率）
- 增量同步：启动 + 复习（2个触发点，减少33%）
- 秀元卡片：永不误删

### 预期效果
- 启动速度：提升10-20%（减少一次增量同步）
- 浏览器打开速度：提升30-50%（移除同步操作）
- 数据安全：保持不变（WebSocket + 增量同步 + 7天全量同步）

## 用户配置建议

### 单设备用户
```typescript
fullSync: {
    enabled: true,
    interval: 604800000,  // 7天
}
```

### 多设备用户
```typescript
fullSync: {
    enabled: true,
    interval: 259200000,  // 3天（更频繁）
}
```

### 性能优先用户
```typescript
fullSync: {
    enabled: false,  // 完全禁用（不推荐）
}
```

## 风险评估

### 低风险
- ✅ WebSocket实时监听覆盖大部分场景
- ✅ 增量同步在关键时机触发
- ✅ 7天全量同步足以清理孤儿卡片

### 中风险
- ⚠️ 如果WebSocket断开且增量同步失败，可能7天内数据不一致
- **缓解措施**：保留手动全量同步按钮

### 高风险
- ❌ 完全禁用全量同步（不推荐）

## 后续优化方向

1. **智能同步频率**：根据卡片数量动态调整
   - <500张：7天
   - 500-2000张：3天
   - >2000张：1天

2. **增量同步优化**：批量处理，减少API调用

3. **同步状态指示器**：显示上次同步时间和状态

4. **同步日志**：记录每次同步的详细信息，方便调试

## 总结

这个方案在**数据安全**和**性能**之间取得了最佳平衡：

- 🛡️ 数据安全：WebSocket + 增量同步 + 7天全量同步
- ⚡ 性能优化：减少83%全量同步频率，减少33%增量同步触发
- 🎯 用户体验：打开浏览器更快，秀元卡片不会被误删
- 🔧 灵活性：保留手动同步按钮，用户可按需触发


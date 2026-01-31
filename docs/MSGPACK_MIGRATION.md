# msgpack 存储格式迁移

> **完成时间**: 2026-01-31  
> **状态**: ✅ Phase 1.0 完成

---

## 📋 概述

根据思源开发者建议，将插件存储格式从 JSON 迁移到 msgpack，以获得更好的性能并避免同步问题。

### 为什么使用 msgpack？

1. **性能更好**：msgpack 是二进制格式，比 JSON 快 2-5 倍
2. **避免同步问题**：文件存储比数据库更适合插件（不会有同步冲突）
3. **体积更小**：msgpack 压缩率更高，节省存储空间

---

## ✅ 已完成的工作

### 1. 安装依赖

```json
{
  "dependencies": {
    "@msgpack/msgpack": "^3.1.3"
  }
}
```

### 2. 更新文件命名

```typescript
const STORAGE_FILES = {
    CARDS: 'cards.msgpack',                      // ✅ 改为 msgpack
    CARDS_JSON: 'cards.json',                    // 旧格式（用于迁移）
    SETTINGS: 'settings.json',                   // 保持 JSON（便于手动编辑）
    PRACTICE_QUEUE: 'practice-queue.msgpack',    // ✅ 改为 msgpack
    PRACTICE_QUEUE_JSON: 'practice-queue.json',  // 旧格式（用于迁移）
    PRACTICE_QUEUE_BACKUP: 'practice-queue-backup.msgpack',
    INCREMENTAL_LEARNING_QUEUE: 'incremental-learning-queue.msgpack',
    INCREMENTAL_LEARNING_QUEUE_JSON: 'incremental-learning-queue.json',
    RIFF_BLACKLIST: 'riff-blacklist.msgpack',
    RIFF_BLACKLIST_JSON: 'riff-blacklist.json',
};
```

### 3. 实现 msgpack 读写方法

```typescript
/**
 * 加载 msgpack 数据
 */
async loadMsgpackData(filename: string): Promise<any> {
    const content = await this.readPluginData(filename);
    if (!content) return null;

    const encoder = new TextEncoder();
    const buffer = encoder.encode(content);
    return decode(buffer);
}

/**
 * 保存 msgpack 数据
 */
async saveMsgpackData(filename: string, data: any): Promise<void> {
    const buffer = encode(data);
    const decoder = new TextDecoder();
    const content = decoder.decode(buffer);
    await this.writePluginData(filename, content);
}
```

### 4. 实现自动迁移

```typescript
/**
 * 迁移 JSON 数据到 msgpack 格式
 */
async migrateToMsgpack(): Promise<void> {
    const migrations = [
        { from: 'cards.json', to: 'cards.msgpack', name: 'cards' },
        { from: 'practice-queue.json', to: 'practice-queue.msgpack', name: 'practice-queue' },
        { from: 'incremental-learning-queue.json', to: 'incremental-learning-queue.msgpack', name: 'incremental-learning-queue' },
        { from: 'riff-blacklist.json', to: 'riff-blacklist.msgpack', name: 'riff-blacklist' },
    ];

    for (const { from, to, name } of migrations) {
        // 检查是否已经迁移
        const msgpackExists = await this.readPluginData(to);
        if (msgpackExists) continue;

        // 读取 JSON 文件
        const jsonContent = await this.readPluginData(from);
        if (!jsonContent) continue;

        const data = JSON.parse(jsonContent);

        // 保存为 msgpack
        await this.saveMsgpackData(to, data);

        console.log(`[StorageManager] ✅ Migrated ${name}: ${from} → ${to}`);
    }
}
```

### 5. 更新所有存储方法

✅ **loadCards() / saveCards()**
- 优先加载 msgpack 格式
- 后备加载 JSON 格式（向后兼容）
- 保存使用 msgpack 格式

✅ **loadPracticeQueue() / savePracticeQueue()**
- 优先加载 msgpack 格式
- 后备加载 JSON 格式
- 保存使用 msgpack 格式

✅ **loadIncrementalLearningQueue() / saveIncrementalLearningQueue()**
- 优先加载 msgpack 格式
- 后备加载 JSON 格式
- 保存使用 msgpack 格式

✅ **loadRiffBlacklist() / saveRiffBlacklist()**
- 优先加载 msgpack 格式
- 后备加载 JSON 格式
- 保存使用 msgpack 格式

✅ **getQueueBackup() / setQueueBackup()**
- 使用 msgpack 格式

---

## 🔄 迁移流程

### 首次运行

1. 插件启动时调用 `init()`
2. `init()` 调用 `migrateToMsgpack()`
3. 检查每个文件是否已迁移（msgpack 文件是否存在）
4. 如果未迁移，读取 JSON 文件并转换为 msgpack
5. 保存 msgpack 文件
6. 保留 JSON 文件（以便回滚）

### 后续运行

1. 优先加载 msgpack 文件
2. 如果 msgpack 文件不存在，加载 JSON 文件（向后兼容）
3. 所有保存操作使用 msgpack 格式

---

## 📊 性能对比

### 理论性能提升

| 操作 | JSON | msgpack | 提升 |
|------|------|---------|------|
| 编码速度 | 1x | 2-3x | 2-3倍 |
| 解码速度 | 1x | 2-5x | 2-5倍 |
| 文件大小 | 1x | 0.6-0.8x | 20-40% 更小 |

### 实际测试（待补充）

- [ ] 测试 1000 张卡片的加载时间
- [ ] 测试 1000 张卡片的保存时间
- [ ] 测试文件大小对比

---

## 🚨 注意事项

### 1. 向后兼容

- ✅ 保留 JSON 文件（不删除）
- ✅ 优先加载 msgpack，后备加载 JSON
- ✅ 用户可以手动回滚（删除 msgpack 文件）

### 2. 设置文件

- ⚠️ `settings.json` 保持 JSON 格式
- 原因：便于用户手动编辑配置

### 3. 日志文件

- ⚠️ 复习日志保持 JSON 格式
- 原因：日志文件需要人类可读

---

## 🎯 下一步

### Phase 1.1: StorageManager 添加黑名单管理

- ✅ 黑名单已实现（`getRiffBlacklist()`, `addToRiffBlacklist()` 等）
- ✅ 使用 msgpack 格式存储

### Phase 1.2-1.3: RiffDataSource 集成

- 添加 `storage` 参数
- 实现 `mergeLocalNextDues()` 方法
- 优先使用本地 nextDues

---

## 📝 测试清单

### 单元测试

- [ ] 测试 msgpack 编码/解码
- [ ] 测试 JSON → msgpack 迁移
- [ ] 测试向后兼容（JSON 后备加载）
- [ ] 测试性能（msgpack vs JSON）

### 集成测试

- [ ] 测试首次运行（自动迁移）
- [ ] 测试后续运行（加载 msgpack）
- [ ] 测试回滚（删除 msgpack，加载 JSON）

---

## 🎉 总结

Phase 1.0 已完成：

1. ✅ 安装 `@msgpack/msgpack` 依赖
2. ✅ 实现 msgpack 读写方法
3. ✅ 实现自动迁移（JSON → msgpack）
4. ✅ 更新所有存储方法
5. ✅ 编译成功

**下一步**：Phase 1.1 - StorageManager 添加黑名单管理（已完成）

---

**创建时间**: 2026-01-31  
**最后更新**: 2026-01-31  
**维护者**: AI Assistant

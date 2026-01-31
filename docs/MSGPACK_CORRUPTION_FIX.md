# Msgpack 文件损坏修复指南

## 问题症状

插件加载时出现以下错误：

```
[StorageManager] Failed to load msgpack practice-queue.msgpack: 
InvalidCharacterError: Failed to execute 'atob' on 'Window': 
The string to be decoded is not correctly encoded.
```

## 原因分析

这个错误表明 msgpack 文件使用了旧的（错误的）编码方法创建，导致文件内容不是有效的 Base64 格式。

### 旧编码方法的问题

```typescript
// ❌ 旧方法：使用 TextEncoder/TextDecoder（会损坏二进制数据）
const content = new TextDecoder().decode(encoded);
```

### 新编码方法

```typescript
// ✅ 新方法：使用 Base64 编码（安全可靠）
const base64 = btoa(String.fromCharCode(...encoded));
```

## 自动修复机制

插件现在包含自动修复逻辑：

### 1. 检测损坏文件

在 `init()` 时，`migrateToMsgpack()` 会：
- 尝试加载每个 msgpack 文件
- 如果加载失败（`InvalidCharacterError`），标记为损坏

### 2. 从 JSON 恢复

如果检测到损坏：
- 查找对应的 JSON 备份文件
- 从 JSON 重新生成 msgpack 文件
- 使用新的 Base64 编码方法

### 3. 无 JSON 备份的情况

如果 msgpack 损坏且没有 JSON 备份：
- 记录警告日志
- 允许插件继续运行
- 下次保存时会创建新的正确格式文件

## 手动修复步骤

如果自动修复失败，可以手动修复：

### 方法 1：删除损坏的 msgpack 文件

1. 找到插件数据目录：
   ```
   {思源工作空间}/data/storage/petal/siyuan-plugin-fsrs/
   ```

2. 删除损坏的 msgpack 文件：
   ```
   practice-queue.msgpack
   incremental-learning-queue.msgpack
   cards.msgpack
   riff-blacklist.msgpack
   ```

3. 重新加载插件，它会从 JSON 文件重新生成

### 方法 2：使用 JSON 备份

如果 JSON 文件存在：

1. 确认 JSON 文件存在：
   ```
   practice-queue.json
   incremental-learning-queue.json
   cards.json
   riff-blacklist.json
   ```

2. 删除对应的 msgpack 文件

3. 重新加载插件

### 方法 3：完全重置（最后手段）

⚠️ 警告：这会丢失所有队列数据！

1. 备份整个插件数据目录

2. 删除所有 msgpack 和 JSON 文件

3. 重新加载插件

4. 重新添加卡片到队列

## 预防措施

### 确保使用最新版本

确保插件已更新到包含 Base64 编码修复的版本：

```bash
git log --oneline | grep "msgpack"
```

应该看到类似的提交：
```
2fa23e3 fix(storage): Improve msgpack error handling for corrupted files
4e8f1d9 fix(storage): Complete msgpack migration summary log with cleanedCount
a1b2c3d fix(storage): Fix msgpack encoding using Base64 instead of TextEncoder
```

### 保留 JSON 备份

不要删除 JSON 文件（`*.json`），它们是重要的备份：
- `practice-queue.json`
- `incremental-learning-queue.json`
- `cards.json`
- `riff-blacklist.json`

## 日志分析

### 正常迁移日志

```
[StorageManager] ⚠️ Corrupted msgpack file detected: practice-queue.msgpack, will re-migrate
[StorageManager] ✅ Migrated practice-queue: practice-queue.json → practice-queue.msgpack
[StorageManager] 🎉 Msgpack migration complete: migrated 1 files, cleaned 1 corrupted files
```

### 无 JSON 备份日志

```
[StorageManager] ⚠️ Corrupted msgpack file detected: practice-queue.msgpack, will re-migrate
[StorageManager] ⚠️ No JSON backup found for corrupted practice-queue.msgpack, will start fresh
[StorageManager] 🎉 Msgpack migration complete: cleaned 1 corrupted files
```

### Base64 解码错误日志

```
[StorageManager] Corrupted msgpack file (invalid Base64): practice-queue.msgpack
```

## 技术细节

### InvalidCharacterError 的原因

`atob()` 函数要求输入是有效的 Base64 字符串：
- 只能包含 A-Z, a-z, 0-9, +, /, =
- 长度必须是 4 的倍数（padding）

旧编码方法产生的文件包含任意字节，不符合 Base64 规范。

### 新编码流程

```typescript
// 编码：数据 → msgpack → Base64 → 存储
const buffer = encode(data);
const base64 = btoa(String.fromCharCode(...buffer));
await writeFile(base64);

// 解码：存储 → Base64 → msgpack → 数据
const base64 = await readFile();
const binaryString = atob(base64);
const bytes = new Uint8Array(binaryString.length);
for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
}
const data = decode(bytes);
```

## 常见问题

### Q: 为什么不直接使用 JSON？

A: Msgpack 有以下优势：
- 文件更小（约 50% 大小）
- 解析更快（约 2-3 倍）
- 避免思源同步时的 JSON 格式问题

### Q: 会丢失数据吗？

A: 不会，因为：
- JSON 文件作为备份保留
- 自动从 JSON 恢复
- 只有在没有任何备份时才会重置

### Q: 需要手动操作吗？

A: 通常不需要：
- 插件会自动检测和修复
- 只有在自动修复失败时才需要手动操作

## 相关文档

- [MSGPACK_MIGRATION.md](./MSGPACK_MIGRATION.md) - Msgpack 迁移指南
- [MSGPACK_FIX_SUMMARY.md](./MSGPACK_FIX_SUMMARY.md) - 修复总结
- [AI_HANDOFF_GUIDE.md](./AI_HANDOFF_GUIDE.md) - 开发者指南

---

**最后更新**：2026-02-01
**状态**：✅ 已修复
**优先级**：P0（关键修复）

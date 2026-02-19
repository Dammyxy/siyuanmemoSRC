# Xiuyuan 列表项模版卡调试指南

## 调试步骤

### 1. 检查 TransactionObserver 是否启用

打开浏览器开发者工具（F12），查看控制台日志：

```
[SiyuanMemo] TransactionObserver initialized
[SiyuanMemo] TransactionObserver enabled: true/false
```

如果显示 `enabled: false`，需要在设置中启用自动制卡功能。

### 2. 检查快速制卡是否触发事件

当你点击"快速制卡"后，应该看到：

```
[SiyuanMemo] WS Event: transactions
[SiyuanMemo] Transaction received: 1
[SiyuanMemo] Ops: insert/update <blockId>
[SiyuanMemo] Queueing check for block: <blockId>
```

如果没有看到这些日志，说明 TransactionObserver 没有监听到事件。

### 3. 检查列表项检测

2秒后（debounce），应该看到：

```
[SiyuanMemo] Processing queue, blocks: 1
[SiyuanMemo] checkAndCreateCard called for <blockId>
[SiyuanMemo] Check block <blockId>, content: ...
[SiyuanMemo] Strategy match result for <blockId>: ...
```

### 4. 检查列表项模版检测

如果是列表项且有子级，应该看到：

```
[SiyuanMemo] Adding to Riff Deck: ...
[SiyuanMemo] addRiffCards result: ...
[SiyuanMemo] Block <blockId> is a list template with N children
[SiyuanMemo] Detected list template card: <blockId>
[SiyuanMemo] Creating N list template cards for parent: <blockId>
```

### 5. 检查卡片创建

每张卡片创建时应该看到：

```
[SiyuanMemo] Created list template card: <xiuyuanId> (child: <childBlockId>)
```

最后应该看到：

```
[SiyuanMemo] ✅ Successfully created N list template cards
```

## 常见问题排查

### 问题1：没有任何日志输出

**原因**：TransactionObserver 未启用

**解决**：
1. 打开插件设置
2. 找到"自动制卡"相关选项
3. 确保已启用

### 问题2：有日志但没有检测到列表项

**原因**：可能的原因
1. 块类型不是列表项（type != 'i'）
2. 子级数量 < 2
3. SQL 查询失败

**解决**：
1. 检查块类型：在控制台运行
   ```javascript
   // 替换 <blockId> 为你的块ID
   fetch('/api/query/sql', {
     method: 'POST',
     headers: {'Content-Type': 'application/json'},
     body: JSON.stringify({stmt: "SELECT type FROM blocks WHERE id = '<blockId>'"})
   }).then(r => r.json()).then(console.log)
   ```

2. 检查子级：
   ```javascript
   fetch('/api/query/sql', {
     method: 'POST',
     headers: {'Content-Type': 'application/json'},
     body: JSON.stringify({stmt: "SELECT id FROM blocks WHERE parent_id = '<blockId>' AND type = 'i'"})
   }).then(r => r.json()).then(console.log)
   ```

### 问题3：检测到但没有创建卡片

**原因**：xiuyuanService 未初始化或创建失败

**解决**：
1. 检查 xiuyuanService 是否存在：
   ```javascript
   // 在控制台运行
   window.siyuanMemoPlugin?.xiuyuanService
   ```

2. 查看错误日志：
   ```
   [SiyuanMemo] Failed to create list template card for child <childBlockId>: ...
   ```

### 问题4：只创建了1张卡片

**原因**：可能是 `createFromBlocks` 方法的问题

**解决**：检查每次调用的日志，确认循环执行了正确的次数

## 增强调试日志

如果上述日志不够详细，可以临时添加更多日志。

## 实际调试步骤

### 步骤1：打开开发者工具

1. 在思源笔记中按 `F12` 打开开发者工具
2. 切换到 `Console` 标签页
3. 清空控制台（点击 🚫 图标）

### 步骤2：创建测试列表

在思源笔记中创建以下结构：

```markdown
- 测试问题
  - 答案1
  - 答案2
  - 答案3
```

### 步骤3：执行快速制卡

1. 选中父列表项"测试问题"
2. 点击思源原生的"快速制卡"按钮
3. 观察控制台输出

### 步骤4：分析日志

按照以下顺序检查日志：

#### 4.1 事件监听
```
✅ 应该看到：
[SiyuanMemo] WS Event: transactions
[SiyuanMemo] Transaction received: 1
[SiyuanMemo] Ops: insert <blockId>

❌ 如果没有：TransactionObserver 未启用或未监听到事件
```

#### 4.2 队列处理
```
✅ 应该看到（2秒后）：
[SiyuanMemo] Processing queue, blocks: 1
[SiyuanMemo] checkAndCreateCard called for <blockId>

❌ 如果没有：debounce 机制问题
```

#### 4.3 列表项检测
```
✅ 应该看到：
[SiyuanMemo] 🔍 Checking if block <blockId> is a list template...
[SiyuanMemo] Block type query result: [{type: "i"}]
[SiyuanMemo] Block <blockId> type: i
[SiyuanMemo] Children query result: [{id: "..."}, {id: "..."}, {id: "..."}]
[SiyuanMemo] Block <blockId> has 3 list item children
[SiyuanMemo] ✅ Block <blockId> is a list template with 3 children

❌ 如果看到：
[SiyuanMemo] ❌ Block <blockId> is not a list item (type='p')
→ 块类型不对，可能选错了块

[SiyuanMemo] ❌ Block <blockId> has only 1 children (need ≥2)
→ 子级数量不够
```

#### 4.4 卡片创建
```
✅ 应该看到：
[SiyuanMemo] 🎯 Starting to create list template cards for parent: <blockId>
[SiyuanMemo] 📝 Creating 3 list template cards for parent: <blockId>
[SiyuanMemo] 📌 Creating card 1/3 for child: <childId1>
[SiyuanMemo] ✅ Created list template card 1/3: <xiuyuanId>
[SiyuanMemo] 📌 Creating card 2/3 for child: <childId2>
[SiyuanMemo] ✅ Created list template card 2/3: <xiuyuanId>
[SiyuanMemo] 📌 Creating card 3/3 for child: <childId3>
[SiyuanMemo] ✅ Created list template card 3/3: <xiuyuanId>
[SiyuanMemo] 🎉 List template cards creation complete: 3 succeeded, 0 failed

❌ 如果看到错误：
[SiyuanMemo] ❌ Failed to create list template card 1/3 for child <childId>: ...
→ 查看具体错误信息
```

### 步骤5：验证卡片

1. 打开卡片浏览器
2. 搜索刚才创建的卡片
3. 应该看到 3 张卡片，每张卡片的正面都是"测试问题"

## 常见问题及解决方案

### 问题：没有看到任何 [SiyuanMemo] 日志

**原因**：插件未加载或日志被禁用

**解决**：
1. 检查插件是否启用：设置 → 集市 → 已下载 → 插件
2. 重新加载插件：禁用后重新启用
3. 检查是否有 `disableLogs` 配置

### 问题：看到 "Block type: p" 而不是 "i"

**原因**：选中的不是列表项块，而是段落块

**解决**：
1. 确保你的结构是列表（以 `-` 或 `*` 开头）
2. 选中的是父列表项，不是段落

### 问题：看到 "has only 0 children"

**原因**：子级列表项没有被正确识别

**可能的原因**：
1. 子级不是列表项（可能是段落）
2. 缩进不正确
3. 数据库未同步

**解决**：
1. 确保子级也是列表项（以 `-` 或 `*` 开头）
2. 确保子级正确缩进
3. 等待几秒让数据库同步

### 问题：看到 "Template not found: builtin-list-item"

**原因**：列表项模版未注册

**解决**：
1. 检查 `src/core/xiuyuan/templates/builtin.ts` 是否包含 `LIST_ITEM_TEMPLATE`
2. 检查插件是否重新编译
3. 重新加载插件

## 手动测试 SQL 查询

如果怀疑 SQL 查询有问题，可以在控制台手动测试：

### 测试1：检查块类型

```javascript
// 替换 YOUR_BLOCK_ID 为实际的块ID
fetch('/api/query/sql', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    stmt: "SELECT id, type, content FROM blocks WHERE id = 'YOUR_BLOCK_ID'"
  })
}).then(r => r.json()).then(data => {
  console.log('Block info:', data);
});
```

### 测试2：检查子级列表项

```javascript
// 替换 YOUR_BLOCK_ID 为实际的块ID
fetch('/api/query/sql', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    stmt: "SELECT id, type, content FROM blocks WHERE parent_id = 'YOUR_BLOCK_ID' AND type = 'i'"
  })
}).then(r => r.json()).then(data => {
  console.log('Children:', data);
});
```

### 测试3：检查 Xiuyuan 服务

```javascript
// 检查 xiuyuanService 是否存在
console.log('xiuyuanService:', window.siyuanMemoPlugin?.xiuyuanService);

// 检查模版是否注册
console.log('Templates:', window.siyuanMemoPlugin?.xiuyuanService?.getAllTemplates());
```

## 需要提供的信息

如果问题仍未解决，请提供以下信息：

1. **完整的控制台日志**（从点击"快速制卡"开始）
2. **块结构截图**（显示父列表项和子级）
3. **SQL 查询结果**（上面的测试1和测试2）
4. **插件版本**和**思源版本**
5. **是否有其他插件**可能影响制卡功能

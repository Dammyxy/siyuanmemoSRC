# 验证 UnifiedStorageManager 是否正常工作

## 步骤 1：检查文件是否生成

在思源笔记的数据目录中查找：

```
data/storage/petal/siyuan-plugin-siyuanmemo/unified-cards.msgpack
```

**Windows 路径示例**：
```
C:\Users\你的用户名\AppData\Roaming\SiYuan\data\storage\petal\siyuan-plugin-siyuanmemo\unified-cards.msgpack
```

**预期结果**：
- ✅ 文件存在：说明 UnifiedStorageManager 已经初始化
- ❌ 文件不存在：说明还没有保存过数据

## 步骤 2：创建一张测试卡片

### 方法 A：使用快速双向卡片

1. 在思源笔记中创建一个块：
   ```
   DDD <> 领域驱动设计
   ```

2. 右键点击块 → 选择"创建卡片"

3. 选择"快速双向"模板

### 方法 B：使用控制台创建

打开浏览器控制台（F12），执行：

```javascript
// 获取插件实例
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');

// 获取 UnifiedStorageManager
const unifiedStorage = plugin.getContext().getUnifiedStorage();

// 查看当前状态
console.log('UnifiedStorage stats:', unifiedStorage.getStats());

// 查看所有 Xiuyuan
console.log('All Xiuyuans:', unifiedStorage.getAllXiuYuans());

// 查看所有卡片
console.log('All Cards:', unifiedStorage.getAllCards());
```

## 步骤 3：验证数据是否保存

### 3.1 检查控制台日志

创建卡片后，应该看到类似的日志：

```
[XiuyuanRepository] ✅ Saved xiuyuan: xy_xxx
[UnifiedStorageManager] Scheduled save in 1000ms
[UnifiedStorageManager] Saved to msgpack: { version: 1, xiuyuans: 1, cards: 2 }
```

### 3.2 检查文件内容

使用 MessagePack 查看工具或控制台：

```javascript
// 在控制台执行
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const data = await plugin.loadData('unified-cards.msgpack');
console.log('Unified storage data:', data);
```

**预期输出**：
```javascript
{
  version: 1,
  xiuyuans: {
    'xy_xxx': {
      id: 'xy_xxx',
      blockIDs: ['20240220-abc123'],
      templateID: 'builtin-quick-bidirectional',
      // ...
    }
  },
  cards: {
    'card-1': {
      id: 'card-1',
      xiuyuanID: 'xy_xxx',
      blockId: '20240220-abc123',
      due: 1708416000000,
      // ...
    },
    'card-2': {
      id: 'card-2',
      xiuyuanID: 'xy_xxx',
      blockId: '20240220-abc123',
      due: 1708416000000,
      // ...
    }
  }
}
```

## 步骤 4：验证卡片是否可以复习

1. 打开卡片浏览器
2. 应该能看到刚创建的卡片
3. 点击"开始复习"
4. 应该能正常复习卡片

## 常见问题

### Q1: 文件不存在

**可能原因**：
1. UnifiedStorageManager 没有被初始化
2. 没有创建过卡片（首次保存才会创建文件）

**解决方法**：
1. 检查控制台是否有错误日志
2. 创建一张测试卡片
3. 等待 1 秒（防抖延迟）

### Q2: 文件存在但是空的

**可能原因**：
1. 保存失败
2. 数据格式错误

**解决方法**：
1. 检查控制台错误日志
2. 查看 `unified-cards.msgpack` 文件大小
3. 如果文件大小为 0，删除文件重新创建卡片

### Q3: 创建卡片后看不到

**可能原因**：
1. 数据保存到了旧的 `cards.msgpack`
2. 卡片浏览器还在使用旧的 StorageManager

**解决方法**：
1. 检查是否同时存在 `cards.msgpack` 和 `unified-cards.msgpack`
2. 如果是，说明有些地方还在使用旧的 StorageManager
3. 需要检查 DataAccessFacade 是否使用了 UnifiedStorageManager

## 调试命令

### 查看存储状态

```javascript
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const context = plugin.getContext();

// 查看 UnifiedStorageManager
const unifiedStorage = context.getUnifiedStorage();
console.log('UnifiedStorage:', {
  stats: unifiedStorage.getStats(),
  xiuyuans: unifiedStorage.getAllXiuYuans().length,
  cards: unifiedStorage.getAllCards().length,
});

// 查看 StorageManager（旧的）
const oldStorage = context.getStorage();
console.log('OldStorage:', {
  cards: oldStorage.getAllCards().length,
});
```

### 强制保存

```javascript
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const unifiedStorage = plugin.getContext().getUnifiedStorage();

// 强制保存
await unifiedStorage.save();
console.log('✅ Saved');
```

### 查看数据文件

```javascript
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');

// 查看 unified-cards.msgpack
const unifiedData = await plugin.loadData('unified-cards.msgpack');
console.log('Unified data:', unifiedData);

// 查看 cards.msgpack（旧的）
const oldData = await plugin.loadData('cards.msgpack');
console.log('Old data:', oldData);
```

## 成功标志

如果一切正常，你应该看到：

1. ✅ `unified-cards.msgpack` 文件存在且不为空
2. ✅ 创建卡片后，文件内容包含 xiuyuans 和 cards
3. ✅ 卡片浏览器能显示卡片
4. ✅ 可以正常复习卡片
5. ✅ 控制台没有错误日志

## 下一步

如果验证成功，可以继续实现分文件存储：
- [分文件存储设计](./split-file-storage-design.md)


---

## 问题排查记录

### 问题 1: XiuyuanRepository 使用错误的存储 ✅ 已解决

**现象**：XiuyuanRepository 使用 XiuyuanStorage 而不是 UnifiedStorageManager

**原因**：ApplicationContext 在创建 XiuyuanRepository 时传入了错误的存储实例

**解决方案**：修改 ApplicationContext.ts 第 295 行，使用 `context.getUnifiedStorage()` 而不是 `context.getXiuyuanStorage()`

**修改文件**：
- `siyuan-plugin-siyuanmemo/src/application/ApplicationContext.ts` (第 295 行)

---

### 问题 2: 队列显示 0 张卡片 ✅ 已解决

**现象**：
- 浏览器能看到 62 张卡片
- 但所有队列（检索练习、最终演练等）都显示 0 张卡片
- 控制台日志显示：`[SiYuanMemo][DataAccessFacade] 🔍 getCards() returned 0 cards`

**原因分析**：
在 `ApplicationContext.create()` 中创建临时 `CardApplicationService` 时，传入的是旧的 `storageManager` 而不是 `unifiedStorageManager`。

**问题代码**（第 680 行）：
```typescript
const cardApplicationService = new CardApplicationService(
  createCardUseCase,
  deleteCardUseCase,
  updateCardUseCase,
  storageManager,  // ❌ 错误：使用旧存储
  cardScheduleService
);
```

这导致：
1. `CardApplicationService` 内部的查询处理器（`GetCardsQueryHandler`）使用旧的 `storageManager`
2. 旧的 `storageManager` 没有数据（数据都在 `unifiedStorageManager` 中）
3. 所以 `getCards()` 返回 0 张卡片

**解决方案**：
修改 `ApplicationContext.create()` 中的临时 `CardApplicationService` 创建代码，使用 `unifiedStorageManager`：

```typescript
const cardApplicationService = new CardApplicationService(
  createCardUseCase,
  deleteCardUseCase,
  updateCardUseCase,
  unifiedStorageManager as any,  // ✅ 正确：使用统一存储
  cardScheduleService
);
```

**修改文件**：
- `siyuan-plugin-siyuanmemo/src/application/ApplicationContext.ts` (第 680 行)

**验证步骤**：
1. 重新编译插件：`npm run build`
2. 重启思源笔记
3. 打开插件浏览器
4. 检查队列是否显示正确的卡片数量
5. 查看控制台日志，确认 `getCards()` 返回正确数量

---

## 调试命令（更新）

### 验证 CardApplicationService 使用的存储

```javascript
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const context = plugin.getContext();

// 获取 CardApplicationService
const cardService = context.getCardService();

// 查看它使用的存储
console.log('CardService storage:', cardService.storage);

// 对比 UnifiedStorageManager
const unifiedStorage = context.getUnifiedStorage();
console.log('UnifiedStorage cards:', unifiedStorage.getAllCards().length);

// 对比旧的 StorageManager
const oldStorage = context.getStorage();
console.log('OldStorage cards:', oldStorage.getAllCards().length);
```

### 验证队列数据

```javascript
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const context = plugin.getContext();

// 获取检索练习队列
const retrievalQueue = context.getRetrievalQueue();
console.log('Retrieval queue size:', retrievalQueue.getSize());

// 获取所有卡片
const cardService = context.getCardService();
const result = await cardService.getCards({});
console.log('CardService getCards:', result.cards.length);

// 对比 UnifiedStorage
const unifiedStorage = context.getUnifiedStorage();
console.log('UnifiedStorage cards:', unifiedStorage.getAllCards().length);
```

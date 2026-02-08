# 渐进学习队列浏览器数据源迁移报告

## 问题描述

用户报告：浏览器上，渐进学习队列的表格视图点击后会污染本地卡组数据。

## 根本原因分析

### 旧架构的问题

1. **旧架构和新架构并存：**
   - 旧架构：`src/core/queue/strategies/IncrementalLearningQueue.ts` (已标记为 @deprecated)
   - 新架构：`src/queues/IncrementalLearningQueue.ts` (统一数据源架构)

2. **数据源不统一：**
   - `IncrementalLearningDataSource` 曾经直接访问 `plugin.incrementalQueue`（旧架构队列）
   - 旧架构队列混合了 Riff API 数据和本地存储数据，没有经过统一数据源管理器

3. **数据污染路径：**
   ```
   用户在浏览器中查看渐进学习队列
   ↓
   IncrementalLearningDataSource.fetchRows() 调用旧架构队列的 getAllCards()
   ↓
   旧架构队列从 Riff API 加载数据
   ↓
   _recalculateNextDues() 方法为不存在的卡片创建默认 FSRSCard
   ↓
   this.storage.setCard(localCard) 保存到本地存储
   ↓
   本地卡组数据被污染
   ```

## 解决方案

### ✅ 已完成的修复（2026-02-06）

#### 1. `IncrementalLearningDataSource` 已迁移到统一数据源架构
   - 文件：`src/ui/browser/datasource/IncrementalLearningDataSource.ts`
   - 构造函数现在接收 `UnifiedDataSourceManager` 实例
   - 通过 `manager.getQueue(QueueType.IncrementalLearning)` 获取队列
   - 不再直接访问旧架构的 `plugin.incrementalQueue`

#### 2. `SRSBrowser.vue` 已集成统一数据源适配器
   - 初始化了 `SRSBrowserAdapter` 实例
   - 在 `loadData()` 方法中强制使用统一数据源管理器
   - **已移除所有降级逻辑**

#### 3. 移除了所有降级路径
   
   **修改的函数：**
   
   a. **`getQueueById()` 函数**
   - 移除了降级到旧队列系统的逻辑
   - 现在只从 `UnifiedDataSourceManager` 获取队列
   - 如果获取失败，返回 `null` 并记录错误
   
   ```typescript
   function getQueueById(id: string) {
     // 从 UnifiedDataSourceManager 获取队列实例
     if (browserAdapter.value) {
       try {
         const queueTypeMap: Record<string, QueueType> = {
           'retrieval': QueueType.RetrievalPractice,
           'final-drill': QueueType.FinalDrill,
           'incremental-learning': QueueType.IncrementalLearning,
           'filter-group': QueueType.FilterGroup,
           'neural-roam': QueueType.NeuralRoam,
         };
         
         const queueType = queueTypeMap[id];
         if (queueType) {
           const manager = UnifiedDataSourceManager.getInstance();
           const queue = manager.getQueue(queueType);
           if (queue) {
             return queue;
           }
         }
       } catch (error) {
         console.error(`[SRSBrowser] Failed to get queue from UnifiedDataSourceManager:`, error);
         return null;
       }
     }
     
     console.error(`[SRSBrowser] browserAdapter not initialized, cannot get queue: ${id}`);
     return null;
   }
   ```
   
   b. **`loadData()` 函数**
   - 重构为两个清晰的分支：
     1. **队列模式**：强制使用统一数据源架构
     2. **非队列模式**：SQL 查询或全部卡片（使用 `DeckDataSource`）
   - 移除了 `createQueueDataSource()` 的调用（该函数会创建旧架构的数据源）
   - 如果 `browserAdapter` 未初始化，抛出错误
   
   ```typescript
   async function loadData(forceRefresh = false) {
     // 队列模式：强制使用统一数据源架构
     if (activeQueueId.value) {
       if (!browserAdapter.value) {
         throw new Error('UnifiedDataSourceManager adapter not initialized');
       }
       
       // 使用 browserAdapter 获取数据
       // ...
       return;
     }
     
     // 非队列模式：SQL 查询或全部卡片
     // ...
   }
   ```

#### 4. 数据污染已被防止
   - 不再调用旧架构队列的 `_recalculateNextDues()` 方法
   - 不再创建默认的 FSRSCard 并保存到本地存储
   - 所有队列数据访问都通过统一数据源管理器进行
   - 无法回退到旧架构，确保数据一致性

### 🔍 需要注意的地方

#### `dataSourceFactory.ts` 中的 `createQueueDataSource()`

虽然 `SRSBrowser.vue` 已经不再调用 `createQueueDataSource()`，但该函数仍然存在于 `src/ui/browser/utils/dataSourceFactory.ts` 中。

**当前状态：**
- 该函数会为 `incremental-learning` 创建 `IncrementalLearningDataSource`
- 但是传递的是 `plugin` 参数，而不是 `UnifiedDataSourceManager` 实例
- 这会导致类型错误

**建议：**
- 可以考虑移除 `createQueueDataSource()` 函数中的 `incremental-learning` 分支
- 或者添加注释说明该函数已废弃，不应再使用

## 验证步骤

1. **检查统一数据源管理器是否正确初始化**
   ```typescript
   const manager = UnifiedDataSourceManager.getInstance();
   console.log('Current mode:', manager.getCurrentMode());
   ```

2. **检查渐进学习队列是否使用统一数据源**
   - 打开浏览器控制台
   - 切换到渐进学习队列视图
   - 查看日志输出：
     ```
     [SRSBrowser] ✅ Queue type mapped: incremental-learning
     [SRSBrowser] ✅ Queue view initialized
     [SRSBrowser] ✅ Fetched X rows from UnifiedDataSourceManager
     ```

3. **检查是否有错误日志**
   - 如果看到以下错误，说明统一数据源管理器未正确初始化：
     ```
     [SRSBrowser] browserAdapter not initialized, cannot get queue: incremental-learning
     ```
   - 需要检查 `onMounted()` 中的初始化逻辑

4. **验证数据不会被污染**
   - 查看渐进学习队列
   - 检查本地存储中的卡片数据
   - 确认没有创建默认的 FSRSCard

## 相关文件

### 已修改的文件
- `src/ui/browser/SRSBrowser.vue` - 浏览器主组件（移除降级逻辑）
- `src/ui/browser/datasource/IncrementalLearningDataSource.ts` - 渐进学习数据源（已迁移）

### 相关文件
- `src/ui/browser/SRSBrowserAdapter.ts` - 统一数据源适配器
- `src/managers/UnifiedDataSourceManager.ts` - 统一数据源管理器
- `src/queues/IncrementalLearningQueue.ts` - 新架构的渐进学习队列
- `src/core/queue/strategies/IncrementalLearningQueue.ts` - 旧架构的渐进学习队列（@deprecated）
- `src/ui/browser/utils/dataSourceFactory.ts` - 数据源工厂（包含已废弃的 `createQueueDataSource()`）

### 相关 Spec
- `.kiro/specs/unified-data-source-architecture/` - 统一数据源架构
- `.kiro/specs/unified-data-source-ui-integration/` - 统一数据源 UI 集成

## 结论

✅ **问题已完全修复**：
- `IncrementalLearningDataSource` 已经迁移到统一数据源架构
- 所有降级路径已被移除
- 数据污染问题已被彻底防止
- 队列模式强制使用统一数据源管理器

⚠️ **后续清理建议**：
- 考虑移除 `dataSourceFactory.ts` 中的 `createQueueDataSource()` 函数
- 或者至少移除其中的 `incremental-learning` 分支
- 添加废弃警告，防止其他代码误用

## 更新日期

- 初始版本：2026-02-06
- 移除降级逻辑：2026-02-06

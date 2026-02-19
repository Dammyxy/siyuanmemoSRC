# Phase 12: 高优先级 DDD 迁移进度

**开始时间**: 2026-02-19  
**当前状态**: 进行中  
**完成度**: 60% (3/5)

---

## 📊 任务列表

| # | 任务 | 文件 | 状态 | 耗时 | 完成时间 |
|---|------|------|------|------|---------|
| 1 | BlockMenuHandler 迁移 | BlockMenuHandler.ts | ✅ 完成 | 30分钟 | 2026-02-19 |
| 2 | XiuyuanSyncService 迁移 | XiuyuanSyncService.ts | ✅ 完成 | 45分钟 | 2026-02-19 |
| 3 | ReviewSyncManager 迁移 | ReviewSyncManager.ts | ✅ 完成 | 20分钟 | 2026-02-19 |
| 4 | DataAccessFacade 迁移 | DataAccessFacade.ts | ⏳ 待开始 | 预计2小时 | - |
| 5 | UnifiedQueueStrategy 迁移 | UnifiedQueueStrategy.ts | ⏳ 待开始 | 预计2小时 | - |

---

## ✅ Task 1: BlockMenuHandler 迁移（已完成）

### 完成的工作

1. ✅ 移除所有 Storage 直接访问（11 处）
2. ✅ 强化 ApplicationContext 依赖（必需）
3. ✅ 移除 Fallback 逻辑（2 处）
4. ✅ 清理未使用的导入（3 个）
5. ✅ 修复类型错误（3 个）

### 关键变更

- 将 `applicationContext` 从可选改为必需
- 创建 `getStorage()` 和 `getCardService()` 辅助方法
- 移除所有 `this.deps.storage` 直接访问
- 移除 `createDefaultCard` fallback 逻辑

### DDD 合规度提升

- **之前**: ❌ 直接访问 Storage，有 fallback 逻辑
- **之后**: ✅ 通过 ApplicationContext 访问，无 fallback

---

## ✅ Task 2: XiuyuanSyncService 迁移（已完成）

### 完成的工作

1. ✅ 移除 EventEmitter 继承
2. ✅ 使用依赖注入的 EventBus
3. ✅ CardApplicationService 改为必需
4. ✅ 移除所有 fallback 逻辑（10 处）
5. ✅ 创建事件桥接方法
6. ✅ 替换所有 emit() 调用（6 处）
7. ✅ 0 编译错误

### 关键变更

- 移除 `extends EventEmitter<HybridSyncEvents>`
- 添加 `eventBus: EventBus` 依赖注入
- 创建 `publishEvent()` 桥接方法
- 将 `cardApplicationService` 从可选改为必需
- 移除所有 `if (this.cardApplicationService)` 检查

### DDD 合规度提升

- **之前**: ❌ 继承 EventEmitter，可选依赖，10 处 fallback
- **之后**: ✅ 使用 EventBus，必需依赖，无 fallback
- **合规度**: ~90% → ~98%

---

## ✅ Task 3: ReviewSyncManager 迁移（已完成）

### 完成的工作

1. ✅ 移除直接 UI 调用（3 处 `pushMsg`）
2. ✅ 使用依赖注入的 EventBus
3. ✅ 通过事件发布替代 UI 通知
4. ✅ 更新同步服务类型
5. ✅ 0 编译错误

### 关键变更

- 添加 `eventBus: EventBus` 依赖注入
- 创建 `publishEvent()` 辅助方法
- 移除所有 `pushMsg()` 调用
- 发布 `review.completed` 和 `review.sync.failed` 事件
- 使用 `XiuyuanSyncService` 替代 `HybridSyncService`

### DDD 合规度提升

- **之前**: ❌ 直接调用 UI API，混合业务和 UI
- **之后**: ✅ 通过 EventBus 发布事件，业务和 UI 分离
- **合规度**: ~85% → ~95%

---

## ⏳ Task 4: DataAccessFacade 迁移（待开始）

### 主要问题

1. ❌ 实现 IDataRouter 接口（应该在应用层）
2. ❌ 包含过滤逻辑（应该在领域服务）
3. ❌ 直接操作 Storage
4. ❌ 包含 SQL 查询逻辑（应该在基础设施层）

### 迁移策略

1. 拆分为多个查询处理器
2. 过滤逻辑移到领域服务
3. SQL 查询移到基础设施层

### 预计耗时

2 小时

---

## ⏳ Task 5: UnifiedQueueStrategy 迁移（待开始）

### 主要问题

1. ❌ 实现 IQueueStrategy 接口（应该在应用层）
2. ❌ 包含 UI 配置逻辑
3. ❌ 直接访问 UnifiedDataSourceManager
4. ❌ 包含调度器预览逻辑（应该在领域层）

### 迁移策略

1. 队列适配移到应用服务
2. UI 配置移到 UI 层
3. 调度器逻辑移到领域层

### 预计耗时

2 小时

---

## 📈 整体进度

- **已完成**: 3/5 任务（60%）
- **已耗时**: 1.58 小时
- **剩余预计**: 4 小时
- **总预计**: 5.58 小时

---

## 🎯 下一步行动

继续 Task 4: DataAccessFacade 迁移

**是否继续？**

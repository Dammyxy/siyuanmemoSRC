# Phase 12 Task 2: XiuyuanSyncService DDD 迁移计划

**日期**: 2026-02-19  
**优先级**: P0（高）  
**预计时间**: 3 小时

---

## 🔍 当前问题分析

### 文件信息
- **位置**: `src/services/XiuyuanSyncService.ts`
- **行数**: 1250 行
- **复杂度**: 高

### 主要问题

1. **继承 EventEmitter** (第 59 行)
   - ❌ 违反 DDD 原则：应该使用依赖注入的 EventBus
   - ❌ 紧耦合：难以测试和替换

2. **混合多个职责**
   - 同步逻辑（增量、全量、删除）
   - 事件发射（syncStart, syncSuccess, syncError）
   - 重试机制（withRetry）
   - 进度回调（reportProgress）

3. **直接操作 Storage**
   - `this.storage.getCard()`
   - `this.storage.setCard()`
   - `this.storage.saveCards()`
   - `this.storage.getRiffBlacklist()`

4. **依赖 CardApplicationService（可选）**
   - 有 fallback 逻辑
   - 不符合 DDD 强制依赖原则

---

## 🎯 迁移策略

### 方案选择：渐进式重构

**原因**:
- 文件太大（1250 行），完全重写风险高
- 同步逻辑复杂，需要保持功能稳定
- 可以分步骤验证

### 迁移步骤

#### Step 1: 移除 EventEmitter 继承
- 使用依赖注入的 EventBus
- 保持事件接口不变

#### Step 2: 强化依赖注入
- CardApplicationService 改为必需
- 移除所有 fallback 逻辑

#### Step 3: 移除 Storage 直接访问
- 通过 CardApplicationService 访问
- 创建辅助方法

#### Step 4: 简化职责
- 保留核心同步逻辑
- 移除重试机制（应该在基础设施层）
- 移除进度回调（应该通过事件）

---

## 📋 详细实施计划

### Step 1: 移除 EventEmitter 继承

**当前代码**:
```typescript
export class XiuyuanSyncService extends EventEmitter<HybridSyncEvents> {
  // ...
  this.emit('syncStart', {...});
}
```

**目标代码**:
```typescript
export class XiuyuanSyncService {
  constructor(
    private config: HybridSyncConfig,
    private cardApplicationService: CardApplicationService,
    private eventBus: EventBus  // ✅ 依赖注入
  ) {}
  
  // 使用 EventBus
  this.eventBus.publish('xiuyuan.sync.start', {...});
}
```

**影响范围**:
- 构造函数
- 所有 `this.emit()` 调用（约 10 处）
- 事件监听器（外部代码）

---

### Step 2: 强化依赖注入

**当前代码**:
```typescript
constructor(
  config: HybridSyncConfig,
  cardApplicationService?: CardApplicationServiceLike  // ❌ 可选
) {
  this.cardApplicationService = cardApplicationService;
}

// 使用时有 fallback
if (this.cardApplicationService) {
  await this.cardApplicationService.batchCreateCardsWithoutEvents([fsrsCard]);
} else {
  this.storage.setCard(fsrsCard);  // ❌ fallback
}
```

**目标代码**:
```typescript
constructor(
  config: HybridSyncConfig,
  cardApplicationService: CardApplicationService  // ✅ 必需
) {
  this.cardApplicationService = cardApplicationService;
}

// 直接使用，无 fallback
await this.cardApplicationService.batchCreateCardsWithoutEvents([fsrsCard]);
```

---

### Step 3: 移除 Storage 直接访问

**当前代码**:
```typescript
const localCards = this.storage.getAllCards();
const blacklist = this.storage.getRiffBlacklist();
this.storage.setCard(card);
await this.storage.saveCards();
```

**目标代码**:
```typescript
// 通过 CardApplicationService 访问
const localCards = await this.cardApplicationService.getCards({});
const blacklist = this.getBlacklist();  // 通过配置或专门的服务
// 不直接 setCard，使用 batchCreateCards/batchUpdateCards
```

**挑战**:
- `getRiffBlacklist()` 需要找到替代方案
- `getAllCards()` 需要通过 CardApplicationService

---

### Step 4: 简化职责

**移除的功能**:
1. **重试机制** - 应该在基础设施层（HTTP 客户端）
2. **进度回调** - 通过事件发布
3. **定时器管理** - 由插件主类管理

**保留的功能**:
1. 增量同步逻辑
2. 全量同步逻辑
3. 删除同步逻辑
4. 卡片类型检测

---

## ⚠️ 风险评估

### 高风险点

1. **EventBus 替换**
   - 风险：外部代码依赖 EventEmitter 接口
   - 缓解：保持事件名称和数据结构不变

2. **Storage 访问移除**
   - 风险：`getRiffBlacklist()` 没有替代方案
   - 缓解：暂时保留 Storage 引用，只用于黑名单

3. **Fallback 逻辑移除**
   - 风险：CardApplicationService 未初始化时崩溃
   - 缓解：在插件启动时确保初始化

### 中风险点

1. **重试机制移除**
   - 风险：网络错误时同步失败
   - 缓解：在调用层添加重试

2. **进度回调移除**
   - 风险：UI 无法显示进度
   - 缓解：通过事件发布进度

---

## ✅ 验收标准

- [ ] 移除 EventEmitter 继承
- [ ] 使用 EventBus 发布事件
- [ ] CardApplicationService 改为必需
- [ ] 移除所有 fallback 逻辑
- [ ] 移除大部分 Storage 直接访问
- [ ] 编译成功，无类型错误
- [ ] 功能测试通过（增量同步、全量同步）

---

## 🚀 开始实施

让我们开始迁移...

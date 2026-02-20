# Riff 同步架构审视

## 当前实现的问题

### ❌ 技术负债：破坏封装

**问题代码**：
```typescript
// ❌ 直接访问 UnifiedStorage 的私有字段
const unifiedStorage = this.storage.getUnifiedStorage?.();
(unifiedStorage as any).xiuyuans.set(xiuyuan.id, xiuyuan);
```

**问题分析**：
1. **破坏封装性**：直接访问私有字段 `xiuyuans`
2. **绕过业务逻辑**：没有通过 UnifiedStorageManager 的公共 API
3. **缺少索引更新**：没有触发索引重建
4. **缺少保存调度**：没有触发自动保存

### ❌ 架构问题：缺少 Repository 层

**当前依赖**：
```typescript
constructor(
    config: HybridSyncConfig,
    cardApplicationService: CardApplicationServiceLike,
    eventBus: EventBus
) {
    // ❌ 没有 XiuyuanRepository
}
```

**问题**：
- `XiuyuanSyncService` 应该通过 `XiuyuanRepository` 保存 Xiuyuan
- 而不是直接操作 UnifiedStorage

## 正确的 DDD 架构

### 方案 A：注入 XiuyuanRepository（推荐）✅

**修改构造函数**：
```typescript
import { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';

constructor(
    config: HybridSyncConfig,
    cardApplicationService: CardApplicationServiceLike,
    eventBus: EventBus,
    xiuyuanRepository: IXiuyuanRepository  // ✅ 注入 Repository
) {
    this.xiuyuanRepository = xiuyuanRepository;
}
```

**保存 Xiuyuan**：
```typescript
// ✅ 通过 Repository 保存（符合 DDD）
const { xiuyuan, card } = await this.convertRiffCardToFSRSCard(riffCard);

// 1. 将 IXiuyuan 转换为 Xiuyuan 领域实体
const xiuyuanEntity = Xiuyuan.reconstitute({
    id: XiuyuanId.create(xiuyuan.id).value,
    blockIDs: xiuyuan.blockIDs.map(id => BlockId.create(id).value),
    templateID: TemplateId.create(xiuyuan.templateID).value,
    // ... 其他字段
});

// 2. 通过 Repository 保存
await this.xiuyuanRepository.save(xiuyuanEntity);

// 3. 卡片会自动保存（因为在 Xiuyuan 内部）
```

**优点**：
- 符合 DDD 分层架构
- 通过 Repository 统一管理持久化
- 自动触发索引更新和保存调度
- 保持封装性

**缺点**：
- 需要修改构造函数签名
- 需要更新所有创建 XiuyuanSyncService 的地方

### 方案 B：使用 UnifiedStorageManager 的公共 API

**添加公共方法**：
```typescript
// UnifiedStorageManager.ts
/**
 * 保存 Xiuyuan（公共 API）
 * 
 * @param xiuyuan Xiuyuan 数据
 */
saveXiuyuan(xiuyuan: IXiuyuan): void {
    // 1. 保存到 Map
    this.xiuyuans.set(xiuyuan.id, xiuyuan);
    
    // 2. 更新索引（如果需要）
    // ...
    
    // 3. 标记为脏并调度保存
    this.dirty = true;
    this.scheduleSave();
}
```

**使用**：
```typescript
// ✅ 通过公共 API 保存
const unifiedStorage = this.storage.getUnifiedStorage();
if (unifiedStorage) {
    unifiedStorage.saveXiuyuan(xiuyuan);
}
```

**优点**：
- 不需要修改构造函数
- 保持封装性
- 触发保存调度

**缺点**：
- 仍然绕过了 Repository 层
- 不完全符合 DDD 架构

### 方案 C：临时方案 - 使用 createCard

**利用现有 API**：
```typescript
// ✅ 使用 UnifiedStorageManager.createCard()
const { xiuyuan, card } = await this.convertRiffCardToFSRSCard(riffCard);

const unifiedStorage = this.storage.getUnifiedStorage();
if (unifiedStorage) {
    // createCard 会自动保存 xiuyuan（如果不存在）
    await unifiedStorage.createCard(xiuyuan, card);
}
```

**优点**：
- 使用现有公共 API
- 自动处理 Xiuyuan 和 Card
- 触发索引更新和保存

**缺点**：
- 如果 Xiuyuan 已存在会失败
- 需要额外的存在性检查

## 推荐方案（长期架构）

### ✅ 方案 A：注入 XiuyuanRepository（立即实施）

**架构优势**：
- 完全符合 DDD 分层架构
- 通过 Repository 统一管理持久化
- 更好的可测试性（可 Mock Repository）
- 更清晰的职责划分
- 自动触发索引更新和保存调度

**实施步骤**：

#### 1. 修改 XiuyuanSyncService 构造函数

```typescript
import { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';

constructor(
    config: HybridSyncConfig,
    cardApplicationService: CardApplicationServiceLike,
    eventBus: EventBus,
    xiuyuanRepository: IXiuyuanRepository  // ✅ 注入 Repository
) {
    this.config = { ...config, retry: config.retry || this.DEFAULT_RETRY_CONFIG };
    this.storage = config.storage;
    this.riffBlacklistService = config.riffBlacklistService || null;
    this.cardApplicationService = cardApplicationService;
    this.eventBus = eventBus;
    this.xiuyuanRepository = xiuyuanRepository;  // ✅ 保存引用
}
```

#### 2. 修改 convertRiffCardToFSRSCard 方法

```typescript
private async convertRiffCardToFSRSCard(riffBlock: RiffBlock): Promise<{
    xiuyuanEntity: Xiuyuan;  // ✅ 返回领域实体，而不是 IXiuyuan
    card: FSRSCard;
}> {
    // ... 现有逻辑 ...
    
    // ✅ 创建 Xiuyuan 领域实体（而不是 IXiuyuan）
    const xiuyuanEntity = Xiuyuan.create({
        id: XiuyuanId.create(xiuyuanId).value,
        blockIDs: [BlockId.create(riffBlock.id).value],
        templateID: TemplateId.create('builtin-riff-sync').value,
        faces: [CardFace.create({
            question: '',
            answer: '',
            questionBlockId: riffBlock.id,
            answerBlockId: riffBlock.id
        }).value],
        priority: Priority.create(priority).value,
        meta: { schedulerType: 'fsrs-v6' }
    }).value;
    
    // ✅ 通过 Xiuyuan 聚合根创建 Card
    const cardEntity = xiuyuanEntity.createCard(0);  // faceIndex = 0
    
    // ✅ 更新 Card 的 FSRS 数据
    cardEntity.updateScheduleInfo({
        due: parseValidDate(riffCard?.due) || now,
        stability: riffCard?.stability || 0,
        difficulty: riffCard?.difficulty || 0,
        // ... 其他字段
    });
    
    return { xiuyuanEntity, card };
}
```

#### 3. 修改同步逻辑（使用 Repository）

```typescript
// 增量同步
for (const riffCard of filtered) {
    const result = await this.cardApplicationService.getCard({ cardId: riffCard.id });
    const localCard = result.card;
    
    if (!localCard) {
        // ✅ 通过 Repository 保存（符合 DDD）
        const { xiuyuanEntity, card } = await this.convertRiffCardToFSRSCard(riffCard);
        
        // Repository 会自动处理：
        // 1. 领域实体 → 持久化模型转换
        // 2. 保存到 UnifiedStorage
        // 3. 更新索引
        // 4. 调度保存
        await this.xiuyuanRepository.save(xiuyuanEntity);
        
        addedCount++;
    } else {
        // 更新逻辑保持不变
        // ...
    }
}
```

#### 4. 更新所有创建 XiuyuanSyncService 的地方

```typescript
// 在插件主类或依赖注入容器中
const xiuyuanRepository = new XiuyuanRepository(
    context.getStorage(),  // UnifiedStorageManager
    context.getPlugin()
);

const xiuyuanSyncService = new XiuyuanSyncService(
    config,
    cardApplicationService,
    eventBus,
    xiuyuanRepository  // ✅ 注入 Repository
);
```

### ⚠️ 方案 C（临时方案，不推荐长期使用）

如果暂时无法修改构造函数，可以继续使用当前的临时方案：

```typescript
const unifiedStorage = this.storage.getUnifiedStorage();
if (unifiedStorage) {
    const existingXiuyuan = unifiedStorage.getXiuYuan(xiuyuan.id);
    if (!existingXiuyuan) {
        await unifiedStorage.createCard(xiuyuan, card);
    } else {
        await unifiedStorage.updateCard(card);
    }
}
```

**缺点**：
- 绕过了 Repository 层
- 不完全符合 DDD 架构
- 需要手动处理存在性检查
- 技术债务会累积

## 实施计划（长期架构）

### 阶段 1：准备工作（1-2 小时）

1. **确认 XiuyuanRepository 接口**
   - 检查 `IXiuyuanRepository` 是否已定义
   - 确认 `save()` 方法签名
   - 确认 Repository 实现类

2. **确认 Xiuyuan 领域实体**
   - 检查 `Xiuyuan.create()` 工厂方法
   - 检查 `xiuyuan.createCard()` 方法
   - 确认值对象（XiuyuanId, BlockId, TemplateId 等）

### 阶段 2：修改 XiuyuanSyncService（2-3 小时）

1. **修改构造函数**
   - 添加 `xiuyuanRepository: IXiuyuanRepository` 参数
   - 保存 Repository 引用

2. **重构 convertRiffCardToFSRSCard**
   - 返回 `Xiuyuan` 领域实体（而不是 `IXiuyuan`）
   - 使用 `Xiuyuan.create()` 创建聚合根
   - 使用 `xiuyuan.createCard()` 创建卡片

3. **修改同步逻辑**
   - `incrementalSync()`: 使用 `xiuyuanRepository.save()`
   - `fullSync()`: 使用 `xiuyuanRepository.save()`
   - 移除直接访问 `UnifiedStorage` 的代码

### 阶段 3：更新依赖注入（1 小时）

1. **找到所有创建 XiuyuanSyncService 的地方**
   ```bash
   # 搜索实例化代码
   grep -r "new XiuyuanSyncService" src/
   ```

2. **注入 XiuyuanRepository**
   ```typescript
   const xiuyuanRepository = new XiuyuanRepository(
       context.getStorage(),
       context.getPlugin()
   );
   
   const xiuyuanSyncService = new XiuyuanSyncService(
       config,
       cardApplicationService,
       eventBus,
       xiuyuanRepository
   );
   ```

### 阶段 4：测试（2-3 小时）

1. **单元测试**
   - Mock XiuyuanRepository
   - 测试 `incrementalSync()`
   - 测试 `fullSync()`

2. **集成测试**
   - 测试从 Riff 同步新卡片
   - 测试更新已有卡片
   - 测试删除卡片

3. **手动测试**
   - 创建测试卡片
   - 验证 Xiuyuan 和 Card 都被正确保存
   - 验证索引更新
   - 验证块属性设置

### 预计总时间：6-9 小时

## 总结

### 当前状态
当前实现使用了**临时方案（方案 C）**：
- ✅ 使用公共 API（`createCard`, `updateCard`）
- ✅ 保持了封装性
- ⚠️ 绕过了 Repository 层
- ⚠️ 不完全符合 DDD 架构

### 长期目标
实施**方案 A（注入 XiuyuanRepository）**：
- ✅ 完全符合 DDD 分层架构
- ✅ 通过 Repository 统一管理持久化
- ✅ 更好的可测试性
- ✅ 更清晰的职责划分
- ✅ 自动触发索引更新和保存

### 架构原则
1. **聚合根**：所有卡片必须属于 Xiuyuan 聚合根
2. **Repository 模式**：通过 Repository 管理持久化
3. **领域模型与持久化模型分离**：Xiuyuan Entity ↔ IXiuyuan DTO
4. **封装性**：不直接访问私有字段或绕过公共 API
5. **事务边界**：Xiuyuan 是事务的边界

### 行动建议
**立即开始实施方案 A**，按照上述 4 个阶段逐步重构，预计 1-2 天完成。

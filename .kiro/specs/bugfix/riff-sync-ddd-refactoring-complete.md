# Riff 同步 DDD 架构重构完成

## 概述

成功将 `XiuyuanSyncService` 重构为完全符合 DDD 架构的实现，通过注入 `XiuyuanRepository` 来管理 Xiuyuan 聚合根的持久化。

## 实施内容

### 1. 修改 XiuyuanSyncService 构造函数

**文件**: `src/application/services/XiuyuanSyncService.ts`

**变更**:
```typescript
// ✅ 新增：注入 XiuyuanRepository
constructor(
    config: HybridSyncConfig,
    cardApplicationService: CardApplicationServiceLike,
    eventBus: EventBus,
    xiuyuanRepository: IXiuyuanRepository  // ✅ 新增参数
) {
    // ...
    this.xiuyuanRepository = xiuyuanRepository;
}
```

**新增导入**:
```typescript
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import { Xiuyuan } from '@/core/xiuyuan/domain/Xiuyuan';
import { XiuyuanId } from '@/core/xiuyuan/domain/XiuyuanId';
import { BlockId } from '@/core/xiuyuan/domain/BlockId';
import { TemplateId } from '@/core/xiuyuan/domain/TemplateId';
import { CardFace } from '@/core/xiuyuan/domain/CardFace';
import { Priority } from '@/core/xiuyuan/domain/Priority';
```

### 2. 重构 convertRiffCardToFSRSCard 方法

**变更**: 返回 Xiuyuan 领域实体而不是 IXiuyuan DTO

**之前**:
```typescript
private async convertRiffCardToFSRSCard(riffBlock: RiffBlock): Promise<{
    xiuyuan: IXiuyuan;  // ❌ DTO
    card: FSRSCard;
}>
```

**之后**:
```typescript
private async convertRiffCardToFSRSCard(riffBlock: RiffBlock): Promise<{
    xiuyuanEntity: Xiuyuan;  // ✅ 领域实体
    card: FSRSCard;
}>
```

**实现细节**:
1. 创建值对象（XiuyuanId, BlockId, TemplateId, Priority, CardFace）
2. 使用 `Xiuyuan.create()` 工厂方法创建聚合根
3. 返回领域实体而不是持久化模型

### 3. 修改同步逻辑使用 Repository

#### incrementalSync 方法

**之前**:
```typescript
// ❌ 直接访问 UnifiedStorage
const unifiedStorage = this.storage.getUnifiedStorage?.();
if (unifiedStorage) {
    await unifiedStorage.createCard(xiuyuan, card);
}
```

**之后**:
```typescript
// ✅ 通过 Repository 保存
const { xiuyuanEntity, card } = await this.convertRiffCardToFSRSCard(riffCard);
const saveResult = await this.xiuyuanRepository.save(xiuyuanEntity);
if (!saveResult.ok) {
    console.error(`Failed to save Xiuyuan: ${errorMsg}`);
    continue;
}
```

#### fullSync 方法

**之前**:
```typescript
// ❌ 批量操作 UnifiedStorage
const xiuyuansToAdd: IXiuyuan[] = [];
const cardsToAdd: FSRSCard[] = [];
// ... 收集数据
for (let i = 0; i < xiuyuansToAdd.length; i++) {
    await unifiedStorage.createCard(xiuyuansToAdd[i], cardsToAdd[i]);
}
```

**之后**:
```typescript
// ✅ 逐个通过 Repository 保存
for (const riffCard of riffCards) {
    const { xiuyuanEntity, card } = await this.convertRiffCardToFSRSCard(riffCard);
    const saveResult = await this.xiuyuanRepository.save(xiuyuanEntity);
    if (saveResult.ok) {
        addedCount++;
    }
}
```

### 4. 更新 ApplicationContext 依赖注入

**文件**: `src/application/ApplicationContext.ts`

**变更**:
```typescript
// 14. 初始化 HybridSyncService
if (riffConfig) {
    const cardService = context.getCardService();
    const eventBus = context.getEventBus();
    
    // ✅ 创建 XiuyuanRepository
    const xiuyuanRepository = new XiuyuanRepository(unifiedStorageManager);
    
    // 创建 HybridSyncService
    hybridSyncService = new HybridSyncService(
        { /* config */ },
        cardService,
        eventBus,
        xiuyuanRepository  // ✅ 注入 Repository
    );
    
    console.log('[ApplicationContext] ✅ HybridSyncService initialized with XiuyuanRepository');
}
```

### 5. 修复 CardApplicationServiceLike 接口

**新增方法**:
```typescript
interface CardApplicationServiceLike {
    getCard(query: { cardId: string }): Promise<{ card: FSRSCard | null }>;  // ✅ 新增
    batchCreateCardsWithoutEvents(cards: any[]): Promise<...>;
    batchUpdateCardsWithoutEvents(cards: any[]): Promise<...>;
    batchDeleteCards(cardIds: string[]): Promise<...>;
    saveCards(): Promise<void>;
}
```

## 架构优势

### 1. 完全符合 DDD 分层架构

```
应用层 (XiuyuanSyncService)
    ↓ 依赖
领域层 (IXiuyuanRepository 接口)
    ↓ 实现
基础设施层 (XiuyuanRepository 实现)
    ↓ 使用
持久化层 (UnifiedStorageManager)
```

### 2. 职责清晰

- **XiuyuanSyncService**: 负责同步业务逻辑
- **XiuyuanRepository**: 负责领域模型与持久化模型的转换
- **UnifiedStorageManager**: 负责底层存储

### 3. 更好的可测试性

```typescript
// 可以轻松 Mock Repository
const mockRepository: IXiuyuanRepository = {
    save: vi.fn().mockResolvedValue(ok(undefined)),
    findById: vi.fn(),
    // ...
};

const syncService = new XiuyuanSyncService(
    config,
    cardService,
    eventBus,
    mockRepository  // ✅ 注入 Mock
);
```

### 4. 自动触发索引更新和保存

Repository 的 `save()` 方法会自动：
1. 转换领域模型为持久化模型
2. 保存到 UnifiedStorage
3. 更新内存索引
4. 调度防抖保存
5. 写入块属性
6. 发布领域事件

### 5. 消除技术债务

- ❌ 不再直接访问私有字段
- ❌ 不再绕过 Repository 层
- ❌ 不再破坏封装性
- ✅ 完全符合 DDD 原则

## 编译状态

### 错误: 0
所有类型错误已修复。

### 警告: 25
主要是未使用的变量和方法（TODO 方法），不影响功能：
- `syncRiffCardToLocal` (未使用的私有方法)
- `rebuildXiuyuanFromBlock` (TODO 方法)
- `getXiuyuanBlockIDs` (TODO 方法)
- `rebuildFieldMapping` (TODO 方法)
- `updateXiuyuanReviewData` (TODO 方法)

这些方法是为未来的跨设备同步功能预留的，可以保留。

## 运行时问题修复

### 问题：CardFace 验证失败

**错误信息**:
```
Error: Failed to create CardFace: Question cannot be empty
```

**原因**:
`CardFace.create()` 要求 question 不能为空，但我们为 Riff 卡片创建的 CardFace 使用了空字符串。

**修复**:
```typescript
// ❌ 之前：使用空字符串
const cardFaceResult = CardFace.create({
    question: '',  // 验证失败！
    answer: '',
    questionBlockId: riffBlock.id,
    answerBlockId: riffBlock.id
});

// ✅ 之后：使用块内容
const cardFaceResult = CardFace.create({
    question: riffBlock.content || `Block ${riffBlock.id}`,  // 使用块内容
    answer: '',
    questionBlockId: riffBlock.id,
    answerBlockId: riffBlock.id
});
```

**说明**:
- Riff 卡片的内容存储在 `riffBlock.content` 中
- 如果 content 为空（极少情况），使用 blockId 作为后备
- 这样既满足了 CardFace 的验证要求，又保留了卡片的实际内容

## 测试建议

### 1. 单元测试

```typescript
describe('XiuyuanSyncService with Repository', () => {
    it('should save Xiuyuan through Repository', async () => {
        const mockRepository = {
            save: vi.fn().mockResolvedValue(ok(undefined))
        };
        
        const service = new XiuyuanSyncService(
            config,
            cardService,
            eventBus,
            mockRepository
        );
        
        await service.incrementalSync();
        
        expect(mockRepository.save).toHaveBeenCalled();
    });
});
```

### 2. 集成测试

1. 测试从 Riff 同步新卡片
2. 验证 Xiuyuan 和 Card 都被正确保存
3. 验证索引更新
4. 验证块属性设置

### 3. 手动测试

1. 在 Riff 中创建新卡片
2. 触发增量同步
3. 检查本地是否创建了 Xiuyuan 和 Card
4. 检查块属性是否正确设置
5. 检查卡片是否可以正常复习

## 后续工作

### 可选优化

1. **批量保存优化**: 
   - 当前是逐个保存，可以实现 `saveMany()` 批量保存
   - 减少 I/O 操作次数

2. **错误处理增强**:
   - 添加更详细的错误日志
   - 实现失败重试机制

3. **性能监控**:
   - 添加保存耗时统计
   - 监控 Repository 调用次数

### 清理工作

1. 移除未使用的 TODO 方法（如果确认不需要）
2. 添加更多注释说明架构设计
3. 更新相关文档

## 总结

成功将 XiuyuanSyncService 重构为完全符合 DDD 架构的实现：

✅ 注入 XiuyuanRepository 依赖  
✅ 返回 Xiuyuan 领域实体  
✅ 通过 Repository 管理持久化  
✅ 消除技术债务  
✅ 提高可测试性  
✅ 保持封装性  

重构完成，代码质量显著提升！

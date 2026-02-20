# Phase 4: XiuyuanSyncService DDD 架构分析

## 当前架构问题

### 1. 直接操作基础设施层

**问题代码位置**：

#### 1.1 直接调用 `setBlockAttrs` 和 `getBlockAttrs`
```typescript
// src/application/services/XiuyuanSyncService.ts

// ❌ 第 259-273 行：直接调用 getBlockAttrs
const attrs = await getBlockAttrs(riffCard.id);
const xiuyuanID = attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'];

// ❌ 第 869-890 行：直接调用 getBlockAttrs 和 setBlockAttrs
const attrs = await getBlockAttrs(card.id);
const cardTypeMarkerAttr = riffBlock.ial?.['custom-fsrs-card-type'];
await setBlockAttrs(card.id, {
    [ATTR_CARD_TYPE]: cardType,
});
```

**违反原则**：
- 应用服务不应该直接操作基础设施（块属性）
- 应该通过 Repository 或领域服务处理

#### 1.2 直接使用 `UnifiedStorageManager`
```typescript
// ❌ 第 234 行：直接调用 getAllCards
const localCards = this.unifiedStorage.getAllCards();

// ❌ 第 245 行：直接调用 getCard
const localCard = this.unifiedStorage.getCard(riffCard.id);

// ❌ 第 791 行：直接调用 getRiffBlacklist
const blacklist = (this.unifiedStorage as any).getRiffBlacklist?.() || new Set();
```

**违反原则**：
- 应用服务应该通过 Repository 查询数据
- 不应该直接访问存储层

#### 1.3 直接使用 `CardApplicationService`
```typescript
// ⚠️ 第 245 行：通过 CardApplicationService 查询
const result = await this.cardApplicationService.getCard({ cardId: riffCard.id });

// ⚠️ 第 280 行：通过 CardApplicationService 保存
await this.cardApplicationService.batchCreateCardsWithoutEvents([xiuyuanEntity]);
```

**问题**：
- `CardApplicationService` 是应用服务，不应该被另一个应用服务调用
- 应该直接使用 Repository

### 2. 混合使用多种数据访问方式

**问题**：
- 有时用 `UnifiedStorageManager`
- 有时用 `CardApplicationService`
- 有时用 `XiuyuanRepository`
- 缺乏统一的数据访问策略

### 3. 块属性操作分散

**问题**：
- 检查块属性：`getBlockAttrs`
- 写入块属性：`setBlockAttrs`
- 应该统一通过 Repository 处理

## DDD 架构改进方案

### 方案 1：完全符合 DDD（推荐）

#### 架构分层

```
XiuyuanSyncService (应用服务)
    ↓
XiuyuanRepository (仓储)
    ↓
Xiuyuan (聚合根)
    ↓
Card (实体)
```

#### 改进点

1. **移除直接的块属性操作**
   - 所有块属性操作通过 `XiuyuanRepository.save()` 完成
   - `XiuyuanRepository` 已经实现了块属性写入（第 127-145 行）

2. **统一使用 Repository**
   - 查询：`xiuyuanRepository.findById()`, `xiuyuanRepository.findAll()`
   - 保存：`xiuyuanRepository.save()`
   - 删除：`xiuyuanRepository.delete()`

3. **移除对 CardApplicationService 的依赖**
   - 直接使用 `XiuyuanRepository`
   - `XiuyuanRepository.save()` 会自动保存关联的 Card

4. **移除对 UnifiedStorageManager 的直接访问**
   - 通过 Repository 查询数据
   - Repository 内部使用 Storage

#### 具体改进

##### 改进 1：移除块属性检查，使用 Repository 查询

```typescript
// ❌ 旧方式
const attrs = await getBlockAttrs(riffCard.id);
const xiuyuanID = attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'];

if (xiuyuanID) {
    console.log(`Skipping ${riffCard.id}: block already has Xiuyuan ID ${xiuyuanID}`);
    skippedCount++;
    continue;
}

// ✅ 新方式
const xiuyuanIdStr = `xy_riff_${riffCard.id}`;
const existingXiuyuan = await this.xiuyuanRepository.findById(xiuyuanIdStr);

if (existingXiuyuan.ok && existingXiuyuan.value) {
    console.log(`Skipping ${riffCard.id}: Xiuyuan already exists ${xiuyuanIdStr}`);
    skippedCount++;
    continue;
}
```

##### 改进 2：移除 CardApplicationService，使用 Repository

```typescript
// ❌ 旧方式
const result = await this.cardApplicationService.getCard({ cardId: riffCard.id });
const localCard = result.card;

if (!localCard) {
    const { xiuyuanEntity } = await this.convertRiffCardToFSRSCard(riffCard);
    const saveResult = await this.xiuyuanRepository.save(xiuyuanEntity);
}

// ✅ 新方式（已经是正确的）
const xiuyuanIdStr = `xy_riff_${riffCard.id}`;
const existingXiuyuan = await this.xiuyuanRepository.findById(xiuyuanIdStr);

if (!existingXiuyuan.ok || !existingXiuyuan.value) {
    const { xiuyuanEntity } = await this.convertRiffCardToFSRSCard(riffCard);
    const saveResult = await this.xiuyuanRepository.save(xiuyuanEntity);
}
```

##### 改进 3：移除 UnifiedStorageManager，使用 Repository

```typescript
// ❌ 旧方式
const localCards = this.unifiedStorage.getAllCards();
const riffCardIds = new Set(filtered.map(c => c.id));
const cardsToDelete = localCards.filter(localCard => {
    if (localCard.meta?.xiuyuanID) return false;
    return !riffCardIds.has(localCard.id);
});

// ✅ 新方式
const allXiuyuans = await this.xiuyuanRepository.findAll();
const riffBlockIds = new Set(filtered.map(c => c.id));

const xiuyuansToDelete = allXiuyuans.value.filter(xiuyuan => {
    // 只删除 Riff 同步创建的 Xiuyuan
    if (!xiuyuan.getId().getValue().startsWith('xy_riff_')) return false;
    
    // 检查对应的块是否还在 Riff 中
    const blockId = xiuyuan.getBlockIDs()[0]?.getValue();
    return blockId && !riffBlockIds.has(blockId);
});

for (const xiuyuan of xiuyuansToDelete) {
    await this.xiuyuanRepository.delete(xiuyuan.getId());
}
```

##### 改进 4：移除块属性操作，依赖 Repository

```typescript
// ❌ 旧方式
const attrs = await getBlockAttrs(card.id);
const cardTypeMarkerAttr = riffBlock.ial?.['custom-fsrs-card-type'];

await setBlockAttrs(card.id, {
    [ATTR_CARD_TYPE]: cardType,
});

// ✅ 新方式
// 块属性由 XiuyuanRepository.save() 自动处理
// 不需要手动调用 setBlockAttrs
```

### 方案 2：渐进式改进（过渡方案）

如果完全重构工作量太大，可以分步进行：

#### Step 1：添加 Repository 查询方法
- 在 `XiuyuanRepository` 中添加 `findByBlockId()` 方法
- 在 `XiuyuanRepository` 中添加 `findAll()` 方法

#### Step 2：替换 UnifiedStorageManager 调用
- 将 `unifiedStorage.getAllCards()` 替换为 `xiuyuanRepository.findAll()`
- 将 `unifiedStorage.getCard()` 替换为 `xiuyuanRepository.findById()`

#### Step 3：移除 CardApplicationService 依赖
- 直接使用 `XiuyuanRepository`

#### Step 4：移除块属性操作
- 依赖 `XiuyuanRepository.save()` 自动处理

## 需要添加的 Repository 方法

### 1. findById
```typescript
/**
 * 根据 ID 查找 Xiuyuan
 * 
 * @param id - Xiuyuan ID
 * @returns Result<Xiuyuan | null>
 */
async findById(id: XiuyuanId): Promise<Result<Xiuyuan | null>>
```

### 2. findAll
```typescript
/**
 * 查找所有 Xiuyuan
 * 
 * @returns Result<Xiuyuan[]>
 */
async findAll(): Promise<Result<Xiuyuan[]>>
```

### 3. findByBlockId
```typescript
/**
 * 根据块 ID 查找 Xiuyuan
 * 
 * @param blockId - 块 ID
 * @returns Result<Xiuyuan[]>
 */
async findByBlockId(blockId: BlockId): Promise<Result<Xiuyuan[]>>
```

### 4. delete
```typescript
/**
 * 删除 Xiuyuan
 * 
 * @param id - Xiuyuan ID
 * @returns Result<void>
 */
async delete(id: XiuyuanId): Promise<Result<void>>
```

## 实施计划

### Phase 4.1：添加 Repository 方法 ✅
- [ ] 在 `IXiuyuanRepository` 接口中添加方法签名
- [ ] 在 `XiuyuanRepository` 中实现方法

### Phase 4.2：重构 XiuyuanSyncService
- [ ] 移除 `UnifiedStorageManager` 依赖
- [ ] 移除 `CardApplicationService` 依赖
- [ ] 使用 `XiuyuanRepository` 统一数据访问
- [ ] 移除直接的块属性操作

### Phase 4.3：测试和验证
- [ ] 单元测试
- [ ] 集成测试
- [ ] 回归测试

## 预期效果

### 1. 符合 DDD 架构
- ✅ 应用服务只协调用例
- ✅ 数据访问通过 Repository
- ✅ 块属性操作封装在 Repository

### 2. 代码更清晰
- ✅ 统一的数据访问方式
- ✅ 减少重复代码
- ✅ 更容易测试

### 3. 更好的可维护性
- ✅ 修改块属性逻辑只需要改 Repository
- ✅ 修改查询逻辑只需要改 Repository
- ✅ 应用服务专注于业务流程

## 风险评估

### 低风险
- 添加 Repository 方法（不影响现有代码）

### 中风险
- 重构 XiuyuanSyncService（需要仔细测试）

### 高风险
- 移除 CardApplicationService 依赖（可能影响其他服务）

## 建议

1. **先实施 Phase 4.1**：添加 Repository 方法
2. **然后实施 Phase 4.2**：逐步重构 XiuyuanSyncService
3. **每个改动都要测试**：确保功能正常
4. **保持向后兼容**：暂时保留旧代码，标记为 `@deprecated`

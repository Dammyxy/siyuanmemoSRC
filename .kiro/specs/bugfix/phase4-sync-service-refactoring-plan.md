# Phase 4.2: XiuyuanSyncService 重构计划

## 重构目标

将 `XiuyuanSyncService` 从混合架构重构为完全符合 DDD 的架构。

## 当前依赖

```typescript
export class XiuyuanSyncService {
    private unifiedStorage: UnifiedStorageManager;  // ❌ 直接访问存储层
    private cardApplicationService: CardApplicationServiceLike;  // ❌ 应用服务调用应用服务
    private xiuyuanRepository: IXiuyuanRepository;  // ✅ 正确的依赖
    private eventBus: EventBus;  // ✅ 正确的依赖
}
```

## 目标依赖

```typescript
export class XiuyuanSyncService {
    private xiuyuanRepository: IXiuyuanRepository;  // ✅ 唯一的数据访问方式
    private eventBus: EventBus;  // ✅ 事件发布
    // 移除 unifiedStorage
    // 移除 cardApplicationService
}
```

## 重构步骤

### Step 1: 移除 UnifiedStorageManager 的使用

#### 1.1 替换 `getAllCards()` 调用

**位置**: 第 234 行, 第 245 行, 第 519 行

```typescript
// ❌ 旧代码
const localCards = this.unifiedStorage.getAllCards();
const existingCardWithSameBlock = this.unifiedStorage.getAllCards()
    .find(c => c.blockId === riffCard.id);

// ✅ 新代码
const allXiuyuansResult = await this.xiuyuanRepository.findAll();
if (!allXiuyuansResult.ok) {
    console.error('[XiuyuanSyncService] Failed to get all Xiuyuans:', allXiuyuansResult.error);
    return;
}

// 检查是否已存在相同 blockId 的 Xiuyuan
const existingXiuyuan = allXiuyuansResult.value.find(xiuyuan => {
    const blockIds = xiuyuan.getBlockIDs();
    return blockIds.some(blockId => blockId.getValue() === riffCard.id);
});
```

#### 1.2 替换 `getRiffBlacklist()` 调用

**位置**: 第 234 行, 第 791 行

```typescript
// ❌ 旧代码
const blacklist = (this.unifiedStorage as any).getRiffBlacklist?.() || new Set();

// ✅ 新代码
// 黑名单功能应该移到专门的服务或 Repository
// 暂时保留，但添加 TODO 注释
// TODO: Phase 4.3 - 将黑名单功能移到 RiffBlacklistService
```

### Step 2: 移除 CardApplicationService 的使用

#### 2.1 替换 `getCard()` 调用

**位置**: 第 245 行, 第 519 行

```typescript
// ❌ 旧代码
const result = await this.cardApplicationService.getCard({ cardId: riffCard.id });
const localCard = result.card;

// ✅ 新代码
const xiuyuanIdStr = `xy_riff_${riffCard.id}`;
const xiuyuanIdResult = XiuyuanId.create(xiuyuanIdStr);
if (!xiuyuanIdResult.ok) {
    console.error('[XiuyuanSyncService] Invalid Xiuyuan ID:', xiuyuanIdStr);
    continue;
}

const existingXiuyuanResult = await this.xiuyuanRepository.findById(xiuyuanIdResult.value);
if (!existingXiuyuanResult.ok) {
    console.error('[XiuyuanSyncService] Failed to find Xiuyuan:', existingXiuyuanResult.error);
    continue;
}

const existingXiuyuan = existingXiuyuanResult.value;
```

#### 2.2 替换 `batchUpdateCardsWithoutEvents()` 调用

**位置**: 第 280-350 行

```typescript
// ❌ 旧代码
localCard.priority = newPriority;
localCard.updatedAt = Date.now();
await this.cardApplicationService.batchUpdateCardsWithoutEvents([localCard]);

// ✅ 新代码
// 更新 Xiuyuan 的优先级
const priorityResult = Priority.create(newPriority);
if (priorityResult.ok) {
    xiuyuan.updatePriority(priorityResult.value);
    await this.xiuyuanRepository.save(xiuyuan);
}
```

#### 2.3 替换 `batchDeleteCards()` 调用

**位置**: 第 380-390 行

```typescript
// ❌ 旧代码
const cardIds = cardsToDelete.map(c => c.id);
const result = await this.cardApplicationService.batchDeleteCards(cardIds);

// ✅ 新代码
const xiuyuansToDelete = /* 找到要删除的 Xiuyuan */;
for (const xiuyuan of xiuyuansToDelete) {
    await this.xiuyuanRepository.delete(xiuyuan);
}
```

#### 2.4 替换 `saveCards()` 调用

**位置**: 第 400 行, 第 600 行

```typescript
// ❌ 旧代码
await this.cardApplicationService.saveCards();

// ✅ 新代码
// Repository.save() 已经自动保存，不需要额外调用
// 移除这行代码
```

### Step 3: 移除块属性操作

#### 3.1 移除 `getBlockAttrs()` 调用

**位置**: 第 259-273 行

```typescript
// ❌ 旧代码
const attrs = await getBlockAttrs(riffCard.id);
const xiuyuanID = attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'];

if (xiuyuanID) {
    console.log(`Skipping ${riffCard.id}: block already has Xiuyuan ID ${xiuyuanID}`);
    skippedCount++;
    continue;
}

// ✅ 新代码
// 通过 Repository 查询，不需要检查块属性
const xiuyuanIdStr = `xy_riff_${riffCard.id}`;
const xiuyuanIdResult = XiuyuanId.create(xiuyuanIdStr);
if (!xiuyuanIdResult.ok) continue;

const existingXiuyuanResult = await this.xiuyuanRepository.findById(xiuyuanIdResult.value);
if (existingXiuyuanResult.ok && existingXiuyuanResult.value) {
    console.log(`Skipping ${riffCard.id}: Xiuyuan already exists`);
    skippedCount++;
    continue;
}
```

#### 3.2 移除 `setBlockAttrs()` 调用

**位置**: 第 869-890 行

```typescript
// ❌ 旧代码
await setBlockAttrs(card.id, {
    [ATTR_CARD_TYPE]: cardType,
});

// ✅ 新代码
// 块属性由 XiuyuanRepository.save() 自动处理
// 不需要手动调用 setBlockAttrs
// 移除这段代码
```

### Step 4: 更新构造函数

```typescript
// ❌ 旧构造函数
constructor(
    config: HybridSyncConfig,
    cardApplicationService: CardApplicationServiceLike,
    eventBus: EventBus,
    xiuyuanRepository: IXiuyuanRepository,
    unifiedStorage: UnifiedStorageManager
) {
    this.unifiedStorage = unifiedStorage;
    this.cardApplicationService = cardApplicationService;
    this.xiuyuanRepository = xiuyuanRepository;
    this.eventBus = eventBus;
}

// ✅ 新构造函数
constructor(
    config: HybridSyncConfig,
    xiuyuanRepository: IXiuyuanRepository,
    eventBus: EventBus
) {
    this.config = {
        ...config,
        retry: config.retry || this.DEFAULT_RETRY_CONFIG
    };
    this.xiuyuanRepository = xiuyuanRepository;
    this.eventBus = eventBus;
}
```

## 重构优先级

### 高优先级（必须完成）
1. ✅ 移除 `CardApplicationService` 依赖
2. ✅ 移除 `UnifiedStorageManager` 依赖
3. ✅ 移除块属性操作

### 中优先级（建议完成）
4. ⚠️ 重构黑名单功能（移到专门的服务）
5. ⚠️ 重构卡片类型检测（移到领域服务）

### 低优先级（可选）
6. 📝 添加单元测试
7. 📝 添加集成测试

## 风险评估

### 高风险区域
- `incrementalSync()` 方法（核心同步逻辑）
- `fullSync()` 方法（全量同步逻辑）
- `convertRiffCardToFSRSCard()` 方法（数据转换）

### 缓解措施
1. 逐步重构，每次只改一个方法
2. 每次改动后立即测试
3. 保留旧代码作为注释，便于回滚
4. 添加详细的日志

## 测试计划

### 单元测试
- [ ] 测试 `incrementalSync()` 的各种场景
- [ ] 测试 `fullSync()` 的各种场景
- [ ] 测试 `convertRiffCardToFSRSCard()` 的数据转换

### 集成测试
- [ ] 测试 Riff 同步 → 本地创建
- [ ] 测试本地删除 → Riff 删除
- [ ] 测试 Riff 删除 → 本地删除
- [ ] 测试重复创建防护

### 回归测试
- [ ] 测试现有的同步功能
- [ ] 测试跨设备同步
- [ ] 测试黑名单功能

## 实施时间表

### Week 1: 准备和分析
- [x] 创建重构计划
- [x] 分析当前代码
- [x] 识别风险区域

### Week 2: 核心重构
- [ ] 重构 `incrementalSync()`
- [ ] 重构 `fullSync()`
- [ ] 移除 `CardApplicationService` 依赖

### Week 3: 清理和测试
- [ ] 移除 `UnifiedStorageManager` 依赖
- [ ] 移除块属性操作
- [ ] 添加测试

### Week 4: 验证和发布
- [ ] 集成测试
- [ ] 回归测试
- [ ] 文档更新

# 卡片类型数据源分析

## 问题

列表模版卡的类型有两个数据源：
1. **块属性**：`custom-card-type`
2. **卡片数据**：`FSRSCard.type`

这两个数据源可能不一致，导致混乱。

## 数据流分析

### 1. 创建流程

#### 列表模版卡创建（CreateListTemplateCardsUseCase）

```
用户操作：右键列表项 → 创建列表模版卡
    ↓
BlockMenuHandler.createListTemplateCards()
    ↓
CreateListTemplateCardsUseCase.execute()
    ↓
1. 创建 Xiuyuan 聚合根（包含多个 CardFace）
2. 为每个 face 创建 Card 实体
3. XiuyuanRepository.save(xiuyuan)
    ↓
    ├─ 保存到 msgpack（cardDTOs）
    │   └─ cardToFSRSCard() 
    │       └─ 检测类型：meta.listTemplate 存在 → type = 'item' ✅
    │
    └─ 写入块属性
        ├─ 父列表项：custom-card-type = 'item' ✅
        └─ 所有子列表项：custom-card-type = 'item' ✅
```

### 2. 同步流程（XiuyuanSyncService）

#### 增量同步（incrementalSync）

```
插件启动 / 定时触发
    ↓
XiuyuanSyncService.incrementalSync()
    ↓
1. 从 Riff 获取新卡片（getRiffNewCards）
    ↓
2. 对于每张新卡片：
    ├─ 检查是否为 Xiuyuan 卡片（custom-xiuyuan-id 存在？）
    │   ├─ 是 → 跳过（已由 XiuyuanRepository 管理）
    │   └─ 否 → 继续处理
    │
    ├─ RiffMapper.toDomain(riffBlock)
    │   └─ 从块属性读取：custom-card-type → FSRSCard.type ⚠️
    │
    └─ 保存到 storage（cardDTOs）
```

**关键发现**：
- Xiuyuan 卡片（包括列表模版卡）在同步时会被跳过
- 只有非 Xiuyuan 卡片才会通过 RiffMapper 从块属性读取类型

### 3. 读取流程

#### 复习界面（UnifiedReviewAdapter）

```
用户进入复习界面
    ↓
UnifiedReviewAdapter.getNextCard()
    ↓
1. 从 storage 读取卡片（cardDTOs）
    └─ 使用 FSRSCard.type ✅
    
2. 渲染卡片
    └─ 根据 FSRSCard.meta 判断渲染器
        ├─ meta.listTemplate 存在 → XiuyuanListTemplateCard
        ├─ meta.faces 存在 → MultiClozeCardRenderer
        └─ 其他 → 默认渲染器
```

#### 卡片浏览器（BrowserApplicationService）

```
用户打开卡片浏览器
    ↓
GetBrowserCardsQueryHandler.execute()
    ↓
1. 从 storage 读取所有卡片（cardDTOs）
    └─ 使用 FSRSCard.type ✅
    
2. 应用过滤器
    └─ 类型过滤：根据 FSRSCard.type ✅
```

## 数据源优先级

### 当前实现

| 场景 | 数据源 | 优先级 |
|------|--------|--------|
| **创建时** | XiuyuanRepository.cardToFSRSCard() | FSRSCard.type（检测或强制） |
| **同步时** | RiffMapper.toDomain() | 块属性 `custom-card-type` |
| **复习时** | UnifiedReviewAdapter | FSRSCard.type（从 cardDTOs） |
| **浏览时** | GetBrowserCardsQueryHandler | FSRSCard.type（从 cardDTOs） |

### 问题分析

#### ✅ 列表模版卡不会有冲突

**原因**：
1. 列表模版卡有 `custom-xiuyuan-id` 属性
2. 同步时会被识别为 Xiuyuan 卡片并跳过
3. 不会通过 RiffMapper 从块属性读取类型
4. 类型完全由 XiuyuanRepository.cardToFSRSCard() 控制

**数据流**：
```
创建 → XiuyuanRepository.save()
         ├─ cardToFSRSCard(): type = 'item' (强制)
         └─ setBlockAttrs: custom-card-type = 'item'
              ↓
同步 → XiuyuanSyncService.incrementalSync()
         └─ 检测到 custom-xiuyuan-id → 跳过 ✅
              ↓
复习/浏览 → 使用 FSRSCard.type = 'item' ✅
```

#### ⚠️ 普通卡片可能有冲突

**场景**：用户手动修改块属性 `custom-card-type`

**数据流**：
```
创建 → 快速制卡
         ├─ CardTypeDetectionService: type = 'topic'
         └─ setBlockAttrs: custom-card-type = 'topic'
              ↓
用户手动修改块属性 → custom-card-type = 'item'
              ↓
同步 → XiuyuanSyncService.incrementalSync()
         └─ RiffMapper: 从块属性读取 type = 'item' ⚠️
              ↓
复习/浏览 → 使用 FSRSCard.type = 'item' ✅
```

**结论**：普通卡片的类型会跟随块属性变化，这是正确的行为。

## 是否重复？

### 块属性的作用

1. **持久化**：存储在思源笔记的数据库中
2. **可见性**：用户可以在块属性面板中查看和修改
3. **同步源**：作为 Riff 同步的数据源

### 卡片数据的作用

1. **运行时**：插件运行时使用的数据
2. **性能**：快速查询和过滤
3. **索引**：支持按类型、优先级等查询

### 结论：不是重复，而是互补

| 数据源 | 作用 | 优先级 |
|--------|------|--------|
| **块属性** | 持久化、用户可见、同步源 | 低（仅在同步时读取） |
| **卡片数据** | 运行时、性能、索引 | 高（复习和浏览时使用） |

**数据流向**：
```
块属性 (custom-card-type)
    ↓ (同步时读取)
卡片数据 (FSRSCard.type)
    ↓ (复习/浏览时使用)
用户界面
```

## 修复建议

### 当前修复是否正确？

**是的！** 当前修复是正确的：

1. ✅ **XiuyuanRepository.cardToFSRSCard()**：强制列表模版卡类型为 `item`
2. ✅ **XiuyuanRepository.save()**：写入块属性 `custom-card-type = 'item'`

**原因**：
- 列表模版卡不会通过 RiffMapper 同步（因为有 `custom-xiuyuan-id`）
- 块属性只是为了用户可见性和一致性
- 实际使用的是 FSRSCard.type（从 cardDTOs）

### 是否需要额外修改？

**不需要！** 当前修复已经足够：

1. ✅ 卡片数据中的类型正确（`item`）
2. ✅ 块属性中的类型正确（`item`）
3. ✅ 两者保持一致
4. ✅ 不会被同步覆盖（因为有 `custom-xiuyuan-id`）

### 唯一的潜在问题

**场景**：用户手动修改列表模版卡的块属性 `custom-card-type`

**影响**：
- 块属性会变化
- 但卡片数据不会变化（因为不会同步）
- 复习和浏览仍然使用卡片数据中的类型

**解决方案**：
- 不需要特殊处理
- 用户修改块属性是不推荐的操作
- 如果需要，可以在文档中说明

## 总结

### 数据源关系

```
┌─────────────────────────────────────────────────────────┐
│                    思源笔记数据库                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 块属性 (custom-card-type)                         │   │
│  │ - 持久化存储                                      │   │
│  │ - 用户可见                                        │   │
│  │ - 同步源（仅非 Xiuyuan 卡片）                     │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          ↓ (同步时读取)
┌─────────────────────────────────────────────────────────┐
│                  插件内存 (msgpack)                       │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 卡片数据 (FSRSCard.type)                          │   │
│  │ - 运行时数据                                      │   │
│  │ - 快速查询                                        │   │
│  │ - 索引支持                                        │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          ↓ (复习/浏览时使用)
┌─────────────────────────────────────────────────────────┐
│                      用户界面                             │
│  - 复习界面                                              │
│  - 卡片浏览器                                            │
│  - 类型过滤                                              │
└─────────────────────────────────────────────────────────┘
```

### 列表模版卡的特殊性

1. ✅ 有 `custom-xiuyuan-id` 属性
2. ✅ 同步时被跳过（不会从块属性读取类型）
3. ✅ 类型完全由 XiuyuanRepository 控制
4. ✅ 块属性只是为了一致性和用户可见性

### 当前修复的正确性

✅ **完全正确！**

- 卡片数据：`type = 'item'`（强制）
- 块属性：`custom-card-type = 'item'`（写入）
- 两者一致，不会冲突

### 不需要额外修改

- ❌ 不需要移除块属性写入
- ❌ 不需要修改同步逻辑
- ❌ 不需要修改读取逻辑

**原因**：列表模版卡的数据流是独立的，不会与普通卡片的同步流程冲突。

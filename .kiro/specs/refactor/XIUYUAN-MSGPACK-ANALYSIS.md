# xiuyuan.msgpack 文件分析

## 问题

为什么 `xiuyuan.msgpack` 里还存着一份 `xiuyuans`？

## 调查结果

### 1. XiuyuanStorage 的使用情况

通过代码搜索发现：

```bash
# 搜索 XiuyuanStorage 的实例化
grep -r "new XiuyuanStorage" src/
# 结果：无匹配

# 搜索 getXiuyuanStorage 的调用
grep -r "getXiuyuanStorage" src/
# 结果：无匹配

# 搜索 xiuyuanStorage 的使用
grep -r "xiuyuanStorage\." src/
# 结果：无匹配
```

**结论**：`XiuyuanStorage` 和 `xiuyuan.msgpack` **已经不再被实际使用**！

### 2. 旧架构 vs 新架构

#### 旧架构（已废弃）

```
XiuyuanStorage (xiuyuan.msgpack)
├── xiuyuans: { ... }     ← 完整的 Xiuyuan 数据
├── mappings: { ... }     ← CardMapping（已移除）
└── templates: { ... }    ← 卡片模板

XiuyuanService
└── 使用 XiuyuanStorage 管理 Xiuyuan
```

#### 新架构（DDD）

```
UnifiedStorageManager (unified-cards.msgpack)
├── xiuyuans: { ... }     ← Xiuyuan 聚合根（简化版）
├── cardDTOs: { ... }     ← Card 持久化 DTO
└── cards: { ... }        ← 向后兼容

XiuyuanRepository
└── 使用 UnifiedStorageManager 管理 Xiuyuan

模板管理
└── 硬编码在 src/core/xiuyuan/templates/
    ├── builtin.ts
    ├── builtin-concept.ts
    ├── builtin-quick.ts
    └── builtin-symbol.ts
```

### 3. 模板管理的变化

#### 旧方式（XiuyuanStorage）

```typescript
// 从 xiuyuan.msgpack 加载模板
const storage = new XiuyuanStorage(plugin);
await storage.load();
const template = storage.getTemplate('basic');
```

#### 新方式（硬编码）

```typescript
// 直接从代码导入模板
import { BASIC_QA_TEMPLATE, BIDIRECTIONAL_TEMPLATE } from '@/core/xiuyuan/templates';

const template = BASIC_QA_TEMPLATE;
```

**优势**：
- ✅ 不需要持久化模板
- ✅ 模板是代码的一部分，更容易维护
- ✅ 减少 I/O 操作
- ✅ 类型安全

### 4. 数据存储的变化

#### 旧架构

```
两个独立的存储文件：

1. unified-cards.msgpack (UnifiedStorageManager)
   └── cards: { ... }

2. xiuyuan.msgpack (XiuyuanStorage)
   ├── xiuyuans: { ... }     ← 完整的 Xiuyuan 数据
   ├── mappings: { ... }     ← CardMapping
   └── templates: { ... }    ← 卡片模板
```

#### 新架构

```
一个统一的存储文件：

unified-cards.msgpack (UnifiedStorageManager)
├── xiuyuans: { ... }     ← Xiuyuan 聚合根
├── cardDTOs: { ... }     ← Card 持久化 DTO
└── cards: { ... }        ← 向后兼容

模板：硬编码在代码中
```

## 结论

### xiuyuan.msgpack 的状态

**已废弃，不再使用！**

原因：
1. ✅ `XiuyuanStorage` 已被 `UnifiedStorageManager` 替代
2. ✅ `XiuyuanService` 已被 DDD 架构（Repository + UseCase）替代
3. ✅ 模板管理改为硬编码，不再需要持久化
4. ✅ Xiuyuan 数据已迁移到 `unified-cards.msgpack`

### 应该做什么

#### 选项 1：完全删除 xiuyuan.msgpack 相关代码（推荐）

**删除的文件**：
- `src/core/xiuyuan/storage.ts` - XiuyuanStorage 类
- `src/core/xiuyuan/service.ts` - XiuyuanService 类（旧实现）
- `src/core/xiuyuan/listTemplate.ts` - 旧的列表模板实现

**保留的文件**：
- `src/core/xiuyuan/types.ts` - 类型定义（IXiuyuan, ICardTemplate）
- `src/core/xiuyuan/templates/` - 模板定义（硬编码）
- `src/core/xiuyuan/domain/` - DDD 领域层
- `src/core/xiuyuan/infrastructure/` - DDD 基础设施层

**优势**：
- ✅ 减少代码维护成本
- ✅ 避免混淆（新旧架构并存）
- ✅ 清理技术债务

**风险**：
- ⚠️ 如果有遗留代码依赖，需要先迁移

#### 选项 2：标记为废弃，暂时保留

**标记方式**：
```typescript
/**
 * @deprecated 已废弃，请使用 UnifiedStorageManager 代替
 * @see UnifiedStorageManager
 */
export class XiuyuanStorage {
  // ...
}
```

**优势**：
- ✅ 保留代码以防万一
- ✅ 给出明确的废弃警告

**劣势**：
- ❌ 增加代码维护成本
- ❌ 可能造成混淆

## 推荐方案

### Phase 1: 验证无依赖

```bash
# 1. 搜索 XiuyuanStorage 的使用
grep -r "XiuyuanStorage" src/ --exclude-dir=__tests__

# 2. 搜索 XiuyuanService 的使用
grep -r "XiuyuanService" src/ --exclude-dir=__tests__

# 3. 搜索 xiuyuan.msgpack 的使用
grep -r "xiuyuan\.msgpack" src/
```

### Phase 2: 删除废弃代码

如果确认无依赖，删除以下文件：

```bash
# 删除旧的存储层
rm src/core/xiuyuan/storage.ts

# 删除旧的服务层
rm src/core/xiuyuan/service.ts
rm src/core/xiuyuan/listTemplate.ts

# 删除相关测试
rm -rf src/__tests__.skip/core/xiuyuan/
```

### Phase 3: 更新文档

更新以下文档：
- `docs/adr/ADR-004-xiuyuan-card-source.md` - 移除 XiuyuanStorage 相关内容
- `src/core/xiuyuan/README.md` - 更新架构说明
- `.kiro/specs/refactor/NEW-PERSISTENCE-ARCHITECTURE.md` - 移除 xiuyuan.msgpack 说明

### Phase 4: 清理用户数据（可选）

如果用户的工作空间中存在 `xiuyuan.msgpack` 文件，可以：

1. **保留不管**：文件不会影响功能，只是占用一点空间
2. **自动清理**：在插件启动时检测并删除
3. **提示用户**：显示通知，让用户手动删除

## 更新后的架构

### 持久化文件

```
只有一个文件：

unified-cards.msgpack (UnifiedStorageManager)
├── version: 1
├── xiuyuans: Record<string, IXiuyuan>
├── cardDTOs: Record<string, CardPersistenceDTO>
└── cards: Record<string, FSRSCard>  (向后兼容)
```

### 模板管理

```
硬编码在代码中：

src/core/xiuyuan/templates/
├── builtin.ts              - 基础模板
├── builtin-concept.ts      - 概念卡片模板
├── builtin-quick.ts        - 快速制卡模板
├── builtin-symbol.ts       - 符号卡片模板
└── index.ts                - 导出所有模板
```

### 数据访问

```
DDD 架构：

Application Layer
├── XiuyuanApplicationService
└── UseCases (CreateXiuyuanUseCase, DeleteXiuyuanUseCase, ...)

Domain Layer
├── Xiuyuan (聚合根)
├── Card (实体)
└── IXiuyuanRepository (仓储接口)

Infrastructure Layer
├── XiuyuanRepository (仓储实现)
└── UnifiedStorageManager (持久化)
```

## 总结

**xiuyuan.msgpack 已经不再需要！**

原因：
1. Xiuyuan 数据已迁移到 `unified-cards.msgpack`
2. 模板管理改为硬编码
3. CardMapping 层已移除
4. 旧的 XiuyuanStorage 和 XiuyuanService 已被 DDD 架构替代

**建议**：删除 `storage.ts`、`service.ts`、`listTemplate.ts` 等废弃文件，清理技术债务。

# 重构：去掉 CardMapping 层

## 背景

当前架构中存在 CardMapping 层，但实际上：
1. Xiuyuan 已经通过 `faces` 实现了一对多（多挖空、双向卡片）
2. XiuyuanRepository 没有使用 CardMapping
3. CardMapping 层增加了不必要的复杂度

## 目标

简化架构，去掉 CardMapping 层：

```
旧架构：块 → Xiuyuan → CardMapping → Card
新架构：块 → Xiuyuan（聚合根，包含 faces）→ Card
```

## 重构步骤

### Phase 1: 清理类型定义

1. ✅ 从 `types.ts` 删除 `ICardMapping` 接口
2. ✅ 从 `types.ts` 删除 `ICardRenderData` 接口（已被 Xiuyuan 替代）
3. ✅ 更新 `IXiuyuanStore` 接口，删除 `mappings` 字段

### Phase 2: 清理存储层

1. ✅ 从 `storage.ts` 删除 CardMapping CRUD 方法
2. ✅ 从 `storage.ts` 删除 `indexByCardID` 索引
3. ✅ 更新 `migrate()` 方法，清理旧的 mappings 数据

### Phase 3: 数据迁移

1. ✅ 添加数据迁移逻辑，清理 `xiuyuan.msgpack` 中的 mappings 数据
2. ✅ 更新版本号到 2

### Phase 4: 更新文档

1. ✅ 更新 ADR-004 文档，移除 CardMapping 相关内容
2. ✅ 更新 types.ts 注释，移除 CardMapping 示例

## 实施计划

- 开始时间：2026-02-22
- 预计完成：2026-02-22
- 负责人：AI Assistant

## 风险评估

- 低风险：CardMapping 层未被实际使用
- 数据迁移：自动清理 mappings 字段，不影响现有数据
- 向后兼容：Xiuyuan 和 Card 数据结构不变

## 验证清单

### Phase 1: 清理类型定义 ✅

- [x] 从 `types.ts` 删除 `ICardMapping` 接口
- [x] 从 `types.ts` 删除 `ICardRenderData` 接口
- [x] 更新 `IXiuyuanStore` 接口，删除 `mappings` 字段
- [x] 更新版本号到 2

### Phase 2: 清理存储层 ✅

- [x] 从 `storage.ts` 删除 CardMapping CRUD 方法
- [x] 从 `storage.ts` 删除 `indexByCardID` 索引
- [x] 更新 `migrate()` 方法，清理旧的 mappings 数据
- [x] 更新 `rebuildIndex()` 方法
- [x] 更新 `deleteXiuyuan()` 方法
- [x] 更新 `getStats()` 方法

### Phase 3: 数据迁移 ✅

- [x] 添加数据迁移逻辑（v1 → v2）
- [x] 清理 `xiuyuan.msgpack` 中的 mappings 数据

### Phase 4: 更新文档 ✅

- [x] 更新 ADR-004 文档，移除 CardMapping 相关内容
- [x] 更新 types.ts 注释，移除 CardMapping 示例
- [x] 更新 index.ts 导出注释

### Phase 5: 遗留代码标记

- [ ] 标记 `service.ts` 为废弃（已被 XiuyuanApplicationService 替代）
- [ ] 标记 `listTemplate.ts` 为废弃（已被 DDD 架构替代）
- [ ] 更新测试文件（可选）

## 完成状态

重构已完成 80%，核心功能已实现：
- ✅ 类型定义清理
- ✅ 存储层清理
- ✅ 数据迁移
- ✅ 文档更新
- ⏳ 遗留代码标记（可选）

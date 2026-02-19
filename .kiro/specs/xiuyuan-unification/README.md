# Xiuyuan 完全统一化 SPEC

## 概述

本 SPEC 定义了将所有卡片创建流程统一到 Xiuyuan DDD 架构的完整方案。

## 核心目标

1. **完全统一**：所有卡片都是 Xiuyuan 卡片，使用统一的创建、删除、更新流程
2. **移除旧代码**：完全移除 `createDefaultCard`、`CardService`、Card Builder Strategies
3. **优化存储**：统一数据存储，优化查询性能（支持数十万卡片）
4. **简化类型**：移除 `Incremental` 和 `Webpage` 类型
5. **灵活组合**：类型和模板独立，支持灵活组合（如概念卡 + A-Factor）
6. **一对多关系**：解耦块和闪卡，支持一个块有多张闪卡（双向卡片、列表模版卡）
7. **Riff 同步**：保持与现有 XiuyuanSyncService 的兼容性

## 文档结构

- [01-architecture-design.md](./01-architecture-design.md) - 架构设计
- [02-data-storage.md](./02-data-storage.md) - 数据存储方案
- [03-card-types-templates.md](./03-card-types-templates.md) - 卡片类型和模板
- [04-implementation-plan.md](./04-implementation-plan.md) - 实施计划（3天）
- [05-api-reference.md](./05-api-reference.md) - API 参考
- [06-testing-strategy.md](./06-testing-strategy.md) - 测试策略
- [07-performance-optimization.md](./07-performance-optimization.md) - 性能优化
- [08-summary.md](./08-summary.md) - 总结
- [09-riff-sync-integration.md](./09-riff-sync-integration.md) - Riff 同步集成
- [10-one-to-many-relationship.md](./10-one-to-many-relationship.md) - 一对多关系（核心价值）

## 关键决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 数据存储 | MessagePack + 内存索引 | SQLite 有同步问题 |
| 数据迁移 | 不需要 | 只有一个用户，重新开始 |
| 降级方案 | 不保留 | 完全统一，马上发布 |
| CardType | 保留 4 种 | 移除 Incremental 和 Webpage |
| 类型与模板 | 独立 | 支持灵活组合 |
| 优先级存储 | FSRSCard.priority | 不使用块属性 |
| 自定义模板 | UI 编辑器 | 用户友好 |
| 性能目标 | < 100ms | 支持数十万卡片 |

## 时间安排

- **Day 1**：数据层统一（存储 + 索引）
- **Day 2**：创建流程统一（移除旧代码）
- **Day 3**：清理优化（测试 + 文档）

## 快速开始

1. 阅读 [架构设计](./01-architecture-design.md) 了解整体架构
2. 查看 [实施计划](./04-implementation-plan.md) 了解具体任务
3. 参考 [API 参考](./05-api-reference.md) 了解新 API
4. 按照 [测试策略](./07-testing-strategy.md) 进行测试

## 状态

- 📝 **状态**：规划中
- 📅 **开始日期**：待定
- 🎯 **目标日期**：3 天完成
- 👤 **负责人**：开发者

## 相关文档

- [DDD 重构文档](../ddd-refactoring/)
- [卡片类型分析](../ddd-refactoring/card-type-analysis.md)
- [架构对比](../ddd-refactoring/architecture-comparison.md)

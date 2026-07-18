# Legacy DDD Architecture Decision Records

> 本目录是冻结的 **Legacy DDD series**。仓库另有同号的 Runtime Architecture series；权威清单、状态与引用规则见 [Architecture Decision Registry](../ADR-INDEX.md)。新 ADR 不再写入本目录。

## 什么是 ADR？

架构决策记录（Architecture Decision Record，ADR）是一种记录重要架构决策的文档格式。每个 ADR 描述一个具体的架构决策，包括：

- **背景**：为什么需要做这个决策
- **决策**：我们决定做什么
- **后果**：这个决策带来的影响
- **替代方案**：我们考虑过但没有选择的其他方案

## ADR 列表

| 编号 | 标题 | 状态 | 日期 |
|------|------|------|------|
| [Legacy DDD ADR-001](./ADR-001-trait-pattern.md) | Trait 模式用于队列能力扩展 | 已替代 | 2026-02-02 |
| [Legacy DDD ADR-002](./ADR-002-observer-pattern.md) | 观察者模式用于缓存失效 | 部分已替代 | 2026-02-02 |
| [Legacy DDD ADR-003](./ADR-003-abstraction-layers.md) | 保持 Provider-SessionManager-Sequencer 分离 | 已替代 | 2026-02-02 |
| [Legacy DDD ADR-004](./ADR-004-xiuyuan-card-source.md) | Xiuyuan 卡片来源抽象层 | 部分已替代 | 2026-02-02 |
| [Legacy DDD ADR-005](./ADR-005-native-riff-read-only-import-source.md) | Native Riff 退役为只读显式导入源 | 已接受 | 2026-07-10 |

## ADR 状态

- **提议中（Proposed）**：正在讨论的决策
- **已接受（Accepted）**：已经采纳并实施的决策
- **已废弃（Deprecated）**：不再推荐使用的决策
- **已替代（Superseded）**：被新决策替代的旧决策

## 如何使用 ADR

### 创建新的 ADR

不要在本 Legacy DDD series 中创建新 ADR。按 [Architecture Decision Registry](../ADR-INDEX.md) 继续 Runtime Architecture series。

### 更新现有 ADR

- 如果决策发生变化，在 Runtime Architecture series 创建新的 ADR 并将旧 ADR 标记为"已替代"或"部分已替代"
- 在新 ADR 中引用被替代的 ADR
- 不要修改已接受的 ADR 的决策部分
- 引用时必须写 `Runtime ADR-XXX` 或 `Legacy DDD ADR-XXX`，禁止只写裸编号

## 参考资料

- [ADR 介绍](https://adr.github.io/)
- [为什么要写 ADR](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)

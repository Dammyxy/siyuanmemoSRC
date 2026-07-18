# ADR-002 SQL Worker Authority

- Series: Runtime Architecture
- Status: Partially Superseded by [Runtime ADR-006](./ADR-006-truth-device-identity-authority.md)
- Date: 2026-04-30
- Superseded Scope: the `Device Identity` section only
- Registry: [Architecture Decision Registry](./ADR-INDEX.md)

## Context

上游内核插件系统（PR #17487）未提供 SQLite/database API。`siyuan.storage.put` 为字符串文件写入，不适合作为 SQL 热路径。

## Decision

`SrsBackendWorker` 成为 SiYuanMemo 持久化写入的唯一 authority：

1. Card、Schedule、Queue、Review 的正式持久化命令都在 Worker 内提交。
2. Worker 独占 `siyuanmemo.db`、SQLite delta manifest/segments 与 MessagePack truth manifests/segments 的写入所有权。
3. 主线程仅作为 `readBinary/writeBinary` host-effect 桥和派生 read-model 消费方。
4. renderer、UI 与 `kernel.js` 不实例化 write-capable SQL runtime，也不直接调用整库 `saveStore()`；一次性迁移必须由 Worker-owned migration command 执行。
5. Worker 不可用时返回 explicit unavailable，不允许 renderer fallback、双写或本地补写。

## Implementation Status at Acceptance (Historical)

本节原本记录 ADR 接受时的迁移状态，不是持续更新的架构事实。当前实现状态以 `ARCHITECTURE.md`、活跃 OpenSpec、测试和边界 guard 为准；截至 2026-07-17，`check-no-ui-sql`、`check-no-kernel-db-owner` 与 `check-storage-writer-authority` 均通过。该 ADR 从未允许 production 双 authority。

## Migration Strategy

迁移采用按 mutation family 渐进强收口，而不是一次性重写全部存储：

1. Review transaction 与 undo/truth 收尾。
2. Card Schedule 正式写入。
3. Queue membership 与队列写模型。
4. 通用 Card CRUD。
5. 导入、迁移与整库修复工具。
6. 删除 renderer-side SQL runtime 与整库保存路径。

每个 mutation family 可以独立迁移和验证；但一旦切换到 Worker authority，同一 family 的 renderer 写入口必须在同一 change 中删除。禁止以兼容、fallback 或过渡为理由保留 production 双写。

## Canonical Truth Model

持久化采用混合真相模型，不强制所有 bounded context 使用完整 event sourcing：

- Review、Review Ledger 与 Undo 使用 append-only MessagePack events，保留历史、审计与反向操作证据。
- Card、Schedule、Queue 使用可压缩的当前状态 snapshot、增量 changeset 与 deletion tombstone。
- SQLite delta 是持久化但可回收的 crash journal；只有在对应 mutation 已被 canonical truth 覆盖并通过校验后，相关 sealed segment 才可删除。
- 临时 `siyuanmemo.db` 是派生 projection/read model，可以从 canonical truth 加未回收 delta 确定性重建。

因此，SQLite checkpoint、临时 DB 存在或 SQL transaction 成功都不能单独作为 canonical durability 证明。durability acknowledgement 必须来自对应 truth family 的持久化 receipt。

## Durability Acknowledgement

正式写入采用两阶段 durability receipt：

1. `journaled`：mutation 已提交 SQL transaction，并完整写入可校验、可 replay 的 SQLite delta crash journal。Review 等交互热路径可以在此阶段返回业务成功。
2. `truth-committed`：对应 truth family 已持久化并校验 canonical MessagePack event、snapshot、changeset 或 tombstone；只有此阶段才能推进 delta coverage watermark，并回收被完整覆盖的 sealed segments。

`journaled` 不得伪装成 `truth-committed`。返回结果和诊断必须保留 durability stage、mutation identity、delta sequence 与 truth promotion 状态。truth promotion 失败时保留 delta、后台重试并暴露维护诊断；重启时先 replay 未完成 delta，再继续 promotion。

## Atomic Durability Unit

最小 durability unit 是一次业务命令对应的 Worker transaction，而不是单张 SQL 表、单行记录或单个 truth 文件。每个 unit 拥有稳定 `mutationId` / idempotency key，并覆盖该命令产生的全部 Schedule、Review Ledger、Undo、Queue、Card、tombstone 与 metadata 变化。

只有该 unit 要求的全部 canonical truth 输出均成功并通过校验，receipt 才能从 `journaled` 推进为 `truth-committed`。部分 truth family 成功不得提前确认。重试必须复用相同 mutation identity。delta segment 回收以完整 unit coverage 为准；压缩时保留或搬迁尚未完成的 unit。

当前 Review 实现已落地该 journal boundary：answer 使用 Review idempotency key，undo 使用 `review-session-undo:<undoToken>`。Worker bootstrap 把 authority identity 的 `deviceId + identityEpoch` 传入 SQL mutation runtime；SQLite delta entry 保存完整 mutation envelope、捕获的全部 durable operations、单调 journal sequence 与 persistent `journaled` receipt。receipt 与 delta entry 同一次 segment/manifest publication 持久化，不依赖 SQL commit 后的第二条补写路径。重复 mutation 返回原 receipt/sequence；segment 或 manifest publication 失败不发出 `journaled`，并恢复临时 projection。

## Truth Promotion Ordering

P0 使用一个 Worker-owned、单 writer、按 delta journal sequence 串行推进的 Truth Promotion Module。Module 可以把连续 mutation 批量编码进同一 truth segment，并以一次 manifest 更新提交该批次，但不得改变 mutation 顺序。

- truth manifests 只有该 Module 可以写入。
- `WorkerTruthPublicationModule` 是物理 family writer；所有 production append，包括 legacy Review flush/backfill maintenance，必须经 `WorkerTruthPromotionModule.runExclusivePublication()` 串行门禁，不能直接并发写 manifest。
- 同一 `mutationId` 的重试保持幂等，不创建第二份逻辑提交。
- batch 中任一 durability unit 的必要 truth 输出不完整时，该 unit 不得获得 `truth-committed` receipt。
- shutdown 停止接收新 promotion，完成或安全保留当前 journaled batch；restart 从未完成 mutation 继续。
- promotion coverage、retry 与 last-success 状态只保存在一个覆盖写并回读验证的 `truth/promotion/device-<deviceId>/epoch-<identityEpoch>/state.v1.json`；禁止每 mutation 创建 receipt 文件。
- Worker 内部调度负责 bounded continuation 与失败延迟重试。shared background-work registry 的 `truth-promotion` kind只跟踪 Worker maintenance 状态；renderer 不解释 manifest，也不执行 truth 写入。
- `review.truth.maintenanceStatus` 报告 pending mutation count、oldest pending age、journal frontier、coverage frontier、retry reason 与 last successful promotion time。
- P0 不按 card、entity 或 truth family 并行写 manifest。只有实测 promotion 队列成为瓶颈后，才另行设计带顺序与 fencing 证明的 partition。

## Snapshot Partitioning

Card/Schedule canonical state 使用中等粒度、device-owned、immutable snapshot segments，不使用整库单文件，也不使用一实体一文件：

- Card 与 Schedule 组成同一个 Card Aggregate，并在同一 snapshot unit 中保存。
- 普通 mutation 先产生 changeset；compaction 生成新的 immutable snapshot generation。
- 每个 segment 同时受实体数量与编码字节数双阈值约束，任一达到即切分。具体阈值由真实数据测量调整，不写入长期兼容 contract。
- Queue 使用按 queue family/type 划分的小型 snapshot，不与 Card Aggregate 大段混写。
- deletion tombstone 与对应 aggregate 分片一起压缩，避免删除数据在 replay 或同步后复活。
- 新 generation 的全部 segments 写入并校验成功后，manifest 才能一次切换；旧 generation 不原地修改，并至少保留到新 generation 完整验证结束。
- 每台设备只写自己的 truth directory；跨设备状态由 reconciliation 读取各 device manifests 后归并。

## Storage Budget

存储容量和文件数量是正式运行时不变量，不能依赖人工清理：

- 正常区间执行普通后台 promotion/compaction。
- 达到软阈值时立即调度后台 compaction 并暴露诊断，不阻塞业务命令。
- 达到高阈值时，新 mutation 返回前必须执行有界同步 promotion/compaction。
- 达到硬阈值且无法安全回收时返回 explicit `STORAGE_PRESSURE`，禁止继续无限增长，也禁止删除未 `truth-committed` 的 mutation。

P0 初始运行目标：delta sealed segments 压缩后不超过 16，软阈值 32，硬阈值 64；每个 truth family/device 的 closed segments 压缩后不超过 16，软阈值 48，硬阈值 96；snapshot segment 同时受约 256–512 aggregates 与约 2–4 MB 编码大小限制；snapshot generation 默认只保留 current 与 previous verified generation。具体阈值是可调运行策略，不构成长久文件格式兼容 contract。

现有超预算数据必须先通过 migration compaction 建立安全基线，再启用硬阈值。回收顺序固定为 truth promotion、coverage 验证、未完成 mutation 搬迁、最后删除已覆盖文件。

## Recovery History Retention

SQLite delta 是有限期 crash journal，不是永久审计历史。当前状态必须能由最新 verified checkpoint 或 snapshot generation，加上其后的 canonical changeset 与尚未覆盖的 replayable delta 重建。

- verified checkpoint 覆盖范围内的 mutation 已全部 `truth-committed` 后，对应旧 delta 才可进入回收。
- 默认保留 current 与 previous verified recovery generation；更旧 generation 在 coverage、checksum 与引用关系全部验证后回收。
- 新设备从最新 verified canonical state 与后续变化开始，不从第一条历史 delta 重放。
- Review 的业务历史由 append-only Review truth 保留；delta 不承担永久审计职责。
- 任何未覆盖 mutation 都会阻止其 recovery evidence 被删除，必要时先搬迁并验证到新的 recovery segment。
- compaction 先写完整 immutable generation、验证 descriptor/manifest/segment checksum，再切换 fenced manifest；中断候选只作为 orphan evidence，不能成为读取源。
- promotion receipt 状态集中保存在每个 `deviceId + identityEpoch` 的有限 state record 中，不为每条 mutation 生成永久 receipt 文件。
- combined diagnostics 的 `journalSequenceFrontier`、`truthCoverageFrontier` 与 lag 是当前恢复窗口证据，不代表永久保留全部历史 delta。

## Device Identity

> **Superseded scope:** 本节已由 [Runtime ADR-006](./ADR-006-truth-device-identity-authority.md) 替代，不得再按下述 IndexedDB/localStorage authority 方案实施。Runtime ADR-002 的其他决策仍然有效。

SiYuanMemo truth ownership 使用插件安装身份，而不是同步文件、临时目录或单独的 SiYuan runtime `System.ID`：

- `pluginInstallationId` 是稳定的 truth device authority，并作为 device-owned truth directory 的身份来源。
- 身份冗余保存在 device-local `localStorage` 与 IndexedDB；workspace temp 文件只作为可丢弃镜像，不再作为 authority。
- SiYuan runtime `System.ID` 只作为 `hostFingerprint`，用于诊断配置复制、桌面机器变化或身份异常；它不单独决定 truth directory，因为非标准容器上的 runtime ID 不保证跨启动稳定。
- identity record 至少保存 `deviceId`、`hostFingerprint`、`identityEpoch`、`createdAt` 与 `lastSeenAt`。
- 两个本地 authority 副本不一致时 fail closed 并要求身份恢复，不按任意优先级静默选取。
- 两个本地副本同时丢失时创建新的 `deviceId` 与 identity epoch；旧 device truth directory 保持只读并继续参与 reconciliation，不重命名、不覆盖、不猜测认领。
- identity 不从同步数据反推，也不由远端 manifest 决定。

## Startup Recovery

启动恢复必须先区分 disposable projection failure 与 canonical evidence failure：

- 临时 `siyuanmemo.db` 缺失或损坏，但 canonical truth 与必要 delta 完整时，删除并确定性重建 projection。
- current generation 不完整而 previous verified generation 可用时，使用 previous verified generation，并按 journal sequence replay 后续完整 evidence。
- 未覆盖 delta、truth segment、manifest、checksum 或 identity ownership 无法验证时，进入 explicit `STORAGE_RECOVERY_REQUIRED`。
- recovery-required 状态禁止 Review、编辑、sync upload 与其他正式写入；允许读取最后 verified 状态、查看诊断和导出备份，但必须标记数据可能不是最新。
- 不允许跳过损坏 mutation、依赖临时 SQLite 猜测当前状态，或创建新的 canonical frontier 掩盖损坏 evidence。
- recovery state 明确记录 `ready`、previous-generation fallback 或 `read-only-recovery-required`，并附 last verified generation、replay frontier、quarantined evidence、diagnostic reason 与 disabled capabilities。
- formal mutation、truth promotion、truth compaction 与 reconciliation 共用 recovery write gate；只读 projection/query/diagnostics 不被伪装成可写。
- 损坏或未引用 evidence 保留原文件并进入 quarantine 诊断，只有 verified replacement 与 coverage 证明后才允许清理。

## Baseline Contracts And Compatibility Guards

存储迁移先固定可重复验证的基线，不用模糊的“文件很多”作为实施依据：

- historical deterministic fixture 记录 192 个 sealed SQLite delta segments、143 个 truth segments、manifest 引用 131 个 segments、27.5 MiB temporary projection，以及当时的 IndexedDB/localStorage identity 状态；其中 identity authority 语义已由 Runtime ADR-006 替代。
- shared contracts 显式版本化 mutation envelope、durability receipt、truth generation、coverage watermark、storage pressure、recovery state 与 identity record；业务实现只能消费这些稳定边界，不得重新定义同名私有 shape。
- reader 必须保留输入中的实际 format version。未来 MessagePack truth manifest/segment、SQLite delta manifest/segment、queue snapshot 或 identity record 一律 fail closed；禁止把未知版本归一成当前版本、跳过后继续写入或静默创建新 frontier。
- renderer writer guard 以当前遗留调用点和最大出现次数建立只减不增基线。现有 `ApplicationContext`/migration 整库路径仍是 section 6 待删除债务；基线允许它们继续存在，不允许新增调用者或在同一文件增加第二条路径。
- kernel companion guard 禁止 `siyuanmemo.db`、SQLite delta、truth segments、truth manifests 与 MessagePack writer ownership；kernel 继续只做 relay、wake-up 与 writer status。

## Cross-Device Reconciliation

文件同步只负责运输 device-owned immutable truth；业务 reconciliation 决定 canonical state：

- 每个 `deviceId + identityEpoch` 只写自己的 truth directory，其他设备只读该 namespace。
- reconciliation 按 `mutationId`、aggregate identity、causal base revision、device identity 与 epoch 合并，不按文件时间、文件大小或 SQLite 副本裁决。
- 相同 mutation 幂等去重；不同 aggregate 自动归并；append-only Review facts 保留双方证据。
- tombstone 按 causal revision 阻止旧状态复活；显式重建必须走 domain recreation contract。
- 同一 aggregate 的 non-commutative concurrent mutation 形成显式 conflict，冻结该 aggregate 新写入，直到确定性 resolution 被记录。
- 只有证明 commutative 的 domain operation 才自动合并。
- reconciliation 输出必须先写成 verified checkpoint 或 generation，再由其重建 SQLite 与 queue projection。
- SiYuan 产生的 SQLite conflict copy 与 file-level last-writer-wins 永远不是 domain truth。
- active entrypoint 是 `truth.reconciliation.run`；旧 `sync.conflict.merge` RPC 已移除，数据库副本 merge API 只返回 explicit unavailable。
- publication 失败时保持 previous verified generation 与现有 SQL/Queue projection，不允许 partial switch。
- reconciliation diagnostics 记录 source count、accepted/duplicate mutation、merge decision、blocked aggregate、conflict、published generation 与 projection rebuild 结果。

## Consequences

- 消除 DB、delta 与 truth ownership 双写风险。
- Worker 不可用时返回 explicit unavailable，不做隐式 fallback 双写。
- Card/Review/Queue/Scheduler 以 Worker Storage Commit Module 为唯一正式写入 seam。
- renderer 通过 projection receipt 判断 patch、refresh、repair 或 unavailable，不以本地整库保存维持一致性。

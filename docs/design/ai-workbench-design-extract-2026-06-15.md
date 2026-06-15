# Plugin AI Workbench Design Extract - 2026-06-15

本文是一次设计考古，不是恢复计划。

背景：`retire-plugin-owned-ai-workbench` 已删除插件自有 AI Workbench、LLM/provider、prompt、chat、session、tool loop、UI 面板和 `memo_card draft` 插件生成路径。后续方向是：思源本体 Agent 负责推理、模型、工具编排；SiYuanMemo 只提供 MCP/Agent 工具，暴露学习上下文、Review 只读辅助、Xiuyuan/Card 写入和 UI 导航。

目标：从已删除实现中抽出可复用设计 grammar，供未来在思源本体 Agent 里实现时参考。不要把旧插件 AI runtime 复活成另一个名字。

考古来源：

- `HEAD^:src/types/ai.ts`
- `HEAD^:src/application/services/AgentCardDraftService.ts`
- `HEAD^:src/application/services/AIPromptContractRegistry.ts`
- `HEAD^:src/application/services/AISelfTestDraftSupport.ts`
- `HEAD^:src/application/services/AISelfTestCardCreationService.ts`
- `HEAD^:src/application/services/AIFlashcardToolService.ts`
- `HEAD^:src/application/services/AIFlashcardToolDecisionRuntime.ts`
- `HEAD^:src/application/services/AIFlashcardCardResolutionRuntime.ts`
- `HEAD^:src/application/services/AIFlashcardMarkdownInsertionRuntime.ts`
- `HEAD^:src/application/services/AIFlashcardTargetRuntime.ts`
- `HEAD^:src/application/services/AIFlashcardXiuyuanWriteRuntime.ts`
- `HEAD^:src/application/services/AIChatToolExecutorService.ts`
- `HEAD^:src/application/services/AIWorkbenchContextProjection.ts`
- `HEAD^:src/application/services/AIWorkbenchContextProviderRegistry.ts`
- `HEAD^:src/application/services/AIWorkbenchContextRuntime.ts`
- `HEAD^:src/application/services/AIPromptComposer.ts`
- `HEAD^:src/application/services/AIWorkbenchPromptRuntime.ts`
- `HEAD^:src/application/services/AIWorkbenchResultNormalization.ts`
- `HEAD^:src/application/services/AIWorkbenchResultFormatter.ts`
- `HEAD^:src/application/services/AIWorkbenchCdfRuntime.ts`
- `HEAD^:src/application/services/AIWorkbenchGeneralChatRuntime.ts`
- `HEAD^:src/application/services/AIWorkbenchService.ts`
- `HEAD^:src/application/services/AIWorkbenchThreadNormalization.ts`
- `HEAD^:src/application/services/AIWorkbenchRunProjection.ts`
- `HEAD^:src/application/services/AIWorkbenchRunRuntime.ts`
- `HEAD^:src/application/services/AIWorkbenchConversationTreeRuntime.ts`
- `HEAD^:src/application/services/AIWorkbenchSelfTestRuntime.ts`
- `HEAD^:src/application/services/AIWorkbenchSessionRuntime.ts`
- `HEAD^:src/application/services/AIWorkbenchSessionStoreService.ts`
- `HEAD^:src/application/services/AIWorkbenchSkillRegistry.ts`
- `HEAD^:src/application/services/AIChatToolRegistry.ts`
- `HEAD^:src/application/services/AIChatApprovalService.ts`
- `HEAD^:src/application/services/AIChatVarStoreService.ts`
- `HEAD^:src/ui/ai/aiWorkbenchPaneProjection.ts`
- `HEAD^:src/types/settings.ts`
- `HEAD^:src/types/arena.ts`
- `HEAD^:src/application/services/ArenaKernelService.ts`
- `openspec/changes/retire-plugin-owned-ai-workbench/design.md`
- `openspec/changes/retire-plugin-owned-ai-workbench/evidence.md`

## Keep / Drop

Keep:

- 数据契约：source packet、candidate card、CDF semantic structure、context snapshot、tool approval envelope。
- 流程不变量：候选优先、预览优先、用户显式选择后写入、写入结果可追踪。
- 质量约束：源材料有界、字段固定、空字段显式保留、宁缺毋滥。
- Review 安全：只读辅助、揭示答案前不解释提取型卡片、不提交 feedback。
- Xiuyuan/Card 写入分工：Agent 产意图和候选，SiYuanMemo MCP 校验并调用既有写入 Module。
- 写入安全：write intent、idempotency key、dry-run diff、stale result policy。
- 可观测性：tool result ledger、stream delta、runtime diagnostics、bounded tool-loop guard。
- 结构安全：tool manifest descriptor、policy resolution ladder、generic structured normalizer、failure diagnostic projection。
- 实验评估：arena exposure ledger 作为 host Agent 侧 prompt/strategy telemetry。

Drop:

- 插件自有 AI Workbench UI。
- 插件 LLM/provider/model settings。
- 插件 prompt runtime、chat runtime、tool loop。
- 插件 session tree / conversation persistence。
- 插件侧 `memo_card draft` 生成。
- 为旧 AI 面板保留的 Settings、tab、dialog、review sidecar glue。

## Reusable Design Modules

### 1. Agent Context Packet

Source:

- `AIWorkbenchContextProjection.ts`
- `AIWorkbenchPromptRuntime.ts`

Reusable design:

- 把上下文作为显式 packet，而不是让模型从 UI 状态里猜。
- Packet 可包含：
  - `source`
  - `queueType`
  - `queueProgress`
  - `currentCard`
  - `selectedBlocks`
  - `neuralBatch`
  - attached contexts summary
- `currentCard` 不只是文本。它还带 review semantics：
  - 阅读型 `topic` / `concept` 卡没有答案面，动作是“下一张”。
  - 提取型卡需要 reveal，动作是“显示答案”。
- 结构化任务必须知道 `selectedBlocks` 的 `blockId`、`type`、`hPath` 和有界 `text`。

Future shape:

- SiYuan core Agent 请求上下文时，调用 SiYuanMemo MCP 的 read-only tool。
- SiYuanMemo 返回 Review Card / Retrieval Practice Queue / Review Session Cursor 相关只读 snapshot。
- Host Agent 自己决定如何推理，不把 snapshot 持久化成插件 session。

Anti-design:

- 不恢复 AI Workbench session。
- 不让插件维护 Agent 历史树。
- 不在插件里做 chat memory。

### 2. Source-Bounded Card Candidate Contract

Source:

- `AgentCardDraftService.ts`
- `AIPromptContractRegistry.ts`

Reusable design:

- 卡片生成要先产候选，不直接写卡。
- 候选必须声明 `persisted: false`。
- 源材料必须有界：
  - 默认候选数：5
  - 最大候选数：20
  - 最大 source blocks：8
  - 单 source 最大字符：4000
  - 总 source 最大字符：12000
- Source packet 至少包含：
  - `id`
  - `text`
  - `sourceRef`
  - `truncated`
- Candidate 至少包含：
  - `draftId`
  - `type`
  - `front`
  - `back`
  - `sourceRefs`
  - `validationWarnings`
  - `persisted: false`
- 可选字段：
  - `rationale`
  - `difficulty`
  - `missingContext`
  - `confidence`

Future shape:

- Host Agent 生成 `candidates[]`。
- SiYuanMemo MCP 提供 `memo_card preview/validate/save` 一类 Interface。
- `save` 必须接收显式 `selectedDraftIds` 或显式候选 payload，不允许“保存刚才模型说的那些”这种隐式状态。

Anti-design:

- 不恢复插件 LLM 生成。
- 不给 `memo_card draft` 加启发式 fallback。
- 不让 SiYuanMemo 自称“已保存”尚未写入的候选。

### 3. Canonical Self-Test Candidate

Source:

- `src/types/ai.ts`
- `AISelfTestDraftSupport.ts`
- `AIPromptContractRegistry.ts`
- `AISelfTestCardCreationService.ts`

Reusable design:

- 模型输出 mode-neutral canonical 字段，本地或 MCP adapter 再渲染成目标 Markdown。
- Candidate fields：
  - `id`
  - `kind`
  - `selected`
  - `summary`
  - `prompt`
  - `answer`
  - `details`
  - `clozeTargets`
- `kind` 是学习意图，不是 UI 标签：
  - 辨析
  - 因果
  - 应用
  - 反例
  - 触发
  - 定义
  - 边界
  - 其他
- `answer` 应短，稳定，可重复判断。
- `details` 默认空，只补 1-2 条极短判分辅助。
- `summary` 只做识别，不塞解释正文。
- `selected` 默认 true，但保存前必须允许用户取消。

Renderer idea:

- `list-item`：问题为首层列表项，答案和补充为子列表。
- `mark`：把 cloze target 渲染成合法 `==...==`。
- `heading`：问题进标题，答案进正文。
- `super-block`：问题和答案进入超级块子块。

Future shape:

- Host Agent 输出 canonical self-test cards。
- SiYuanMemo MCP 根据目标模式做 deterministic render + Xiuyuan 写入。
- 渲染失败返回 validation error，不让模型重写整段 Markdown。

Anti-design:

- 不要求模型直接返回 mode-specific `draftMarkdown`。
- 不恢复旧 `multi-mark` / `cdf-multiline` 插件生成路径。

### 4. Concept Coach Result Grammar

Source:

- `src/types/ai.ts`
- `AIPromptContractRegistry.ts`
- `AIWorkbenchResultNormalization.ts`

Reusable design:

Structured result 分六块：

- `workingDefinition`
- `perspectives`
- `integratedUnderstanding`
- `selfTestCards`
- `cdfStructure`
- `realWorldTriggers`

`perspectives` 固定五个视角：

- `traits`
- `contrasts`
- `partsAndWhole`
- `causality`
- `significance`

`integratedUnderstanding` 固定三项：

- `essence`
- `notWhat`
- `capabilities`

Normalization lesson:

- 固定 key 不省略；材料不足也返回空字符串或空数组。
- 对模型输出做 normalization diagnostic：
  - `full`
  - `partial`
  - `empty`
- 对 alias 做宽容解析，但对输出契约保持严格。

Future shape:

- 这套 grammar 可以成为思源本体 Agent 的“学习理解模板”，不是 SiYuanMemo runtime。
- SiYuanMemo 可以只提供上下文和写入工具，不保存 Concept Coach result。

Anti-design:

- 不恢复 tab rerun、follow-up、workbench pane。
- 不把 Concept Coach 做成插件内固定产品功能。

### 5. CDF Semantic Structure

Source:

- `src/types/ai.ts`
- `AIPromptContractRegistry.ts`
- `AIWorkbenchCdfRuntime.ts`
- `aiWorkbenchPaneProjection.ts`

Reusable design:

- CDF 先产语义 JSON，不直接产 `:::` / `;;;` Markdown。
- Top-level：
  - `anchors`
- Anchor：
  - `id`
  - `conceptName`
  - `selected`
  - `definitionCandidates`
  - `descriptorGroups`
  - `resolution`
  - `warnings`
- Definition candidate：
  - `id`
  - `text`
  - `selected`
- Descriptor group：
  - `id`
  - `title`
  - `selected`
  - `items`
- Descriptor item：
  - `id`
  - `text`
  - `selected`

Resolution statuses：

- `resolved-context`
- `resolved-notebook`
- `resolved-manual`
- `unresolved`

Key invariant:

- 多 item descriptor group 中，每个 item text 应该能表达 “提示 -> 答案”。
- Preview 阶段只解析概念文档和可创建性，不写入。
- 用户选择 anchor / definition / descriptor item 后，才显式 create。
- target notebook 改变后，旧 resolution 可能 stale，必须重新 preview 或手动绑定。

Future shape:

- Host Agent 产 CDF semantic structure。
- SiYuanMemo MCP 提供：
  - preview semantic CDF against notebook/context
  - search concept documents
  - bind / create concept document
  - create selected Xiuyuan cards

Anti-design:

- 不恢复插件 CDF 面板。
- 不恢复 CDF search UI runtime。
- 不让模型直接写 `:::` / `;;;` 并跳过 semantic preview。

### 6. Study Action Decision

Source:

- `AIChatToolRegistry.ts`
- `AIFlashcardToolDecisionRuntime.ts`
- `AIFlashcardToolService.ts`

Reusable design:

`DecideStudyAction` 是好 Interface，因为它只做判断，不写入。

Possible output:

- `answer-directly`
- `create-excerpt-topic`
- `create-topic-item`
- `create-card`

Decision payload:

- `recommendedTool`
- `cardFamily`
- `reason`
- `missingInfo`
- `approvalRequired`

Routing signals:

- 用户目标：理解、摘录、继续 Topic、制卡。
- 选区形态：`:::`, `;;;`, `==...==`, `>>`, `<>`, heading/list-item/super-block。
- Topic continuation 是否可用。
- 当前 block type。

Future shape:

- Host Agent 内部可以复用这套判断 grammar。
- SiYuanMemo MCP 也可以暴露只读 decision helper，但不能代替用户写入审批。

Anti-design:

- 不把 decision helper 和 write tool 绑成一个自动执行链。
- 不在插件里保留 tool-chain runtime。

### 7. Write Target Memory

Source:

- `AIFlashcardTargetRuntime.ts`
- `AIWorkbenchSelfTestRuntime.ts`

Reusable design:

写入目标可以是：

- `daily-note`
- `block`

Target memory：

- `mode`
- `notebookId`
- `notebookName`
- `targetBlockId`
- `targetLabel`
- `updatedAt`

Write mode：

- append：document / heading / list / list item / super block 可追加。
- after：非 appendable block 后插入。

Key invariant:

- 只有写入成功后，才更新默认 target memory。
- `block` mode 必须有 `targetBlockId`。
- `daily-note` mode 需要 resolve 今日 Daily Note。

Future shape:

- Host Agent 选择或询问 target。
- SiYuanMemo MCP 校验 target、resolve write mode、执行写入。
- Target memory 是否 host-owned 需要单独决定；插件不应为 Agent 聊天持久化整棵 session。

Anti-design:

- 不恢复 AI Workbench target 设置面板。
- 不把 target memory 当成隐式“下一次保存所有内容”的会话状态。

### 8. Tool Approval Envelope

Source:

- `AIChatToolRegistry.ts`
- `AIChatApprovalService.ts`
- `src/types/ai.ts`

Reusable design:

Tool group grammar 值得保留：

- `context-read`
- `study-decision`
- `siyuan-read`
- `siyuan-write`
- `review-read`
- `flashcard-write`
- `web`
- `vars`

Policy grammar 值得保留：

- execution policy：`auto` / `ask-once` / `ask-always`
- result approval policy：`never` / `on-error` / `always`

Approval request fields：

- `type`
- `toolCallId`
- `toolName`
- `group`
- `title`
- `description`
- `args`
- `argsText`
- `resultText`
- `resultStatus`
- `argsVarRef`
- `resultVarRef`
- `runGroupId`
- `skillId`
- `tabId`
- `status`
- `createdAt`
- `resolvedAt`
- `rejectReason`

Future shape:

- Host Agent owns approval UI and tool loop。
- SiYuanMemo MCP tools expose enough metadata for host to classify writes。
- SiYuanMemo write tools should still fail closed if called without explicit payload.

Anti-design:

- 不恢复插件 approval card UI。
- 不恢复插件 tool executor。
- 不让 flashcard write 默认 auto。

### 9. Variable Store For Long Tool Results

Source:

- `AIChatVarStoreService.ts`
- `AIChatToolRegistry.ts`

Reusable design:

- 长工具结果进入 var store，只在对话中放 preview。
- Var entry：
  - `id`
  - `name`
  - `description`
  - `value`
  - `preview`
  - `createdAt`
  - `updatedAt`
- 后续工具可以通过 var ref 读取，不重复塞完整文本进 prompt。

Future shape:

- 这应由思源本体 Agent 或 host tool runtime 拥有。
- SiYuanMemo MCP 只需要返回可缓存的结构化结果和稳定引用字段。

Anti-design:

- 不在 SiYuanMemo 里保存 Agent var store。
- 不让插件成为 host Agent memory adapter。

### 10. Structured User Skill Sections

Source:

- `src/types/ai.ts`
- `AIPromptContractRegistry.ts`
- `AIWorkbenchResultNormalization.ts`

Reusable design:

Generic structured skill section：

- `id`
- `title`
- `emptyHint`
- `runPrompt`
- `followUpPrompt`
- `responseKey`
- `renderer`
- `required`

Renderer kinds：

- `markdown`
- `list`
- `cards`
- `keyValue`

Structured cards：

- `id`
- `question`
- `answer`
- `kind`
- `selected`

Future shape:

- 思源本体 Agent 可以用这套 section schema 做“可编辑学习流程模板”。
- SiYuanMemo 只需接收最终显式 card/cdf payload。

Anti-design:

- 不恢复插件 user skill editor。
- 不恢复 AI prompt settings。
- 不让 SiYuanMemo 管理通用 Agent skill marketplace。

### 11. Context Provider Descriptors

Source:

- `AIWorkbenchContextProviderRegistry.ts`
- `AIWorkbenchContextRuntime.ts`

Reusable design:

- Context provider 应该是小 descriptor，而不是散落在 UI 里的按钮逻辑。
- 旧实现里的 provider 粒度有参考价值：
  - manual text
  - selected content
  - block refs
  - current document
- Provider 输出应进入统一 attached context packet：
  - `title`
  - `summary`
  - `blockIds`
  - `preview`
  - bounded content

Future shape:

- Host Agent 可以有“添加上下文”菜单。
- SiYuanMemo MCP 提供 selected blocks / current document / block refs 的读取 Adapter。
- Provider registry 属于 host Agent 或思源本体，不属于 SiYuanMemo 插件。

Anti-design:

- 不恢复插件 context panel。
- 不把 attached contexts 存成插件 AI session。

### 12. Observable Run Projection

Source:

- `AIWorkbenchRunRuntime.ts`
- `AIWorkbenchRunProjection.ts`

Reusable design:

- 长任务需要一个只读 run projection，而不是让 UI 猜“是不是卡住了”。
- Projection 可以表达：
  - mode
  - title
  - description
  - startedAt
  - active tab/step
  - interrupted/error state

Future shape:

- Host Agent owns run orchestration。
- SiYuanMemo MCP write/read tools返回稳定 progress/result metadata。

Anti-design:

- 不恢复插件 run runtime。
- 不恢复 workbench tab rerun/follow-up orchestration。

### 13. Conversation Tree Projection

Source:

- `AIWorkbenchConversationTreeRuntime.ts`
- `AIWorkbenchThreadNormalization.ts`
- `src/types/ai.ts`

Reusable design:

- 旧 conversation tree 的可取之处是“projection”，不是插件 session store。
- 有价值的概念：
  - message node
  - version count
  - branch count
  - active leaf
  - separator / pinned context marker
- 对未来 Agent 来说，这能支持 branching / retry / compare without overwriting。

Future shape:

- Host Agent 若需要分支对话，可以复用 projection shape。
- SiYuanMemo MCP 不应保存树，只在结果里给 enough metadata。

Anti-design:

- 不恢复 `AIWorkbenchSessionStoreService`。
- 不恢复 skill/tab-coupled conversation tree。

### 14. Write Intent And Idempotency Envelope

Source:

- `AIChatToolExecutorService.ts`
- backend AI tool job contracts from the retired path

Reusable design:

- 写入工具不应只传 raw args；应该投影成 write intent。
- Intent kinds 值得保留：
  - `progressive`
  - `topic-derived`
  - `markdown-insertion`
  - `flashcard`
- 写入 job envelope 可包含：
  - `jobId`
  - `sessionId`
  - `commandId`
  - `idempotencyKey`
  - `toolName`
  - `phase`
  - `requiresApproval`
  - `approvalState`
  - `writeIntent`
  - `deadlineAt`
- `idempotencyKey` 对 Agent 很重要：重复提交、网络重试、审批后继续，都不能重复写卡或重复改块。

Future shape:

- Host Agent owns tool job lifecycle。
- SiYuanMemo MCP write tools接收显式 payload 后，返回可审计 write intent 和 result。
- Writer relay 或 MCP Adapter 可以用 idempotency key 防重复写入。

Anti-design:

- 不恢复 backend AI job runtime。
- 不恢复插件 tool executor。
- 不让 write intent 变成自动执行授权。

### 15. SEARCH/REPLACE Block Edit Protocol

Source:

- `AIChatToolExecutorService.ts`
- `AIChatToolRegistry.ts`

Reusable design:

- Agent 修改思源块时，不能只给“把这里改一下”的自然语言。
- 合适的 block edit Interface：
  - 读取最新块内容。
  - 输入精确 SEARCH/REPLACE hunk。
  - 支持 `dryRun`。
  - 找不到 SEARCH 片段时 fail closed。
  - 返回 replacement count 和 preview。
- 这个协议比自由写 Markdown 更可测试，也更适合审批 UI。

Future shape:

- SiYuanMemo MCP 可以提供 bounded `apply_block_diff` 类工具。
- Host Agent 负责生成 diff，用户审批后再执行。

Anti-design:

- 不让 Agent 直接覆盖整块内容。
- 不在 SiYuanMemo 里做“猜测式修补”。

### 16. Stale Result Policy

Source:

- `AIWorkbenchSessionRuntime.ts`
- `AIWorkbenchSessionStoreService.ts`
- `AIWorkbenchContextProjection.ts`

Reusable design:

- Context signature 之外，还需要 result stale policy。
- Thread/session projection 里有用字段：
  - `resultContextSignature`
  - `stale`
  - `staleReason`
  - `contextIsHistorical`
  - `liveContextSignature`
- 这能表达：回答没坏，只是它对应旧的 Review Card / selected blocks / queue state。

Future shape:

- Host Agent 可以在 UI 上标“此回答对应旧上下文”。
- SiYuanMemo MCP read result 可返回当前 context signature，host 自己判 stale。

Anti-design:

- 不恢复插件 session store。
- 不为 stale 结果自动重跑旧 Workbench tab。

### 17. Tool Result Ledger

Source:

- `AIChatToolExecutorService.ts`
- `AIWorkbenchApprovalRuntime.ts`
- `aiWorkbenchPaneProjection.ts`

Reusable design:

- Tool result 不只是给模型的一段文本。它应该是 ledger entry。
- Useful fields：
  - `toolCallId`
  - `toolName`
  - `group`
  - `status`
  - `args`
  - `argsText`
  - `formattedText`
  - `finalText`
  - `resultText`
  - `error`
  - `argsVarRef`
  - `varRef`
  - `durationMs`
  - `roundIndex`
  - `llmUsage`
  - `createdAt`
- `finalText` 给用户/对话，`resultText` 给审批/摘要，`formattedText` 是完整可压缩表示。

Future shape:

- Host Agent owns ledger。
- SiYuanMemo MCP tools返回结构化 result，host 生成 ledger entry。

Anti-design:

- 不恢复插件 tool timeline UI。
- 不把 tool ledger 存在 SiYuanMemo 插件 session。

### 18. Prompt Layering

Source:

- `AIWorkbenchPromptRuntime.ts`
- `AIPromptContractRegistry.ts`
- `AIChatSkillRegistry.ts`

Reusable design:

- Prompt 应分层：
  - behavior prompt：可由 builtin/user skill 调整。
  - tool rules：来自启用工具组。
  - structured contract：由系统强制附加。
  - payload：JSON context/materials。
- 结构化 contract 应最后附加，优先级高于用户行为 prompt。
- Contract 应提供：
  - fixed top-level keys
  - minimal valid example
  - renderer value shape
  - empty-key policy

Future shape:

- 思源本体 Agent 可复用 prompt layering。
- SiYuanMemo MCP 只需要给 schema、examples、validation errors。

Anti-design:

- 不恢复插件 prompt editor。
- 不把 provider/model prompt settings 留在 SiYuanMemo。

### 19. Context Materialization Quality

Source:

- `AIWorkbenchContextRuntime.ts`
- `AIWorkbenchContextProjection.ts`

Reusable design:

- Context packet 质量取决于 materialization，不只是 ID 列表。
- 旧实现里值得保留的规则：
  - selected/current/source block ids 去重。
  - 从 Review Card meta 读取 front/back/source block ids。
  - document block 用 standard Markdown 读取正文。
  - neural virtual card 尝试补 standard Markdown。
  - attached context 有 `title` / `summary` / `preview` / `blockIds`。
  - manual text、selected content、block refs、current document 进入同一种 attached context shape。

Future shape:

- SiYuanMemo MCP read tool 应优先返回标准 Markdown 和 block provenance。
- Host Agent 只消费 context packet，不碰 DOM/SQL 细节。

Anti-design:

- 不恢复插件 context runtime。
- 不让 Agent 自己拼 SQL 读取 Review/Browser 上下文。

### 20. Tool Loop Guardrails

Source:

- `AIWorkbenchGeneralChatRuntime.ts`
- `AIChatToolExecutorService.ts`

Reusable design:

- Tool loop 要有硬预算。
- 旧实现里值得抽：
  - `maxToolRounds`
  - `maxToolCalls`
  - repeated tool call signature
  - 同一工具同参数重复超过阈值时拒绝继续
  - 预算耗尽后要求模型基于已有结果总结
- 这属于 host Agent runtime，不属于 SiYuanMemo。

Future shape:

- Host Agent owns tool loop guard。
- SiYuanMemo MCP 不提供“继续自动工具链”的能力，只提供单次 bounded tool。

Anti-design:

- 不恢复插件 tool loop。
- 不让 MCP tool 自己递归调用其它 tool。

### 21. Stream Delta And Diagnostics Shape

Source:

- `AIWorkbenchGeneralChatRuntime.ts`
- `AIWorkbenchApprovalRuntime.ts`

Reusable design:

- 流式输出不应只有 text delta。
- Useful stream channels：
  - text delta
  - reasoning delta
  - diagnostic event
  - interrupted status
  - approval waiting event
- Diagnostics 应 bounded，例如只保留最近 N 条。

Future shape:

- Host Agent streaming UI 可复用这个 shape。
- SiYuanMemo MCP write/read tools只返回普通 result，不拥有 stream UI。

Anti-design:

- 不恢复插件 streaming chat UI。
- 不在 SiYuanMemo 插件中显示 reasoning/tool stream。

### 22. Deterministic Assistant Result Markdown Export

Source:

- `AIWorkbenchResultFormatter.ts`
- `AIWorkbenchCdfRuntime.ts`

Reusable design:

- Agent 结构化结果如果要写回思源，应由 deterministic formatter 处理。
- Formatter 规则：
  - only selected self-test cards / CDF anchors。
  - perspective sections 归一成 list markdown。
  - CDF semantic anchors 渲染成合法 Xiuyuan/CDF Markdown。
  - section title 和 timestamp 包装为可追踪块。
- 这避免模型自己手写复杂 Markdown。

Future shape:

- Host Agent 输出 semantic JSON。
- SiYuanMemo MCP deterministic render 后写入。

Anti-design:

- 不恢复“发送整个 AI Workbench 结果到思源”的 UI。
- 不让模型直接决定最终块结构。

### 23. Generic Structured Result Normalizer

Source:

- `AIWorkbenchResultNormalization.ts`
- `src/types/ai.ts`

Reusable design:

- 自定义学习 skill 不应该把模型 JSON 直接交给 UI 或写入 Adapter。
- 通用 normalizer 可以把 renderer-specific 输出归一成固定 shape：
  - `markdown` -> `text`
  - `list` -> `items`
  - `cards` -> `cards`
  - `keyValue` -> `keyValues`
- 对输入可宽容：
  - card question aliases：`question` / `q` / `front` / `title`
  - card answer aliases：`answer` / `a` / `back` / `body` / `content`
  - key-value aliases：`key` / `name` / `title`
- 对输出要严格：
  - 固定 renderer。
  - 固定 missing section diagnostic。
  - 空 section 显式为空，不省略 key。
- Diagnostic fields：
  - `status`
  - `missingSections`
  - `rawShape`
  - `renderer`

Future shape:

- Host Agent 可以用这套 normalizer 接住用户自定义学习模板。
- SiYuanMemo MCP 只接收 normalizer 后的显式 card/CDF/write payload。

Anti-design:

- 不恢复插件 user skill runtime。
- 不让 SiYuanMemo 保存通用 Agent skill result。
- 不把 alias 宽容扩展成写入时的猜测 fallback。

### 24. Tool Manifest Descriptor

Source:

- `AIChatToolRegistry.ts`
- `src/types/ai.ts`

Reusable design:

- Tool 不只是函数名。Manifest 应把调用风险、返回形状、压缩策略和规则 prompt 放在同一份 descriptor。
- Useful descriptor fields：
  - `name`
  - `description`
  - `group`
  - JSON-schema `definition`
  - `executionPolicy`
  - `resultApprovalPolicy`
  - `sessionScope`
  - `declaredReturnType`
  - `compressArgs`
  - `compressResult`
  - group-level `rulePrompt`
- Policy resolution ladder：
  - group default
  - tool default
  - per-tool execution/result override
  - write groups 默认 ask-always
  - `vars` 可作为 host runtime 默认能力
  - web/search 类工具只在 host 配置后注入

Future shape:

- Host Agent owns tool registry and permission UI。
- SiYuanMemo MCP tools 应导出足够 metadata，让 host 能把 `review-read`、`siyuan-write`、`flashcard-write` 风险分开。

Anti-design:

- 不恢复插件 `AIChatToolRegistry`。
- 不让 SiYuanMemo 根据 settings 拼 host Agent tool prompt。
- 不把 write tool policy 降成默认 auto。

### 25. Persisted Agent Projection Normalization

Source:

- `AIWorkbenchThreadNormalization.ts`
- `AIWorkbenchSessionStoreService.ts`

Reusable design:

- 如果 host Agent 要保存 message/thread projection，读取时不能信任旧 schema。
- Normalization grammar：
  - message kind whitelist。
  - generated fallback IDs。
  - legacy alias migration。
  - invalid/candidate-board records dropped or downgraded。
  - malformed diagnostics materialized as bounded `rawShape`。
  - approval/tool-log/result shapes normalized before display。
- 这个设计价值在“持久化投影可恢复”，不是旧插件 session store。

Future shape:

- 只在思源本体 Agent 或 host runtime 持久化对话投影时复用。
- SiYuanMemo MCP 不存 Agent history；最多返回可被 host 正规化的 result envelopes。

Anti-design:

- 不恢复 `AIWorkbenchSessionStoreService`。
- 不为兼容旧 AI session 加迁移路径。
- 不让 SiYuanMemo 持有 host Agent conversation tree。

### 26. Failure Diagnostic Projection

Source:

- `AIWorkbenchService.ts`
- `AIWorkbenchThreadNormalization.ts`
- `src/types/ai.ts`

Reusable design:

- 失败不应只成为 toast 或 console error。对话/任务投影里也应有可见 failure message。
- Useful fields：
  - `failureDiagnostic.content`
  - `failureRunMode`
  - `requestSourceMessageId`
  - `runGroupId`
  - `interrupted`
- `interrupted` 和 `error` 分开表达：
  - interrupted 是用户/系统中断。
  - error 是执行失败。
- 失败消息应该能挂回来源用户消息和 run group，方便用户知道哪次请求失败。

Future shape:

- Host Agent owns failure UI。
- SiYuanMemo MCP tools should return typed failure envelopes，host 再 materialize 为 visible diagnostic。

Anti-design:

- 不恢复插件 failure/runtime state。
- 不把失败自动重跑。
- 不用 toast 替代审计记录。

### 27. Arena Exposure Ledger

Source:

- `AIWorkbenchService.ts`
- `src/types/arena.ts`
- `ArenaKernelService.ts`

Reusable design:

- 旧 arena 里可保留的是评估 ledger，不是插件 prompt 竞技 runtime。
- Exposure selection grammar：
  - `exposureId`
  - `pool`
  - selected `pack`
  - `challengers`
  - weights / trigger metadata
- Event grammar：
  - `exposure`
  - `accept`
  - `edit`
  - `rerun`
  - `abandon`
  - `create`
  - `manual-bad`
  - `judge`
- Outcome labels：
  - `off-target`
  - `needs-refactor`
  - `usable`
  - `strong`
- Prompt pack override grammar 可作为 host-side 实验输入：
  - `prependSystemPrompt`
  - `appendSystemPrompt`
  - default tool groups
  - tool policies
  - tab/section prompts

Future shape:

- 思源本体 Agent 若要评估学习提示策略，可以复用 exposure ledger。
- SiYuanMemo 可以提供匿名化学习结果/写入结果 metadata，但不拥有实验 runtime。

Anti-design:

- 不恢复 `ArenaKernelService`。
- 不恢复插件内 prompt pack/settings。
- 不用 arena 做自动生成质量豁免；写入仍走 candidate preview/save。

### 28. Flashcard Write Adapter Resolution

Source:

- `AIFlashcardCardResolutionRuntime.ts`
- `AIFlashcardMarkdownInsertionRuntime.ts`
- `AIFlashcardXiuyuanWriteRuntime.ts`

Reusable design:

- Agent-facing write payload 不应暴露所有 Xiuyuan 内部模板细节；Adapter 可以把高层 mode 映射成稳定写入命令。
- Inline mode resolution：
  - `quick` -> builtin quick item card
  - `bidirectional-single` -> builtin bidirectional item card
  - `multi-cloze` -> builtin cloze card
  - `concept` -> builtin concept card
- CDF/list mode resolution：
  - `concept-multiline` -> concept list template / item card
  - `descriptor-multiline` -> descriptor list template / descriptor card
- `==...==` cloze marker parsing可保留为 deterministic preflight，不让模型解释自己写了几个挖空。
- Markdown insertion 后要从 mutation result 取 `doOperations.id`，再 hydrate blocks rows：
  - `id`
  - `parent_id`
  - `root_id`
  - `box`
  - `path`
  - `hpath`
  - `type`
  - `subtype`
  - `content`
  - `markdown`
  - `sort`
- Xiuyuan write Adapter interface 应窄：
  - `createFromBlocks`
  - `createListTemplateCards`

Future shape:

- Host Agent 提供学习意图、候选、target、selected ids。
- SiYuanMemo MCP save tool 负责 mode resolution、Markdown insertion、row hydration、Xiuyuan/Card write。
- Result envelope 返回 created block rows、Xiuyuan ids、card ids、warnings/errors。

Anti-design:

- 不让 host Agent 直接拼 Xiuyuan internal command。
- 不让模型直接决定 builtin template id。
- 不在失败时猜测 alternate template。

## Flashcard-Specific Extraction

### Candidate-first, write-later

最重要的不变量：

- 生成阶段只产候选。
- 候选带 source refs 和 warnings。
- 预览阶段校验 target、可写性、CDF resolution。
- 写入阶段必须显式选择候选。
- 写入结果返回 created/skipped/failed item results。

这给 Interface 带来 Depth：caller 只需要学会候选契约，复杂的 Xiuyuan/Card 写入和思源块插入都藏在 MCP Adapter 后面。

### Source refs are part of card quality

卡片候选不能只是 front/back。必须带来源：

- 用于用户回看材料。
- 用于避免模型发明事实。
- 用于写入后可追踪。
- 用于未来重复检测或 provenance。

### CDF before Markdown

旧实现里最值得保留的 CDF 设计不是 UI，而是流程：

1. Agent 产 semantic anchors。
2. MCP preview 解析概念文档。
3. 用户选择 anchor / definition / descriptor。
4. MCP create selected Xiuyuan cards。
5. 结果报告每个 anchor 的 created/skipped/failed。

这比让模型直接吐 `:::` / `;;;` Markdown 更可测试，也更容易在 SiYuan core Agent 里迁移。

### Xiuyuan write separation

Future Agent 不应该直接理解 Xiuyuan 内部写入细节。合适的 Interface：

- explicit card candidate payload
- explicit target
- explicit selected ids
- explicit duplicate policy if needed
- result with `xiuyuanId`, `cardIds`, `sourceBlockIds`, `warnings`, `error`

Xiuyuan/Card write remains SiYuanMemo Adapter responsibility。

## Other Designs Worth Extracting

除了闪卡，值得抽：

1. Review assistance gating
   - Review read-only context 可以给 Agent。
   - 提取型卡 reveal 前不应解释答案。
   - `memo_review` 继续禁止 answer/grade/feedback/submit/commit。

2. Context signature
   - 用 source、queue、selected blocks、current card semantics、neural batch 形成 signature。
   - 用来判断结果是否 stale。
   - Future host 可以用类似机制判断“这次回答是否还对应当前 Review Card”。

3. Normalization diagnostics
   - `full` / `partial` / `empty` 比“解析失败”更有用。
   - Agent 输出可以部分可用；UI 或 host 再决定是否追问。

4. Tool group permission grammar
   - context-read / review-read 自动。
   - siyuan-write / flashcard-write ask-always。
   - study-decision 只判断不写入。

5. Long-result variable references
   - 长 block read、web fetch、搜索结果不应反复进入 prompt。
   - Host Agent 需要 var/ref 机制；插件只返回可缓存结构。

6. Target memory
   - “默认写入位置”是高价值 UX。
   - 但 ownership 要谨慎。Host Agent 可以记偏好；SiYuanMemo 只校验当前 target。

7. Structured learning template
   - Concept Coach 的六段结构可以变成 Agent prompt 模板。
   - 不应变成 SiYuanMemo 插件功能面板。

8. Approval audit trail
   - 写入审批记录 args/result/status，方便解释“写了什么、写到哪、成功几项”。
   - Host-owned approval UI 可以复用这个 envelope。

9. Pure UI projection helpers
   - 旧 `aiWorkbenchPaneProjection.ts` 把 message/tool/approval/diagnostic 的展示计算从 Vue component 中拆出。
   - 这个 Presenter 思路可借鉴：UI 读 projection，不读 runtime。
   - 但旧 AI pane 和 runtime 全部 retired，不作为 SiYuanMemo 复用目标。

10. Conversation branching projection
   - 旧 message tree 里的 version/branch/active-leaf 概念可以给 host Agent 参考。
   - 保留 projection idea，不保留插件 session store。

11. Write intent
   - 对写入分类，比“这是一个工具调用”更能做审批和审计。
   - 对 flashcard/progressive/topic-derived/markdown-insertion 分别显示风险。

12. Tool-loop guard
   - max rounds、max calls、重复调用检测是 host Agent runtime 必需品。
   - SiYuanMemo MCP 保持单工具、显式、bounded。

13. Deterministic formatter
   - 语义结果写回思源时，不让模型直接拼复杂 Markdown。
   - Formatter 负责合法 Xiuyuan/CDF/列表结构。

14. User skill canonicalizer
   - `user:` ID prefix、reserved builtin ID 避让、unique suffix、section cap、responseKey sanitizer 有参考价值。
   - 但它属于 host Agent skill/template 管理，不属于 SiYuanMemo。

15. Dynamic structured prompt contract
   - 从 section schema 生成 `allKeys`、`requiredKeys`、renderer-specific minimal JSON example、empty-key policy。
   - 可并入 host Agent prompt layering；SiYuanMemo 只提供 schema/examples/validation error。

16. Review chat continuity key
   - `queueType::queueLabel` 这类 lane key 可区分“同一复习通道”和“同一张卡/同一上下文”。
   - Future host 可用它做 continuity；精确 context 仍用 context signature。

17. Run mode copy contract
   - `full-run` / `tab-rerun` / `follow-up` / `chat` / `tool-chain` 的 title/description 可帮 host UI 解释当前在更新什么。
   - SiYuanMemo 不保存 run mode，只让 MCP result 带 enough metadata。

18. Debounced snapshot writer
   - noisy UI projection 持久化可用 `schedule` / `clear` / `hasPending` 这种小 Interface。
   - 只适合 host-owned projection store；SiYuanMemo 不建 Agent session store。

19. Flashcard mode resolver
   - 高层 card mode 到 builtin template/cardType/creationMode 的映射值得保留。
   - 它应在 SiYuanMemo MCP Adapter 内，不该让 host Agent 学 Xiuyuan 内部模板表。

## Do Not Resurrect

以下设计应明确标记为 retired：

- AI Workbench pane/dialog/sidecar/companion tab。
- `AIWorkbenchService` 与所有 `AIWorkbench*Runtime` session orchestration。
- `AIChatToolExecutorService` 插件工具循环。
- `AIChatSkillRegistry` / `AIWorkbenchSkillRegistry` 插件 skill 管理。
- `AIPromptComposer` / prompt settings / provider settings。
- `LLMPort`、`OpenAICompatibleLLMAdapter`、backend AI job。
- `AgentCardDraftService` 插件 LLM generation。
- `memo_ui` 的 `ai` / `ai-companion` target。
- `memo_card draft` 作为插件生成器。
- 任何为了旧 AI 使用体验而加的 fallback / compatibility shim。

## Candidate Future Changes

这些是后续可拆的小 change，不建议一次做完。

### `agent-card-candidate-contract`

Purpose:

- 定义 host Agent -> SiYuanMemo MCP 的 card candidate contract。
- 明确 source packet、candidate fields、selected ids、preview/save result。

Scope:

- 文档和 MCP schema 优先。
- 不接入插件 LLM。
- 不改 Review/Queue/Scheduler。

### `mcp-cdf-candidate-contract`

Purpose:

- 定义 CDF semantic structure preview/create contract。
- 支持 concept document search/bind/create。

Scope:

- 只围绕 CDF -> Xiuyuan/Card write。
- 不恢复 CDF UI。

### `review-agent-context-contract`

Purpose:

- 明确 host Agent 可读的 Review Card / Retrieval Practice Queue / Review Session Cursor context。
- 保持 read-only。

Scope:

- `memo_review get/status/query/search` 一类读工具。
- 继续禁止 feedback/grade/commit。

### `host-owned-tool-approval-envelope`

Purpose:

- 把旧 approval envelope 转成 host Agent tool permission grammar。

Scope:

- 文档/契约。
- SiYuanMemo 只声明 write 工具风险和结果形状。

### `target-memory-ownership-decision`

Purpose:

- 决定默认制卡位置由 host Agent 记忆，还是由 SiYuanMemo MCP 存偏好。

Scope:

- 先做 ADR 或 design note。
- 不引入插件 session。

### `mcp-write-intent-envelope`

Purpose:

- 定义 write intent、idempotency key、deadline、approval state、result ledger 字段。
- 让 host Agent 和 SiYuanMemo MCP 对“将要写什么”有同一套审计语言。

Scope:

- 文档/MCP schema 优先。
- 不恢复 backend AI job runtime。

### `mcp-block-diff-protocol`

Purpose:

- 定义 SEARCH/REPLACE + dryRun 的安全块编辑协议。

Scope:

- 只面向思源块编辑。
- 不覆盖整块，不添加猜测式 fallback。

### `host-agent-context-staleness-contract`

Purpose:

- 定义 context signature、result context signature、stale reason、historical context 展示规则。

Scope:

- Host-owned UI/Agent 状态。
- SiYuanMemo MCP 只返回当前 context identity。

### `host-agent-tool-manifest-contract`

Purpose:

- 定义 MCP tool metadata 到 host Agent tool manifest 的映射。
- 明确 group、execution/result policy、return type、arg/result compression。

Scope:

- Host-owned tool registry。
- SiYuanMemo 只声明 MCP tool metadata 和风险等级。

### `host-agent-structured-result-normalizer`

Purpose:

- 定义通用 structured section result normalizer。
- 支持 markdown/list/cards/keyValue renderer 和 normalization diagnostics。

Scope:

- Host Agent template/result layer。
- SiYuanMemo MCP 只接收归一化后的显式写入 payload。

### `host-agent-failure-diagnostic-projection`

Purpose:

- 定义 failure diagnostic 如何进入 host Agent message/run projection。
- 区分 interrupted/error，并挂回 source message/run group。

Scope:

- Host-owned UI/projection。
- SiYuanMemo MCP 返回 typed failures，不保存 chat history。

### `host-agent-arena-exposure-ledger`

Purpose:

- 定义 Agent prompt/strategy 实验的 exposure、event、outcome ledger。
- 允许 host 做学习提示策略评估。

Scope:

- Host Agent experimentation。
- SiYuanMemo 不恢复 arena runtime，不恢复 prompt pack settings。

### `mcp-flashcard-write-adapter-contract`

Purpose:

- 定义 card mode -> template/cardType/listKind/creationMode 的 Adapter contract。
- 定义 mutation result -> hydrated block rows -> Xiuyuan/Card result envelope。

Scope:

- SiYuanMemo MCP write Adapter。
- 不恢复插件 AI generation，不暴露 Xiuyuan 内部命令给模型。

## Architecture Notes

用 Module / Interface / Adapter / Seam 的角度看，旧 AI Workbench 过度设计点在于：插件拥有太多一体化 Interface，caller 需要同时理解 UI 面板、LLM 设置、prompt contract、tool loop、approval、session tree、CDF preview、Xiuyuan writes。删除后，真正有 Depth 的部分反而更清楚：

- Context Snapshot Interface：隐藏 Review/Browser/Queue 读取细节。
- Candidate Contract Interface：隐藏学习卡质量规则。
- CDF Semantic Interface：隐藏 Markdown 和 Xiuyuan 写入细节。
- MCP Write Adapter：隐藏思源块插入、Xiuyuan/Card 创建、writer relay。
- Flashcard Mode Resolver Interface：隐藏 builtin template 选择和 mutation row hydration。
- Approval Envelope Interface：隐藏具体 UI，只表达风险和结果。
- Write Intent Interface：隐藏写入执行细节，只表达风险分类、幂等性和审计字段。
- Context Materialization Interface：隐藏 DOM/SQL/standard Markdown 差异，只给 Agent 可靠材料。
- Tool Manifest Interface：隐藏 host registry 细节，只表达工具风险和返回语义。
- Structured Normalizer Interface：隐藏模型输出松散性，只给写入 Adapter 稳定 payload。
- Failure Projection Interface：隐藏 runtime 异常细节，只给用户可理解、可追踪的失败记录。
- Arena Ledger Interface：隐藏实验选择算法，只记录 exposure/event/outcome。

未来要深的是这些小 Interface，不是旧 Workbench 大 runtime。

## Acceptance Rules For Future Implementation

- Host Agent owns model, reasoning, prompt orchestration, tool loop, approval UI, long-result var store, and chat/session history。
- SiYuanMemo MCP owns bounded reads, validation, deterministic render, explicit writes, and typed result envelopes。
- Any write requires explicit payload and target。
- Any write should carry a write intent and idempotency identity when retry is possible。
- Any card candidate remains `persisted: false` until save succeeds。
- Any generated output must keep source refs or declare missing context。
- Any flashcard write should resolve high-level mode to internal template/card type inside SiYuanMemo, then return hydrated created rows。
- Any Review assistance must stay read-only unless a future explicit product decision changes it。
- Any block edit should prefer SEARCH/REPLACE with dry-run preview。
- Any result tied to volatile context should expose staleness metadata。
- Any tool exposed to host Agent should declare group, approval policy, return type, and compression intent。
- Any structured result accepted from a model should be normalized before preview/write。
- Any failed write/run should produce a visible diagnostic envelope, not only a toast/log。
- Any prompt/strategy experiment belongs to host Agent telemetry, not SiYuanMemo runtime。
- Any unsupported retired AI target must fail closed。
- No fallback generation inside SiYuanMemo。

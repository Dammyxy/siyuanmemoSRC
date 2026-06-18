# GitHub Issues Triage - 2026-05-14

Source repo: https://github.com/Dammyxy/siyuan-plugin-siyuanmemo

This document is a discussion queue for GitHub issues. It is not an implementation spec yet.

## Live Refresh - 2026-06-15

Source: GitHub REST API `Dammyxy/siyuan-plugin-siyuanmemo/issues?state=open&per_page=100` and `state=closed`.

Observed open issues: 51.

Observed closed issues: 22.

GitHub CLI was unavailable in this environment, so the refresh used the GitHub REST API.

### Completion Snapshot

- GitHub closed issues: 22.
- Open GitHub issues with local completion evidence: 21 issue numbers, consisting of 20 implemented numbers (#71, #72, #73, #65, #60, #56, #64, #63, #61, #57, #55, #54, #52, #21, #20, #19, #16, #59, #47, #46) plus #58 as validation-only coverage.
- If #58 is counted only as verification rather than implementation, local implemented still-open issue count is 20; total issue numbers covered is 42 implemented/closed plus one validation-only.
- OpenSpec status confirms these issue-backed changes are complete: `polish-progressive-excerpt-doc-and-source-marks`, `add-review-command-hotkeys-and-doc-scope-review`, `fix-topic-container-shortcut-item-creation`, `fix-multicloze-review-rendering`, `fix-formula-cloze-katex-marker-rendering`, `show-suspended-card-badge-in-browser`, `render-custom-review-surface-links`, `add-concept-review-roam-entry`, `scope-srs-browser-sql-filter-to-card-universe`, `harden-symbol-listener-business-idempotency`, `explain-srs-browser-count-differences`, `add-relative-priority-actions-in-browser`, and `preserve-progressive-excerpt-source-links-and-marks`.

### Newly Observed Since 2026-05-18

| Issue | Title | Created | URL |
|---|---|---|---|
| #66 | 不同设备间的复习进度同步需求 | 2026-05-20T01:55:43Z | https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/66 |
| #67 | 建议item制卡使用其他容器块 | 2026-05-22T06:28:08Z | https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/67 |
| #68 | 取消闪卡，在设置中，增加一个 取消二次确认的弹窗 开关！ | 2026-05-22T09:03:37Z | https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/68 |
| #69 | 申请放出一个删除卡片的API，可被其他插件引用。 | 2026-05-22T09:04:25Z | https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/69 |
| #70 | 所摘录的TOPIC，随文档所在笔记本而具有不同的存放位置。 | 2026-05-22T09:06:44Z | https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/70 |
| #71 | 对于摘录，其生成的文档需要优化：星号引用导致反链面板空白，无法判断其内容。 | 2026-05-23T03:38:04Z | https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/71 |
| #72 | 对于摘录，其生成的文档需要优化：首行会默认多出一处空行 | 2026-05-23T03:38:42Z | https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/72 |
| #73 | 对于摘录，如果原文在同一个段落块下，原文可以改变样式，多块摘录则没有变 | 2026-06-12T02:03:52Z | https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/73 |

### Proposed Order

1. #71 / #72 / #73 - Implemented by `polish-progressive-excerpt-doc-and-source-marks`. Progressive excerpt document/source-mark polish stayed in the same bounded slice as the completed #59/#46 work.
2. #70 - Excerpt Topic storage location by notebook. Same product area, but needs storage policy and settings/design discussion.
3. #68 - Optional delete-card confirmation bypass. Small UX/settings change, but it touches Card CRUD confirmation safety and should stay separate.
4. #67 - Item card backing container. Potentially valuable, but changes Item creation shape and editor/editability semantics.
5. #66 - Cross-device review progress sync. Important but broad; overlaps recent review durability/backend truth work and should wait until durability segments stabilize.
6. #69 - Public delete-card API for other plugins. Cross-plugin API contract; do not start without API/permission design.

### Decision Notes

- Do not treat GitHub-open status as not implemented. Several implemented local changes still correspond to open GitHub issues.
- Prefer closing or commenting GitHub issues after user/live smoke confirmation, especially for #71/#72/#73, #65/#60/#56, #64, #63, #61, #57, #55, #54, #52, #21, #20, #19, #16, #59, #47, and #46.
- #71/#72/#73 were implemented together by OpenSpec change `polish-progressive-excerpt-doc-and-source-marks`: generated excerpt document formatting, first visible source reference placement, and multi-block source mark coverage share Progressive / Excerpt ownership.
- The live excerpt blocker `BLOCK_ATTR_WRITE_FORBIDDEN: custom-fsrs-reading-source-lineage (large-or-high-churn-payload)` was fixed in the same slice by moving rich source semantics into plugin-owned excerpt records and keeping block attrs compact.
- #58 stays validation-only but now has active regression coverage for first-source-reference placement at the end of the first meaningful excerpt content block.
- 2026-06-18 maintainer triage: #70, #68, and #67 are paused and must not be auto-pulled as the next issue unless explicitly named again.
- #67 is not currently proven to mean "Item creation only accepts paragraph source blocks"; manual Topic continuation already uses selection/block DOM evidence. The unresolved product question is whether the user wants broader AutoCard listener source block coverage, a richer Topic-derived Item artifact/container, or both.
- 2026-06-18 maintainer triage: #66 is already completed in the newer build and is waiting for release/live testing; do not auto-pull it as the next issue unless explicit validation or release follow-up is requested.
- 2026-06-18 maintainer triage: #69 is paused. Current code has internal Card CRUD deletion services and Agent/MCP card tools, but no stable public delete-card API for other plugins. Resume only after cross-plugin API contract, permission/confirmation model, target identity, and delete semantics are decided.
- 2026-06-18 maintainer triage: #53 remains a future Review UI design candidate, not a paused issue. Breadcrumbs can act like RemNote-style expanded hierarchy context hints; move it later until breadcrumb usage/design is reviewed.
- 2026-06-18 maintainer triage: #49 is paused/shelved. The current Browser search input no longer displays the old `state:new/review` advanced placeholder, while the query parser still supports `state:` syntax internally. Removed the unused i18n placeholder text; broader Browser search/filter naming unification should wait for a dedicated Browser UI terminology pass.
- 2026-06-18 implementation: #47 is completed in the active code path. The document-tree block menu registers `open-menu-doctree`, collects current document plus descendant document ids through `DocTreeReviewScopeService`, and now exposes a Browse group that opens SRS Browser with `initialOpenState.scopeDocIds` plus `preset: 'all'`. Regression coverage passes in `BlockMenuHandler.core-review-entry.test.ts` and `BrowserDeckQueryKernel.scope-doc-ids.test.ts`; live SiYuan menu smoke is still pending.
- 2026-06-18 maintainer triage: #36 is paused. "关于卡片调度器" is too broad to auto-pull as the next issue; resume only after the scheduler question is narrowed to a concrete behavior, bug, or implementation slice.
- 2026-06-18 maintainer triage: #32 is paused. Browser tag search needs a dedicated Browser query/product decision before it is safe to auto-pull again.
- 2026-06-18 implementation: #15 is completed by OpenSpec change `scope-browser-doc-click-to-doc-tree`. SRS Browser left hierarchy document clicks now resolve the clicked document plus descendant documents through `DocTreeReviewScopeService`, reload through existing Browser `scopeDocIds`, and clear exact `docId` so child document cards are not filtered out. The optional include/exclude child-doc toggle is intentionally not included in this slice.
- 2026-06-18 implementation: #21 is completed by OpenSpec change `review-insert-position-slider`. Review footer skip actions now keep the primary `跳过` as a one-click action and move later-position insertion into an inline expandable panel with presets, slider, local last-position memory, and quick direct date scheduling. Regression coverage passes in `ReviewActions.spec.ts` and `SkipMenuButton.spec.ts`; live SiYuan smoke is still pending.

### Later-Batch Grouping

- Progressive / Excerpt polish: #71, #72, and #73 implemented by `polish-progressive-excerpt-doc-and-source-marks`; #70 remains the next broader storage-policy follow-up.
- Card CRUD / deletion UX/API: #68, #69.
- Item creation model: #67.
- Review durability / sync: #66.

## Live Refresh - 2026-05-15

Source: GitHub API `Dammyxy/siyuan-plugin-siyuanmemo/issues?state=open&per_page=100`

Observed open issues: 40.

GitHub CLI was unavailable in this environment, so the refresh used the GitHub REST API.

### Newly Observed / Needs Triage

| Issue | Title | URL | Updated |
|---|---|---|---|
| #65 | 功能请求：新增当前文档（及其子文档）内闪卡一键复习的快捷键。类思源本体的ALT+F。 | https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/65 | 2026-05-15T06:10:16Z |

### Current Open Issue Titles

| Issue | Title |
|---|---|
| #65 | 功能请求：新增当前文档（及其子文档）内闪卡一键复习的快捷键。类思源本体的ALT+F。 |
| #64 | 非文档块的topic下的快捷键item制卡不成功 |
| #63 | 有关填空题闪卡的问题 |
| #61 | 求助公式制卡一直报错是为啥 |
| #60 | 打开复习界面的快捷键应当全局适用（含思源主页） |
| #59 | 摘录：已摘录的文本内容，应当考虑做出标记（如背景变色） |
| #58 | 摘录，其*引用，应置于第一个块的末尾。 |
| #57 | 已经暂停的卡片在卡片浏览器中没有标识 |
| #56 | 为定位到原块位置提供可自定义设置的快捷键 |
| #55 | bug：临时、刻意练习界面 无法渲染链接 |
| #54 | 复习界面，建议概念卡concept提供立即漫游的入口 |
| #53 | 面包屑最好隐藏，鼠标滑动到上面的时候再显示，否则面包屑会泄露答案 |
| #52 | SRS浏览器右上角的过滤，应存在默认限定条件为SRS浏览器中的卡片。（即使是SQL的搜索） |
| #51 | 笔记本右键，增加插件的相应功能调用 |
| #49 | 细节优化：搜索过滤的命名应更新，形成统一。如图。 |
| #48 | 新增功能：由用户手动触发，对全局进行扫描，实现全局性的符号制卡 |
| #47 | 文档块标右键菜单：新增在SRS浏览器中打开该文档及子文档内的卡片 |
| #46 | 摘录制卡：摘录制卡不应当导致链接的灭失。 |
| #42 | 对于快速制卡，考虑将其逻辑变更为：取消已有闪卡->重新快速制卡。 |
| #41 | 针对于未找到id块的闪卡，提供一次全部检索及批量处理的方式。 |
| #40 | 闪卡复习界面，多行挖空，其卡片应当符合markdown渲染，而非纯文本样式。 |
| #39 | 在复习界面编辑时，其文档路径会隐去。应当予以保留。 |
| #38 | 制作Item（挖空），但原Topic（摘录）是否保留——应当增设配置项，由使用者决定是否开启这一功能。 |
| #36 | 关于卡片调度器 |
| #35 | 申请两个css：1. 调整卡片复习时的按钮高度 2. 去除卡片复习时，按钮上的图片 |
| #32 | SRS浏览器似乎不支持按tag搜索 |
| #31 | 概念多行阅读卡编辑无法刷新 |
| #30 | “No Cards”时按钮应该显示退出，而非“显示答案” |
| #29 | 概念卡+标准渲染，未能显示文档标题 |
| #28 | 概念卡的内容如何显示 |
| #26 | 多填空卡片复习时观感问题 |
| #25 | 只读模式无法切换 |
| #23 | 概念描述符卡渲染中，无法点击链接和引用 |
| #22 | 神经漫游界面没有显示文档块标题 |
| #21 | 插入到队列指定位置，建议增加一个队列的滑动条，可以滑动调整 |
| #20 | 重复间隔插件开启监听符号制卡后，制卡会出现多个相同闪卡，排查后发现会与叶归插件发生冲突。 |
| #19 | 🐛 SRS浏览器中统计到的闪卡缺失 |
| #18 | 建议更改复习界面顶部卡片数量的样式，体现当前卡片是什么类型的卡 |
| #16 | 建议SRS浏览器中优先级设置提供相对加减模式 |
| #15 | 建议SRS浏览器中，点击左侧文档，显示文档下所有闪卡，包括文档内闪卡以及子文档闪卡 |
| #13 | 能否支持一键将文档内超级块制卡？ |
| #10 | 🤔将渐进阅读划分为 6 个动作：导入、阅读、改写、摘录、挖空、回忆。插件实现哪些呢 |
| #6 | 能否在顶栏显示要复习的数量？ |

### Refresh Decision

- First-batch implementation evidence now covers #64, #63, #61, #55, #52, #20, and #19 via completed OpenSpec changes or implemented triage status.
- The next triage candidate should start with newly observed #65, then #60 if #65 is deferred.
- #65 and #60 are likely related to review-entry hotkeys and should be triaged together before implementation to avoid overlapping shortcut behavior.

### #65 / #60 / #56 Decisions

- #60 keeps the standard `打开复习界面` command as the global Review entry with default `Alt+R`. It opens the normal Review dialog and must not require a current document context, including on the SiYuan home surface.
- #65 adds two user-configurable commands with no default hotkey: `复习当前文档及子文档的到期卡片` and `临时练习当前文档及子文档的全部卡片`.
- #65 command scope is the current open document root plus all descendant documents. If the current document cannot be resolved, or the scoped set has no matching cards, the command fails closed with a message and does not fall back to global Review.
- The #65 due Review command opens only due/reviewable cards through the existing scoped Review entry path. It must not mix future cards into the due queue.
- The #65 temporary drill command opens all practiceable scoped cards through the existing temporary drill dialog path. It does not need tab restore parity for this slice.
- #56 adds `定位当前复习卡原块` as a user-configurable command with no default hotkey. It applies only to the active Review current card, reuses existing source-block location behavior, and must not grade, reveal, skip, advance, reload, or infer a card from Browser/recent-card state.
- Implementation scope is tracked by OpenSpec change `add-review-command-hotkeys-and-doc-scope-review`.

### #57 / #16 Decisions

- #57 is a Browser presentation change only: suspended rows show a localized badge in the existing state/type column and a subtle row treatment.
- #57 badge truth is only `BrowserCard.suspended`, produced by the unified plugin card state/read model. The Browser UI must not read legacy block attributes, card metadata, source content, or SQL attributes to decide badge visibility.
- #57 does not change suspended preset membership, sorting, filters, queue mutation, scheduling writes, or suspend/restore actions.
- #16 keeps absolute `set-priority` available and adds two fixed relative actions: `优先级 +10` and `优先级 -10`. Labels describe numeric value changes because lower numeric priority means higher scheduling priority.
- #16 relative actions clamp each selected card independently to `0..100`, persist through the existing unified card update path, and refresh through existing Browser post-action handling.
- #16 does not add undo, settings, queue reorder, scheduler recomputation, configurable step size, or new storage ownership.
- Implementation scope is tracked by OpenSpec changes `show-suspended-card-badge-in-browser` and `add-relative-priority-actions-in-browser`.

### #54 Decisions

- #54 adds a compact Review content-near action labeled `从概念漫游` for active Concept-related cards only.
- Eligible cards are Concept, Concept Definition, and Descriptor. Concept cards roam from the current Concept block; Concept Definition cards roam from the bound/referenced Concept block; Descriptor cards roam from the parent/bound Concept block.
- If the active card cannot resolve a stable Concept focus from its own metadata/card-face evidence, the action is hidden. It must not infer from Browser selection, recent Review history, breadcrumbs, or arbitrary DOM context.
- Clicking the action starts Neural Roam through the existing `DialogManager.openNeuralRoamDialog()` path with the resolved focus as the first item.
- The Review action creates a new independent Neural Roam session/path and preserves older Neural Roam history. It must not use broad `resetHistory: true` clearing for this entry.
- The action must not grade, reveal, skip, advance, hide, suspend, delete, reschedule, or submit Review feedback for the active card.
- Implementation scope is tracked by OpenSpec change `add-concept-review-roam-entry`.

## Live Refresh - 2026-05-18

Source: GitHub API `Dammyxy/siyuan-plugin-siyuanmemo/issues?state=open&per_page=100`

Observed open issues: 40.

GitHub CLI was unavailable in this environment, so the refresh used the GitHub REST API.

### Open Issues Still Covered By Completed Local Changes

GitHub still reports these issues open, but local OpenSpec completion evidence is `all_done`:

| Issue | Local change |
|---|---|
| #65 / #60 / #56 | `add-review-command-hotkeys-and-doc-scope-review` |
| #64 | `fix-topic-container-shortcut-item-creation` |
| #63 | `fix-multicloze-review-rendering` |
| #61 | `fix-formula-cloze-katex-marker-rendering` |
| #57 | `show-suspended-card-badge-in-browser` |
| #55 | `render-custom-review-surface-links` |
| #54 | `add-concept-review-roam-entry` |
| #52 | `scope-srs-browser-sql-filter-to-card-universe` |
| #20 | `harden-symbol-listener-business-idempotency` |
| #19 | `explain-srs-browser-count-differences` |
| #16 | `add-relative-priority-actions-in-browser` |

### Open Issues Covered By Current Implementation

GitHub may still report these issues open, but current active code and regression tests satisfy the requested behavior:

| Issue | Status |
|---|---|
| #47 | Implemented: document-tree block menu opens SRS Browser with current document plus descendant document scope through `initialOpenState.scopeDocIds`; live SiYuan smoke still pending. |
| #21 | Implemented: Review footer skip/later area now uses an inline expandable panel with presets, slider, local last-position memory, and quick direct date scheduling; live SiYuan smoke still pending. |

### Next Batch Grouping

Recommended next change after scope grilling: `preserve-progressive-excerpt-source-links-and-marks`.

Included issues:

| Issue | Topic | Why grouped |
|---|---|---|
| #59 | Mark already-excerpted source text | Progressive excerpt source marking |
| #46 | Preserve links during excerpt card creation | Inline source/link preservation across excerpt and Topic-derived Item creation |

Validation-only:

| Issue | Reason |
|---|---|
| #58 | Current `ProgressiveReadingService` code/tests already append a single first-source visible reference; keep as verification unless an uncovered entry path is found. |

Deferred or non-feature:

| Issue | Reason |
|---|---|
| #38 | Deferred. SuperMemo-style semantics retain original Topic/excerpt by default; removal/hiding would be a separate destructive policy decision. |
| #10 | Discussion/question only, not a feature requirement. |
| #48 | Global symbol scan broadens AutoCard listener/write ownership. |
| #13 | Document-wide super-block one-click card creation broadens batch creation scope. |
| #41 | Missing-source repair is a Browser/repair workflow, not excerpt source preservation. |
| #42 | Quick-card cancel-and-recreate changes quick-card mutation semantics. |

Decisions from scope grilling:

- #59 source marks are enabled by default, configurable, visually restrained, and SiYuanMemo-owned so generic user marks are not confused with plugin marks.
- #59 marks are visual only. They do not block repeated excerpts, and deleted/edited marks are not auto-repaired.
- #46 covers both creation hops: source selection -> excerpt/Topic artifact, and Topic/excerpt selection -> derived Item artifact.
- #46 preserves common inline structures when DOM evidence is available: Markdown links, SiYuan block references, asset/resource links, `siyuan://` links, and existing inline `span[data-type]` tokens.
- #46 allows plain degraded creation when preservation evidence is unavailable, but diagnostics must record it and user-facing feedback appears when source evidence suggests link/reference loss.
- Do not mix Browser, Queue, scheduler, backend worker, or kernel companion ownership into this change.

Implementation note:

- Local change `preserve-progressive-excerpt-source-links-and-marks` now implements #59 source marking and #46 inline preservation coverage on the active Progressive / Excerpt / Topic-derived path.
- #58 stayed validation-only: current tests still assert only the first source reference is emitted for multi-block excerpts.
- Deferred skip list for future pulls now includes #49, #38, #10, #48, #13, #41, and #42.
- #47 is implemented in the active code path: the existing document-tree scope/query chain is now reachable from a Browse group in the document-tree block menu. Keep it out of future next-issue pulls unless live smoke finds a regression.
- #36 is paused and must not be auto-pulled until the scheduler scope is made concrete again.
- #32 is paused and must not be auto-pulled until Browser tag search scope is made concrete again.

### Deferred / Do Not Auto-Pull

When selecting the next local issue batch, skip these issues unless the user explicitly names them:

| Issue | Status | Skip reason |
|---|---|---|
| #38 | Deferred | Keep original Topic/excerpt by default; source removal/hiding needs a separate destructive-policy decision. |
| #10 | Discussion only | This is a product question about Progressive Reading vocabulary, not an implementation request. |
| #48 | Deferred | Global symbol scan broadens AutoCard listener/write ownership. |
| #13 | Deferred | Document-wide super-block one-click card creation broadens batch creation scope. |
| #41 | Deferred | Missing-source repair belongs to Browser/repair workflow, not current excerpt preservation work. |
| #42 | Deferred | Quick-card cancel-and-recreate changes quick-card mutation semantics and needs its own decision. |
| #36 | Paused by maintainer | "关于卡片调度器" is too broad to auto-pull; resume only when the scheduler question is narrowed to a concrete behavior, bug, or implementation slice. |
| #32 | Paused by maintainer | Browser tag search needs a dedicated Browser query/product decision before it is safe to auto-pull again. |
| #70 | Paused by maintainer | Notebook-dependent Excerpt Topic storage is a broader storage-policy/settings decision; do not auto-pull unless explicitly named. |
| #68 | Paused by maintainer | Delete-card confirmation bypass is a Card CRUD safety/UX decision; skipped by maintainer for now. |
| #67 | Needs-info / paused by maintainer | Current code does not limit manual Topic-derived Item creation to paragraph source blocks. Clarify whether the desired change is broader AutoCard listener source block support, a richer Item artifact/container, or both before proposing implementation. |
| #66 | Completed in newer build / awaiting release test | Maintainer says the new version has completed this issue and it only needs上线/live testing; do not auto-pull implementation work unless explicit validation or release follow-up is requested. |
| #69 | Needs-design / paused by maintainer | Public delete-card API for other plugins needs a cross-plugin contract first: target identity, local tombstone vs native Riff delete semantics, permission/confirmation model, result/error shape, and discovery surface. Current plugin has internal deletion services but no stable external delete API. |
| #49 | Paused / shelved by maintainer | Current Browser search input has no visible `state:new/review` placeholder; unused i18n advanced placeholder text was removed. Broader search/filter/preset/type naming unification should wait for a dedicated Browser UI terminology pass. |

## First Batch

These issues are selected first because they look like correctness bugs, data integrity risks, or high-friction creation/review failures.

| Issue | Topic | Current Signal | Discussion State |
|---|---|---|---|
| [#64](https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/64) | Topic/item creation | Shortcut item creation succeeds when Topic is a document block, but not when Topic is a non-document block such as a super block. UI reports success, no card is created. | Decided: non-document Topic containers must support shortcut item card creation. |
| [#63](https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/63) | Cloze review/rendering | Cloze blank length should reflect hidden text length. Multi-cloze cards are created, but review hides/shows all blanks together, and first generated card can fail rendering. | Implemented: `fix-multicloze-review-rendering` routes ordinary multi-cloze review to the dedicated renderer; live SiYuan smoke still pending. |
| [#61](https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/61) | Formula cloze | Formula card using `\cloze` can produce KaTeX error: `Expected 'EOF', got '#' at position 1: #2`. | Implemented: `fix-formula-cloze-katex-marker-rendering`; live temporary-card Review smoke passed and was cleaned up. |
| [#55](https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/55) | Temporary / deliberate practice rendering | Temporary and deliberate practice surfaces do not render links. User also asks about language-learning cards with audio timestamp, original text, and translation. | Implemented: `render-custom-review-surface-links` renders common custom Review links and forwards block navigation through existing open-block behavior; language-learning card workflow remains separate. |
| [#52](https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/52) | SRS Browser SQL filter | SRS Browser right-top filter should stay scoped to SRS Browser cards even for SQL search such as `select * from blocks where box = ...`. | Implemented: `scope-srs-browser-sql-filter-to-card-universe` scopes SQL-mode rows/actions to the Browser Card Universe; live mixed SQL smoke script recorded. |
| [#20](https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/20) | Symbol listener duplicate creation | Symbol listener card creation can create duplicate cards when YeGui plugin is also enabled. Reports multiple console errors. | Implemented: `harden-symbol-listener-business-idempotency` adds stable business idempotency and in-flight duplicate skipping; live YeGui-style smoke script recorded. |
| [#19](https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/19) | SRS Browser card count | SiYuan native flashcard manager shows more cards than SRS Browser. SRS Browser total can vary and document plugin card count can also be short. | Implemented: `explain-srs-browser-count-differences` adds read-only native-vs-Browser count diagnostics without changing Browser row/action scope. |

## Proposed Order

1. #64 - narrow reproduction, obvious false success message, likely bounded to Topic-derived item creation.
2. #20 - duplicate creation can pollute user data; must inspect idempotency boundary.
3. #19 / #52 - Browser projection/count correctness; discuss together but implement separately if ownership differs.
4. #63 / #61 - cloze/formula rendering model; likely needs product decision before code.
5. #55 - rendering bug plus separate language-learning workflow question.

## Grill Notes

Use one-question-at-a-time discussion. Resolved domain terms should be captured in `CONTEXT.md`; durable trade-offs may become ADRs only if they are hard to reverse and surprising.

Open terms to sharpen:

- Topic vs document block vs non-document Topic container - resolved for #64: document blocks and super blocks can both be valid Topic Containers.
- Item card creation success vs visual mark success
- SRS Browser card universe vs arbitrary SQL result universe
- Symbol listener idempotency identity
- Multi-cloze card identity and reveal semantics
- Review rendering vs source block rendering

### #64 Decisions

- Non-document Topic containers, including super blocks, must support shortcut item card creation.
- UI must not report full success when only the cloze/visual mark succeeded but card creation failed.
- On partial failure, message must distinguish mark success from card creation failure and include an actionable failure reason.
- Shortcut item card creation is atomic from the user's perspective: either cloze marking and card creation both complete, or the document returns to its prior state and the UI reports failure.

### #20 Decisions

- Symbol listener card creation must be idempotent by stable business identity: source block, symbol/range, card type, and target Topic Container.
- Repeated listener events from another plugin or from editor event duplication must not create multiple cards for that identity.
- Duplicate listener events should be treated as silent idempotent success. Do not show user-facing errors or create another card; write diagnostic/debug evidence with the skipped identity.
- Concurrent duplicate events for the same identity should be guarded by a short-lived in-flight lock. The first event executes; later events skip silently with `in-flight duplicate skipped` diagnostic evidence.

### #19 / #52 Decisions

- SRS Browser owns a **SRS Browser Card Universe**: the plugin-managed SRS cards addressable by card identity and browser projection.
- SQL searches in SRS Browser are scoped by intersecting arbitrary SQL block results with the **SRS Browser Card Universe**.
- Counts, filters, and bulk operations in SRS Browser must not treat all matching `blocks` rows as cards.
- SRS Browser count parity with SiYuan native flashcard manager should be explainable, not blindly forced. Show plugin-manageable card count and native card count separately when they differ.
- Count differences should be diagnosable by reason, such as missing plugin index, unsupported card type, missing source block, or sync/projection not complete.
- Count diagnostics should first ship as grouped reasons with expandable sample IDs. Each group shows its count and up to a bounded sample list, such as the first 20 card or block IDs.
- #19 implementation keeps Browser grid `totalCount`, select-all, and bulk actions scoped to plugin-manageable Browser rows. Native-only samples are diagnostics only and never become action targets.
- Native and Browser evidence failures are explicit unavailable states. They are not treated as zero-card evidence.

### #63 Decisions

- Multi-cloze creation may create multiple cards, but each review card focuses only one cloze.
- During review, hide/reveal only the current card's cloze. Do not hide or reveal all clozes together.
- Non-current clozes on the same review card should show their original answers with a subtle de-emphasized style, so they are visible but not treated as the current prompt.
- Current cloze blank width should approximate visible answer length with min/max bounds. Text answers scale by visible text length; formula, image, and complex inline answers use a fixed bounded placeholder width to avoid layout overflow.

### #61 Decisions

- Formula cloze is supported as plugin syntax, but plugin cloze markers must never be passed through to KaTeX.
- Card creation/rendering should parse formula-internal cloze into SiYuanMemo semantics, then render only valid formula source through KaTeX.
- Current cloze hidden state may replace or mask the target formula fragment, but the KaTeX input remains syntactically valid.
- Formula cloze hiding must preserve local context and hide only the target fragment. Do not fall back to whole-formula hiding because it changes the question too much.

### #55 Decisions

- The bug is not that temporary or deliberate practice intrinsically cannot render links. The failure comes from **Custom Review Surface** rendering that does not get SiYuan native link rendering for free.
- Temporary and deliberate practice surfaces should render links when their content includes supported link/reference forms.
- Link rendering scope for custom review surfaces is bounded to common review content first: Markdown links, SiYuan block references, asset/resource links, and `siyuan://` internal links. Do not promise full parity with SiYuan editor/native block rendering.
- Custom review surfaces own rendering and event forwarding only. Link click behavior should route through existing SiYuanMemo/SiYuan open logic rather than inventing separate navigation rules.

## First Batch Decision Summary

- #64: Non-document Topic Containers are valid for shortcut item card creation; creation is atomic from the user's perspective.
- #20: Symbol listener creation is idempotent by stable identity and guarded by in-flight duplicate skipping.
- #19 / #52: SRS Browser is scoped to the SRS Browser Card Universe; SQL results are intersected with it; count differences are explainable via grouped diagnostics.
- #63: Multi-cloze cards focus one cloze per card; only current cloze hides/reveals; non-current clozes show de-emphasized answers; blank width is bounded by answer shape.
- #61: Formula cloze is supported through plugin parsing; KaTeX sees only valid formula source; hiding is local to the target fragment.
- #55: Custom Review Surfaces must render common review links and forward clicks to existing open/navigation logic.

## Later Batch Summary

- Review/UI: #60, #57, #56, #54, #40, #39, #35, #30, #26, #25, #23, #22, #18, #6, #53; #49 is shelved until a Browser UI terminology pass.
- Creation/progressive reading: #59, #58, #46, #31, #29, #28
- Deferred / do not auto-pull unless explicitly named: #36, #32, #49, #48, #42, #41, #38, #13, #10
- Queue/Browser enhancements: #47, #16, #15, and #21 implemented; #36 and #32 are paused.

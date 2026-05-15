# GitHub Issues Triage - 2026-05-14

Source repo: https://github.com/Dammyxy/siyuan-plugin-siyuanmemo

This document is a discussion queue for GitHub issues. It is not an implementation spec yet.

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

## First Batch

These issues are selected first because they look like correctness bugs, data integrity risks, or high-friction creation/review failures.

| Issue | Topic | Current Signal | Discussion State |
|---|---|---|---|
| [#64](https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/64) | Topic/item creation | Shortcut item creation succeeds when Topic is a document block, but not when Topic is a non-document block such as a super block. UI reports success, no card is created. | Decided: non-document Topic containers must support shortcut item card creation. |
| [#63](https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/63) | Cloze review/rendering | Cloze blank length should reflect hidden text length. Multi-cloze cards are created, but review hides/shows all blanks together, and first generated card can fail rendering. | Implemented: `fix-multicloze-review-rendering` routes ordinary multi-cloze review to the dedicated renderer; live SiYuan smoke still pending. |
| [#61](https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/61) | Formula cloze | Formula card using `\cloze` can produce KaTeX error: `Expected 'EOF', got '#' at position 1: #2`. | Implemented: `fix-formula-cloze-katex-marker-rendering`; live temporary-card Review smoke passed and was cleaned up. |
| [#55](https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/55) | Temporary / deliberate practice rendering | Temporary and deliberate practice surfaces do not render links. User also asks about language-learning cards with audio timestamp, original text, and translation. | Implemented: `render-custom-review-surface-links` renders common custom Review links and forwards block navigation through existing open-block behavior; language-learning card workflow remains separate. |
| [#52](https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/52) | SRS Browser SQL filter | SRS Browser right-top filter should stay scoped to SRS Browser cards even for SQL search such as `select * from blocks where box = ...`. | Pending |
| [#20](https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/20) | Symbol listener duplicate creation | Symbol listener card creation can create duplicate cards when YeGui plugin is also enabled. Reports multiple console errors. | Pending |
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

- Review/UI: #60, #57, #56, #54, #53, #49, #40, #39, #35, #30, #26, #25, #23, #22, #18, #6
- Creation/progressive reading: #59, #58, #48, #46, #42, #41, #38, #31, #29, #28, #13, #10
- Queue/Browser enhancements: #47, #36, #32, #21, #16, #15

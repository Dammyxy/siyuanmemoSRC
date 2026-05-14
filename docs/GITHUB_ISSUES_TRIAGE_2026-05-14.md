# GitHub Issues Triage - 2026-05-14

Source repo: https://github.com/Dammyxy/siyuan-plugin-siyuanmemo

This document is a discussion queue for GitHub issues. It is not an implementation spec yet.

## First Batch

These issues are selected first because they look like correctness bugs, data integrity risks, or high-friction creation/review failures.

| Issue | Topic | Current Signal | Discussion State |
|---|---|---|---|
| [#64](https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/64) | Topic/item creation | Shortcut item creation succeeds when Topic is a document block, but not when Topic is a non-document block such as a super block. UI reports success, no card is created. | Decided: non-document Topic containers must support shortcut item card creation. |
| [#63](https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/63) | Cloze review/rendering | Cloze blank length should reflect hidden text length. Multi-cloze cards are created, but review hides/shows all blanks together, and first generated card can fail rendering. | Pending |
| [#61](https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/61) | Formula cloze | Formula card using `\cloze` can produce KaTeX error: `Expected 'EOF', got '#' at position 1: #2`. | Pending |
| [#55](https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/55) | Temporary / deliberate practice rendering | Temporary and deliberate practice surfaces do not render links. User also asks about language-learning cards with audio timestamp, original text, and translation. | Pending |
| [#52](https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/52) | SRS Browser SQL filter | SRS Browser right-top filter should stay scoped to SRS Browser cards even for SQL search such as `select * from blocks where box = ...`. | Pending |
| [#20](https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/20) | Symbol listener duplicate creation | Symbol listener card creation can create duplicate cards when YeGui plugin is also enabled. Reports multiple console errors. | Pending |
| [#19](https://github.com/Dammyxy/siyuan-plugin-siyuanmemo/issues/19) | SRS Browser card count | SiYuan native flashcard manager shows more cards than SRS Browser. SRS Browser total can vary and document plugin card count can also be short. | Pending |

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

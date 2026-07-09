## Context

Native Riff Compatibility can project a SiYuan source block into `builtin-riff-sync` card records without preserving quick-symbol evidence. The failing card `20260610140511-bb340gl` has live source content `反思>>反思`, but its projected card and Xiuyuan payload only describe a riff-managed item card whose first face question is the whole block and whose answer is empty.

Review already has an SRS Card Render Contract and quick renderer path. The missing Module is the deterministic repair owner that can convert trusted live source evidence into quick-symbol render evidence before Review chooses a renderer.

## Goals / Non-Goals

**Goals:**
- Add a deep `Riff Symbol Render Repair` Module that recognizes riff-managed cards with supported quick-symbol source grammar.
- Produce an explicit render repair patch/evidence from live source content instead of hidden Review-side symbol guessing.
- Reuse the same evidence rules from Native Riff sync and Review render-contract resolution.
- Keep card ID, block ID, scheduling truth, and native Riff interoperability unchanged.

**Non-Goals:**
- Do not change QuickCardRenderer face parsing semantics.
- Do not make Native Riff the scheduling authority.
- Do not introduce a broad Protyle fallback or UI-only heuristic.
- Do not rewrite existing Xiuyuan card-source architecture.

## Decisions

1. Centralize quick-symbol evidence in a `Riff Symbol Render Repair` Module.
   - Rationale: the same rule is needed for existing bad cards and future sync imports. A single Module gives locality and lets tests target one interface.
   - Alternative considered: parse `>>` directly in Review UI. Rejected because it hides data repair behind presentation logic and weakens the SRS Card Render Contract.

2. Require riff-managed + source-block evidence before repair.
   - Rationale: `builtin-riff-sync` alone is not enough; repair must only run when Native Riff Compatibility owns the compatibility projection and the source block still exists.
   - Alternative considered: infer quick cards from `content_text` only. Rejected because escaped or stale projected text is weaker evidence than live block content.

3. Emit diagnostics for invalid or missing source evidence.
   - Rationale: repair must fail closed when the block is missing, source grammar is ambiguous, or faces do not match the source.
   - Alternative considered: silently keep Protyle. Rejected because the bug becomes invisible and future cards remain misclassified.

4. Preserve existing QuickCardRenderer parsing.
   - Rationale: the QuickCard Module already owns front/back semantics for `>>`, `<<`, `<>`, `::`, `;;`, cloze, and formula cloze. Repair only supplies the missing render evidence.
   - Alternative considered: duplicate face parsing in the repair Module. Rejected because it splits ownership and risks drift.

## Risks / Trade-offs

- [Risk] Live source block lookup is unavailable in a pure card-only path → Mitigation: return explicit diagnostics and skip repair rather than guessing.
- [Risk] Existing projected faces may disagree with live source grammar → Mitigation: prefer live source evidence only for riff-managed compatibility cards and record a repair diagnostic.
- [Risk] Sync and Review call paths diverge again → Mitigation: expose one repair Module interface and test both sync-time evidence creation and Review-time contract consumption through it.
- [Risk] Over-classification of ordinary Riff cards containing symbols → Mitigation: limit repair to supported quick-symbol grammar with non-empty front/back evidence and riff-managed ownership.

## Migration Plan

1. Add regression tests for a riff-managed `builtin-riff-sync` card whose source block is `反思>>反思` and whose projected metadata lacks quick-symbol fields.
2. Add the repair Module and wire it into SRS Card Render Contract resolution with explicit source-content input.
3. Reuse the Module in the Native Riff sync projection path so future cards persist quick-symbol evidence.
4. Add a repair diagnostic path for existing records whose live block is missing or grammar is invalid.
5. Validate with focused tests, DDD boundary checks, hidden fallback checks, and build.

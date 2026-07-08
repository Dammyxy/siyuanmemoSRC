## Context

SiYuanMemo currently stores SRS semantics across several fields and owners: `FSRSCard.type`, `cardTypeMarker`, Xiuyuan `templateID`, `meta.typeMarker`, `faceIndex`, `fieldMapping`, progressive lineage, and selected block attributes. Creation paths for list cards, CDF definition/descriptor cards, and Topic-derived items already know the intended semantic kind, but Browser, Review, Queue counters, SQL projections, and repair tools still read or infer different slices of that evidence.

The failure mode is concrete: after migration or sync, cards that were created as list items or CDF cards can appear as generic Topic cards. The existing "编辑SRS数据" entry edits scheduling/review data only and does not own enough semantic evidence to repair card type corruption safely.

## Goals / Non-Goals

**Goals:**
- Introduce one SRS Card Semantics Module with a small Interface that resolves effective semantic kind and supporting evidence.
- Introduce a reconciliation repair Module that audits card rows, produces dry-run plans, and commits deterministic semantic repairs with receipts.
- Keep Review, Browser, Queue, and SQL projection semantics consistent by routing semantic decisions through the same Module.
- Add creation receipts after repair exists so future migrations can use stable creation evidence before heuristic evidence.
- Fail closed for ambiguous or conflicting evidence and show diagnostics instead of silently rewriting cards.

**Non-Goals:**
- Do not change scheduler algorithms, Review answer flow, or Topic scheduling rules.
- Do not merge semantic repair into the existing SRS scheduling editor.
- Do not silently auto-repair all cards on startup.
- Do not resurrect legacy binary snapshot storage as an active source of truth.
- Do not redesign Xiuyuan aggregates beyond adding semantic evidence and repair use cases.

## Decisions

### 1. SRS Card Semantics Module owns effective semantic kind

Create a deep Module with an Interface shaped around behavior, not storage fields:

- `resolveCardSemantics(input): SrsCardSemanticResolution`
- `auditCardSemantics(input): SrsCardSemanticAuditResult`
- `planCardSemanticRepair(input): SrsCardSemanticRepairPlan`

The Interface returns:

- effective kind: `item | topic | concept | descriptor`
- confidence: `deterministic | ambiguous | insufficient`
- evidence list: template, creation receipt, type marker, progressive lineage, block attr, structure
- proposed patch only when deterministic
- diagnostics for conflicts and missing evidence

Rationale: callers need a stable semantic answer, not knowledge of every legacy field. This improves locality because new evidence rules land in one implementation instead of Review, Browser, SQL, and repair UI each re-learning the same migration history.

Alternatives considered:
- Patch Review render policy only. Rejected because Browser, Queue counters, and SQL rows stay wrong.
- Extend "编辑SRS数据". Rejected because that Interface is scheduling-oriented and would become shallow and confusing.
- Trust `FSRSCard.type` as source of truth. Rejected because current failure is exactly `type` corruption.

### 2. Evidence order is explicit and conservative

Resolution uses this order:

1. Creation receipt, once introduced.
2. Xiuyuan template evidence (`templateID`, card rules, field mapping, faces).
3. Card meta evidence (`typeMarker`, `cardTypeMarker`, `faceKey`, `faceIndex`, progressive lineage).
4. Block attributes and managed card binding attrs.
5. Structure detection evidence only for audit hints, never as sole commit evidence for existing SRS cards.

Deterministic examples:

- `builtin-list-item` resolves to `item`.
- `builtin-concept-definition*` resolves to `descriptor` for definition cards under the existing contract that stores definition prompts as descriptor-review cards.
- `builtin-concept-descriptor*` resolves to `descriptor`.
- `progressive.kind = piece | excerpt` resolves to `topic`.
- `progressive.kind = derived-item` resolves to `item`.

Rationale: existing durable creation metadata is stronger than block shape, and block shape can drift after editing.

Alternatives considered:
- Infer from current block structure first. Rejected because content changes after card creation can produce false repairs.
- Always prefer `card.type`. Rejected because corrupted `topic` is the target symptom.

### 3. Repair is dry-run first, commit second

The repair Module first returns an auditable plan:

- affected card count
- safe repair count
- ambiguous count
- skipped count
- before/after semantic kind
- evidence that justified each safe patch
- conflicting evidence for skipped rows

Commit mode applies only safe deterministic patches and writes a repair receipt. The user-facing entry is separate from SRS scheduling edit and can expose dry-run before commit.

Rationale: card semantics are durable user data. Silent startup repairs risk irreversible wrong classification.

Alternatives considered:
- Startup automatic repair. Rejected due to data risk and weak observability.
- Manual per-card editing. Rejected because projections and counters require coordinated persistence.

### 4. SQL repository provides repair-safe persistence, not semantic policy

SQL storage adds methods to read semantic audit candidates, apply semantic patches, update projection evidence, and persist repair receipts. It does not decide the semantic kind. The SRS Card Semantics Module decides, and SQL persists the plan.

Rationale: SQL-first ownership stays intact while semantic policy remains testable outside storage.

Alternatives considered:
- Put resolver logic inside `SqlUnifiedStorageRepository`. Rejected because Review and non-SQL tests would duplicate policy or need storage to answer pure semantic questions.

### 5. Creation receipts come after current repair path

Current corrupted data needs resolver and reconciliation first. Once repair exists, new creation paths write receipts for list cards, CDF cards, quick cards, progressive Topic/Item cards, and native Riff compatibility imports.

Rationale: receipts prevent future drift but cannot repair historical data alone.

Alternatives considered:
- Start with receipts. Rejected because it does not fix existing damaged cards.

## Risks / Trade-offs

- [Risk] CDF semantic naming is historically overloaded between concept, descriptor, and definition cards. → Mitigation: encode the existing contract in tests and mark conflicting evidence ambiguous instead of auto-repairing.
- [Risk] SQL projection rows can drift from card rows after repair. → Mitigation: commit semantic repair through one persistence path that updates card rows, projection evidence, and receipts together.
- [Risk] Structure heuristics can produce false positives. → Mitigation: use structure only as audit evidence unless reinforced by Xiuyuan/template/receipt evidence.
- [Risk] Repair UI may invite users to apply broad changes without understanding. → Mitigation: default to dry-run, show counts and examples, and require explicit commit action.
- [Risk] Large libraries may make audit expensive. → Mitigation: stream or page audit candidates from SQL and cap UI examples while preserving full receipt output.

## Migration Plan

1. Add SRS Card Semantics Module and resolver tests for list, CDF definition/descriptor, progressive Topic/Item, quick card, and ambiguous evidence.
2. Add SQL-backed audit candidate read and dry-run reconciliation tests.
3. Add commit repair persistence with receipt writing and projection evidence update.
4. Add a user-facing "诊断并修复卡片类型" entry separate from "编辑SRS数据".
5. Route Browser/Review/Queue semantic reads through the resolver where current paths depend on raw `type` or template checks.
6. Add creation receipts to active creation paths.
7. Validate with focused tests, boundary/fallback checks, and `pnpm build`.

Rollback strategy: keep repair commit explicit and receipt-backed. If a repair regression is found, use receipts to identify affected cards and apply a reverse semantic patch before disabling the entry.

## Open Questions

- Should CDF definition cards continue to resolve to `descriptor` under the existing persisted contract, or should a future product change introduce a richer semantic kind such as `concept-definition`? This change preserves current runtime behavior and does not add new public card kind values.
- Should repair receipts be stored in SQL-only metadata or also mirrored to JSON diagnostics for user export? Implementation can start SQL-first and add export later if needed.

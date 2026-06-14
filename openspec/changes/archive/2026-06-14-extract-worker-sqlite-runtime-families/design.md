## Context

Recent backend RPC work split method families and dispatcher adapters, but `WorkerSqliteDatabaseService` still concentrates many runtime families behind one large Interface and one large test surface. Some families already have runtimes, such as Review feedback and queue projection. This change continues that direction for non-AI families that are still mostly embedded in the database service.

## Goals / Non-Goals

**Goals:**
- Select a low-risk worker SQLite family and extract it behind a narrow runtime Module.
- Keep `WorkerSqliteDatabaseService` as the compatibility facade for existing callers.
- Move selected family state and helper logic into the family runtime.
- Add focused family tests that do not require broad DB-service scenarios.
- Document remaining large DB-service families after the slice.

**Non-Goals:**
- No SQL schema redesign.
- No Review truth policy rewrite.
- No queue projection policy change.
- No public backend RPC method string changes.
- No AI/Job/Hotspot, AI workbench, or agent work.

## Decisions

1. Start with one or two families, not a full DB-service rewrite.
   - Rationale: the database service is high-risk and already clean enough in some Review paths. Small family extraction gives Leverage without broad churn.
   - Alternative rejected: split the whole file by directory in one pass; that would blur behavior validation.

2. Keep transaction authority in the worker DB layer.
   - Rationale: extracted runtime Modules should receive explicit DB/repository dependencies and not invent separate write ownership.
   - Alternative rejected: let each family open its own DB ownership path; that risks inconsistent transaction policy.

3. Prefer non-AI families with local state.
   - Rationale: kernel transaction queue and Xiuyuan sync apply have state/helper clusters that can become deep Modules.
   - Alternative rejected: start with AI/Job/Hotspot or Semantic families; user explicitly deprioritized AI/agent work.

4. Preserve facade methods until callers migrate.
   - Rationale: backend adapters and tests can remain stable while Implementation moves behind the facade.
   - Alternative rejected: update every caller to new runtimes in one pass; that increases blast radius.

## Risks / Trade-offs

- Risk: extracted runtime becomes pass-through. Mitigation: move family state, normalization, diagnostics, and tests together.
- Risk: transaction behavior changes accidentally. Mitigation: characterization tests around selected facade methods before extraction.
- Risk: broad tests remain large. Mitigation: add focused tests for new runtime and leave broad adapter tests as compatibility smoke.

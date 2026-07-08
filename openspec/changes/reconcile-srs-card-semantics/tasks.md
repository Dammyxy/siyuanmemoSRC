## 1. SRS Card Semantics Module

- [x] 1.1 Add resolver types and public Interface for effective SRS card semantic kind, evidence, diagnostics, and repair patches
- [x] 1.2 Implement deterministic resolver rules for list cards, CDF cards, progressive Topic roots, progressive derived Items, quick cards, and ambiguous conflicts
- [x] 1.3 Add focused resolver tests for corrupted `type = topic` cards and conflict diagnostics

## 2. Semantic Reconciliation Repair

- [x] 2.1 Add dry-run reconciliation planner that audits cards and returns safe, skipped, ambiguous, and insufficient repair rows without mutation
- [x] 2.2 Add SQL-first persistence support for semantic repair candidates, deterministic repair patches, projection evidence update or invalidation, and repair receipts
- [x] 2.3 Add commit-mode reconciliation flow that applies only deterministic patches and records skipped/ambiguous diagnostics
- [x] 2.4 Add a dedicated user-facing semantic repair entry separate from `编辑SRS数据`

## 3. Creation Receipts

- [x] 3.1 Add append-safe creation receipt types and persistence hooks for managed SRS cards
- [x] 3.2 Record receipts from list-template, CDF, progressive Topic, and Topic-derived Item creation paths
- [x] 3.3 Prefer valid creation receipts in semantic resolution while treating invalid receipts as diagnostic evidence only

## 4. Integration And Validation

- [x] 4.1 Route Browser, Review, Queue, or SQL semantic reads that currently depend on raw card type through the semantics resolver where needed
- [x] 4.2 Update architecture/backlog documentation for the new SRS Card Semantics Module and deferred receipt/repair debt
- [x] 4.3 Run focused vitest coverage, boundary/fallback checks, `pnpm build`, and `git diff --check`

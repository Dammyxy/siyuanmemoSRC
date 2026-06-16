## ADDED Requirements

### Requirement: Unified selection excerpt action
SiYuanMemo SHALL provide one application-owned selection excerpt action Interface for editor, block-menu, and Review excerpt creation flows.

#### Scenario: Shared action has action-oriented name
- **WHEN** callers create or detect a selection excerpt
- **THEN** they SHALL use `SelectionExcerptService.executeSelectionExcerptAction(...)` instead of a create-only or materialize-only public method

#### Scenario: Editor surface creates excerpt through shared action
- **WHEN** the editor excerpt hotkey or menu has a valid `ProgressiveExcerptSelectionSnapshot`
- **THEN** it SHALL call the shared selection excerpt action Interface instead of independently sequencing materialize, highlight, create, duplicate handling, and result mapping

#### Scenario: Block menu creates excerpt through shared action
- **WHEN** the block menu creates a full-block excerpt from selected blocks
- **THEN** it SHALL call the same shared selection excerpt action Interface used by the editor flow

#### Scenario: Review surface creates excerpt through shared action
- **WHEN** the Review surface creates an excerpt from the current Topic card selection
- **THEN** it SHALL call the same shared selection excerpt action Interface before applying Review-specific queue or hyperspace routing

#### Scenario: Old pass-through Interface is removed
- **WHEN** the editor, block-menu, and Review callers migrate to the shared action
- **THEN** `SelectionExcerptService` SHALL NOT expose public `materializeExcerptSource()`, `createFromSelection()`, or `updateSourceBlockDom()` compatibility aliases for caller-side orchestration

### Requirement: Renderer-only materialization ownership
The selection excerpt action runtime SHALL own renderer-only selection materialization orchestration while preserving `ProgressiveReadingService` as the progressive command facade and `ProgressiveExcerptMaterializer` as artifact materialization owner.

#### Scenario: Valid selection is materialized
- **WHEN** a caller submits a valid selection snapshot to the action runtime
- **THEN** the runtime SHALL materialize source block ids, content DOM, preservation diagnostics, and source-mark preparation from that snapshot before invoking excerpt creation

#### Scenario: Progressive command fails
- **WHEN** `ProgressiveReadingService.createExcerptFromSelection()` rejects or returns an unavailable command result
- **THEN** the action runtime SHALL surface an explicit failure and MUST NOT replace it with caller-local mutation fallback

#### Scenario: Backend and writer ownership remain unchanged
- **WHEN** the shared action creates an excerpt
- **THEN** it SHALL use the existing `ProgressiveReadingService` public write path so `progressive.command.execute` and writer relay policy remain authoritative

### Requirement: Typed action outcomes
The selection excerpt action runtime SHALL return typed action outcomes that callers can render without inspecting low-level progressive creation details.

#### Scenario: Created excerpt outcome
- **WHEN** excerpt creation succeeds with a new excerpt artifact
- **THEN** the action outcome SHALL have `kind: "created"` and include `excerptEntityId`, `topicCardId`, `sourceBlockIds`, `sourceLineage`, `payloadIdentity`, `disclosureState`, color application status, preservation diagnostics, and source-mark diagnostics for caller routing or presentation

#### Scenario: Duplicate excerpt outcome
- **WHEN** duplicate detection returns an existing excerpt record
- **THEN** the action outcome SHALL have `kind: "duplicate"` and identify the duplicate record, source block ids when available, color application status, and source-mark diagnostics without creating another excerpt artifact

#### Scenario: Hard failures throw
- **WHEN** source-mark preparation, progressive command execution, or required excerpt write authority fails
- **THEN** the action SHALL throw an explicit error instead of returning a `failed` outcome that callers could locally recover from

#### Scenario: Action outcome does not leak materialized content
- **WHEN** an editor, block-menu, or Review caller receives a created or duplicate outcome
- **THEN** the outcome SHALL NOT include full selected DOM, full excerpt content, or caller-ready rendered content

#### Scenario: Source semantics are authoritative from materialization
- **WHEN** Review needs next-item source context after a created excerpt
- **THEN** it SHALL use the `sourceLineage`, `payloadIdentity`, `disclosureState`, and `sourceBlockIds` returned from the action outcome and SHALL NOT infer those facts from DOM or rendered content

#### Scenario: Surface-specific message mapping
- **WHEN** a caller receives a typed action outcome
- **THEN** the caller SHALL map that outcome to surface-specific messages without duplicating materialize/create/highlight logic

### Requirement: Typed progressive lineage
The touched Progressive / Excerpt creation chain SHALL preserve typed progressive lineage facts rather than passing them through as `unknown`.

#### Scenario: Created card receives typed progressive lineage
- **WHEN** a created excerpt passes lineage into card creation metadata
- **THEN** the touched creation path SHALL type `sourceLineage`, `payloadIdentity`, and `disclosureState` with the progressive source model types instead of `unknown`

#### Scenario: Type tightening remains bounded
- **WHEN** this change tightens lineage typing
- **THEN** it SHALL keep the migration scoped to the Progressive / Excerpt creation chain and SHALL NOT require a repository-wide lineage refactor

### Requirement: Source mark consistency
The selection excerpt action runtime SHALL apply source marks consistently across editor, block-menu, and Review surfaces when source marking is enabled.

#### Scenario: Source marking enabled
- **WHEN** source marking is enabled and the selection snapshot can prepare a source mark mutation
- **THEN** the runtime SHALL persist source mark DOM through the existing progressive source block update path and report whether color was applied

#### Scenario: Source marking disabled
- **WHEN** source marking is disabled for a selection excerpt action
- **THEN** the runtime SHALL skip source mark preparation and report color application as false without changing excerpt creation behavior

#### Scenario: Source mark preparation fails
- **WHEN** source marking is enabled and the live selection snapshot cannot prepare a source-mark mutation
- **THEN** the runtime SHALL fail the action explicitly and SHALL NOT report excerpt creation success

#### Scenario: Source mark persistence fails after preparation
- **WHEN** source-mark preparation succeeds but applying or persisting the source mark fails
- **THEN** the runtime SHALL still return the created or duplicate action outcome with `colorApplied=false` and a source-mark diagnostic

#### Scenario: Duplicate still marks source
- **WHEN** the action detects a duplicate excerpt and a source mark mutation was prepared
- **THEN** the runtime SHALL apply the source mark result before returning the duplicate outcome

### Requirement: Diagnostic separation
The selection excerpt action runtime SHALL expose source-mark diagnostics separately from preservation diagnostics so callers can present precise user-facing messages.

#### Scenario: Created excerpt but source mark not written
- **WHEN** a new excerpt is created but source-mark persistence fails after preparation
- **THEN** the caller SHALL be able to show a message equivalent to "已创建 Topic，但原文标记未写入" without presenting it as a link/reference preservation warning

#### Scenario: Duplicate excerpt but source mark not written
- **WHEN** a duplicate excerpt is found but source-mark persistence fails after preparation
- **THEN** the caller SHALL be able to show a message equivalent to "已找到已有摘录，但原文标记未写入" without presenting it as a link/reference preservation warning

#### Scenario: Preservation degradation remains separate
- **WHEN** selected content has link/reference preservation degradation
- **THEN** the caller SHALL be able to show preservation degradation independently from source-mark write failure

### Requirement: Surface adapter boundary
The selection excerpt action runtime SHALL keep surface-specific effects outside the core action Interface unless they are represented as narrow injected adapters.

#### Scenario: Source mark setting is caller-owned
- **WHEN** editor, block-menu, or Review starts a selection excerpt action
- **THEN** that caller SHALL read source-mark settings and pass `sourceMarkingEnabled` into `executeSelectionExcerptAction(...)`

#### Scenario: Origin is diagnostic-only
- **WHEN** a caller passes an `origin` value into the shared action
- **THEN** the action MAY use it for logging or diagnostics but SHALL NOT use it to alter creation rules or persisted source semantics

#### Scenario: Duplicate target opening
- **WHEN** an action outcome identifies a duplicate excerpt
- **THEN** opening the existing document or block SHALL be performed by a surface adapter or by the caller, not by importing UI tab code into the action runtime

#### Scenario: Duplicate outcome has no UI target
- **WHEN** an action outcome identifies a duplicate excerpt
- **THEN** the outcome SHALL carry application-layer identity facts and SHALL NOT carry a precomputed UI navigation target

#### Scenario: Review routing remains Review-owned
- **WHEN** Review receives a created excerpt outcome
- **THEN** Review-specific insertion into the current Progressive review or hyperspace session SHALL remain in the Review command runtime

#### Scenario: Toasts remain surface-owned
- **WHEN** an action returns created, duplicate, degraded-preservation, or failure information
- **THEN** user-facing messages SHALL remain owned by the caller surface or its injected message adapter

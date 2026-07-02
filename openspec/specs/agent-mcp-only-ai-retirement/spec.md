# agent-mcp-only-ai-retirement Specification

## Purpose
TBD - created by archiving change retire-plugin-owned-ai-workbench. Update Purpose after archive.
## Requirements
### Requirement: MCP tools remain the plugin Agent contract
SiYuanMemo SHALL keep `memo_query`, `memo_card`, `memo_review`, and `memo_ui` as the only plugin-owned Agent/MCP tool names, with non-empty action validation, typed result envelopes, and `agent.tool.execute` writer relay routing.

#### Scenario: Kernel registers MCP tools
- **WHEN** SiYuan exposes `siyuan.mcp.registerTool`
- **THEN** the plugin registers exactly `memo_query`, `memo_card`, `memo_review`, and `memo_ui` with bounded input schemas

#### Scenario: Kernel rejects unsafe review actions
- **WHEN** a caller invokes `memo_review` with `answer`, `grade`, `feedback`, `submit`, or `commit`
- **THEN** the plugin returns a typed `unsupported-operation` result and does not relay a scheduler or feedback mutation

#### Scenario: Writer relay unavailable
- **WHEN** an MCP tool call cannot be submitted through `agent.tool.execute`
- **THEN** the plugin returns a typed `unavailable` result and does not perform an alternate direct write path

### Requirement: Host Agent owns AI reasoning and generation
SiYuanMemo SHALL NOT own chat reasoning, model/provider selection, prompt orchestration, tool-loop execution, AI session persistence, or AI Workbench conversation UI after this change.

#### Scenario: Browser and Review surfaces load
- **WHEN** Browser or Review UI renders action buttons, menus, sidebars, dialogs, or companion tabs
- **THEN** no plugin-owned AI Workbench entrypoint, AI sidecar, or AI companion tab is visible or invokable

#### Scenario: Settings surface loads
- **WHEN** the Settings panel renders configurable sections
- **THEN** settings that only configure plugin-owned AI Workbench chat, provider, prompt, tool-loop, or user-skill behavior are not exposed as active product settings

#### Scenario: Application context starts
- **WHEN** `ApplicationContext` builds the active runtime services
- **THEN** it does not instantiate plugin-owned AI Workbench, chat, prompt, provider, or session-store services for active use

### Requirement: Card MCP writes require explicit payloads
SiYuanMemo SHALL preserve controlled `memo_card` card writes only for explicit caller-provided payloads and existing card identifiers, routed through `CardApplicationService` and writer relay.

#### Scenario: Host Agent creates a card
- **WHEN** the host Agent calls `memo_card` with action `create` and a valid card command payload
- **THEN** SiYuanMemo delegates to `CardApplicationService.createCard` and returns a typed result

#### Scenario: Host Agent saves selected candidates
- **WHEN** the host Agent calls `memo_card` with action `save`, selected draft ids, and explicit draft candidate payloads
- **THEN** SiYuanMemo persists only the selected candidates through controlled card creation and reports saved, skipped, and failed draft ids

#### Scenario: Draft generation is requested
- **WHEN** a caller invokes `memo_card` draft generation without host-provided explicit candidate content
- **THEN** SiYuanMemo returns typed `unsupported-operation` or `unavailable` and does not call `LLMPort`, AI settings, plugin prompt runtime, or heuristic local generation

### Requirement: Review MCP remains read-only assistance
SiYuanMemo SHALL allow `memo_review` to expose bounded current-review context for explanation, hint, source lookup, and score suggestion only, without committing answers, feedback, grades, or scheduler decisions.

#### Scenario: Review context is available
- **WHEN** the host Agent asks `memo_review` for the current review card
- **THEN** SiYuanMemo returns bounded current-card context, allowed assistance modes, blocked actions, and `committedFeedback: false`

#### Scenario: Review context is unavailable
- **WHEN** no active review card context can be resolved
- **THEN** SiYuanMemo returns typed `READ_MODEL_UNAVAILABLE`

### Requirement: UI MCP exposes learning surfaces only
SiYuanMemo SHALL keep `memo_ui` for supported learning/navigation surfaces and SHALL NOT use it to open retired plugin-owned AI Workbench UI.

#### Scenario: UI status is queried
- **WHEN** the host Agent calls `memo_ui` with action `status` or `get`
- **THEN** the available targets exclude retired AI Workbench targets and include only supported non-AI learning surfaces

#### Scenario: AI target is requested
- **WHEN** the host Agent calls `memo_ui` with target `ai`, `ai-companion`, or another retired AI Workbench target
- **THEN** SiYuanMemo returns typed `unsupported-operation` or `unavailable` and does not open a plugin AI dialog, sidecar, or companion tab

### Requirement: Architecture and debt records match the retired AI ownership
SiYuanMemo SHALL update architecture and debt-ledger documentation when production code removes plugin-owned AI Workbench/runtime ownership.

#### Scenario: Runtime ownership changes
- **WHEN** implementation removes AI Workbench, AI service bundle, LLM/provider, or Agent draft ownership from active runtime code
- **THEN** `ARCHITECTURE.md` describes Agent/MCP-only AI ownership and no longer presents retired AI Workbench paths as active

#### Scenario: Production debt is fixed or deferred
- **WHEN** implementation touches production `src/` code for this retirement
- **THEN** `docs/DDD_RESCAN_BACKLOG.md` records the debt fixed, debt deferred, next safe step, and validation


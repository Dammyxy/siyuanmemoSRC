## ADDED Requirements

### Requirement: AI Arena is retired
The system SHALL NOT expose plugin-owned AI Arena strategy packs, prompt overrides, AI scenario pools, AI match recording, or AI Arena manager actions as active product behavior.

#### Scenario: User opens learning UI
- **WHEN** the user opens Browser, Review, Settings, topbar menus, command menus, or plugin-managed dialogs
- **THEN** no AI Arena entry, AI strategy-pack action, AI scenario manager, or AI Arena prompt/tool override control is shown

#### Scenario: Retired AI Arena action is requested
- **WHEN** a caller requests a retired AI Arena action through an existing public seam
- **THEN** the system returns an explicit unsupported or unavailable result without opening UI, selecting prompts, executing tools, or recording AI Arena events

### Requirement: SRS Arena is hidden from normal product surfaces
The system SHALL hide SRS algorithm Arena management, challenge, ranking, and recommendation surfaces from normal user-facing navigation and Review chrome.

#### Scenario: User reviews a card
- **WHEN** the Review surface renders header actions, more-menu actions, side dialogs, conflict dialogs, or advisory banners
- **THEN** SRS Arena controls and algorithm competition UI are not available

#### Scenario: Internal SRS evidence remains
- **WHEN** internal diagnostics or tests need bounded SRS comparison evidence
- **THEN** the retained implementation stays internal-only and does not create visible UI, scheduler writes, or user-facing algorithm selection

### Requirement: Host Agent remains the AI assistance owner
The system SHALL route AI-facing integration through bounded Agent/MCP tools instead of plugin-owned AI or Arena runtime.

#### Scenario: Host Agent asks for memory context
- **WHEN** SiYuan Agent/MCP invokes `memo_query`, `memo_card`, `memo_review`, or `memo_ui`
- **THEN** `AgentToolService` handles the request through existing Browser, Card, Review, Dialog, or Tab owners and does not call Arena, plugin LLM, prompt strategy, or AI session code

#### Scenario: Host Agent requests unsupported AI UI
- **WHEN** SiYuan Agent/MCP requests retired AI UI such as `ai`, `ai-companion`, or Arena targets
- **THEN** the system returns explicit unsupported without opening a plugin AI/Arena surface

### Requirement: Retired Arena settings stay inert
The system SHALL normalize retired Arena AI settings and visible Arena preferences so persisted historical data cannot re-enable retired UI or runtime paths.

#### Scenario: Existing settings contain Arena AI config
- **WHEN** settings are loaded or saved with `arena.ai`, AI strategy packs, prompt overrides, tool policies, or visible manager state from older versions
- **THEN** the active settings keep Arena retired/hidden and do not use those values for runtime selection or UI visibility

#### Scenario: Arena history exists in storage
- **WHEN** historical Arena store records or SQL rows remain after upgrade
- **THEN** normal Browser, Review, Progressive, Card, and Agent/MCP flows ignore them unless a future explicit migration/audit command reads them

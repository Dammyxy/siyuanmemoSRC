## ADDED Requirements

### Requirement: Custom tab callbacks use a typed runtime bridge
The system SHALL register Browser, Review, and Review AI custom-tab lifecycle callbacks through an explicit runtime bridge that provides `TabRuntimeContext` to callback handlers without repeating unchecked double casts in each callback body.

#### Scenario: Tab lifecycle callbacks preserve active handlers
- **WHEN** TabManager registers Browser, Review, and Review AI custom tabs
- **THEN** each registered lifecycle callback SHALL invoke the same active handler as before through the typed runtime bridge

### Requirement: Topbar initialization gate is explicitly typed
The system SHALL check plugin initialization before opening the SRS Browser from the topbar without using TypeScript suppression comments in production code.

#### Scenario: Topbar blocks Browser before initialization
- **WHEN** the topbar callback runs while the plugin is not initialized
- **THEN** it SHALL show the loading message and SHALL NOT open the SRS Browser

#### Scenario: Topbar opens Browser after initialization
- **WHEN** the topbar callback runs while the plugin is initialized
- **THEN** it SHALL open the SRS Browser through the existing plugin entrypoint

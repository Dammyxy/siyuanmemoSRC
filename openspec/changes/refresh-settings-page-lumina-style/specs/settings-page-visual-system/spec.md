## ADDED Requirements

### Requirement: Settings page uses SiYuan-native Lumina-lite visual tokens
The settings page SHALL render with a compact visual system based on SiYuan `b3` theme variables, 1px borders, light dividers, restrained primary highlights, and 4-8px default radii for routine controls.

#### Scenario: Native theme variables drive settings surfaces
- **WHEN** the settings page is rendered
- **THEN** settings shell, navigation, content, form controls, cards, chips, examples, foldouts, and footer SHALL use `b3` theme variables for background, text, border, hover, and primary states instead of hard-coded white or blue-purple surfaces

#### Scenario: Compact token rhythm is applied
- **WHEN** the settings page is rendered on desktop
- **THEN** routine settings controls SHALL use compact 12-14px text, 34-36px input/button height, 4-8px control radii, and 1px row dividers unless a larger modal or text editor surface requires more space

### Requirement: Settings navigation remains functional while adopting light active states
The settings page SHALL preserve the existing left tab and subtab navigation behavior while rendering selected and hover states with light SiYuan-native emphasis.

#### Scenario: Left tab selection remains stable
- **WHEN** a user selects any primary or secondary settings tab
- **THEN** the active tab SHALL update to the selected tab, its subtabs SHALL update to the correct list, and the selected tab SHALL use a light primary state rather than a filled primary block

#### Scenario: Subtab selection remains stable
- **WHEN** a user selects a visible subtab
- **THEN** the active subtab SHALL update, the content area SHALL scroll to the top, and the selected subtab SHALL be visually marked with primary text and/or underline without changing the available settings fields

### Requirement: Settings content uses flat dense sections
The settings page SHALL present form rows, examples, foldouts, guide items, queue items, symbol items, and AI setting summaries as flat dense sections rather than heavy nested cards.

#### Scenario: Form rows are scan-friendly
- **WHEN** a settings subtab contains multiple form items
- **THEN** each form item SHALL remain visually separable through spacing and light dividers while keeping labels, controls, hints, and units readable at compact density

#### Scenario: Nested AI settings follow the same system
- **WHEN** the AI Workbench settings tab renders provider, runtime, built-in skill, or user skill settings
- **THEN** AI manager cards, tool groups, prompt cards, user skill cards, meta chips, and action rows SHALL follow the same flat surface, compact text, light border, and primary-lightest state rules as the rest of the settings page

### Requirement: Settings behavior and persistence contracts are unchanged
The visual refresh SHALL NOT change settings data shape, save payloads, emitted events, tab defaults, maintenance/about footer rules, or dialog entry behavior.

#### Scenario: Save payload remains unchanged
- **WHEN** a user edits settings and clicks the save action
- **THEN** the emitted save payload SHALL preserve the existing settings schema and include the same edited values as before the visual refresh

#### Scenario: Maintenance and about still hide global save actions
- **WHEN** the active settings tab is maintenance or about
- **THEN** the global settings footer SHALL remain hidden

#### Scenario: AI dialog entry behavior remains unchanged
- **WHEN** a user opens AI tool permission, built-in prompt, or user skill editor actions from settings
- **THEN** the same dialogs SHALL open with the same props and visual variant contracts as before the visual refresh

### Requirement: Settings page remains responsive in narrow layouts
The settings page SHALL remain usable in narrow dialogs and mobile-width containers after the visual refresh.

#### Scenario: Narrow layout stacks safely
- **WHEN** the settings container width is below the existing narrow breakpoint
- **THEN** settings tabs, subtabs, content, forms, AI rows, and footer actions SHALL wrap or stack without horizontal clipping, overlapping controls, or hidden primary actions

#### Scenario: Touch targets remain usable
- **WHEN** the settings page is rendered below the mobile-width breakpoint
- **THEN** tab buttons, subtab buttons, form controls, and footer buttons SHALL keep usable hit areas while preserving the compact Lumina-lite density

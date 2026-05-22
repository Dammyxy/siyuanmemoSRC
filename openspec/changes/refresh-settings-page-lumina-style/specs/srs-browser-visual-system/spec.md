## ADDED Requirements

### Requirement: SRS Browser uses SiYuan-native Lumina-lite visual tokens
The SRS Browser SHALL render with a compact visual system based on SiYuan `b3` theme variables, 1px borders, light dividers, restrained primary/action highlights, and 4-8px default radii for routine browser controls.

#### Scenario: Native theme variables drive Browser surfaces
- **WHEN** the SRS Browser is rendered in dialog, tab, dock, or mobile mode
- **THEN** browser shell, hierarchy, toolbar, filters, scope chips, grid, preview, diagnostics, navigator drawer, and neural panels SHALL use `b3` theme variables for background, text, border, hover, selected, and primary states instead of hard-coded white or high-saturation decorative surfaces

#### Scenario: Compact token rhythm is applied
- **WHEN** the SRS Browser is rendered on desktop
- **THEN** routine browser controls SHALL use compact 11-14px text, 30-36px toolbar/input/button height, 4-8px control radii, and 1px dividers unless an embedded editor or Protyle preview requires more space

### Requirement: Browser toolbar remains functional while adopting light action states
The SRS Browser toolbar SHALL preserve search, preset/card-type filtering, filter dialog entry, selection controls, practice entry, view toggles, preview toggle, navigator toggle, AI entry, refresh, spread, sort, and open-in-tab behavior while rendering states with light SiYuan-native emphasis.

#### Scenario: Toolbar actions keep emitted behavior
- **WHEN** a user activates any toolbar control
- **THEN** the toolbar SHALL emit the same event or model update as before the visual refresh

#### Scenario: High-value actions use restrained emphasis
- **WHEN** practice, AI, select-all, preview, navigator, filter, and open-in-tab actions are visible
- **THEN** each action SHALL remain identifiable through icon, label, title, and light state styling without relying on filled high-saturation buttons

#### Scenario: Toolbar density profiles remain stable
- **WHEN** the Browser toolbar is rendered in normal, compact, tight, tab-wide, tab-narrow, or mobile layout profile
- **THEN** controls SHALL wrap, scroll, or collapse according to the existing layout behavior without clipping primary actions

### Requirement: Browser grid and preview use flat dense surfaces
The SRS Browser grid and preview surfaces SHALL preserve current AG Grid behavior and preview behavior while using flat dense Lumina-lite styling.

#### Scenario: AG Grid behavior remains unchanged
- **WHEN** Browser renders rows through AG Grid
- **THEN** row model, pagination, selection, row identity, row click, double-click, context menu, sort, filter, and displayed-column events SHALL remain unchanged

#### Scenario: AG Grid visual states are compact and theme-aware
- **WHEN** grid header, rows, selected rows, suspended rows, checkboxes, paging panel, and first-page overlay are visible
- **THEN** they SHALL use compact row/header heights, `b3` variables, light selected states, and 1px dividers without decorative shadows or hard-coded white surfaces

#### Scenario: Preview panel remains readable
- **WHEN** a Browser preview is open, empty, missing source, or showing document metadata
- **THEN** preview header, metadata, breadcrumb, missing-source state, and body SHALL use compact theme-aware surfaces while preserving jump and delete-card behavior

### Requirement: Browser hierarchy, diagnostics, and neural panels share the same system
The SRS Browser SHALL align hierarchy/navigation surfaces, count diagnostics, navigator drawer, and neural browser panels with the same flat dense visual system.

#### Scenario: Hierarchy and diagnostics remain scan-friendly
- **WHEN** hierarchy navigator, scope chips, count diagnostics, or navigator drawer are visible
- **THEN** they SHALL use light borders, compact text, theme-aware hover/selected states, and no decorative heavy shells

#### Scenario: Neural Browser panels remain functional and visually aligned
- **WHEN** Neural Roam, route bar, focus list, history list, anchor list, activation trace panel, semantic workbench, or narrow roam segments are visible in Browser
- **THEN** those panels SHALL preserve their existing events and state behavior while using compact cards, 4-8px radii, light primary states, and `b3` variables

### Requirement: Browser behavior and runtime contracts are unchanged
The visual refresh SHALL NOT change Browser query state, data source selection, queue contracts, grid row identity, selection scope, preview loading, neural workspace behavior, or review handoff behavior.

#### Scenario: Query and selection state remain unchanged
- **WHEN** a user changes search, preset, card type, queue, document focus, global scope, selected page, all-matching selection, or clear selection
- **THEN** Browser SHALL update the same state and call the same runtime paths as before the visual refresh

#### Scenario: Neural and Semantic handoff remain unchanged
- **WHEN** a user uses Neural Roam or Browser Semantic actions from Browser
- **THEN** Browser SHALL call the same neural controller, route, preview, jump, and review handoff paths as before the visual refresh

### Requirement: Browser remains responsive in dialog, tab, dock, and mobile profiles
The SRS Browser SHALL remain usable across existing layout profiles after the visual refresh.

#### Scenario: Tab and dialog profiles fit without overlap
- **WHEN** Browser is rendered in dialog, tab-wide, or tab-narrow profile
- **THEN** toolbar, hierarchy, grid, preview, navigator drawer, and neural panels SHALL fit without overlapping controls or hiding primary actions

#### Scenario: Mobile profile keeps usable controls
- **WHEN** Browser is rendered in mobile mode
- **THEN** toolbar controls, hierarchy area, grid/preview region, neural panels, and drawer controls SHALL remain reachable with usable hit areas while preserving compact density

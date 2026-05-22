## Why

The SiYuanMemo settings page and SRS Browser already have functional layouts, but their visual systems are mixed: some areas follow a flat SiYuan-native density while AI cards, browser toolbar actions, chips, neural panels, and form surfaces still use larger radii, hard-coded translucent whites, filled accents, and heavier card styling.

Lumina shows a better fit for SiYuan plugin management surfaces: native `b3` theme variables, 1px borders, 4-8px radii, compact 12-14px type, and primary-lightest active states. Applying that style to SiYuanMemo settings and SRS Browser will make both primary management surfaces denser, calmer, and more consistent without changing settings, browser query, grid, or review semantics.

## What Changes

- Refresh the settings page and SRS Browser visual systems around a Lumina-lite style: SiYuan-native colors, compact spacing, light dividers, restrained primary highlights, and flat cards.
- Normalize settings navigation, subtabs, form rows, action buttons, meta chips, AI tool cards, prompt cards, user skill cards, examples, foldouts, and footer to the same density and token set.
- Normalize SRS Browser shell, hierarchy navigator, toolbar, filters, scope chips, grid states, preview panel, count diagnostics, navigator drawer, and neural browser panels to the same density and token set.
- Remove hard-coded white/translucent card backgrounds and AI-specific blue-purple chip styling where they fight SiYuan themes.
- Remove filled/high-saturation browser toolbar accents where light primary/action states can preserve meaning without visual noise.
- Preserve current settings tabs, subtabs, save payloads, emitted events, and handler contracts.
- Preserve current SRS Browser query state, grid behavior, selection behavior, preview behavior, neural workspace behavior, and emitted events.
- Preserve maintenance/about behavior where global save actions remain hidden.
- Keep responsive behavior for narrow settings and browser dialog/tab/mobile widths.

## Capabilities

### New Capabilities

- `settings-page-visual-system`: Defines the visual and interaction requirements for the SiYuanMemo settings page shell, navigation, form rows, actions, cards, state styling, and responsive behavior.
- `srs-browser-visual-system`: Defines the visual and interaction requirements for the SRS Browser shell, toolbar, hierarchy/navigation surfaces, grid, preview, diagnostics, neural panels, and responsive behavior.

### Modified Capabilities

- None.

## Impact

- Affected UI files:
  - `src/ui/settings/SettingsPanel.vue`
  - `src/ui/settings/SettingsPanel.css`
  - `src/ui/settings/settingsPanelViewModel.ts` only if visual grouping metadata is needed
  - `src/ui/settings/ai/*` only if nested AI settings components require local style alignment
  - `src/ui/browser/SRSBrowser.vue`
  - `src/ui/browser/SRSBrowser.scss`
  - `src/ui/browser/BrowserToolbar.vue`
  - `src/ui/browser/BrowserHierarchy.vue`
  - `src/ui/browser/BrowserPreview.vue`
  - `src/ui/browser/CardBrowserGrid.vue` only if retained active component styling must be aligned
  - `src/ui/browser/neural/*` only if nested neural browser panels require local style alignment
- Affected tests:
  - `src/ui/settings/__tests__/SettingsPanel.test.ts`
  - `src/ui/browser/__tests__/BrowserToolbar.styles.spec.ts`
  - focused browser rendering/style tests where existing behavior assertions already cover toolbar, layout, and preview states
  - focused CSS/class/rendering assertions for settings density and retained behavior
- No settings schema changes.
- No Browser query, data source, queue, grid row identity, selection, preview, or review handoff contract changes.
- No application service, persistence, queue, scheduler, review, or kernel companion contract changes.

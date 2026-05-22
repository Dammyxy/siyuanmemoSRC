## Context

SiYuanMemo settings are implemented in `src/ui/settings/SettingsPanel.vue` with most visual rules in `src/ui/settings/SettingsPanel.css`. The current shell already has a left settings rail, horizontal subtabs, per-tab content panels, hidden footer behavior for maintenance/about, and focused tests in `src/ui/settings/__tests__/SettingsPanel.test.ts`.

SRS Browser is opened from `DialogManager.openSRSBrowser` and rendered by `src/ui/browser/SRSBrowser.vue`. Its main visual rules are in `src/ui/browser/SRSBrowser.scss`, with local structure in `BrowserToolbar.vue`, `BrowserHierarchy.vue`, `BrowserPreview.vue`, AG Grid styling, and nested neural browser components. It supports dialog, tab, dock, mobile, tab-wide, and tab-narrow profiles, so visual changes must preserve responsive layout and runtime behavior.

The settings CSS currently contains two visual passes. The later F-Misc pass moves the page toward a flat SiYuan-native style, but several selectors still inherit the earlier card-heavy system: 18px radii, gradient/translucent AI cards, hard-coded rgba white backgrounds, pill chips, and mixed button shapes.

The Browser SCSS has a similar mixed state. It already uses compact toolbar/list/table surfaces, but still contains filled practice/AI toolbar actions, 999px chips and segmented controls, high-saturation color-mix action groups, larger neural cards, box shadows, and decorative missing-state gradients. Lumina's management UI gives a better target for both surfaces: compact rows, 1px dividers, 4-8px radii, `b3` variables, 12-14px text, and primary-lightest hover/selected states.

This change is UI-only. It must not alter settings data shape, save payloads, emitted events, Browser query state, Browser data sources, AG Grid row identity, selection behavior, preview behavior, neural workspace behavior, application services, persistence, queue behavior, review behavior, or kernel companion contracts.

## Goals / Non-Goals

**Goals:**

- Make the settings page and SRS Browser visually consistent with Lumina-lite and SiYuan native density.
- Normalize the shell, tabs, subtabs, forms, buttons, chips, examples, foldouts, AI manager cards, prompt cards, user skill cards, and footer around one token set.
- Normalize Browser shell, hierarchy navigator, toolbar, filters, scope chips, grid, preview, diagnostics, navigator drawer, neural route/focus/history/trace panels, and mobile/tab profiles around the same token set.
- Remove hard-coded white/translucent card backgrounds and AI-specific blue-purple styling where `b3` variables can express the same state.
- Remove filled/high-saturation Browser toolbar accents where light primary/action states can preserve meaning without visual noise.
- Preserve all existing navigation, subtab selection, save behavior, maintenance/about footer behavior, and AI dialog entry behavior.
- Preserve all existing Browser query, selection, grid, preview, hierarchy, neural workspace, and action event behavior.
- Keep the layout usable in narrow dialogs/mobile widths.

**Non-Goals:**

- No new settings fields or schema migration.
- No redesign of settings information architecture beyond visual grouping needed for readability.
- No redesign of Browser data architecture, query flow, queue model, AG Grid data source lifecycle, or neural browser domain behavior.
- No Lumina illustration, Morandi theme, sticky-note review style, bookshelf cover style, or new theme selector.
- No changes to active runtime services outside the settings UI slice.

## Decisions

1. **Use local visual token layers instead of copying Lumina CSS.**
   - Decision: define or consolidate local settings and browser tokens in `SettingsPanel.css` and `SRSBrowser.scss` using `b3` variables as sources of truth.
   - Rationale: Lumina is bundled CSS with plugin-specific classes and some hard-coded colors. Copying it would import unrelated visual debt.
   - Alternative considered: copy Lumina selectors directly. Rejected because it would create class drift and theme conflicts.

2. **Keep the existing Vue structure unless a small wrapper improves visual grouping.**
   - Decision: prefer CSS-level normalization and only adjust `SettingsPanel.vue` or Browser Vue files for semantic wrappers/classes that make repeated rows easier to style.
   - Rationale: settings and browser behavior are covered by targeted tests; broad template movement would increase regression risk.
   - Alternative considered: split settings/browser into many subcomponents during the visual pass. Rejected as unrelated architecture work.

3. **Make active states light, not filled.**
   - Decision: selected tabs, subtabs, chips, Browser scope/filter states, preview toggles, and action states use `var(--b3-theme-primary-lightest)` plus primary text/border rather than filled primary blocks.
   - Rationale: Lumina and SiYuan native controls rely on light emphasis; filled primary blocks and saturated Browser action buttons make management surfaces feel heavier than surrounding UI.
   - Alternative considered: keep filled primary left tabs and filled Browser practice/AI actions. Rejected because it conflicts with the requested Lumina-derived style.

4. **Use compact row rhythm for settings forms.**
   - Decision: form rows and Browser rows use 12-16px vertical rhythm, 12-14px text, 30-36px controls, and 1px dividers.
   - Rationale: Settings and Browser are operational controls, not marketing cards. Dense scanning matters more than decorative separation.
   - Alternative considered: keep 18px cards and 42px inputs. Rejected because they inflate long settings tabs and reduce scan speed.

5. **Keep Browser AG Grid as table authority, style it lightly.**
   - Decision: retain AG Grid row model, pagination, selection, row classes, and event wiring; only normalize CSS variables, row/header density, selected/suspended states, and paging panel surfaces.
   - Rationale: Browser grid lifecycle is behavior-heavy. Visual refresh must not disturb data source or row identity.
   - Alternative considered: replace grid with custom card/list layout. Rejected as a product redesign and high regression risk.

6. **Keep tests behavior-focused with small structural/class checks.**
   - Decision: update existing settings/browser tests only where class expectations or visual-contract assertions are useful; do not snapshot whole pages.
   - Rationale: snapshots would be brittle. The important risks are broken navigation, save payloads, toolbar actions, selection, preview toggles, AI dialog entry, hidden footer behavior, and missing theme classes.

## Risks / Trade-offs

- **Risk: CSS-only cleanup misses nested AI component surfaces.** -> Mitigation: scan `.ai-*`, `.form-*`, `.settings-*`, `.btn-*`, and nested settings AI components for hard-coded colors/radii after editing.
- **Risk: CSS-only cleanup misses nested Browser neural component surfaces.** -> Mitigation: scan `.card-browser-*`, `.toolbar-*`, `.preview-*`, `.neural-*`, and nested browser components for hard-coded colors/radii after editing.
- **Risk: Compact spacing can hurt touch usability on narrow screens.** -> Mitigation: keep mobile buttons/tabs at practical hit sizes and verify responsive rules for `max-width: 980px` and `max-width: 760px`.
- **Risk: Removing filled primary states reduces selected-tab or Browser action clarity.** -> Mitigation: pair primary-lightest background with primary text/border, keep subtab underline, and retain concise text/icons/tooltips for Browser high-value actions.
- **Risk: Browser toolbar compactness can hide primary actions.** -> Mitigation: preserve existing density/layout-profile logic and verify normal, compact, tight, tab-wide, tab-narrow, and mobile toolbar wrapping.
- **Risk: Hard-coded whites remain and break dark themes.** -> Mitigation: grep `SettingsPanel.css`, `SRSBrowser.scss`, and nested settings/browser CSS for `rgba(255`, `#fff`, `#f5`, and replace active surfaces with `b3` variables where safe.
- **Risk: Existing tests assume specific class placement.** -> Mitigation: keep public class names stable unless a test is intentionally updated for the new visual contract.

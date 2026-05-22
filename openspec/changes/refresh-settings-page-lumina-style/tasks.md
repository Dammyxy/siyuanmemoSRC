## 1. Trace And Audit

- [x] 1.1 Trace the active settings entry path from `DialogManager` to `SettingsPanel.vue` and confirm the change stays inside the settings UI slice.
- [x] 1.2 Trace the active SRS Browser entry path from `DialogManager.openSRSBrowser` to `SRSBrowser.vue`, `BrowserToolbar.vue`, hierarchy, grid, preview, and neural browser panels.
- [x] 1.3 Audit `SettingsPanel.css` for mixed visual systems: hard-coded white/translucent surfaces, large radii, filled primary tab states, blue-purple AI chips, gradients, and heavy card shadows.
- [x] 1.4 Audit `SRSBrowser.scss` and Browser component scoped styles for mixed visual systems: high-saturation filled toolbar actions, 999px chips, hard-coded rgba whites/blacks, large neural cards, decorative gradients, and heavy drawer/panel shadows.
- [x] 1.5 Audit nested settings AI components under `src/ui/settings/ai/` and nested browser/neural components under `src/ui/browser/` for local styles that conflict with the shared visual system.

## 2. Visual System Implementation

- [x] 2.1 Add or consolidate local settings and browser token layers in `SettingsPanel.css` and `SRSBrowser.scss` based on SiYuan `b3` variables, compact spacing, 4-8px routine radii, and light primary states.
- [x] 2.2 Normalize settings shell, left tabs, secondary tabs, subtabs, content padding, and footer to the Lumina-lite density while preserving class names used by tests.
- [x] 2.3 Normalize form rows, labels, hints, inputs, selects, textareas, examples, quick actions, foldouts, guide rows, queue rows, symbol rows, and shortcut rows to flat dense sections.
- [x] 2.4 Normalize AI settings manager cards, tool groups, tool rows, prompt preset cards, user skill cards, chips, badges, and actions to the same flat dense visual system.
- [x] 2.5 Normalize Browser shell, hierarchy navigator, toolbar, filter button, scope chips, count diagnostics, navigator drawer, preview panel, missing-source state, and AG Grid theme variables to the same flat dense visual system.
- [x] 2.6 Normalize Browser neural route/focus/history/anchor/trace/semantic panels and narrow roam segmented controls to compact theme-aware cards and light primary states.
- [x] 2.7 Preserve settings responsive rules for `max-width: 980px` and `max-width: 760px`, plus Browser normal/compact/tight/tab-wide/tab-narrow/mobile layout profile behavior.

## 3. Behavior Preservation Tests

- [x] 3.1 Update or add focused `SettingsPanel.test.ts` assertions that the settings panel keeps the `siyuanmemo-settings-theme` class and renders the expected tab/subtab structure.
- [x] 3.2 Verify existing save payload tests still pass for learning, review, card, capture-sync, neural, AI, and user skill settings.
- [x] 3.3 Verify maintenance/about tabs still hide the settings footer.
- [x] 3.4 Verify AI tool permission, built-in prompt, and user skill editor actions still open the same dialogs with the same props and visual variant contracts.
- [x] 3.5 Update or add focused Browser toolbar/style assertions that toolbar density classes, filter active states, preview/navigator toggles, selection buttons, and action events remain wired.
- [x] 3.6 Verify existing Browser grid, hierarchy, selection, preview, and neural browser tests still pass for changed surfaces.

## 4. Validation

- [x] 4.1 Run targeted settings tests with `pnpm exec vitest run src/ui/settings/__tests__/SettingsPanel.test.ts`.
- [x] 4.2 Run targeted Browser UI tests with `pnpm exec vitest run src/ui/browser/__tests__/BrowserToolbar.styles.spec.ts src/ui/browser/__tests__/BrowserToolbar.spec.ts src/ui/browser/__tests__/SRSBrowser.tab-layout.spec.ts src/ui/browser/__tests__/BrowserPreview.spec.ts`.
- [x] 4.3 Run a grep validation over settings and browser CSS for remaining hard-coded white/translucent surfaces, filled high-saturation buttons, and large decorative radii; document any intentional exceptions.
- [x] 4.4 Run `pnpm run check:boundaries` or `node scripts/check-hidden-fallbacks.cjs`.
- [x] 4.5 Run `pnpm build`.
- [x] 4.6 Append a `docs/DDD_RESCAN_BACKLOG.md` task delta if production `src/` files are changed during implementation.

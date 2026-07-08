## 1. Review Interruption Removal

- [ ] 1.1 Remove Review CDF interruption panel rendering from `ReviewView.vue`.
- [ ] 1.2 Remove `reviewCdfInterruptionPanel`, blocking reason builders, locate/edit/open-abnormal handlers, and `advanceReviewCdfBlockingCard`.
- [ ] 1.3 Remove `blocked-cdf` from Review no-score removal diagnostics and update affected tests.

## 2. Browser Diagnostic Surface Removal

- [ ] 2.1 Remove `cdf-abnormal` Browser preset/action entrypoints.
- [ ] 2.2 Remove Browser CDF repair result presentation/dialog surface and menu wiring.
- [ ] 2.3 Remove now-unused CDF abnormal/repair i18n keys.

## 3. Docs And Validation

- [ ] 3.1 Update architecture/backlog docs for CDF diagnostic surface removal.
- [ ] 3.2 Run focused Review/Browser tests, hidden fallback check, boundary check, build, OpenSpec validation, and diff hygiene checks.

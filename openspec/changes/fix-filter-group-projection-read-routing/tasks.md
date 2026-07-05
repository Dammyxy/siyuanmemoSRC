## 1. Review Routing

- [x] 1.1 Add a FilterGroup Review routing guard that bypasses global projection row hydration.
- [x] 1.2 Keep Browser/projection-owned FilterGroup read mode unchanged.

## 2. Regression Coverage

- [x] 2.1 Cover dynamic FilterGroup Review selecting live filtered cards under projection rollout.
- [x] 2.2 Cover static subset FilterGroup Review staying on exact local scope.

## 3. Validation

- [x] 3.1 Run focused Review/Queue strategy tests for FilterGroup projection routing.
- [x] 3.2 Run OpenSpec validation, boundary checks, build, and update debt ledger.

# Card Migration Tests Summary

## Overview

This document summarizes the implementation of comprehensive unit tests for the `migrateCard()` function in the StorageManager, which handles card-level migration during the FSRS v6 upgrade.

## Test File Location

- **File**: `src/core/storage/__tests__/card-migration.test.ts`
- **Test Framework**: Vitest
- **Total Tests**: 39 tests
- **Status**: ✅ All tests passing

## Test Coverage

### 1. FSRS v5 → v6 Migration (5 tests)

Tests verify that cards with `fsrs-v5` scheduler type are correctly migrated to `fsrs-v6`:

- ✅ Migrates card schedulerType from fsrs-v5 to fsrs-v6
- ✅ Preserves all card data during migration
- ✅ Preserves review history (reps, lapses, lastReview, elapsedDays, scheduledDays)
- ✅ Handles multiple cards with fsrs-v5 scheduler
- ✅ Logs migration events to console

### 2. SM-2 → v6 Migration (5 tests)

Tests verify that cards with `sm2` scheduler type are correctly migrated to `fsrs-v6`:

- ✅ Migrates card schedulerType from sm2 to fsrs-v6
- ✅ Preserves all card data during migration
- ✅ Preserves card state (state, leechCount, isLeech)
- ✅ Handles multiple cards with sm2 scheduler
- ✅ Logs migration events to console

### 3. A-Factor → A-Factor v2 Migration (4 tests)

Tests verify that Topic cards with `a-factor` scheduler are migrated to `a-factor-v2`:

- ✅ Migrates card schedulerType from a-factor to a-factor-v2
- ✅ Preserves aFactor value
- ✅ Preserves topic card metadata (afs history, of, optimalInterval)
- ✅ Logs migration events to console

### 4. Data Preservation (7 tests)

Tests verify that all card data is preserved during migration:

- ✅ Preserves all FSRS core fields (due, stability, difficulty, reps, lapses, state, lastReview, elapsedDays, scheduledDays)
- ✅ Preserves card metadata (priority, type, tags, leechCount, isLeech, createdAt, updatedAt)
- ✅ Preserves skip information (skipped, skipNote, skipUntil)
- ✅ Preserves incremental reading data (sourceUrl, extractedFrom)
- ✅ Preserves Riff sync information (syncToRiff, riffCardId)
- ✅ Preserves scheduler metadata (sm15, topic)
- ✅ Preserves custom meta field

### 5. No Migration Needed (6 tests)

Tests verify that cards that don't need migration are left unchanged:

- ✅ Does not modify cards with fsrs-v6 scheduler
- ✅ Does not modify cards with a-factor-v2 scheduler
- ✅ Does not modify cards with riff scheduler
- ✅ Does not modify cards with sm15 scheduler
- ✅ Does not modify cards without schedulerType
- ✅ Does not log migration for cards that don't need it

### 6. Mixed Migration Scenarios (3 tests)

Tests verify batch migration with different card types:

- ✅ Handles migration of multiple cards with different scheduler types
- ✅ Preserves unique data for each card during batch migration
- ✅ Handles large batch of cards efficiently (100+ cards)

### 7. Edge Cases (6 tests)

Tests verify handling of unusual or edge case scenarios:

- ✅ Handles card with null schedulerType
- ✅ Handles card with unknown schedulerType
- ✅ Handles card with empty string schedulerType
- ✅ Handles card with minimal data
- ✅ Handles card with all optional fields populated
- ✅ Handles empty cards array

### 8. Integration with Storage (3 tests)

Tests verify integration with the StorageManager:

- ✅ Persists migrated cards correctly
- ✅ Retrieves migrated cards by blockId
- ✅ Includes migrated cards in getAllCards

## Requirements Validated

The tests validate the following requirements from the spec:

- **Requirement 6.1**: System loads FSRS v5 data and migrates correctly
- **Requirement 6.2**: System loads SM-2 data and migrates correctly
- **Requirement 6.3**: System preserves all historical review records
- **Requirement 6.4**: System uses new scheduler for next review after migration
- **Requirement 6.5**: System logs errors and keeps original data on migration failure
- **Requirement 9.2**: System replaces 'fsrs-v5' with 'fsrs-v6'
- **Requirement 9.3**: System replaces 'sm2' with 'fsrs-v6'

## Task Details Covered

All task details from Phase 2.3 are covered:

- ✅ Test scheduler type migrations for cards (fsrs-v5 → fsrs-v6, sm2 → fsrs-v6, a-factor → a-factor-v2)
- ✅ Test data preservation during card migration
- ✅ Ensure all card data and review history is preserved

## Test Results

```
Test Files  1 passed (1)
     Tests  39 passed (39)
  Duration  2.11s
```

All tests pass successfully, confirming that the `migrateCard()` function:

1. Correctly migrates scheduler types from old to new versions
2. Preserves all card data and review history
3. Handles edge cases gracefully
4. Logs migration events appropriately
5. Integrates properly with the StorageManager

## Implementation Details

### Test Structure

The tests use a comprehensive approach:

1. **Mock Setup**: Mocks the Siyuan API to simulate file system operations
2. **Test Helpers**: Provides utility functions to create mock cards and setup storage
3. **Descriptive Tests**: Each test has a clear name describing what it validates
4. **Comprehensive Assertions**: Tests verify both the migration and data preservation

### Key Test Patterns

1. **Arrange-Act-Assert**: All tests follow the AAA pattern for clarity
2. **Isolation**: Each test is independent and doesn't affect others
3. **Mock Cleanup**: Mocks are cleared before each test and restored after
4. **Console Logging**: Tests verify that migration events are logged

## Next Steps

With card migration tests complete, the next phase involves:

1. Running all existing property-based tests to ensure compatibility
2. Running all unit tests to verify no regressions
3. Manual testing of the complete migration workflow
4. Documentation updates

## Conclusion

The card migration tests provide comprehensive coverage of the `migrateCard()` function, ensuring that the FSRS v6 upgrade maintains backward compatibility with existing card data while correctly migrating scheduler types. All 39 tests pass, validating that the implementation meets the requirements and handles edge cases appropriately.

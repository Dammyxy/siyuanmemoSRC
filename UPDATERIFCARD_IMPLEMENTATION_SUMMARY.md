# updateRiffCard() Implementation Summary

## Task Completed
✅ **Task 1.3**: 实现 `updateRiffCard()` API

## Implementation Details

### Function Signature
```typescript
export async function updateRiffCard(
    deckID: string,
    cardID: string,
    updates: Partial<RiffCard>
): Promise<void>
```

### Key Features

1. **Updates Card Data Without Triggering Scheduling**
   - Uses `batchSetRiffCardsDueTime` API to update the `due` field
   - Does NOT call `reviewRiffCard`, preventing Riff's scheduling algorithm from running
   - Allows local schedulers to maintain full control over card scheduling

2. **API Limitation Documentation**
   - Clearly documents that only the `due` field can be updated
   - Other fields (state, lapses, reps, lastReview) are ignored due to Riff API limitations
   - Includes JSDoc comments explaining the limitation and future extensibility

3. **Error Handling**
   - Propagates API errors to caller
   - Propagates network errors to caller
   - No silent failures - errors are thrown for proper handling upstream

### Implementation Location
- **File**: `siyuan-plugin-fsrs/src/core/siyuan/riff.ts`
- **Lines**: Added after `getRiffNewCards()` function, before `batchSetRiffCardsDueTime()`

### Test Coverage

Comprehensive test suite with **20 test cases** covering:

#### Basic Functionality (4 tests)
- ✅ Updates card due time using batchSetRiffCardsDueTime
- ✅ Handles updates with only due field
- ✅ Does not call API when due field is not provided
- ✅ Does not call API when updates object is empty

#### API Limitation - Unsupported Fields (5 tests)
- ✅ Ignores state field updates
- ✅ Ignores reps field updates
- ✅ Ignores lapses field updates
- ✅ Ignores lastReview field updates
- ✅ Ignores all unsupported fields and only updates due

#### Error Handling (2 tests)
- ✅ Propagates API errors
- ✅ Propagates network errors

#### Edge Cases (4 tests)
- ✅ Handles due date in the past
- ✅ Handles due date far in the future
- ✅ Handles empty string card ID
- ✅ Handles empty string deck ID

#### Requirement Validation (3 tests)
- ✅ Satisfies requirement 1.4: update card data without triggering scheduling
- ✅ Satisfies requirement 1.5: document limitation of only supporting due field
- ✅ Satisfies requirement 1.8: not call Riff scheduling algorithm

#### Integration Scenarios (2 tests)
- ✅ Works in a typical sync scenario
- ✅ Supports batch-like updates through multiple calls

### Requirements Satisfied

✅ **Requirement 1.4**: THE FSRS_Plugin SHALL 提供 `updateRiffCard()` API，该 API 更新卡片数据但不触发 Riff 调度

✅ **Requirement 1.5**: WHEN `updateRiffCard()` 被调用时，THE System SHALL 仅更新 Riff 数据库中指定的卡片字段

✅ **Requirement 1.8**: THE FSRS_Plugin SHALL NOT 在通过新 API 更新卡片数据时调用 Riff 的调度算法

## Usage Examples

### Basic Usage
```typescript
// Update card's due time
await updateRiffCard('deck-1', 'card-1', {
  due: new Date(Date.now() + 86400000).toISOString()
});
```

### Sync Scenario
```typescript
// Sync locally scheduled card to Riff
const localCard = {
  id: 'card-1',
  due: new Date(Date.now() + 86400000).toISOString(),
  state: 2,
  reps: 5,
  lapses: 1
};

// Only due will be synced; other fields are ignored
await updateRiffCard('deck-1', localCard.id, {
  due: localCard.due,
  state: localCard.state,  // Ignored
  reps: localCard.reps,    // Ignored
  lapses: localCard.lapses // Ignored
});
```

### Error Handling
```typescript
try {
  await updateRiffCard('deck-1', 'card-1', {
    due: new Date().toISOString()
  });
} catch (error) {
  console.error('Failed to update Riff card:', error);
  // Handle error appropriately
}
```

## API Limitation

**Current Limitation**: Only the `due` field can be updated due to Riff API constraints.

The function uses `batchSetRiffCardsDueTime` which is the only available API for updating card data without triggering scheduling. Other fields like `state`, `reps`, `lapses`, and `lastReview` cannot be updated through the current Riff API.

**Future Enhancement**: If SiYuan provides a more comprehensive update API in the future, this function can be extended to support updating additional fields.

## Integration with Riff Decoupling Architecture

This function is a critical component of the Riff decoupling architecture:

1. **Data-Only Mode**: Enables local schedulers to optionally sync their scheduling decisions back to Riff
2. **Bidirectional Sync**: Supports the optional backup of local scheduling data to Riff
3. **No Scheduling Interference**: Ensures Riff's scheduling algorithm is not triggered, maintaining local scheduler independence

## Next Steps

The next task in the riff-decoupling spec is:
- **Task 1.4**: 实现 `syncToRiff()` 辅助函数

This will build on `updateRiffCard()` to provide a higher-level sync function with error handling for the bidirectional sync mode.

## Test Results

All 49 tests pass:
- ✅ 14 tests for getRiffCards() API
- ✅ 15 tests for getRiffNewCards() API
- ✅ 20 tests for updateRiffCard() API

**Test File**: `siyuan-plugin-fsrs/src/core/siyuan/__tests__/riff.test.ts`

## Documentation

The function includes comprehensive JSDoc documentation:
- Function description
- Parameter descriptions
- Return type
- API limitation warning
- Usage examples
- Future enhancement notes

This ensures developers understand both the capabilities and limitations of the function.

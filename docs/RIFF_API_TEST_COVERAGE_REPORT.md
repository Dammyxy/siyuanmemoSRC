# Riff API Unit Test Coverage Report

## Task 1.5: 编写 Riff API 单元测试

**Status**: ✅ COMPLETE

**Test File**: `src/core/siyuan/__tests__/riff.test.ts`

**Total Tests**: 70 tests (all passing)

---

## Coverage Analysis

### 1. getRiffCards() API Tests (14 tests)

#### Requirements Coverage:
- ✅ **Requirement 1.1**: API 提供 `getRiffCards()` 获取所有卡片
- ✅ **Requirement 1.2**: `dueOnly: false` 时返回所有卡片

#### Test Categories:

**Backward Compatibility (2 tests)**
- ✅ Old API signature with (deckID, page, pageSize)
- ✅ Default parameters (page=1, pageSize=20)

**dueOnly Option (2 tests)**
- ✅ Fetch only due cards when `dueOnly=true`
- ✅ Fetch all cards when `dueOnly=false` with pagination

**notebook Option (2 tests)**
- ✅ Fetch cards from specific notebook
- ✅ Handle pagination for notebook cards

**rootID Option (2 tests)**
- ✅ Fetch cards from document tree
- ✅ Handle pagination for tree cards

**includeNew Option (1 test)**
- ✅ Include new cards when `includeNew=true`

**Edge Cases (3 tests)**
- ✅ Empty card set
- ✅ Single page with less than pageSize cards
- ✅ Stop pagination when blocks array is empty

**Priority of Options (2 tests)**
- ✅ notebook > rootID > dueOnly priority
- ✅ rootID > dueOnly priority

---

### 2. getRiffNewCards() API Tests (15 tests)

#### Requirements Coverage:
- ✅ **Requirement 1.3**: API 提供 `getRiffNewCards()` 获取指定时间戳之后的卡片
- ✅ **Requirement 8.3**: 支持增量更新

#### Test Categories:

**Basic Functionality (3 tests)**
- ✅ Return all cards when `since` is not specified
- ✅ Filter cards created after specified timestamp
- ✅ Return empty array when no cards match filter

**Timestamp Parsing (5 tests)**
- ✅ Handle ISO 8601 timestamp strings
- ✅ Handle Unix timestamp in seconds (10 digits)
- ✅ Handle Unix timestamp in milliseconds (13 digits)
- ✅ Handle invalid timestamps gracefully
- ✅ Handle missing created field

**Edge Cases (3 tests)**
- ✅ Empty card set
- ✅ `since=0` (return all cards)
- ✅ Future timestamp (return no cards)

**Integration with getRiffCards (2 tests)**
- ✅ Call getRiffCards with correct parameters
- ✅ Handle pagination from getRiffCards

**Requirement Validation (2 tests)**
- ✅ Requirement 1.3: Filter cards by creation time
- ✅ Requirement 8.3: Support incremental updates

---

### 3. updateRiffCard() API Tests (20 tests)

#### Requirements Coverage:
- ✅ **Requirement 1.4**: API 提供 `updateRiffCard()` 更新卡片数据
- ✅ **Requirement 1.5**: 仅更新指定字段，不触发 Riff 调度
- ✅ **Requirement 1.8**: 不调用 Riff 的调度算法

#### Test Categories:

**Basic Functionality (4 tests)**
- ✅ Update card due time using batchSetRiffCardsDueTime
- ✅ Handle updates with only due field
- ✅ No API call when due field is not provided
- ✅ No API call when updates object is empty

**API Limitation - Unsupported Fields (5 tests)**
- ✅ Ignore state field updates
- ✅ Ignore reps field updates
- ✅ Ignore lapses field updates
- ✅ Ignore lastReview field updates
- ✅ Ignore all unsupported fields, only update due

**Error Handling (2 tests)**
- ✅ Propagate API errors
- ✅ Propagate network errors

**Edge Cases (4 tests)**
- ✅ Due date in the past
- ✅ Due date far in the future
- ✅ Empty string card ID
- ✅ Empty string deck ID

**Requirement Validation (3 tests)**
- ✅ Requirement 1.4: Update card data without triggering scheduling
- ✅ Requirement 1.5: Document limitation of only supporting due field
- ✅ Requirement 1.8: Not call Riff scheduling algorithm

**Integration Scenarios (2 tests)**
- ✅ Typical sync scenario
- ✅ Batch-like updates through multiple calls

---

### 4. syncToRiff() Helper Function Tests (21 tests)

#### Requirements Coverage:
- ✅ **Requirement 1.6**: 提供 `syncToRiff()` 辅助函数
- ✅ **Requirement 6.1**: 在本地更新后调用 `syncToRiff()`
- ✅ **Requirement 6.2**: 使用卡片的调度参数调用 `updateRiffCard()`
- ✅ **Requirement 6.3**: 包含 due、state、lapses、reps、lastReview
- ✅ **Requirement 6.4**: 网络错误时记录错误不抛出异常
- ✅ **Requirement 6.5**: API 错误时记录错误不抛出异常
- ✅ **Requirement 6.7**: 同步失败时允许复习继续

#### Test Categories:

**Basic Functionality (3 tests)**
- ✅ Call updateRiffCard with card scheduling parameters
- ✅ Handle Date objects for due and lastReview
- ✅ Handle ISO string dates

**Error Handling - Does Not Throw Exceptions (4 tests)**
- ✅ Catch and log network errors without throwing
- ✅ Catch and log API errors without throwing
- ✅ Catch and log validation errors without throwing
- ✅ Handle multiple consecutive failures gracefully

**Edge Cases (4 tests)**
- ✅ Card with minimal fields
- ✅ Card with undefined lastReview
- ✅ Empty deck ID
- ✅ Empty card ID

**Requirement Validation (7 tests)**
- ✅ Requirement 1.6: Provide syncToRiff helper function
- ✅ Requirement 6.1: Call syncToRiff after successful local update
- ✅ Requirement 6.2: Use updateRiffCard with scheduling parameters
- ✅ Requirement 6.3: Include due, state, lapses, reps, lastReview in update
- ✅ Requirement 6.4: Log error on network failure without throwing
- ✅ Requirement 6.5: Log error on API failure without throwing
- ✅ Requirement 6.7: Allow review to continue even if sync fails

**Integration Scenarios (3 tests)**
- ✅ Typical SchedulerRouter sync flow
- ✅ Batch sync through multiple calls
- ✅ Partial batch failure gracefully

---

## Test Quality Assessment

### ✅ Strengths

1. **Comprehensive Coverage**: All four APIs have extensive test coverage
2. **Requirement Traceability**: Tests explicitly reference requirements they validate
3. **Edge Case Testing**: Thorough testing of edge cases and error conditions
4. **Error Handling**: Extensive testing of error scenarios (network, API, validation)
5. **Integration Testing**: Tests cover integration scenarios and typical usage patterns
6. **Backward Compatibility**: Tests ensure old API signatures still work
7. **Parameter Combinations**: Tests cover various parameter combinations

### ✅ Test Organization

- Clear test structure with descriptive test names
- Grouped by feature and functionality
- Separate sections for basic functionality, edge cases, and requirement validation
- Helper functions for creating mock data

### ✅ Requirement Coverage

All task requirements are fully covered:

| Requirement | Coverage |
|-------------|----------|
| 1.1 - getRiffCards() API | ✅ 14 tests |
| 1.2 - dueOnly parameter | ✅ 2 tests |
| 1.3 - getRiffNewCards() API | ✅ 15 tests |
| 1.4 - updateRiffCard() API | ✅ 20 tests |
| 1.5 - Field update limitations | ✅ 5 tests |
| 1.6 - syncToRiff() helper | ✅ 21 tests |
| 1.8 - No scheduling trigger | ✅ 3 tests |
| 6.1-6.7 - Sync error handling | ✅ 7 tests |
| 8.3 - Incremental updates | ✅ 2 tests |

---

## Test Execution Results

```
✓ src/core/siyuan/__tests__/riff.test.ts (70)
  ✓ Feature: riff-decoupling - getRiffCards() API (14)
  ✓ Feature: riff-decoupling - getRiffNewCards() API (15)
  ✓ Feature: riff-decoupling - updateRiffCard() API (20)
  ✓ Feature: riff-decoupling - syncToRiff() helper function (21)

Test Files  1 passed (1)
     Tests  70 passed (70)
  Duration  2.17s
```

**Status**: ✅ All tests passing

---

## Conclusion

Task 1.5 is **COMPLETE** with comprehensive test coverage:

- ✅ **70 tests** covering all four Riff API functions
- ✅ **All requirements** from the spec are validated
- ✅ **Edge cases** and error conditions thoroughly tested
- ✅ **Error handling** verified (network, API, validation errors)
- ✅ **Integration scenarios** tested
- ✅ **Backward compatibility** maintained
- ✅ **100% test pass rate**

The test suite provides excellent coverage of the Riff API layer and validates all the requirements specified in task 1.5.

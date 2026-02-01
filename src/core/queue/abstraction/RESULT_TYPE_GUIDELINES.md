# Result Type Guidelines for Queue Methods

## Overview

This document provides guidelines for using the `Result<T, E>` type pattern in queue implementations. The Result type pattern provides explicit error handling and eliminates silent failures.

## When to Use Result Type

According to **Requirement 8.1**, the system SHALL use Result type pattern for operations that can fail. The following queue methods are candidates for Result type:

### 1. Data Modification Methods

Methods that modify data and may fail due to database errors, validation failures, or other issues:

```typescript
// ❌ Current (implicit error handling)
async remove(items: TItem[]): Promise<number>;

// ✅ Recommended (explicit error handling)
async remove(items: TItem[]): Promise<Result<number>>;
```

**Rationale**: Database operations can fail due to connection issues, constraint violations, or other errors. Using Result type forces callers to handle these cases explicitly.

### 2. Feedback Processing

Methods that process user feedback and update card state:

```typescript
// ❌ Current (errors thrown as exceptions)
async onFeedback(currentItem: TItem | null, feedback: QueueFeedback): Promise<void>;

// ✅ Recommended (explicit error handling)
async onFeedback(currentItem: TItem | null, feedback: QueueFeedback): Promise<Result<void>>;
```

**Rationale**: Feedback processing involves scheduling calculations and database updates, both of which can fail.

### 3. Trait Methods

Trait methods that modify queue state:

```typescript
// IMutableTrait
async insertAt(items: TItem[], index: number): Promise<Result<void>>;

// IRemovableTrait  
async removeItems(items: TItem[]): Promise<Result<number>>;

// IPrioritizableTrait
async setPriority(item: TItem, priority: number): Promise<Result<boolean>>;
```

## Migration Strategy

To maintain backward compatibility while adopting Result types, we use a **gradual migration approach**:

### Phase 1: Documentation (Current)

- Document which methods should use Result type
- Provide examples of Result type usage
- Update JSDoc comments to indicate error handling expectations

### Phase 2: New Implementations

- New queue implementations should use Result type for error-prone methods
- Existing implementations can continue using current patterns
- Provide adapter utilities to convert between patterns if needed

### Phase 3: Gradual Refactoring (Optional)

- Refactor existing implementations to use Result type
- Update all callers to handle Result type
- Remove old error handling patterns

## Implementation Examples

### Example 1: DataSource with Result Type

```typescript
import { ok, err, type Result } from '@/types/result';

class MyDataSource extends ObservableDataSource<QueueItem> {
  async remove(items: QueueItem[]): Promise<Result<number>> {
    try {
      // Attempt to remove items from database
      const count = await this.db.delete(items);
      
      // Notify observers on success
      this.notifyObservers();
      
      return ok(count);
    } catch (error) {
      // Return error instead of throwing
      return err(error as Error);
    }
  }
}
```

### Example 2: Caller Handling Result

```typescript
// Explicit error handling
const result = await dataSource.remove([card1, card2]);

if (result.ok) {
  showNotice(`Successfully removed ${result.value} cards`);
} else {
  showNotice(`Failed to remove cards: ${result.error.message}`);
  errorReporter.report(result.error);
}
```

### Example 3: Chaining Results

```typescript
import { andThen, map } from '@/types/result';

// Chain multiple operations
const result = await dataSource.remove([card])
  .then(r => map(r, count => `Removed ${count} cards`))
  .then(r => andThen(r, async message => {
    await logOperation(message);
    return ok(message);
  }));
```

## Benefits of Result Type

1. **Explicit Error Handling**: Callers must handle both success and error cases
2. **Type Safety**: TypeScript ensures all cases are handled at compile time
3. **No Silent Failures**: Errors cannot be accidentally ignored
4. **Composable**: Results can be chained and transformed
5. **Testable**: Error paths are easier to test

## Current Status

**Task 9.3 Status**: ✅ Documented

The Result type pattern has been documented for queue methods. Actual implementation is deferred to maintain backward compatibility. New implementations (e.g., Xiuyuan module in Task 9.4) should follow these guidelines.

## Related Requirements

- **Requirement 8.1**: Use Result type pattern for operations that can fail
- **Requirement 8.2**: Return { ok: true, value: T } on success
- **Requirement 8.3**: Return { ok: false, error: Error } on failure
- **Requirement 8.4**: Force explicit handling of both cases
- **Requirement 8.5**: Eliminate silent failures

## See Also

- [Result Type Implementation](../../../types/result.ts)
- [Observer Pattern](./OBSERVER_PATTERN.md)
- [Trait Pattern](./TRAIT_PATTERN.md)

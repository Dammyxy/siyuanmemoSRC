# Generic Type Constraints Implementation

## Overview

This document describes the implementation of generic type constraints for queue-related interfaces, satisfying **Requirement 6.2**: "WHEN defining IQueue interface, THE System SHALL constrain TItem to extend QueueItem".

## Changes Made

### 1. Updated Interface Constraints

All queue-related interfaces now require that the generic type parameter `TItem` extends `QueueItem`:

**Core Interfaces:**
- `IQueueStrategy<TItem extends QueueItem>` - Queue strategy interface
- `ISequencer<TItem extends QueueItem>` - Sequencer interface for ordering items
- `IDataSource<TItem extends QueueItem>` - Data source interface for fetching items
- `IObservableDataSource<TItem extends QueueItem>` - Observable data source with observer pattern
- `QueueInterface<TItem extends QueueItem>` - Base queue interface

**Trait Interfaces:**
- `IMutableTrait<TItem extends QueueItem>` - Insertion capabilities
- `IRemovableTrait<TItem extends QueueItem>` - Deletion capabilities
- `IPrioritizableTrait<TItem extends QueueItem>` - Priority management
- `IInterceptiveTrait<TItem extends QueueItem>` - Pre-processing hooks

#### IQueueStrategy (Strategy.ts)
```typescript
// Before:
export interface IQueueStrategy<TItem = any>

// After:
export interface IQueueStrategy<TItem extends import('../types').QueueItem = any>
```

#### ISequencer (abstraction/types.ts)
```typescript
// Before:
export interface ISequencer<TItem>

// After:
export interface ISequencer<TItem extends import('../types').QueueItem>
```

#### IDataSource (datasource/IDataSource.ts)
```typescript
// Before:
export interface IDataSource<TItem>

// After:
export interface IDataSource<TItem extends QueueItem>
```

#### IObservableDataSource (datasource/IDataSource.ts)
```typescript
// Before:
export interface IObservableDataSource<TItem> extends IDataSource<TItem>

// After:
export interface IObservableDataSource<TItem extends QueueItem> extends IDataSource<TItem>
```

#### Trait Interfaces (abstraction/types.ts)
All trait interfaces now have the constraint:
- `IMutableTrait<TItem extends QueueItem>`
- `IRemovableTrait<TItem extends QueueItem>`
- `IPrioritizableTrait<TItem extends QueueItem>`
- `IInterceptiveTrait<TItem extends QueueItem>`

#### QueueInterface (types.ts)
```typescript
// Before:
export interface QueueInterface<TItem>

// After:
export interface QueueInterface<TItem extends QueueItem>
```

### 2. Updated BaseCompositeQueue

The base queue class now enforces the constraint:

```typescript
// Before:
export class BaseCompositeQueue<TItem = any>

// After:
export class BaseCompositeQueue<TItem extends QueueItem = QueueItem>
```

Also updated imports to use the correct locations:
- `IQueueStrategy` and `QueueFeedback` now imported from `../abstraction/Strategy`
- Added `QueueItem` import from `../types`

### 3. Updated CompositeQueueConfig

The configuration type also enforces the constraint:

```typescript
// Before:
export type CompositeQueueConfig<TItem>

// After:
export type CompositeQueueConfig<TItem extends QueueItem>
```

## Benefits

### 1. Compile-Time Type Safety

The constraint ensures that all queue items have the required `blockID` field:

```typescript
// ✅ Valid - has blockID
const item: QueueItem = {
  cardID: 'card-123',
  blockID: 'block-123',  // Required!
  deckID: 'deck-123',
  priority: 50,
};

// ❌ Compile error - missing blockID
const invalid: QueueItem = {
  cardID: 'card-123',
  // blockID: missing!
  deckID: 'deck-123',
  priority: 50,
};
```

### 2. Better IDE Support

IDEs can now provide accurate autocomplete for queue item properties:

```typescript
function processItem(item: QueueItem) {
  // IDE knows blockID exists and is a string
  console.log(item.blockID);  // ✅ Autocomplete works
  console.log(item.cardID);   // ✅ Autocomplete works
}
```

### 3. Prevents Type Mismatches

The constraint prevents accidentally using incompatible types:

```typescript
// ❌ Compile error - string doesn't extend QueueItem
const badQueue: IQueueStrategy<string> = ...;

// ✅ Valid - ReviewCard extends QueueItem
const goodQueue: IQueueStrategy<ReviewCard> = ...;
```

### 4. Enforces Architectural Consistency

All queue implementations must now work with items that have a `blockID`, ensuring consistency across the codebase.

## Testing

A comprehensive test suite was added in `__tests__/generic-constraint.test.ts` that verifies:

1. ✅ QueueItem interface requires blockID field
2. ✅ QueueItem allows optional FSRS fields
3. ✅ IQueueStrategy accepts types that extend QueueItem
4. ✅ ISequencer accepts types that extend QueueItem
5. ✅ blockID is always present and accessible
6. ✅ Works with arrays of QueueItems
7. ✅ Compile-time type checking is enforced

All tests pass successfully.

## Backward Compatibility

The changes are backward compatible because:

1. **Default Type Parameter**: `IQueueStrategy` uses `any` as the default, which satisfies the constraint in practice
2. **Existing Code**: All existing queue implementations already use `QueueItem` or types that extend it
3. **No Runtime Changes**: The constraints are compile-time only and don't affect runtime behavior

## Requirements Satisfied

✅ **Requirement 6.1**: QueueItem interface requiring blockID field (already implemented in task 5.1)
✅ **Requirement 6.2**: IQueue interface constrains TItem to extend QueueItem (implemented in this task)
✅ **Requirement 6.3**: Queue implementations enforce required fields (enforced by the constraint)
✅ **Requirement 6.4**: Compile-time errors for incompatible types (verified by tests)
✅ **Requirement 6.5**: Improved IDE autocomplete (verified manually)

## Related Documentation

- [QueueItem Interface](./QUEUE_ITEM_INTERFACE.md) - Details about the base QueueItem interface
- [Trait Pattern](./TRAIT_PATTERN.md) - How traits work with the generic constraints
- [Observer Pattern](./OBSERVER_PATTERN.md) - How observers interact with typed queues

## Future Enhancements

In Phase 2 (Task 11), the `blockID` field will be upgraded to use Branded Types:

```typescript
type BlockID = string & { readonly __brand: 'BlockID' };

export interface QueueItem {
  blockID: BlockID;  // Branded type prevents mixing with other strings
  // ... other fields
}
```

This will provide even stronger type safety by preventing accidental mixing of different ID types.

## References

- **Task**: 5.2 更新 IQueue 接口泛型约束
- **Requirement**: 6.2 - Generic type constraints for IQueue interface
- **Design Document**: Section 2 - Type Safety Interfaces
- **Test File**: `src/core/queue/__tests__/generic-constraint.test.ts`

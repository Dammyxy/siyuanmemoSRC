# ObservableDataSource Base Class

## Overview

The `ObservableDataSource` base class implements the Observer pattern for automatic cache invalidation in data sources. This eliminates the need for manual `reset()` calls in sequencers and queues when data changes.

## Architecture

```
┌─────────────────────────────────────────┐
│      ObservableDataSource<TItem>        │
│  (Abstract Base Class)                  │
├─────────────────────────────────────────┤
│  - observers: IDataSourceObserver[]     │
├─────────────────────────────────────────┤
│  + addObserver(observer)                │
│  + removeObserver(observer)             │
│  # notifyObservers()                    │
│  + getAll(): Promise<TItem[]>           │
│  + add(items): Promise<number>          │
│  + remove(items): Promise<number>       │
└─────────────────────────────────────────┘
           ▲
           │ extends
           │
┌──────────┴──────────────────────────────┐
│     Concrete Data Sources               │
│  - RiffDataSource                       │
│  - StorageDataSource                    │
│  - FilteredDataSource                   │
└─────────────────────────────────────────┘
```

## Key Features

### 1. Observer Management

- **`addObserver(observer)`**: Register an observer to be notified of data changes
  - Prevents duplicate registrations
  - Safe to call multiple times with the same observer

- **`removeObserver(observer)`**: Unregister an observer
  - Safe to call even if observer is not registered
  - Useful for cleanup when sequencers are destroyed

### 2. Automatic Notification

- **`notifyObservers()`**: Protected method that notifies all registered observers
  - Called automatically after data modifications
  - Catches and logs errors from individual observers
  - One observer's failure doesn't affect others

### 3. Data Operations

- **`getAll()`**: Abstract method that subclasses must implement
- **`add(items)`**: Optional method with default no-op implementation
- **`remove(items)`**: Optional method with default no-op implementation

## Usage Example

### Creating a Data Source

```typescript
import { ObservableDataSource } from './ObservableDataSource';
import type { ReviewCard } from '../types';

class MyDataSource extends ObservableDataSource<ReviewCard> {
  private items: ReviewCard[] = [];

  async getAll(): Promise<ReviewCard[]> {
    // Fetch data from storage
    return await this.fetchFromStorage();
  }

  async add(items: ReviewCard[]): Promise<number> {
    // Add items to storage
    this.items.push(...items);
    
    // Automatically notify observers
    this.notifyObservers();
    
    return items.length;
  }

  async remove(items: ReviewCard[]): Promise<number> {
    // Remove items from storage
    const initialLength = this.items.length;
    this.items = this.items.filter(item => 
      !items.some(i => i.blockID === item.blockID)
    );
    const removed = initialLength - this.items.length;
    
    // Only notify if something was actually removed
    if (removed > 0) {
      this.notifyObservers();
    }
    
    return removed;
  }
}
```

### Using with a Sequencer

```typescript
import type { IDataSourceObserver } from '../abstraction/types';

class MySequencer implements IDataSourceObserver {
  private loaded = false;
  private cache: ReviewCard[] = [];

  constructor(private dataSource: MyDataSource) {
    // Register as observer
    dataSource.addObserver(this);
  }

  onDataChanged(): void {
    // Invalidate cache when data changes
    this.loaded = false;
    this.cache = [];
  }

  async next(): Promise<ReviewCard | null> {
    if (!this.loaded) {
      this.loaded = true;
      this.cache = await this.dataSource.getAll();
    }
    return this.cache.shift() || null;
  }

  destroy(): void {
    // Cleanup: remove observer
    this.dataSource.removeObserver(this);
  }
}
```

## Benefits

### 1. Automatic Cache Invalidation

Before (manual reset):
```typescript
// In BaseCompositeQueue.rotateToEnd()
await this.currentQueue.remove([card]);
this.currentQueue.reset(); // Manual reset required!
```

After (automatic notification):
```typescript
// In BaseCompositeQueue.rotateToEnd()
await this.currentQueue.remove([card]);
// Sequencer cache automatically invalidated via observer pattern!
```

### 2. Decoupling

- Data sources don't need to know about sequencers
- Sequencers don't need to be manually reset
- Changes propagate automatically

### 3. Multiple Observers

- One data source can notify multiple sequencers
- All observers are notified on data changes
- Observers can be added/removed dynamically

### 4. Error Resilience

- Errors in one observer don't affect others
- Errors are logged but don't throw
- System remains stable even with failing observers

## Implementation Details

### Observer Registration

```typescript
addObserver(observer: IDataSourceObserver): void {
  if (!this.observers.includes(observer)) {
    this.observers.push(observer);
  }
}
```

- Uses array inclusion check to prevent duplicates
- O(n) complexity but acceptable for small observer lists

### Observer Notification

```typescript
protected notifyObservers(): void {
  for (const observer of this.observers) {
    try {
      observer.onDataChanged();
    } catch (error) {
      console.error('[ObservableDataSource] Observer notification failed:', error);
    }
  }
}
```

- Iterates through all observers
- Catches errors to prevent cascading failures
- Logs errors for debugging

### Default Implementations

```typescript
async add(items: TItem[]): Promise<number> {
  return 0; // No-op by default
}

async remove(items: TItem[]): Promise<number> {
  return 0; // No-op by default
}
```

- Provides default no-op implementations
- Subclasses can override as needed
- Maintains interface compatibility

## Testing

The implementation includes comprehensive tests covering:

### Observer Registration
- ✅ Registering observers
- ✅ Preventing duplicate registrations
- ✅ Multiple observer support

### Observer Removal
- ✅ Removing registered observers
- ✅ Safe removal of non-registered observers
- ✅ Selective removal

### Observer Notification
- ✅ Notification on add operations
- ✅ Notification on remove operations
- ✅ Multiple notifications
- ✅ All observers notified

### Error Handling
- ✅ Catching observer errors
- ✅ Continuing after errors
- ✅ Error logging

### Integration Scenarios
- ✅ Sequencer cache invalidation
- ✅ Multiple sequencers
- ✅ Observer cleanup

### Edge Cases
- ✅ Empty observer list
- ✅ Rapid successive notifications
- ✅ Recursive notifications

## Requirements Satisfied

This implementation satisfies the following requirements from the architecture optimization spec:

- **Requirement 1.1**: DataSource automatically notifies all registered observers
- **Requirement 1.5**: Multiple observers can be registered and all are notified

## Next Steps

The next tasks in the architecture optimization plan are:

1. **Task 1.3**: Update RiffDataSource to extend ObservableDataSource
2. **Task 1.4**: Update Sequencers to implement IDataSourceObserver
3. **Task 1.5**: Register observers in queue initialization
4. **Task 1.6**: Remove manual reset() calls

## References

- **Design Document**: `.kiro/specs/architecture-optimization/design.md`
- **Requirements**: `.kiro/specs/architecture-optimization/requirements.md`
- **ADR-002**: Observer Pattern for Cache Invalidation (to be created)
- **Interface Definition**: `src/core/queue/datasource/IDataSource.ts`
- **Observer Interface**: `src/core/queue/abstraction/types.ts`

## Related Files

- `src/core/queue/datasource/ObservableDataSource.ts` - Base class implementation
- `src/core/queue/datasource/__tests__/ObservableDataSource.test.ts` - Comprehensive tests
- `src/core/queue/datasource/IDataSource.ts` - Interface definitions
- `src/core/queue/abstraction/types.ts` - Observer interface
- `src/core/queue/abstraction/__tests__/observer.test.ts` - Interface tests

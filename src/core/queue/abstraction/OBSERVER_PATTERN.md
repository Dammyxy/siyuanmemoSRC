# Observer Pattern for Cache Invalidation

## Overview

The Observer pattern is implemented to solve the cache invalidation problem in the queue system. Previously, sequencers had to be manually reset when data changed, which was error-prone and led to stale data issues.

## Interfaces

### IDataSourceObserver

```typescript
interface IDataSourceObserver {
  onDataChanged(): void;
}
```

Any component that caches data from a DataSource should implement this interface. When the DataSource's data changes, all registered observers are notified via `onDataChanged()`.

**Responsibilities:**
- Invalidate internal caches when notified
- Reload data on next access

### IObservableDataSource<TItem>

```typescript
interface IObservableDataSource<TItem> extends IDataSource<TItem> {
  addObserver(observer: IDataSourceObserver): void;
  removeObserver(observer: IDataSourceObserver): void;
}
```

DataSources that support observation should implement this interface. They maintain a list of observers and notify them when data changes.

**Responsibilities:**
- Maintain a list of registered observers
- Notify all observers when data is added or removed
- Prevent duplicate observer registration
- Handle observer removal safely

## Usage Example

### 1. Implementing an Observable DataSource

```typescript
class RiffDataSource implements IObservableDataSource<ReviewCard> {
  private observers: IDataSourceObserver[] = [];
  private cards: ReviewCard[] = [];
  
  async getAll(): Promise<ReviewCard[]> {
    return [...this.cards];
  }
  
  async remove(items: ReviewCard[]): Promise<number> {
    const initialLength = this.cards.length;
    this.cards = this.cards.filter(card => 
      !items.some(item => item.cardID === card.cardID)
    );
    const removed = initialLength - this.cards.length;
    
    if (removed > 0) {
      this.notifyObservers(); // Automatically notify observers
    }
    
    return removed;
  }
  
  addObserver(observer: IDataSourceObserver): void {
    if (!this.observers.includes(observer)) {
      this.observers.push(observer);
    }
  }
  
  removeObserver(observer: IDataSourceObserver): void {
    const index = this.observers.indexOf(observer);
    if (index !== -1) {
      this.observers.splice(index, 1);
    }
  }
  
  private notifyObservers(): void {
    for (const observer of this.observers) {
      try {
        observer.onDataChanged();
      } catch (error) {
        console.error('Observer notification failed:', error);
      }
    }
  }
}
```

### 2. Implementing an Observer (Sequencer)

```typescript
class PrioritySequencer<TItem> implements ISequencer<TItem>, IDataSourceObserver {
  private loaded = false;
  private items: TItem[] = [];
  
  constructor(private fetchAll: () => Promise<TItem[]>) {}
  
  // IDataSourceObserver implementation
  onDataChanged(): void {
    console.log('[PrioritySequencer] Data changed, invalidating cache');
    this.loaded = false;
    this.items.length = 0;
  }
  
  // ISequencer implementation
  async next(): Promise<TItem | null> {
    if (!this.loaded) {
      this.loaded = true;
      const fetched = await this.fetchAll();
      this.items.push(...fetched);
      this.items.sort(/* sorting logic */);
    }
    return this.items.shift() || null;
  }
}
```

### 3. Wiring it Together

```typescript
// Create data source and sequencer
const dataSource = new RiffDataSource();
const sequencer = new PrioritySequencer(() => dataSource.getAll());

// Register sequencer as observer
dataSource.addObserver(sequencer);

// Now when data changes, sequencer is automatically notified
await dataSource.remove([someCard]); // Sequencer cache is invalidated automatically
```

## Benefits

1. **Automatic Cache Invalidation**: No need for manual `reset()` calls
2. **Decoupling**: DataSource doesn't need to know about specific sequencer implementations
3. **Multiple Observers**: One DataSource can notify multiple sequencers
4. **Error Isolation**: If one observer fails, others still get notified
5. **Cleaner Code**: Eliminates manual cache management logic

## Migration Guide

### Before (Manual Reset)

```typescript
class BaseCompositeQueue {
  async rotateToEnd(item: TItem): Promise<void> {
    await this.dataSource.remove([item]);
    await this.dataSource.add([item]);
    
    // Manual reset - easy to forget!
    this.sequencer.reset();
  }
}
```

### After (Observer Pattern)

```typescript
class BaseCompositeQueue {
  constructor(dataSource: IObservableDataSource<TItem>) {
    // Register sequencer as observer
    dataSource.addObserver(this.sequencer);
  }
  
  async rotateToEnd(item: TItem): Promise<void> {
    await this.dataSource.remove([item]);
    await this.dataSource.add([item]);
    
    // No manual reset needed - sequencer is automatically notified!
  }
}
```

## Testing

The observer pattern is tested in `abstraction/__tests__/observer.test.ts`:

- ✅ Observer interface implementation
- ✅ Observable data source implementation
- ✅ Multiple observers support
- ✅ Duplicate registration prevention
- ✅ Safe observer removal
- ✅ Integration with sequencer pattern

## Related

- **Requirements**: 1.1, 1.2, 1.5 (Sequencer Cache Invalidation Fix)
- **Design Document**: See `design.md` Section 1 (Observer Pattern)
- **ADR**: ADR-002: Observer Pattern for Cache Invalidation (to be created)

## Next Steps

1. ✅ Define observer interfaces (Task 1.1) - **COMPLETED**
2. ⏳ Implement ObservableDataSource base class (Task 1.2)
3. ⏳ Update RiffDataSource to extend ObservableDataSource (Task 1.3)
4. ⏳ Update Sequencers to implement IDataSourceObserver (Task 1.4)
5. ⏳ Register observers in queue constructors (Task 1.5)
6. ⏳ Remove manual reset() calls (Task 1.6)
7. ⏳ Write property-based tests (Tasks 1.7-1.9)

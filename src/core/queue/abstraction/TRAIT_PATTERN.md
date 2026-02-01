# Trait Pattern for Queue Capabilities

## Overview

The Trait Pattern is used in this codebase to provide optional capabilities to queues without requiring complex inheritance hierarchies. Instead of creating multiple queue subclasses for every combination of features, we define **traits** as separate interfaces that queues can implement as needed.

## What is a Trait?

A **trait** is an interface that defines a specific capability or behavior. Each trait:
- Has a unique `id` string identifier
- Extends the base `IQueueTrait` interface
- Defines methods related to a single responsibility
- Can be implemented independently of other traits

## Available Traits

### 1. IMutableTrait - Insertion Capability

Allows items to be inserted into the queue at specific positions.

```typescript
interface IMutableTrait<TItem> extends IQueueTrait {
  id: 'mutable';
  insertAt(items: TItem[], index: number): Promise<void>;
}
```

**Use Cases**:
- Adding new cards to a review queue
- Inserting priority items at the front
- Implementing undo/redo functionality

### 2. IRemovableTrait - Deletion Capability

Allows items to be removed from the queue.

```typescript
interface IRemovableTrait<TItem> extends IQueueTrait {
  id: 'removable';
  removeItems(items: TItem[]): Promise<number>;
}
```

**Use Cases**:
- Deleting cards the user no longer wants to review
- Removing completed items
- Bulk deletion operations

### 3. IPrioritizableTrait - Priority Management

Allows items to have their priority changed dynamically.

```typescript
interface IPrioritizableTrait<TItem> extends IQueueTrait {
  id: 'prioritizable';
  setPriority(item: TItem, priority: number): Promise<boolean>;
}
```

**Use Cases**:
- User-initiated priority changes
- Automatic priority adjustments
- "Study this first" functionality

### 4. IInterceptiveTrait - Pre-processing Hooks

Allows queues to intercept and modify items before they are returned.

```typescript
interface IInterceptiveTrait<TItem> extends IQueueTrait {
  id: 'interceptive';
  beforeNext?(context: { candidate: TItem | null }): Promise<TItem | null>;
}
```

**Use Cases**:
- Filtering out invalid items
- Applying last-minute transformations
- Implementing conditional logic

### 5. IAutoSortableTrait - Automatic Sorting

Allows queues to re-sort their items on demand.

```typescript
interface IAutoSortableTrait extends IQueueTrait {
  id: 'auto-sortable';
  sort(): Promise<void>;
}
```

**Use Cases**:
- Updating sort order after priority changes
- Re-sorting after bulk insertions
- Implementing "refresh" functionality

## How to Use Traits

### Implementing Traits in a Queue

A queue can implement multiple traits by:
1. Implementing the trait interfaces
2. Providing a `getTrait()` method to access traits dynamically

```typescript
class MyQueue implements IQueueStrategy<ReviewCard>, IMutableTrait<ReviewCard>, IRemovableTrait<ReviewCard> {
  // Implement IQueueStrategy methods
  async next(): Promise<ReviewCard | null> { /* ... */ }
  async onFeedback(item: ReviewCard | null, feedback: QueueFeedback): Promise<void> { /* ... */ }
  getUIConfig(item: ReviewCard | null): QueueUIConfig { /* ... */ }
  
  // Implement IMutableTrait
  async insertAt(items: ReviewCard[], index: number): Promise<void> {
    // Insert items at the specified position
    this.items.splice(index, 0, ...items);
    await this.dataSource.save();
  }
  
  // Implement IRemovableTrait
  async removeItems(items: ReviewCard[]): Promise<number> {
    // Remove items from the queue
    const removed = this.items.filter(item => items.includes(item));
    this.items = this.items.filter(item => !items.includes(item));
    await this.dataSource.save();
    return removed.length;
  }
  
  // Provide trait access
  getTrait(id: string): IQueueTrait | undefined {
    if (id === 'mutable') return this as IMutableTrait<ReviewCard>;
    if (id === 'removable') return this as IRemovableTrait<ReviewCard>;
    return undefined;
  }
}
```

### Consuming Traits

Consumers should check if a queue supports a trait before using it:

```typescript
// Check if the queue supports insertion
const mutableTrait = queue.getTrait?.('mutable') as IMutableTrait<ReviewCard>;
if (mutableTrait) {
  await mutableTrait.insertAt([newCard], 0);
  console.log('Card inserted successfully');
} else {
  console.log('This queue does not support insertion');
}

// Check if the queue supports deletion
const removableTrait = queue.getTrait?.('removable') as IRemovableTrait<ReviewCard>;
if (removableTrait) {
  const removed = await removableTrait.removeItems([card1, card2]);
  console.log(`Removed ${removed} cards`);
}
```

## Benefits of the Trait Pattern

### 1. Flexibility

Queues can mix and match capabilities without complex inheritance:

```typescript
// Queue A: Supports insertion and deletion
class QueueA implements IQueueStrategy, IMutableTrait, IRemovableTrait { }

// Queue B: Supports only deletion
class QueueB implements IQueueStrategy, IRemovableTrait { }

// Queue C: Supports all traits
class QueueC implements IQueueStrategy, IMutableTrait, IRemovableTrait, IPrioritizableTrait { }
```

### 2. Type Safety

TypeScript ensures that trait methods are implemented correctly:

```typescript
// Compile error if insertAt() is not implemented
class MyQueue implements IMutableTrait<ReviewCard> {
  id = 'mutable' as const;
  // Error: Property 'insertAt' is missing
}
```

### 3. Discoverability

Consumers can discover capabilities at runtime:

```typescript
function analyzeQueue(queue: IQueueStrategy) {
  const capabilities = [];
  
  if (queue.getTrait?.('mutable')) capabilities.push('insertion');
  if (queue.getTrait?.('removable')) capabilities.push('deletion');
  if (queue.getTrait?.('prioritizable')) capabilities.push('priority management');
  
  console.log('Queue capabilities:', capabilities.join(', '));
}
```

### 4. Single Responsibility

Each trait focuses on a single capability, making the code easier to understand and maintain.

## Design Decisions

### Why Not Inheritance?

Traditional inheritance would require creating a class for every combination of features:

```typescript
// ❌ Inheritance approach (combinatorial explosion)
class Queue { }
class MutableQueue extends Queue { }
class RemovableQueue extends Queue { }
class MutableRemovableQueue extends Queue { }
class PrioritizableQueue extends Queue { }
class MutablePrioritizableQueue extends Queue { }
// ... and so on
```

With traits, we avoid this explosion:

```typescript
// ✅ Trait approach (composable)
class MyQueue implements IQueueStrategy, IMutableTrait, IRemovableTrait, IPrioritizableTrait { }
```

### Why Not Composition?

Composition (e.g., `queue.mutable.insertAt()`) would require:
- More boilerplate code
- Separate objects for each trait
- More complex initialization

Traits provide a simpler API while maintaining type safety.

## Examples

### Example 1: Adding Cards to a Queue

```typescript
async function addCardsToQueue(queue: IQueueStrategy<ReviewCard>, cards: ReviewCard[]) {
  const mutableTrait = queue.getTrait?.('mutable') as IMutableTrait<ReviewCard>;
  
  if (!mutableTrait) {
    throw new Error('Queue does not support insertion');
  }
  
  // Insert at the beginning (highest priority)
  await mutableTrait.insertAt(cards, 0);
  console.log(`Added ${cards.length} cards to the queue`);
}
```

### Example 2: Removing Suspended Cards

```typescript
async function removeSuspendedCards(queue: IQueueStrategy<ReviewCard>) {
  const removableTrait = queue.getTrait?.('removable') as IRemovableTrait<ReviewCard>;
  
  if (!removableTrait) {
    console.log('Queue does not support deletion');
    return;
  }
  
  // Get all cards and filter suspended ones
  const allCards = await queue.getAllCards?.() || [];
  const suspendedCards = allCards.filter(card => card.suspended);
  
  // Remove them
  const removed = await removableTrait.removeItems(suspendedCards);
  console.log(`Removed ${removed} suspended cards`);
}
```

### Example 3: Boosting Card Priority

```typescript
async function boostCardPriority(queue: IQueueStrategy<ReviewCard>, card: ReviewCard) {
  const priorityTrait = queue.getTrait?.('prioritizable') as IPrioritizableTrait<ReviewCard>;
  
  if (!priorityTrait) {
    console.log('Queue does not support priority management');
    return;
  }
  
  // Set high priority
  const success = await priorityTrait.setPriority(card, 1000);
  if (success) {
    console.log('Card priority boosted');
  } else {
    console.log('Card not found in queue');
  }
}
```

## Related Documentation

- [Observer Pattern](./OBSERVER_PATTERN.md) - Automatic cache invalidation
- [ADR-001: Trait Pattern](../../../docs/adr/ADR-001-trait-pattern.md) - Design decision record
- [Queue Strategy Interface](./Strategy.ts) - Main queue interface

## References

- [Trait Pattern in Software Engineering](https://en.wikipedia.org/wiki/Trait_(computer_programming))
- [Composition over Inheritance](https://en.wikipedia.org/wiki/Composition_over_inheritance)
